import * as db from "./data.js";
import { computePayroll, shiftHours, SHIFTS, SHIFT_LABEL, DAY_TYPES, periodOf, periodForDate, datesBetween } from "./payroll-calc.js";

/* ---------- i18n ---------- */
const I18N = {
  ko: {
    app: "Paltong 급여", login: "로그인", id: "아이디", pw: "비밀번호", logout: "로그아웃", changePw: "비밀번호 변경", newPw: "새 비밀번호 (6자 이상)",
    tab_pay: "급여 계산", tab_emp: "직원", tab_ledger: "가불·부족분", tab_hist: "급여 내역", tab_set: "설정",
    employee: "직원", period: "급여 기간", first: "1 – 15일", second: "16일 – 말일", month: "월", daily: "일급", breakH: "식사 휴게 (시간/일)",
    roster: "보름치 시프트 표", off: "휴무", sil: "SIL 유급휴가", wkend: "주말",
    type_regular: "평일", type_rest: "휴무일 근무", type_special: "특별공휴일", type_specialRest: "특별공휴일+휴무일", type_holiday: "정규공휴일", type_holidayRest: "정규공휴일+휴무일", type_holidayOff: "정규공휴일 쉼 (100%)", type_sil: "SIL 유급휴가", type_off: "휴무",
    fill: "채우기", fillHelp: "주 6일 기준: 휴무 요일 하나 고르고 시프트 선택 → 전체 날짜에 적용",
    restDay: "주 휴무 요일", dow: ["일", "월", "화", "수", "목", "금", "토"],
    late: "지각·조퇴 합계 (분)", lateHelp: "실제 미근무 시간만 공제 · 분당 ₱", incentive: "인센티브·수당 (+)", other: "기타 공제 (−)",
    deductions: "공제", advAuto: "이 기간 가불 (자동)", shortAuto: "확인된 현금 부족분 (자동 · 웨이터)", none: "없음",
    gov: "법정 공제 (근로자 부담분)", govShare: "반달치 (½)", govFull: "한 달치", govHelp: "참고값 · SSS 5% · PhilHealth 2.5% · Pag-IBIG 2% (최대 ₱200)",
    result: "계산 내역", basic: "기본급 (근무시간 × 시급)", premium: "휴무일·공휴일 할증", ot: "초과근무", nd: "야간근무 가산 (10%)", silPay: "SIL · 유급휴가", holOff: "정규공휴일 유급 (쉼)",
    lateDed: "지각·조퇴 공제", gross: "총 지급액 (Gross)", adv: "가불금", shortage: "현금 부족분", net: "실수령액 (Net)",
    summary: "근무 {d}일 · {h}h · 초과 {o}h · 야간 {n}h · SIL {s}일", netLbl: "실수령액",
    save: "저장", saved: "저장됨", markPaid: "지급 완료로 기록", paid: "지급됨", draft: "작성중", unpay: "지급 취소", paidOn: "지급일", paidVia: "지급 계좌", slip: "급여명세서", print: "인쇄", delete: "삭제", confirmDel: "정말 삭제할까요?", yes: "삭제", cancel: "취소", close: "닫기",
    emp_add: "직원 추가", emp_name: "이름", emp_pos: "직위", pos_waiter: "웨이터/서버", pos_kitchen: "주방", pos_rider: "라이더", pos_other: "기타",
    emp_status: "고용 형태", st_regular: "정규직", st_probationary: "수습", st_fixed: "계약직", st_other: "기타", emp_hired: "입사일", emp_bday: "생일", emp_active: "재직 중", emp_note: "메모", emp_payType: "급여 형태", pt_daily: "일급", pt_monthly: "월급",
    led_add: "기록 추가", led_kind: "종류", k_advance: "가불", k_shortage: "현금 부족분", k_other: "기타 공제", led_date: "날짜", led_amount: "금액", led_note: "메모",
    led_verified: "조사 완료 · 본인 책임 확인", led_auth: "서면 동의 받음", led_applies: "→ {p} 급여에서 공제", led_deducted: "공제됨", led_pending: "미공제", led_filter_all: "전체",
    hist_empty: "저장된 급여가 없어요. 급여 계산 탭에서 저장하세요.", total: "합계",
    set_wage: "기본 일급 (최저임금)", set_break: "기본 식사 휴게 (시간)", set_gov: "법정 공제 기본값", set_lang: "언어",
    contract: "계약서 요약", contractText: [
      "급여: 일급 ₱718 (최저임금) · 월급제는 주6일·8시간 기준 고정 (₱718 × 313 ÷ 12)",
      "지급일: 매월 15일 · 30일",
      "초과근무: 승인된 시간만 · 시급 × 125% (휴무일·공휴일은 할증 적용)",
      "야간 (22~06시): 시급 × 10% 가산",
      "휴무일 130% · 특별공휴일 130% · 정규공휴일 200% (쉬어도 100%)",
      "지각: 실제 미근무 분만 공제 (₱718 ÷ 480분)",
      "개근 인센티브: 월 무단결근·1분 이상 지각 없으면 다음 달 유급휴가 1일 → 시프트 표에서 SIL 선택",
      "가불: 1~15일 신청 → 15일 급여 / 16일~ 신청 → 30일 급여에서 공제",
      "현금 부족분 (웨이터): 조사 후 본인 책임 확정 + 서면 동의 시에만 공제. 근무 중이었다는 이유만으로 분담 불가",
      "13월급: 연 기본급 ÷ 12",
    ],
    noPerm: "권한이 없어요 (관리자만 가능)", paidLocked: "지급 완료된 급여는 관리자만 바꿀 수 있어요", loginFail: "아이디 또는 비밀번호가 틀려요",
    pickEmp: "직원을 먼저 고르세요", deleted: "삭제됨", weekendHelp: "금·토·일 = 주말",
  },
  en: {
    app: "Paltong Payroll", login: "Sign in", id: "ID", pw: "Password", logout: "Sign out", changePw: "Change password", newPw: "New password (6+ chars)",
    tab_pay: "Payroll", tab_emp: "Staff", tab_ledger: "Advances & shortages", tab_hist: "History", tab_set: "Settings",
    employee: "Employee", period: "Pay period", first: "1st – 15th", second: "16th – end", month: "Month", daily: "Daily rate", breakH: "Meal break (hrs/day)",
    roster: "Half-month shift roster", off: "Off", sil: "SIL paid leave", wkend: "Weekend",
    type_regular: "Regular day", type_rest: "Rest day worked", type_special: "Special holiday", type_specialRest: "Special holiday + rest day", type_holiday: "Regular holiday", type_holidayRest: "Regular holiday + rest day", type_holidayOff: "Regular holiday, not worked (100%)", type_sil: "SIL paid leave", type_off: "Off",
    fill: "Fill", fillHelp: "6-day week: pick the rest day and a shift → applied to every date",
    restDay: "Weekly rest day", dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    late: "Tardiness / undertime (minutes)", lateHelp: "Only actual unworked time · per minute ₱", incentive: "Incentive / allowance (+)", other: "Other deduction (−)",
    deductions: "Deductions", advAuto: "Advances this period (auto)", shortAuto: "Verified cash shortage (auto · waiters)", none: "none",
    gov: "Statutory deductions (employee share)", govShare: "Half-month (½)", govFull: "Full month", govHelp: "Reference · SSS 5% · PhilHealth 2.5% · Pag-IBIG 2% (max ₱200)",
    result: "Computation", basic: "Basic pay (hours × hourly)", premium: "Rest-day / holiday premium", ot: "Overtime", nd: "Night differential (10%)", silPay: "SIL · paid leave", holOff: "Regular holiday paid (not worked)",
    lateDed: "Tardiness / undertime", gross: "Gross pay", adv: "Salary advance", shortage: "Cash shortage", net: "Net pay",
    summary: "{d} days · {h}h · OT {o}h · night {n}h · SIL {s} days", netLbl: "Net pay",
    save: "Save", saved: "Saved", markPaid: "Record as paid", paid: "Paid", draft: "Draft", unpay: "Undo paid", paidOn: "Paid on", paidVia: "Paid via", slip: "Payslip", print: "Print", delete: "Delete", confirmDel: "Delete this?", yes: "Delete", cancel: "Cancel", close: "Close",
    emp_add: "Add employee", emp_name: "Name", emp_pos: "Position", pos_waiter: "Waiter / Server", pos_kitchen: "Kitchen", pos_rider: "Rider", pos_other: "Other",
    emp_status: "Employment status", st_regular: "Regular", st_probationary: "Probationary", st_fixed: "Fixed-term", st_other: "Other", emp_hired: "Date hired", emp_bday: "Birthday", emp_active: "Active", emp_note: "Note", emp_payType: "Pay type", pt_daily: "Daily-rated", pt_monthly: "Monthly-rated",
    led_add: "Add record", led_kind: "Kind", k_advance: "Advance", k_shortage: "Cash shortage", k_other: "Other deduction", led_date: "Date", led_amount: "Amount", led_note: "Note",
    led_verified: "Investigated · responsibility established", led_auth: "Written authorization on file", led_applies: "→ deducted from {p} payroll", led_deducted: "deducted", led_pending: "pending", led_filter_all: "All",
    hist_empty: "No saved payrolls yet. Save one from the Payroll tab.", total: "Total",
    set_wage: "Default daily rate (minimum wage)", set_break: "Default meal break (hours)", set_gov: "Statutory deduction defaults", set_lang: "Language",
    contract: "Contract summary", contractText: [
      "Pay: ₱718/day (minimum wage) · monthly-rated = 6 days × 8 hours fixed (₱718 × 313 ÷ 12)",
      "Paydays: 15th and 30th",
      "Overtime: approved hours only · hourly × 125% (higher on rest days / holidays)",
      "Night (10pm–6am): hourly × 10% differential",
      "Rest day 130% · special holiday 130% · regular holiday 200% (100% even if not worked)",
      "Tardiness: only actual unworked minutes (₱718 ÷ 480)",
      "Attendance incentive: perfect month → 1 paid leave day next month → pick SIL in the roster",
      "Advances: requested 1st–15th → 15th payroll / 16th on → 30th payroll",
      "Cash shortage (waiters): deducted only after investigation, established responsibility and written authorization. No automatic splitting among staff on duty",
      "13th-month pay: annual basic ÷ 12",
    ],
    noPerm: "No permission (owner only)", paidLocked: "A paid payroll can only be changed by the owner", loginFail: "Wrong ID or password",
    pickEmp: "Pick an employee first", deleted: "Deleted", weekendHelp: "Fri · Sat · Sun = weekend",
  },
};
let lang = "ko"; try { lang = localStorage.getItem("pp-lang") || "ko"; } catch {}
const t = k => I18N[lang][k] ?? I18N.ko[k] ?? k;

/* ---------- helpers ---------- */
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v; else if (v != null && v !== false) el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const money = v => (+v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const periodLabel = (s, e) => `${s.slice(0, 7)} · ${+s.slice(8) === 1 ? t("first") : t("second")}`;
let toastT; function toast(msg) { const el = document.getElementById("toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2200); }
function sheet(content) {
  const root = document.getElementById("sheetRoot"); root.innerHTML = "";
  const bg = h("div", { class: "sheet-bg", onclick: e => { if (e.target === bg) close(); } }, h("div", { class: "sheet" }, content));
  const close = () => root.innerHTML = ""; root.append(bg); return close;
}
function confirmSheet(msg, onYes) {
  const close = sheet([h("h3", {}, msg), h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: () => close() }, t("cancel")), h("button", { class: "btn danger", onclick: () => { close(); onYes(); } }, t("yes")))]);
}
function field(label, input, help) { return h("div", { class: "f" }, h("label", {}, label), input, help && h("small", {}, help)); }
function sel(opts, value, attrs = {}) {
  const s = h("select", attrs); for (const [v, l] of opts) s.append(h("option", { value: v }, l)); s.value = value; return s;
}
const errMsg = e => e.message === "NO_PERMISSION" ? t("noPerm") : e.message === "PAID_LOCKED" ? t("paidLocked") : e.message;

/* ---------- state ---------- */
const S = { user: null, settings: null, employees: [], tab: "pay", pay: null };
const root = document.getElementById("root");

async function boot() {
  const ok = await db.init();
  if (!ok) return renderLogin();
  S.user = await db.me();
  S.settings = await db.getSettings().catch(() => ({ min_wage: 718, break_hours: 1, sss_on: false, philhealth_on: false, pagibig_on: false, gov_share: 0.5 }));
  S.employees = await db.listEmployees(true);
  render();
}

function renderLogin(err) {
  const id = h("input", { type: "text", id: "lid", autocomplete: "username", placeholder: "admin" });
  const pw = h("input", { type: "password", id: "lpw", autocomplete: "current-password" });
  const form = h("form", { onsubmit: async e => { e.preventDefault(); try { await db.signIn(id.value, pw.value); boot(); } catch { renderLogin(t("loginFail")); } } },
    h("div", { class: "card" }, h("h1", {}, t("app")), field(t("id"), id), field(t("pw"), pw), err && h("div", { class: "err" }, err),
      h("button", { class: "btn primary", type: "submit" }, t("login")), langSwitch()));
  root.innerHTML = ""; root.append(h("div", { class: "login" }, form));
}
function langSwitch() {
  return h("div", { class: "row" },
    h("button", { type: "button", class: "btn sm", "aria-pressed": lang === "ko", onclick: () => setLang("ko") }, "한국어"),
    h("button", { type: "button", class: "btn sm", "aria-pressed": lang === "en", onclick: () => setLang("en") }, "English"));
}
function setLang(l) { lang = l; try { localStorage.setItem("pp-lang", l); } catch {} document.documentElement.lang = l; S.user ? render() : renderLogin(); }

function render() {
  root.innerHTML = "";
  const tabs = [["pay", t("tab_pay")], ["emp", t("tab_emp")], ["ledger", t("tab_ledger")], ["hist", t("tab_hist")], ["set", t("tab_set")]];
  root.append(
    h("div", { class: "top" }, h("span", { class: "brand" }, t("app")), h("span", { class: "sp" }),
      h("span", { class: "muted", style: "color:inherit;opacity:.8;font-size:13px" }, S.user?.name || ""),
      h("button", { onclick: () => setLang(lang === "ko" ? "en" : "ko") }, lang === "ko" ? "EN" : "한"),
      h("button", { onclick: menu }, "⋯")),
    h("div", { class: "tabs", role: "tablist" }, tabs.map(([k, l]) => h("button", { role: "tab", "aria-selected": S.tab === k, onclick: () => { S.tab = k; render(); } }, l))),
    h("main", { id: "main" }));
  ({ pay: renderPay, emp: renderEmp, ledger: renderLedger, hist: renderHist, set: renderSet })[S.tab]();
}
function menu() {
  const close = sheet([
    h("h3", {}, S.user?.name || ""),
    h("button", { class: "btn", onclick: () => { close(); changePw(); } }, t("changePw")),
    h("button", { class: "btn", onclick: async () => { await db.signOut(); location.reload(); } }, t("logout")),
    h("button", { class: "btn ghost", onclick: close }, t("close")),
  ]);
}
function changePw() {
  const pw = h("input", { type: "password", id: "npw", minlength: 6 });
  const close = sheet(h("form", { onsubmit: async e => { e.preventDefault(); try { await db.changePassword(pw.value); toast(t("saved")); close(); } catch (er) { toast(errMsg(er)); } } },
    h("h3", {}, t("changePw")), field(t("newPw"), pw), h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: close }, t("cancel")), h("button", { class: "btn primary", type: "submit" }, t("save")))));
}

/* ================= PAYROLL TAB ================= */
function defaultPay() {
  const d = new Date(); const half = d.getDate() <= 15 ? 1 : 2; const p = periodOf(d.getFullYear(), d.getMonth() + 1, half);
  return { employee_id: "", month: p.start.slice(0, 7), half, start: p.start, end: p.end, id: null, status: "draft",
    daily_rate: +S.settings.min_wage || 718, break_hours: +S.settings.break_hours || 1, days: [], late_minutes: 0, incentive: 0, other_deduction: 0,
    gov: { sss: !!S.settings.sss_on, philhealth: !!S.settings.philhealth_on, pagibig: !!S.settings.pagibig_on, share: +S.settings.gov_share || 0.5 },
    ledger: [], paid_on: null, paid_via: null, restDow: 1, fillShift: "8-18" };
}
async function loadPay(P) {
  const [y, m] = P.month.split("-").map(Number); const p = periodOf(y, m, P.half); P.start = p.start; P.end = p.end;
  const dates = datesBetween(P.start, P.end);
  if (P.employee_id) {
    const emp = S.employees.find(e => e.id === P.employee_id);
    const row = await db.getPayroll(P.employee_id, P.start, P.end);
    if (row) {
      Object.assign(P, { id: row.id, status: row.status, daily_rate: +row.daily_rate, break_hours: +row.break_hours, late_minutes: row.late_minutes, incentive: +row.incentive, other_deduction: +row.other_deduction, gov: row.gov, paid_on: row.paid_on, paid_via: row.paid_via });
      const byDate = Object.fromEntries((row.days || []).map(d => [d.date, d]));
      P.days = dates.map(d => byDate[d] || { date: d, shift: "", type: "off" });
    } else {
      Object.assign(P, { id: null, status: "draft", daily_rate: emp ? +emp.daily_rate : P.daily_rate, late_minutes: 0, incentive: 0, other_deduction: 0, paid_on: null, paid_via: null });
      P.days = dates.map(d => ({ date: d, shift: "", type: "off" }));
    }
    const led = await db.listLedger({ employeeId: P.employee_id, unpaidOnly: !P.id });
    P.ledger = led.filter(l => (P.id && l.payroll_id === P.id) || (!l.payroll_id && periodForDate(l.biz_date).start === P.start));
    if (emp?.position !== "waiter") P.ledger = P.ledger.filter(l => l.kind !== "shortage");
  } else { P.days = dates.map(d => ({ date: d, shift: "", type: "off" })); P.ledger = []; }
}
function payOpts(P) {
  const adv = P.ledger.filter(l => l.kind === "advance").reduce((a, l) => a + +l.amount, 0);
  const sh = P.ledger.filter(l => l.kind === "shortage" && l.verified).reduce((a, l) => a + +l.amount, 0);
  const oth = P.ledger.filter(l => l.kind === "other").reduce((a, l) => a + +l.amount, 0);
  return { daily: P.daily_rate, breakHrs: P.break_hours, lateMinutes: P.late_minutes, incentive: P.incentive, advances: adv, shortage: sh,
    otherDeduction: (+P.other_deduction || 0) + oth, gov: P.gov, govShare: +P.gov.share === 1 ? 1 : 0.5 };
}
async function renderPay() {
  const main = document.getElementById("main");
  if (!S.pay) S.pay = defaultPay();
  if (!S.pay.loaded) { await loadPay(S.pay); S.pay.loaded = true; }
  const P = S.pay;
  const emp = S.employees.find(e => e.id === P.employee_id);
  const R = computePayroll(P.days, payOpts(P));
  const owner = S.user?.role === "owner";
  const locked = P.status === "paid";
  const re = async () => { await loadPay(P); render(); };

  // --- header: employee / period ---
  const empSel = sel([["", "—"], ...S.employees.filter(e => e.active || e.id === P.employee_id).map(e => [e.id, e.name])], P.employee_id, { id: "pEmp", onchange: async e => { P.employee_id = e.target.value; await re(); } });
  const monthIn = h("input", { type: "month", id: "pMonth", value: P.month, onchange: async e => { P.month = e.target.value; await re(); } });
  const halfSel = sel([[1, t("first")], [2, t("second")]], P.half, { id: "pHalf", onchange: async e => { P.half = +e.target.value; await re(); } });
  const dailyIn = h("input", { type: "number", id: "pDaily", value: P.daily_rate, step: 1, min: 0, disabled: locked, oninput: e => { P.daily_rate = +e.target.value || 0; refresh(); } });
  const brkIn = h("input", { type: "number", id: "pBreak", value: P.break_hours, step: 0.5, min: 0, disabled: locked, oninput: e => { P.break_hours = +e.target.value || 0; refresh(); } });
  const head = h("div", { class: "card" },
    h("div", { class: "row" }, h("h2", {}, t("tab_pay")), h("span", { class: "sp" }), P.id && h("span", { class: "pill " + P.status }, locked ? t("paid") : t("draft")), emp && h("span", { class: "pill " + (emp.position === "waiter" ? "waiter" : "") }, t("pos_" + emp.position))),
    h("div", { class: "grid2" }, field(t("employee"), empSel), field(t("month"), monthIn), field(t("period"), halfSel), field(t("daily"), dailyIn), field(t("breakH"), brkIn)));

  // --- roster ---
  const typeOpts = Object.keys(DAY_TYPES).map(k => [k, t("type_" + k)]);
  const shiftOpts = [["", t("off")], ...SHIFTS.map(v => [v, SHIFT_LABEL(v)])];
  const rosterEl = h("div", { class: "roster", id: "roster" });
  const sumEl = h("p", { class: "muted", id: "rosterSum" });
  function drawRoster() {
    rosterEl.innerHTML = "";
    for (const d of P.days) {
      const dt = new Date(d.date + "T00:00:00"); const dow = dt.getDay(); const wk = dow === 5 || dow === 6 || dow === 0;
      const sh = DAY_TYPES[d.type]?.worked ? shiftHours(d.shift, P.break_hours) : null;
      const cls = "day" + (d.type === "off" ? " off" : "") + (d.type === "sil" ? " sil" : "") + (/holiday|special/.test(d.type) ? " hol" : "") + (wk ? " wknd" : "");
      const shiftSel = sel(shiftOpts, d.shift, { disabled: locked, "aria-label": "shift", onchange: e => { d.shift = e.target.value; if (!d.shift && DAY_TYPES[d.type].worked) d.type = "off"; if (d.shift && !DAY_TYPES[d.type].worked && d.type !== "holidayOff") d.type = "regular"; drawRoster(); refresh(); } });
      const typeSel = sel(typeOpts, d.type, { disabled: locked, "aria-label": "day type", onchange: e => { d.type = e.target.value; if (!DAY_TYPES[d.type].worked) d.shift = ""; else if (!d.shift) d.shift = P.fillShift; drawRoster(); refresh(); } });
      rosterEl.append(h("div", { class: cls },
        h("div", { class: "d" }, t("dow")[dow], h("b", {}, +d.date.slice(8))),
        shiftSel, typeSel,
        sh && sh.worked > 0 && h("div", { class: "hrs" }, `${sh.hours}h` + (sh.ot ? ` · OT ${sh.ot}h` : "") + (sh.nd ? ` · ND ${sh.nd}h` : ""))));
    }
    sumEl.textContent = t("summary").replace("{d}", R.daysWorked).replace("{h}", R.hoursWorked).replace("{o}", R.otHours).replace("{n}", R.ndHours).replace("{s}", R.silDays);
  }
  const restSel = sel(t("dow").map((l, i) => [i, l]), P.restDow, { onchange: e => P.restDow = +e.target.value });
  const fillSel = sel(SHIFTS.map(v => [v, SHIFT_LABEL(v)]), P.fillShift, { onchange: e => P.fillShift = e.target.value });
  const fillBtn = h("button", { class: "btn sm", type: "button", disabled: locked, onclick: () => { for (const d of P.days) { const dow = new Date(d.date + "T00:00:00").getDay(); if (dow === P.restDow) { d.shift = ""; d.type = "off"; } else { d.shift = P.fillShift; d.type = "regular"; } } drawRoster(); refresh(); } }, t("fill"));
  const roster = h("div", { class: "card" }, h("h2", {}, t("roster")),
    h("div", { class: "row" }, h("span", { class: "muted" }, t("restDay")), restSel, fillSel, fillBtn, h("span", { class: "muted" }, t("weekendHelp"))),
    h("small", { class: "muted" }, t("fillHelp")), rosterEl, sumEl);

  // --- adjustments & deductions ---
  const lateIn = h("input", { type: "number", id: "pLate", value: P.late_minutes, step: 1, min: 0, disabled: locked, oninput: e => { P.late_minutes = +e.target.value || 0; refresh(); } });
  const incIn = h("input", { type: "number", id: "pInc", value: P.incentive, step: 1, min: 0, disabled: locked, oninput: e => { P.incentive = +e.target.value || 0; refresh(); } });
  const othIn = h("input", { type: "number", id: "pOth", value: P.other_deduction, step: 1, min: 0, disabled: locked, oninput: e => { P.other_deduction = +e.target.value || 0; refresh(); } });
  const govBox = (k, label) => h("label", { class: "check" }, h("input", { type: "checkbox", id: "g_" + k, checked: !!P.gov[k], disabled: locked, onchange: e => { P.gov[k] = e.target.checked; refresh(); } }), label);
  const shareSel = sel([[0.5, t("govShare")], [1, t("govFull")]], P.gov.share, { disabled: locked, onchange: e => { P.gov.share = +e.target.value; refresh(); } });
  const ledList = h("div", { class: "list" });
  for (const l of P.ledger) ledList.append(h("div", { class: "item", onclick: () => ledgerForm(l, re) },
    h("div", { class: "t" }, t("k_" + l.kind), l.kind === "shortage" && !l.verified && h("span", { class: "pill draft", style: "margin-left:6px" }, "?")),
    h("div", { class: "s" }, l.biz_date, l.note ? ` · ${l.note}` : ""), h("div", { class: "m money neg" }, "−" + money(l.amount))));
  const ded = h("div", { class: "card" }, h("h2", {}, t("deductions")),
    h("div", { class: "grid2" }, field(t("late"), lateIn, t("lateHelp") + money(R.perMinute)), field(t("incentive"), incIn), field(t("other"), othIn)),
    h("div", { class: "row" }, h("b", {}, t("advAuto"), " / ", t("shortAuto")), h("span", { class: "sp" }), emp && h("button", { class: "btn sm", type: "button", onclick: () => ledgerForm({ employee_id: emp.id, kind: "advance", biz_date: P.end, amount: "" }, re) }, "+ " + t("led_add"))),
    P.ledger.length ? ledList : h("span", { class: "muted" }, t("none")),
    h("div", { class: "row" }, h("b", {}, t("gov")), shareSel), h("div", { class: "row" }, govBox("sss", "SSS"), govBox("philhealth", "PhilHealth"), govBox("pagibig", "Pag-IBIG")), h("small", { class: "muted" }, t("govHelp")));

  // --- result ---
  const tbl = h("table");
  function drawResult() {
    tbl.innerHTML = "";
    const row = (l, v, cls = "") => tbl.append(h("tr", { class: cls }, h("td", {}, l), h("td", { class: "r" }, v)));
    row(t("basic"), money(R.basic)); if (R.premium) row(t("premium"), money(R.premium)); if (R.otPay) row(t("ot"), money(R.otPay)); if (R.ndPay) row(t("nd"), money(R.ndPay));
    if (R.silPay) row(t("silPay"), money(R.silPay)); if (R.holidayOffPay) row(t("holOff"), money(R.holidayOffPay)); if (R.incentive) row(t("incentive"), money(R.incentive));
    if (R.late) row(t("lateDed"), "−" + money(R.late), "neg");
    row(t("gross"), money(R.gross), "sum");
    if (R.advances) row(t("adv"), "−" + money(R.advances), "neg"); if (R.shortage) row(t("shortage"), "−" + money(R.shortage), "neg");
    if (R.sss) row("SSS", "−" + money(R.sss), "neg"); if (R.philhealth) row("PhilHealth", "−" + money(R.philhealth), "neg"); if (R.pagibig) row("Pag-IBIG", "−" + money(R.pagibig), "neg");
    if (R.otherDeduction) row(t("other"), "−" + money(R.otherDeduction), "neg");
    row(t("net"), money(R.net), "net");
    document.getElementById("barNet").textContent = money(R.net);
  }
  const result = h("div", { class: "card" }, h("h2", {}, t("result")), h("div", { class: "tbl" }, tbl));

  // --- actions ---
  const bar = h("div", { class: "bar" }, h("div", { class: "in" },
    h("div", {}, h("div", { class: "lbl" }, t("netLbl"), emp ? ` · ${emp.name}` : "", ` · ${periodLabel(P.start, P.end)}`), h("div", { class: "net" }, "₱", h("span", { id: "barNet" }, "0"))),
    h("span", { class: "sp" }),
    P.id && h("button", { class: "btn", type: "button", onclick: () => payslip(P, emp, R) }, t("slip")),
    owner && !locked && h("button", { class: "btn primary", type: "button", onclick: () => save(false) }, t("save")),
    owner && !locked && P.id && h("button", { class: "btn", type: "button", onclick: () => markPaid() }, t("markPaid")),
    owner && locked && h("button", { class: "btn", type: "button", onclick: () => unpay() }, t("unpay")),
    owner && P.id && h("button", { class: "btn danger sm", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.detachLedger(P.id); await db.deletePayroll(P.id); toast(t("deleted")); await re(); }) }, t("delete"))));

  main.append(head, roster, ded, result, bar);
  drawRoster(); drawResult();

  function refresh() { Object.assign(R, computePayroll(P.days, payOpts(P))); drawResult(); sumEl.textContent = t("summary").replace("{d}", R.daysWorked).replace("{h}", R.hoursWorked).replace("{o}", R.otHours).replace("{n}", R.ndHours).replace("{s}", R.silDays); }
  async function save(paid, extra = {}) {
    if (!P.employee_id) return toast(t("pickEmp"));
    const res = computePayroll(P.days, payOpts(P));
    try {
      const row = await db.savePayroll({ id: P.id || undefined, employee_id: P.employee_id, period_start: P.start, period_end: P.end, daily_rate: P.daily_rate, break_hours: P.break_hours,
        days: P.days, late_minutes: P.late_minutes, incentive: P.incentive, other_deduction: P.other_deduction, gov: P.gov, result: res, status: paid ? "paid" : P.status, ...extra });
      await db.attachLedger(P.ledger.map(l => l.id), row.id);
      P.id = row.id; toast(t("saved")); await re();
    } catch (e) { toast(errMsg(e)); }
  }
  function markPaid() {
    const dIn = h("input", { type: "date", id: "paidOn", value: today() });
    const vIn = sel([["CASH", "Cash"], ["GCASH", "GCash"], ["MAYA", "Maya"], ["METROBANK", "Metrobank"], ["SAVINGBOX", "Saving box"]], P.paid_via || "CASH", { id: "paidVia" });
    const close = sheet([h("h3", {}, t("markPaid")), h("div", { class: "grid2" }, field(t("paidOn"), dIn), field(t("paidVia"), vIn)),
      h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: close }, t("cancel")), h("button", { class: "btn primary", onclick: async () => { close(); await save(true, { paid_on: dIn.value, paid_via: vIn.value }); } }, t("markPaid")))]);
  }
  async function unpay() { try { await db.savePayroll({ id: P.id, status: "draft", paid_on: null, paid_via: null }); await re(); } catch (e) { toast(errMsg(e)); } }
}

function payslip(P, emp, R) {
  const line = (l, v, cls = "") => h("tr", { class: cls }, h("td", {}, l), h("td", { class: "r" }, v));
  const rows = [line(t("basic"), money(R.basic))];
  if (R.premium) rows.push(line(t("premium"), money(R.premium))); if (R.otPay) rows.push(line(`${t("ot")} (${R.otHours}h)`, money(R.otPay))); if (R.ndPay) rows.push(line(`${t("nd")} (${R.ndHours}h)`, money(R.ndPay)));
  if (R.silPay) rows.push(line(`${t("silPay")} (${R.silDays})`, money(R.silPay))); if (R.holidayOffPay) rows.push(line(t("holOff"), money(R.holidayOffPay))); if (R.incentive) rows.push(line(t("incentive"), money(R.incentive)));
  if (R.late) rows.push(line(`${t("lateDed")} (${R.lateMinutes}m)`, "−" + money(R.late), "neg"));
  rows.push(line(t("gross"), money(R.gross), "sum"));
  for (const [k, l] of [["advances", t("adv")], ["shortage", t("shortage")], ["sss", "SSS"], ["philhealth", "PhilHealth"], ["pagibig", "Pag-IBIG"], ["otherDeduction", t("other")]]) if (R[k]) rows.push(line(l, "−" + money(R[k]), "neg"));
  rows.push(line(t("net"), money(R.net), "net"));
  const days = h("div", { class: "tbl" }, h("table", {}, h("tr", {}, h("th", {}, "Date"), h("th", {}, "Shift"), h("th", {}, "Type"), h("th", { class: "r" }, "Hrs"), h("th", { class: "r" }, "OT"), h("th", { class: "r" }, "ND"), h("th", { class: "r" }, "₱")),
    R.rows.filter(r => r.type !== "off").map(r => h("tr", {}, h("td", {}, r.date.slice(5)), h("td", {}, r.shift ? SHIFT_LABEL(r.shift) : "—"), h("td", {}, t("type_" + r.type)), h("td", { class: "r" }, r.hours || ""), h("td", { class: "r" }, r.ot || ""), h("td", { class: "r" }, r.nd || ""), h("td", { class: "r" }, money(r.amount))))));
  const close = sheet(h("div", { class: "slip" },
    h("div", { class: "head" }, h("div", {}, h("b", {}, "PALTONG RESTAURANT"), h("div", { class: "muted" }, "603 Remedios St. Malate Manila")), h("div", {}, h("b", {}, t("slip")), h("div", { class: "muted" }, `${P.start} ~ ${P.end}`))),
    h("div", { class: "grid2" }, h("div", {}, h("b", {}, emp?.name), h("div", { class: "muted" }, t("pos_" + (emp?.position || "other")))), h("div", {}, `${t("daily")}: ₱${money(P.daily_rate)}`, h("div", { class: "muted" }, t("summary").replace("{d}", R.daysWorked).replace("{h}", R.hoursWorked).replace("{o}", R.otHours).replace("{n}", R.ndHours).replace("{s}", R.silDays)))),
    h("table", {}, rows), h("br"), days,
    P.status === "paid" && h("p", { class: "muted" }, `${t("paid")}: ${P.paid_on} · ${P.paid_via}`),
    h("div", { class: "sig" }, h("div", {}, "Employer / Paltong Restaurant"), h("div", {}, "Employee / " + (emp?.name || ""))),
    h("div", { class: "row noprint", style: "margin-top:14px" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: close }, t("close")), h("button", { class: "btn primary", onclick: () => window.print() }, t("print")))));
}

/* ================= EMPLOYEES ================= */
function renderEmp() {
  const main = document.getElementById("main"); const owner = S.user?.role === "owner";
  const list = h("div", { class: "list" });
  for (const e of S.employees) list.append(h("div", { class: "item", onclick: () => owner && empForm(e) },
    h("div", { class: "t" }, e.name, " ", h("span", { class: "pill " + (e.position === "waiter" ? "waiter" : "") }, t("pos_" + e.position)), !e.active && h("span", { class: "pill", style: "margin-left:6px" }, "✕")),
    h("div", { class: "s" }, `${t("st_" + e.status)} · ${t("pt_" + e.pay_type)}${e.hired_on ? " · " + e.hired_on : ""}`), h("div", { class: "m money" }, "₱" + money(e.daily_rate))));
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_emp")), h("span", { class: "sp" }), owner && h("button", { class: "btn primary sm", onclick: () => empForm({ name: "", position: "waiter", daily_rate: S.settings.min_wage, pay_type: "daily", status: "probationary", active: true }) }, "+ " + t("emp_add"))), list));
}
function empForm(e) {
  const E = { ...e }; delete E.created_at;
  const name = h("input", { type: "text", id: "eName", value: E.name, required: true });
  const pos = sel([["waiter", t("pos_waiter")], ["kitchen", t("pos_kitchen")], ["rider", t("pos_rider")], ["other", t("pos_other")]], E.position, { id: "ePos" });
  const rate = h("input", { type: "number", id: "eRate", value: E.daily_rate, step: 1, min: 0 });
  const pt = sel([["daily", t("pt_daily")], ["monthly", t("pt_monthly")]], E.pay_type, { id: "ePt" });
  const st = sel([["regular", t("st_regular")], ["probationary", t("st_probationary")], ["fixed", t("st_fixed")], ["other", t("st_other")]], E.status, { id: "eSt" });
  const hired = h("input", { type: "date", id: "eHired", value: E.hired_on || "" }); const bday = h("input", { type: "date", id: "eBday", value: E.birthday || "" });
  const active = h("input", { type: "checkbox", id: "eActive", checked: E.active }); const note = h("input", { type: "text", id: "eNote", value: E.note || "" });
  const close = sheet(h("form", { onsubmit: async ev => { ev.preventDefault(); try {
      await db.saveEmployee({ ...E, name: name.value.trim(), position: pos.value, daily_rate: +rate.value, pay_type: pt.value, status: st.value, hired_on: hired.value || null, birthday: bday.value || null, active: active.checked, note: note.value || null });
      S.employees = await db.listEmployees(true); toast(t("saved")); close(); render(); } catch (er) { toast(errMsg(er)); } } },
    h("h3", {}, E.id ? E.name : t("emp_add")),
    h("div", { class: "grid2" }, field(t("emp_name"), name), field(t("emp_pos"), pos), field(t("daily"), rate), field(t("emp_payType"), pt), field(t("emp_status"), st), field(t("emp_hired"), hired), field(t("emp_bday"), bday), field(t("emp_note"), note)),
    h("label", { class: "check" }, active, t("emp_active")),
    h("div", { class: "row" }, E.id && h("button", { class: "btn danger sm", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deleteEmployee(E.id); S.employees = await db.listEmployees(true); close(); render(); }) }, t("delete")),
      h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: close }, t("cancel")), h("button", { class: "btn primary", type: "submit" }, t("save")))));
}

/* ================= LEDGER ================= */
const LF = { employeeId: "", kind: "" };
async function renderLedger() {
  const main = document.getElementById("main"); const owner = S.user?.role === "owner";
  const rows = await db.listLedger({ employeeId: LF.employeeId || undefined, kind: LF.kind || undefined });
  const empSel = sel([["", t("led_filter_all")], ...S.employees.map(e => [e.id, e.name])], LF.employeeId, { onchange: e => { LF.employeeId = e.target.value; render(); } });
  const kindSel = sel([["", t("led_filter_all")], ["advance", t("k_advance")], ["shortage", t("k_shortage")], ["other", t("k_other")]], LF.kind, { onchange: e => { LF.kind = e.target.value; render(); } });
  const list = h("div", { class: "list" });
  for (const l of rows) {
    const p = periodForDate(l.biz_date);
    list.append(h("div", { class: "item", onclick: () => owner && ledgerForm(l, () => render()) },
      h("div", { class: "t" }, l.employees?.name, " · ", t("k_" + l.kind), " ", h("span", { class: "pill " + (l.payroll_id ? "paid" : "draft") }, l.payroll_id ? t("led_deducted") : t("led_pending"))),
      h("div", { class: "s" }, l.biz_date, " ", t("led_applies").replace("{p}", periodLabel(p.start, p.end)), l.note ? ` · ${l.note}` : "", l.kind === "shortage" && !l.verified ? " · ⚠" : ""),
      h("div", { class: "m money neg" }, "−" + money(l.amount))));
  }
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_ledger")), h("span", { class: "sp" }), owner && h("button", { class: "btn primary sm", onclick: () => ledgerForm({ employee_id: S.employees[0]?.id || "", kind: "advance", biz_date: today(), amount: "" }, () => render()) }, "+ " + t("led_add"))),
    h("div", { class: "row" }, empSel, kindSel), rows.length ? list : h("span", { class: "muted" }, t("none"))));
}
function ledgerForm(l, after) {
  const L = { ...l }; delete L.employees; delete L.created_at; delete L.created_by;
  const empSel = sel(S.employees.map(e => [e.id, e.name]), L.employee_id, { id: "lEmp" });
  const kind = sel([["advance", t("k_advance")], ["shortage", t("k_shortage")], ["other", t("k_other")]], L.kind, { id: "lKind", onchange: e => { shortBox.hidden = e.target.value !== "shortage"; } });
  const date = h("input", { type: "date", id: "lDate", value: L.biz_date, required: true }); const amt = h("input", { type: "number", id: "lAmt", value: L.amount, step: 1, min: 1, required: true });
  const note = h("input", { type: "text", id: "lNote", value: L.note || "" });
  const ver = h("input", { type: "checkbox", id: "lVer", checked: L.verified !== false }); const auth = h("input", { type: "checkbox", id: "lAuth", checked: !!L.authorized });
  const shortBox = h("div", { style: "display:grid;gap:6px", hidden: L.kind !== "shortage" }, h("label", { class: "check" }, ver, t("led_verified")), h("label", { class: "check" }, auth, t("led_auth")));
  const hint = h("small", { class: "muted" }); const upd = () => { const p = periodForDate(date.value || today()); hint.textContent = t("led_applies").replace("{p}", periodLabel(p.start, p.end)); }; date.addEventListener("input", upd); upd();
  const close = sheet(h("form", { onsubmit: async ev => { ev.preventDefault(); try {
      await db.saveLedger({ ...L, employee_id: empSel.value, kind: kind.value, biz_date: date.value, amount: +amt.value, note: note.value || null, verified: kind.value === "shortage" ? ver.checked : true, authorized: auth.checked });
      toast(t("saved")); close(); after(); } catch (er) { toast(errMsg(er)); } } },
    h("h3", {}, t("led_add")),
    h("div", { class: "grid2" }, field(t("employee"), empSel), field(t("led_kind"), kind), field(t("led_date"), date, hint), field(t("led_amount"), amt), field(t("led_note"), note)), shortBox,
    h("div", { class: "row" }, L.id && h("button", { class: "btn danger sm", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deleteLedger(L.id); close(); after(); }) }, t("delete")),
      h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: close }, t("cancel")), h("button", { class: "btn primary", type: "submit" }, t("save")))));
}

/* ================= HISTORY ================= */
const HF = { month: "" };
async function renderHist() {
  const main = document.getElementById("main");
  const rows = await db.listPayrolls(HF.month ? { from: HF.month + "-01", to: HF.month + "-31" } : {});
  const mIn = h("input", { type: "month", value: HF.month, onchange: e => { HF.month = e.target.value; render(); } });
  const groups = {}; for (const r of rows) (groups[r.period_start + "|" + r.period_end] ||= []).push(r);
  const out = [];
  for (const [k, g] of Object.entries(groups)) {
    const [s, e] = k.split("|"); const tot = g.reduce((a, r) => a + (+r.result?.net || 0), 0);
    out.push(h("div", { class: "card" }, h("div", { class: "row" }, h("h3", {}, periodLabel(s, e)), h("span", { class: "sp" }), h("span", { class: "money" }, `${t("total")} ₱${money(tot)}`)),
      h("div", { class: "list" }, g.map(r => h("div", { class: "item", onclick: () => { S.pay = { ...defaultPay(), employee_id: r.employee_id, month: s.slice(0, 7), half: +s.slice(8) === 1 ? 1 : 2, loaded: false }; S.tab = "pay"; render(); } },
        h("div", { class: "t" }, r.employees?.name, " ", h("span", { class: "pill " + r.status }, r.status === "paid" ? t("paid") : t("draft"))),
        h("div", { class: "s" }, `${t("pos_" + (r.employees?.position || "other"))} · ${r.result?.daysWorked ?? 0}d · OT ${r.result?.otHours ?? 0}h` + (r.paid_on ? ` · ${r.paid_on} ${r.paid_via || ""}` : "")),
        h("div", { class: "m money" }, "₱" + money(r.result?.net)))))));
  }
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_hist")), h("span", { class: "sp" }), mIn)), out.length ? out : h("p", { class: "muted" }, t("hist_empty")));
}

/* ================= SETTINGS ================= */
function renderSet() {
  const main = document.getElementById("main"); const owner = S.user?.role === "owner"; const s = S.settings;
  const wage = h("input", { type: "number", id: "sWage", value: s.min_wage, step: 1, disabled: !owner }); const brk = h("input", { type: "number", id: "sBrk", value: s.break_hours, step: 0.5, disabled: !owner });
  const g = (k, l) => h("label", { class: "check" }, h("input", { type: "checkbox", id: "s_" + k, checked: !!s[k], disabled: !owner }), l);
  const sss = g("sss_on", "SSS"), ph = g("philhealth_on", "PhilHealth"), pag = g("pagibig_on", "Pag-IBIG");
  const share = sel([[0.5, t("govShare")], [1, t("govFull")]], s.gov_share, { disabled: !owner });
  main.append(h("div", { class: "card" }, h("h2", {}, t("tab_set")),
    h("div", { class: "grid2" }, field(t("set_wage"), wage), field(t("set_break"), brk)),
    h("div", {}, h("b", {}, t("set_gov"))), h("div", { class: "row" }, sss, ph, pag, share),
    h("div", { class: "row" }, h("span", {}, t("set_lang")), langSwitch()),
    owner && h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn primary", onclick: async () => { try {
      S.settings = await db.saveSettings({ min_wage: +wage.value, break_hours: +brk.value, sss_on: sss.firstChild.checked, philhealth_on: ph.firstChild.checked, pagibig_on: pag.firstChild.checked, gov_share: +share.value });
      toast(t("saved")); } catch (e) { toast(errMsg(e)); } } }, t("save")))),
    h("div", { class: "card" }, h("h2", {}, t("contract")), h("ul", { style: "margin:0;padding-left:18px;display:grid;gap:4px" }, t("contractText").map(x => h("li", {}, x)))));
}

document.documentElement.lang = lang;
boot().catch(e => { root.innerHTML = ""; root.append(h("div", { class: "login" }, h("div", { class: "card" }, h("div", { class: "err" }, String(e.message || e))))); });
