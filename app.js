import * as db from "./data.js";
import { computePayroll, shiftHours, SHIFTS, SHIFT_LABEL, DAY_TYPES, DAY_TYPES_FOR, periodOf, periodForDate, datesBetween } from "./payroll-calc.js";

/* ---------- i18n ---------- */
const I18N = {
  ko: {
    app: "Paltong 급여", login: "로그인", id: "아이디", pw: "비밀번호", logout: "로그아웃", changePw: "비밀번호 변경", newPw: "새 비밀번호 (6자 이상)",
    tab_pay: "급여 계산", tab_emp: "직원", tab_ledger: "가불·부족분·보너스", tab_hist: "급여 내역", tab_set: "설정",
    employee: "직원", period: "급여 기간", first: "1 – 15일", second: "16일 – 말일", month: "월",
    daily: "일급", monthlyRate: "월급 (초과근무 포함)", breakH: "식사 휴게 (시간/일)", allowDay: "정비비 (₱/근무일)",
    roster: "보름치 시프트 표", off: "휴무", wkend: "주말",
    type_regular: "평일", type_rest: "휴무일 근무", type_special: "특별공휴일", type_specialRest: "특별공휴일+휴무일", type_holiday: "정규공휴일", type_holidayRest: "정규공휴일+휴무일", type_holidayOff: "정규공휴일 쉼", type_sil: "SIL 유급휴가", type_absent: "결근 (공제)", type_off: "휴무",
    fill: "채우기", fillHelp: "휴무는 고정이 아니에요: 시프트로 전체 채운 뒤, 쉬는 날은 날짜를 눌러 휴무로 바꾸세요 (다시 누르면 근무). 캐시북 근무 스케줄을 그대로 불러올 수도 있어요.",
    restDay: "주 휴무 요일", dow: ["일", "월", "화", "수", "목", "금", "토"],
    late: "지각·조퇴 합계 (분)", lateHelp: "실제 미근무 시간만 공제 · 분당 ₱", incentive: "수동 인센티브·수당 (+)", other: "기타 공제 (−)",
    deductions: "공제 · 보너스", ledgerAuto: "이 기간 자동 반영 (가불 · 현금 부족분 · 보너스)", none: "없음",
    gov: "법정 공제 (근로자 부담분)", govShare: "반달치 (½)", govFull: "한 달치", govHelp: "참고값 · SSS 5% · PhilHealth 2.5% · Pag-IBIG 2% (최대 ₱200)",
    result: "계산 내역", basic: "기본급 (근무시간 × 시급)", basicM: "기본급 (월급 ÷ 2)", premium: "휴무일·공휴일 할증", ot: "초과근무", otIncl: "초과근무 (월급에 포함 · 별도 지급 없음)", nd: "야간근무 가산 (10%)",
    silPay: "SIL · 유급휴가", holOff: "정규공휴일 유급 (쉼)", allowance: "오토바이 정비비 ({d}일 × ₱{a})", absentDed: "결근 공제 ({d}일)",
    lateDed: "지각·조퇴 공제", gross: "총 지급액 (Gross)", adv: "가불금", shortage: "현금 부족분", bonus: "보너스 (최고매출일 · 신메뉴 등)", net: "실수령액 (Net)",
    summary: "근무 {d}일 · {h}h · 초과 {o}h · 야간 {n}h · SIL {s}일", netLbl: "실수령액",
    for13: "13월급 산정용 기본급", riderNote: "배달비·유류비는 당일 현금 지급 (캐시북 직원 탭) · 급여에 포함 안 됨", monthlyNote: "₱30,000 월급은 초과근무 포함 (계약 2.2) · 야간·공휴일·휴무일 할증은 별도 지급 · 결근·지각은 일할 공제",
    save: "저장", saved: "저장됨", markPaid: "지급 완료로 기록", paid: "지급됨", draft: "작성중", unpay: "지급 취소", paidOn: "지급일", paidVia: "지급 계좌", slip: "급여명세서", print: "인쇄", delete: "삭제", confirmDel: "정말 삭제할까요?", yes: "삭제", cancel: "취소", close: "닫기",
    emp_add: "직원 추가", emp_name: "이름", emp_pos: "직위", pos_waiter: "웨이터/서버", pos_kitchen: "주방", pos_rider: "라이더", pos_other: "기타",
    emp_status: "고용 형태", st_regular: "정규직", st_probationary: "수습", st_fixed: "계약직", st_other: "기타", emp_hired: "입사일", emp_bday: "생일", emp_active: "재직 중", emp_note: "메모",
    emp_payType: "급여 형태", pt_daily: "일급 (₱718)", pt_monthly: "월급 (₱30,000 OT 포함)",
    led_add: "기록 추가", led_kind: "종류", k_advance: "가불", k_shortage: "현금 부족분", k_bonus: "보너스 (+)", k_other: "기타 공제", led_date: "날짜", led_amount: "금액", led_note: "메모",
    led_verified: "조사 완료 · 본인 책임 확인", led_auth: "서면 동의 받음", led_applies: "→ {p} 급여에 반영", led_deducted: "반영됨", led_pending: "미반영", led_filter_all: "전체",
    bonusHint: "최고매출일 보너스 = 그날 총매출 × 2% ÷ 근무한 대상자 수 · 주방 신메뉴 인센티브 등",
    hist_empty: "저장된 급여가 없어요. 급여 계산 탭에서 저장하세요.", total: "합계",
    set_wage: "기본 일급 (최저임금)", set_break: "기본 식사 휴게 (시간)", set_gov: "법정 공제 기본값", set_lang: "언어", set_rider: "라이더 정비비 (₱/근무일)", set_kitchen: "주방 월급 기본값",
    contract: "계약서 요약", contractText: [
      "공통 — 지급일 15일·30일 · 초과근무는 승인된 시간만 · 야간(22~06시) +10% · 휴무일 130% · 특별공휴일 130% · 정규공휴일 200%(쉬어도 100%) · 지각은 실제 미근무 분만 공제 · 개근 시 다음 달 유급휴가 1일(SIL) · 생일 달 직전 3개월 개근 시 생일 인센티브 · 가불 1~15일 신청→15일, 16일~→30일 급여 공제 · 주간 최고매출일 보너스 = 매출 2% ÷ 근무 대상자 수 · 13월급 = 기본급 기준",
      "웨이터/서버 (일급 ₱718) — 현금 부족분은 조사 후 본인 책임 확정 + 서면 동의 시에만 공제. 근무 중이었다는 이유만으로 분담 불가",
      "주방 (일급 ₱718 또는 월급 ₱30,000) — 월급은 주6일·8시간 기준이며 초과근무 포함(별도 OT 없음). 야간·공휴일·휴무일 할증은 법대로 지급. 신메뉴 개발 성공 시 특별 인센티브",
      "라이더 (일급 ₱718) — 배달비는 당일 지급(급여 별도) · 유류비는 근무 중 영수증 당일 환급 · 오토바이 정비비 ₱100/실근무일을 급여에 포함(기본급 아님, 13월급 제외) · 배달 거부 시 해당 배달비 없음",
    ],
    noPerm: "권한이 없어요 (관리자만 가능)", paidLocked: "지급 완료된 급여는 관리자만 바꿀 수 있어요", loginFail: "아이디 또는 비밀번호가 틀려요",
    pickEmp: "직원을 먼저 고르세요", deleted: "삭제됨", weekendHelp: "금·토 = 주말",
    fromSched: "캐시북 스케줄 불러오기", schedLoaded: "캐시북 스케줄에서 {n}일 불러왔어요", schedNone: "이 기간 캐시북 스케줄에 이 직원이 없어요", fillAll: "전체 채우기", tapOff: "쉬는 날은 날짜를 눌러 휴무로 (다시 누르면 근무)",
    cbTitle: "캐시북 현금 부족 (확인 필요)", cbHelp: "중간마감·마감에서 센 현금이 장부보다 모자라면 여기 들어와요. 자동으로 빠지지 않아요 — 조사 후 책임 웨이터를 지정하고, 가불·부족분에서 '본인 책임 확인'과 '서면 동의'를 둘 다 체크해야 급여에서 공제돼요.", cbNone: "확인할 부족분이 없어요", cbDone: "처리한 것", cbMid: "중간마감", cbFinal: "마감", cbCounted: "센 현금", cbBook: "장부", cbBy: "센 사람", cbReason: "사유", cbDuty: "근무", is_open: "확인 필요", is_assigned: "웨이터 지정됨", is_dismissed: "해결됨 (공제 안 함)",
    cbLaw: "근무 중이었다는 이유만으로 나눠서 빼면 안 돼요. 본인에게 설명할 기회를 주고, 책임이 확인된 한 사람에게만 지정하세요. 지정 후 가불·부족분에서 '본인 책임 확인'과 '서면 동의 받음'을 체크해야 공제돼요.", cbWho: "책임 웨이터", cbAssign: "이 웨이터의 부족분으로 넣기 (미확인)", cbAssigned: "부족분에 넣었어요 — 확인·동의 체크 후 공제돼요", cbDismissLbl: "찾았거나 장부 실수였다면 (메모)", cbFoundPh: "예: 다음날 서랍에서 찾음 / 매출 입력 실수", cbDismiss: "해결됨 — 공제 안 함", notDeducted: "공제 전 (확인·동의 필요)",
    asStaff: "직원", asAdmin: "관리자", empNo: "직원 번호", pin: "PIN (숫자)", pinFirst: "처음이면 PIN 0000", pinWrong: "번호 또는 PIN이 틀려요", pinLocked: "5번 틀려서 10분 동안 잠겼어요",
    newPinTitle: "내 PIN 등록", newPinHelp: "처음 로그인이에요. 나만 아는 숫자 4~6자리로 PIN을 새로 정해주세요 (0000 안 됨).", newPin: "새 PIN", newPin2: "새 PIN 다시", pinMismatch: "두 PIN이 달라요", pinBad: "숫자 4~6자리로 정해주세요 (0000 안 됨)", pinSaved: "PIN을 등록했어요",
    myPay: "내 급여명세서", myLedger: "내 가불·부족분", myShifts: "내 근무 기록", notPaidYet: "아직 지급 전", noData: "아직 기록이 없어요", empNoLbl: "번호", resetPin: "PIN 초기화 (0000)", pinReset: "PIN을 0000으로 초기화했어요. 다음 로그인 때 본인이 다시 등록해요.", pinSet: "PIN 등록됨", pinNotSet: "PIN 미등록 (0000)",
  },
  en: {
    app: "Paltong Payroll", login: "Sign in", id: "ID", pw: "Password", logout: "Sign out", changePw: "Change password", newPw: "New password (6+ chars)",
    tab_pay: "Payroll", tab_emp: "Staff", tab_ledger: "Advances · shortages · bonuses", tab_hist: "History", tab_set: "Settings",
    employee: "Employee", period: "Pay period", first: "1st – 15th", second: "16th – end", month: "Month",
    daily: "Daily rate", monthlyRate: "Monthly salary (OT-inclusive)", breakH: "Meal break (hrs/day)", allowDay: "Maintenance (₱/duty day)",
    roster: "Half-month shift roster", off: "Off", wkend: "Weekend",
    type_regular: "Regular day", type_rest: "Rest day worked", type_special: "Special holiday", type_specialRest: "Special holiday + rest day", type_holiday: "Regular holiday", type_holidayRest: "Regular holiday + rest day", type_holidayOff: "Regular holiday, not worked", type_sil: "SIL paid leave", type_absent: "Absent (deducted)", type_off: "Off",
    fill: "Fill", fillHelp: "Days off aren’t fixed: fill every date with a shift, then tap a date to make it a day off (tap again to work). Or load the Cash Book work schedule.",
    restDay: "Weekly rest day", dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    late: "Tardiness / undertime (minutes)", lateHelp: "Only actual unworked time · per minute ₱", incentive: "Manual incentive / allowance (+)", other: "Other deduction (−)",
    deductions: "Deductions · bonuses", ledgerAuto: "Applied automatically this period (advances · shortage · bonuses)", none: "none",
    gov: "Statutory deductions (employee share)", govShare: "Half-month (½)", govFull: "Full month", govHelp: "Reference · SSS 5% · PhilHealth 2.5% · Pag-IBIG 2% (max ₱200)",
    result: "Computation", basic: "Basic pay (hours × hourly)", basicM: "Basic pay (monthly ÷ 2)", premium: "Rest-day / holiday premium", ot: "Overtime", otIncl: "Overtime (included in monthly salary · not paid separately)", nd: "Night differential (10%)",
    silPay: "SIL · paid leave", holOff: "Regular holiday paid (not worked)", allowance: "Motorcycle maintenance ({d} days × ₱{a})", absentDed: "Absence deduction ({d} days)",
    lateDed: "Tardiness / undertime", gross: "Gross pay", adv: "Salary advance", shortage: "Cash shortage", bonus: "Bonus (highest-sales day · new menu)", net: "Net pay",
    summary: "{d} days · {h}h · OT {o}h · night {n}h · SIL {s} days", netLbl: "Net pay",
    for13: "Basic for 13th-month pay", riderNote: "Delivery fee & fuel are paid same day in cash (cash book Staff tab) · not part of payroll", monthlyNote: "₱30,000 is OT-inclusive (contract 2.2) · night / holiday / rest-day premiums paid separately · absence & tardiness deducted pro-rata",
    save: "Save", saved: "Saved", markPaid: "Record as paid", paid: "Paid", draft: "Draft", unpay: "Undo paid", paidOn: "Paid on", paidVia: "Paid via", slip: "Payslip", print: "Print", delete: "Delete", confirmDel: "Delete this?", yes: "Delete", cancel: "Cancel", close: "Close",
    emp_add: "Add employee", emp_name: "Name", emp_pos: "Position", pos_waiter: "Waiter / Server", pos_kitchen: "Kitchen", pos_rider: "Rider", pos_other: "Other",
    emp_status: "Employment status", st_regular: "Regular", st_probationary: "Probationary", st_fixed: "Fixed-term", st_other: "Other", emp_hired: "Date hired", emp_bday: "Birthday", emp_active: "Active", emp_note: "Note",
    emp_payType: "Pay type", pt_daily: "Daily (₱718)", pt_monthly: "Monthly (₱30,000 OT-inclusive)",
    led_add: "Add record", led_kind: "Kind", k_advance: "Advance", k_shortage: "Cash shortage", k_bonus: "Bonus (+)", k_other: "Other deduction", led_date: "Date", led_amount: "Amount", led_note: "Note",
    led_verified: "Investigated · responsibility established", led_auth: "Written authorization on file", led_applies: "→ applied to {p} payroll", led_deducted: "applied", led_pending: "pending", led_filter_all: "All",
    bonusHint: "Highest-sales-day bonus = that day's sales × 2% ÷ eligible staff on duty · kitchen new-menu incentive, etc.",
    hist_empty: "No saved payrolls yet. Save one from the Payroll tab.", total: "Total",
    set_wage: "Default daily rate (minimum wage)", set_break: "Default meal break (hours)", set_gov: "Statutory deduction defaults", set_lang: "Language", set_rider: "Rider maintenance (₱/duty day)", set_kitchen: "Kitchen monthly default",
    contract: "Contract summary", contractText: [
      "Common — paydays 15th & 30th · OT only when approved · night (10pm–6am) +10% · rest day 130% · special holiday 130% · regular holiday 200% (100% if not worked) · tardiness: actual unworked minutes only · perfect month → 1 paid leave day (SIL) · birthday incentive after 3 perfect months · advance 1st–15th → 15th payroll, 16th on → 30th · weekly highest-sales-day bonus = sales × 2% ÷ eligible staff on duty · 13th month on basic pay",
      "Waiter / Server (₱718/day) — cash shortage deducted only after investigation, established responsibility and written authorization; no automatic splitting among staff on duty",
      "Kitchen (₱718/day or ₱30,000/month) — monthly is 6 days × 8h and OT-inclusive (no separate OT pay); night, holiday and rest-day premiums paid per law; special incentive for a successful new menu item",
      "Rider (₱718/day) — delivery fee paid same day (outside payroll) · fuel reimbursed same day with receipt · motorcycle maintenance ₱100 per duty day paid with payroll (not basic, excluded from 13th month) · refused delivery earns no fee",
    ],
    noPerm: "No permission (owner only)", paidLocked: "A paid payroll can only be changed by the owner", loginFail: "Wrong ID or password",
    pickEmp: "Pick an employee first", deleted: "Deleted", weekendHelp: "Fri · Sat = weekend",
    fromSched: "Load Cash Book schedule", schedLoaded: "Loaded {n} days from the Cash Book schedule", schedNone: "This employee isn’t on the Cash Book schedule for this period", fillAll: "Fill all", tapOff: "Tap a date to make it a day off (tap again to work)",
    cbTitle: "Cash Book shortages (to check)", cbHelp: "When counted cash at a mid-close or close is less than the book, it lands here. Nothing is deducted automatically — investigate, assign the responsible waiter, then tick both 'responsibility established' and 'written authorization' in Advances & shortages before it comes off pay.", cbNone: "No shortages to check", cbDone: "Handled", cbMid: "Mid-close", cbFinal: "Close", cbCounted: "Counted", cbBook: "Book", cbBy: "Counted by", cbReason: "Reason", cbDuty: "On duty", is_open: "To check", is_assigned: "Waiter assigned", is_dismissed: "Resolved (no deduction)",
    cbLaw: "Don’t split a shortage among everyone on duty. Give the waiter a chance to explain and assign it only to the one person found responsible. It is deducted only after you tick 'responsibility established' and 'written authorization on file'.", cbWho: "Responsible waiter", cbAssign: "Add as this waiter’s shortage (unverified)", cbAssigned: "Added — deducted after verification & authorization", cbDismissLbl: "Found it / book mistake (note)", cbFoundPh: "e.g. found in drawer next day / sale entered wrong", cbDismiss: "Resolved — no deduction", notDeducted: "not deducted (needs verification & consent)",
    asStaff: "Staff", asAdmin: "Admin", empNo: "Employee no.", pin: "PIN (numbers)", pinFirst: "First time? PIN is 0000", pinWrong: "Wrong number or PIN", pinLocked: "Locked for 10 minutes after 5 wrong tries",
    newPinTitle: "Set your PIN", newPinHelp: "First sign-in. Choose your own 4–6 digit PIN (not 0000).", newPin: "New PIN", newPin2: "New PIN again", pinMismatch: "The PINs don’t match", pinBad: "Use 4–6 digits (not 0000)", pinSaved: "PIN saved",
    myPay: "My payslips", myLedger: "My advances & shortages", myShifts: "My shifts", notPaidYet: "not paid yet", noData: "Nothing yet", empNoLbl: "No.", resetPin: "Reset PIN (0000)", pinReset: "PIN reset to 0000. They set a new one at next sign-in.", pinSet: "PIN set", pinNotSet: "PIN not set (0000)",
  },
};
let lang = "ko"; try { lang = localStorage.getItem("pp-lang") || "ko"; } catch {}
const t = k => I18N[lang][k] ?? I18N.ko[k] ?? k;
const tf = (k, vars) => Object.entries(vars).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, b), t(k));

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
const payTypeOf = emp => emp?.pay_type || "daily";

/* ---------- state ---------- */
const S = { user: null, settings: null, employees: [], tab: "pay", pay: null };
const root = document.getElementById("root");

async function boot() {
  const ok = await db.init();
  if (!ok) return renderLogin();
  S.user = await db.me();
  S.settings = await db.getSettings().catch(() => ({ min_wage: 718, break_hours: 1, sss_on: false, philhealth_on: false, pagibig_on: false, gov_share: 0.5, rider_allowance: 100, kitchen_monthly: 30000 }));
  S.employees = await db.listEmployees(true);
  render();
}

let loginMode = "staff"; try { loginMode = localStorage.getItem("pp-login") || "staff"; } catch {}
function renderLogin(err) {
  if (loginMode === "staff") return renderStaffLogin(err);
  const id = h("input", { type: "text", id: "lid", autocomplete: "username", placeholder: "admin" });
  const pw = h("input", { type: "password", id: "lpw", autocomplete: "current-password" });
  const form = h("form", { onsubmit: async e => { e.preventDefault(); try { await db.signIn(id.value, pw.value); boot(); } catch { renderLogin(t("loginFail")); } } },
    h("div", { class: "card" }, h("h1", {}, t("app")), modeSwitch(), field(t("id"), id), field(t("pw"), pw), err && h("div", { class: "err" }, err),
      h("button", { class: "btn primary", type: "submit" }, t("login")), langSwitch()));
  root.innerHTML = ""; root.append(h("div", { class: "login" }, form));
}
function modeSwitch() {
  const set = m => { loginMode = m; try { localStorage.setItem("pp-login", m); } catch {} renderLogin(); };
  return h("div", { class: "row seg" },
    h("button", { type: "button", class: "btn sm", id: "mode-staff", "aria-pressed": loginMode === "staff", onclick: () => set("staff") }, t("asStaff")),
    h("button", { type: "button", class: "btn sm", id: "mode-admin", "aria-pressed": loginMode === "admin", onclick: () => set("admin") }, t("asAdmin")));
}
/* ================= 직원 본인 보기 (번호 + PIN) ================= */
const EMP = { no: "", pin: "", data: null };
function renderStaffLogin(err, typedNo) {
  let last = typedNo || ""; if (!last) try { last = localStorage.getItem("pp-empno") || ""; } catch {}
  const no = h("input", { type: "text", id: "eno", inputmode: "numeric", autocomplete: "username", placeholder: "00001", value: last });
  const pin = h("input", { type: "password", id: "epin", inputmode: "numeric", autocomplete: "current-password", maxlength: 6, placeholder: "••••" });
  const form = h("form", { onsubmit: async e => { e.preventDefault(); await staffSignIn(no.value, pin.value); } },
    h("div", { class: "card" }, h("h1", {}, t("app")), modeSwitch(), field(t("empNo"), no), field(t("pin"), pin, t("pinFirst")), err && h("div", { class: "err", id: "elogin-err" }, err),
      h("button", { class: "btn primary", type: "submit", id: "elogin" }, t("login")), langSwitch()));
  root.innerHTML = ""; root.append(h("div", { class: "login" }, form));
}
async function staffSignIn(no, pin) {
  try {
    await db.init();
    const v = await db.empView(no, pin);
    if (!v.ok) return renderStaffLogin(v.err === "locked" ? t("pinLocked") : t("pinWrong"), no);
    EMP.no = String(no).trim(); EMP.pin = String(pin);
    try { localStorage.setItem("pp-empno", EMP.no); } catch {}
    if (v.must_change) return renderSetPin(v.name);
    EMP.data = v; renderStaffHome();
  } catch (e) { renderStaffLogin(String(e.message || e), no); }
}
function renderSetPin(name, err) {
  const a = h("input", { type: "password", id: "np1", inputmode: "numeric", maxlength: 6 }), b = h("input", { type: "password", id: "np2", inputmode: "numeric", maxlength: 6 });
  const form = h("form", { onsubmit: async e => { e.preventDefault();
      if (a.value !== b.value) return renderSetPin(name, t("pinMismatch"));
      if (!/^[0-9]{4,6}$/.test(a.value) || a.value === "0000") return renderSetPin(name, t("pinBad"));
      try { const r = await db.empSetPin(EMP.no, EMP.pin, a.value); if (!r.ok) return renderSetPin(name, r.err === "locked" ? t("pinLocked") : t("pinBad"));
        toast(t("pinSaved")); await staffSignIn(EMP.no, a.value); } catch (er) { renderSetPin(name, String(er.message || er)); } } },
    h("div", { class: "card" }, h("h1", {}, t("newPinTitle")), h("p", { class: "muted" }, name ? name + " · " : "", t("newPinHelp")),
      field(t("newPin"), a), field(t("newPin2"), b), err && h("div", { class: "err", id: "np-err" }, err),
      h("button", { class: "btn primary", type: "submit", id: "np-save" }, t("save"))));
  root.innerHTML = ""; root.append(h("div", { class: "login" }, form));
}
function renderStaffHome() {
  const v = EMP.data, emp = v.employee;
  root.innerHTML = "";
  const paid = v.payrolls.filter(p => p.status === "paid" && p.result);
  const payList = h("div", { class: "list", id: "my-pay" }, paid.length ? paid.map(p => h("div", { class: "item", onclick: () => {
      const P = { start: p.period_start, end: p.period_end, daily_rate: p.daily_rate, status: p.status, paid_on: p.paid_on, paid_via: p.paid_via };
      payslip({ ...P, pay_type: p.pay_type || 'daily', monthly_rate: p.monthly_rate }, { name: emp.name, position: emp.position }, p.result); } },
    h("div", { class: "t" }, periodLabel(p.period_start, p.period_end)), h("div", { class: "s" }, `${t("paid")} ${p.paid_on || ""} · ${p.paid_via || ""}`), h("div", { class: "m money" }, "₱" + money(p.result.net))))
    : h("span", { class: "muted" }, t("noData")));
  const ledList = h("div", { class: "list", id: "my-ledger" }, v.ledger.length ? v.ledger.map(l => { const p = periodForDate(l.biz_date);
    return h("div", { class: "item" }, h("div", { class: "t" }, t("k_" + l.kind), " ", h("span", { class: "pill " + (l.deducted ? "paid" : "draft") }, l.deducted ? t("led_deducted") : t("led_pending"))),
      h("div", { class: "s" }, l.biz_date, " ", t("led_applies").replace("{p}", periodLabel(p.start, p.end)), l.note ? ` · ${l.note}` : ""), h("div", { class: "m money " + (l.kind === "bonus" ? "pos" : "neg") }, (l.kind === "bonus" ? "+" : "−") + money(l.amount))); })
    : h("span", { class: "muted" }, t("noData")));
  const shifts = h("div", { id: "my-shifts" }, v.payrolls.length ? v.payrolls.map(p => h("details", { class: "card", style: "margin:0 0 8px" },
      h("summary", {}, h("b", {}, periodLabel(p.period_start, p.period_end)), " ", h("span", { class: "pill " + p.status }, p.status === "paid" ? t("paid") : t("notPaidYet"))),
      h("div", { class: "tbl" }, h("table", {}, (p.days || []).filter(d => d.type !== "off" || d.shift).map(d => h("tr", {}, h("td", {}, d.date.slice(5) + " " + t("dow")[new Date(d.date + "T00:00:00").getDay()]),
        h("td", {}, d.shift ? SHIFT_LABEL(d.shift) : "—"), h("td", {}, t("type_" + d.type)))))))) : h("span", { class: "muted" }, t("noData")));
  root.append(
    h("div", { class: "top" }, h("span", { class: "brand" }, t("app")), h("span", { class: "sp" }),
      h("span", { style: "opacity:.85;font-size:13px" }, `${emp.name} · ${t("empNoLbl")} ${emp.emp_no}`),
      h("button", { onclick: () => { setLangOnly(lang === "ko" ? "en" : "ko"); renderStaffHome(); } }, lang === "ko" ? "EN" : "한"),
      h("button", { id: "e-logout", onclick: () => { EMP.pin = ""; EMP.data = null; renderStaffLogin(); } }, t("logout"))),
    h("main", { id: "main" },
      h("div", { class: "card" }, h("h2", {}, t("myPay")), payList),
      h("div", { class: "card" }, h("h2", {}, t("myLedger")), ledList),
      h("div", { class: "card" }, h("h2", {}, t("myShifts")), shifts)));
}
function setLangOnly(l) { lang = l; try { localStorage.setItem("pp-lang", l); } catch {} document.documentElement.lang = l; }
function langSwitch() {
  return h("div", { class: "row" },
    h("button", { type: "button", class: "btn sm", "aria-pressed": lang === "ko", onclick: () => setLang("ko") }, "한국어"),
    h("button", { type: "button", class: "btn sm", "aria-pressed": lang === "en", onclick: () => setLang("en") }, "English"));
}
function setLang(l) { lang = l; try { localStorage.setItem("pp-lang", l); } catch {} document.documentElement.lang = l; S.user ? render() : EMP.data ? renderStaffHome() : renderLogin(); }

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
    h("button", { class: "btn ghost", onclick: () => close() }, t("close")),
  ]);
}
function changePw() {
  const pw = h("input", { type: "password", id: "npw", minlength: 6 });
  const close = sheet(h("form", { onsubmit: async e => { e.preventDefault(); try { await db.changePassword(pw.value); toast(t("saved")); close(); } catch (er) { toast(errMsg(er)); } } },
    h("h3", {}, t("changePw")), field(t("newPw"), pw), h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: () => close() }, t("cancel")), h("button", { class: "btn primary", type: "submit" }, t("save")))));
}

function resultRows(R, P) {
const monthly = P.pay_type === "monthly";
  const rows = []; const row = (l, v, cls = "") => rows.push(h("tr", { class: cls }, h("td", {}, l), h("td", { class: "r" }, v)));
  row(monthly ? t("basicM") : t("basic"), money(R.basic));
  if (R.premium) row(t("premium"), money(R.premium));
  if (monthly && R.otHours) row(`${t("otIncl")} · ${R.otHours}h`, "0.00"); else if (R.otPay) row(`${t("ot")} (${R.otHours}h)`, money(R.otPay));
  if (R.ndPay) row(`${t("nd")} (${R.ndHours}h)`, money(R.ndPay));
  if (R.silPay) row(`${t("silPay")} (${R.silDays})`, money(R.silPay)); if (R.holidayOffPay) row(t("holOff"), money(R.holidayOffPay));
  if (R.allowance) row(tf("allowance", { d: R.daysWorked, a: money(P.allowance_per_day ?? (R.daysWorked ? R.allowance / R.daysWorked : 0)) }), money(R.allowance));
  if (R.bonus) row(t("bonus"), money(R.bonus)); if (R.incentive) row(t("incentive"), money(R.incentive));
  if (R.absentDed) row(tf("absentDed", { d: R.absentDays }), "−" + money(R.absentDed), "neg");
  if (R.late) row(`${t("lateDed")} (${R.lateMinutes}m)`, "−" + money(R.late), "neg");
  row(t("gross"), money(R.gross), "sum");
  if (R.advances) row(t("adv"), "−" + money(R.advances), "neg"); if (R.shortage) row(t("shortage"), "−" + money(R.shortage), "neg");
  if (R.sss) row("SSS", "−" + money(R.sss), "neg"); if (R.philhealth) row("PhilHealth", "−" + money(R.philhealth), "neg"); if (R.pagibig) row("Pag-IBIG", "−" + money(R.pagibig), "neg");
  if (R.otherDeduction) row(t("other"), "−" + money(R.otherDeduction), "neg");
  row(t("net"), money(R.net), "net");
  return rows;
}

/* ================= PAYROLL TAB ================= */
function defaultPay() {
  const d = new Date(); const half = d.getDate() <= 15 ? 1 : 2; const p = periodOf(d.getFullYear(), d.getMonth() + 1, half);
  return { employee_id: "", month: p.start.slice(0, 7), half, start: p.start, end: p.end, id: null, status: "draft", loaded: false,
    pay_type: "daily", daily_rate: +S.settings.min_wage || 718, monthly_rate: +S.settings.kitchen_monthly || 30000, allowance_per_day: 0,
    break_hours: +S.settings.break_hours || 1, days: [], late_minutes: 0, incentive: 0, other_deduction: 0,
    gov: { sss: !!S.settings.sss_on, philhealth: !!S.settings.philhealth_on, pagibig: !!S.settings.pagibig_on, share: +S.settings.gov_share || 0.5 },
    ledger: [], paid_on: null, paid_via: null, restDow: 1, fillShift: "8-18" };
}
function emptyDay(date) { return { date, shift: "", type: "off" }; }
async function loadPay(P) {
  const emp = S.employees.find(e => e.id === P.employee_id);
  P.pay_type = payTypeOf(emp);
  const [y, m] = P.month.split("-").map(Number); const p = periodOf(y, m, P.half); P.start = p.start; P.end = p.end;
  const dates = datesBetween(P.start, P.end);
  if (emp) {
    const row = await db.getPayroll(P.employee_id, P.start, P.end);
    if (row) {
      Object.assign(P, { id: row.id, status: row.status, daily_rate: +row.daily_rate, monthly_rate: +row.monthly_rate || +emp.monthly_rate, allowance_per_day: +row.allowance_per_day,
        break_hours: +row.break_hours, late_minutes: row.late_minutes, incentive: +row.incentive, other_deduction: +row.other_deduction, gov: row.gov, paid_on: row.paid_on, paid_via: row.paid_via });
      const byDate = Object.fromEntries((row.days || []).map(d => [d.date, d]));
      P.days = dates.map(d => byDate[d] || emptyDay(d));
    } else {
      Object.assign(P, { id: null, status: "draft", daily_rate: +emp.daily_rate, monthly_rate: +emp.monthly_rate || +S.settings.kitchen_monthly, allowance_per_day: +emp.allowance_per_day || 0,
        late_minutes: 0, incentive: 0, other_deduction: 0, paid_on: null, paid_via: null });
      P.days = dates.map(d => emptyDay(d));
    }
    const led = await db.listLedger({ employeeId: P.employee_id });
    const inPeriod = l => periodForDate(l.biz_date).start === P.start;
    P.ledger = led.filter(l => (P.id && l.payroll_id === P.id) || (!l.payroll_id && inPeriod(l)));
    if (emp.position !== "waiter") P.ledger = P.ledger.filter(l => l.kind !== "shortage");
  } else { P.days = dates.map(d => emptyDay(d)); P.ledger = []; }
}
function payOpts(P) {
  const sum = k => P.ledger.filter(l => l.kind === k && (k !== "shortage" || (l.verified && l.authorized))).reduce((a, l) => a + +l.amount, 0);
  const o = { payType: P.pay_type, daily: P.daily_rate, monthly: P.monthly_rate, breakHrs: P.break_hours, allowancePerDay: P.allowance_per_day,
    lateMinutes: P.late_minutes, incentive: P.incentive, bonus: sum("bonus"), advances: sum("advance"), shortage: sum("shortage"),
    otherDeduction: (+P.other_deduction || 0) + sum("other"), gov: P.gov, govShare: +P.gov.share === 1 ? 1 : 0.5 };
  return o;
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
  const monthly = P.pay_type === "monthly";
  const re = async () => { P.loaded = false; render(); };

  // --- header ---
  const empSel = sel([["", "—"], ...S.employees.filter(e => e.active || e.id === P.employee_id).map(e => [e.id, e.name])], P.employee_id, { id: "pEmp", onchange: async e => { P.employee_id = e.target.value; await re(); } });
  const monthIn = h("input", { type: "month", id: "pMonth", value: P.month, onchange: async e => { P.month = e.target.value; await re(); } });
  const halfSel = sel([[1, t("first")], [2, t("second")]], P.half, { id: "pHalf", onchange: async e => { P.half = +e.target.value; await re(); } });
  const numIn = (id, key, step, obj = P) => h("input", { type: "number", id, value: obj[key], step, min: 0, disabled: locked, oninput: e => { obj[key] = +e.target.value || 0; refresh(); } });
  const headFields = [field(t("employee"), empSel)];
  headFields.push(field(t("month"), monthIn), field(t("period"), halfSel));
  if (monthly) headFields.push(field(t("monthlyRate"), numIn("pMonthly", "monthly_rate", 100)));
  else headFields.push(field(t("daily"), numIn("pDaily", "daily_rate", 1)));
  headFields.push(field(t("breakH"), numIn("pBreak", "break_hours", 0.5)));
  if (emp?.position === "rider") headFields.push(field(t("allowDay"), numIn("pAllow", "allowance_per_day", 10)));
  const note = monthly ? t("monthlyNote") : emp?.position === "rider" ? t("riderNote") : null;
  const head = h("div", { class: "card" },
    h("div", { class: "row" }, h("h2", {}, t("tab_pay")), h("span", { class: "sp" }), P.id && h("span", { class: "pill " + P.status }, locked ? t("paid") : t("draft")),
      emp && h("span", { class: "pill " + (emp.position === "waiter" ? "waiter" : "") }, t("pos_" + emp.position), " · ", t("pt_" + P.pay_type).split(" (")[0])),
    h("div", { class: "grid2" }, headFields), note && h("small", { class: "muted" }, note));

  // --- roster ---
  const rosterEl = h("div", { class: "roster", id: "roster" });
  const sumEl = h("p", { class: "muted", id: "rosterSum" });
  const summary = () => tf("summary", { d: R.daysWorked, h: R.hoursWorked, o: R.otHours, n: R.ndHours, s: R.silDays });
  function drawRoster() {
    rosterEl.innerHTML = "";
    for (const d of P.days) {
      const dt = new Date(d.date + "T00:00:00"); const dow = dt.getDay(); const wk = dow === 5 || dow === 6;   // 주말 = 금·토
      const toggle = () => { if (locked) return; if (d.type === "off") { d.shift = d.shift || P.fillShift; d.type = "regular"; } else { d.shift = ""; d.type = "off"; } drawRoster(); refresh(); };
      const lbl = h("div", { class: "d", role: "button", title: t("off"), style: locked ? "" : "cursor:pointer", onclick: toggle }, t("dow")[dow], h("b", {}, +d.date.slice(8)));
      const sh = DAY_TYPES[d.type]?.worked ? shiftHours(d.shift, P.break_hours) : null;
      const cls = "day" + (d.type === "off" ? " off" : "") + (d.type === "sil" ? " sil" : "") + (/holiday|special|absent/.test(d.type) ? " hol" : "") + (wk ? " wknd" : "");
      const shiftSel = sel([["", t("off")], ...SHIFTS.map(v => [v, SHIFT_LABEL(v)])], d.shift, { disabled: locked, "aria-label": "shift", onchange: e => { d.shift = e.target.value; if (!d.shift && DAY_TYPES[d.type].worked) d.type = "off"; if (d.shift && !DAY_TYPES[d.type].worked) d.type = "regular"; drawRoster(); refresh(); } });
      const typeSel = sel(DAY_TYPES_FOR[monthly ? "monthly" : "daily"].map(k => [k, t("type_" + k)]), d.type, { disabled: locked, "aria-label": "day type", onchange: e => { d.type = e.target.value; if (!DAY_TYPES[d.type].worked) d.shift = ""; else if (!d.shift) d.shift = P.fillShift; drawRoster(); refresh(); } });
      rosterEl.append(h("div", { class: cls }, lbl, shiftSel, typeSel,
        sh && sh.worked > 0 && h("div", { class: "hrs" }, `${sh.hours}h` + (sh.ot ? ` · OT ${sh.ot}h${monthly ? " (incl.)" : ""}` : "") + (sh.nd ? ` · ND ${sh.nd}h` : ""))));
    }
    sumEl.textContent = summary();
  }
  let fillRow;
  {
    const fillSel = sel(SHIFTS.map(v => [v, SHIFT_LABEL(v)]), P.fillShift, { onchange: e => P.fillShift = e.target.value });
    const fillBtn = h("button", { class: "btn sm", type: "button", id: "fillAll", disabled: locked, onclick: () => { for (const d of P.days) { d.shift = P.fillShift; d.type = "regular"; } drawRoster(); refresh(); } }, t("fillAll"));
    const schedBtn = h("button", { class: "btn sm", type: "button", id: "fromSched", disabled: locked || !emp, onclick: async () => {
      try {
        const rows = (await db.cashbookShifts(P.start, P.end)).filter(r => String(r.staff_name || "").trim().toLowerCase() === String(emp.name).trim().toLowerCase() && r.shift);
        if (!rows.length) return toast(t("schedNone"));
        const by = Object.fromEntries(rows.map(r => [r.day, r.shift]));
        let n = 0;
        for (const d of P.days) { const sh = by[d.date]; if (!sh) continue; n++;
          if (sh === "off") { d.shift = ""; d.type = "off"; } else if (SHIFTS.includes(sh)) { d.shift = sh; if (!DAY_TYPES[d.type]?.worked) d.type = "regular"; } }
        drawRoster(); refresh(); toast(tf("schedLoaded", { n }));
      } catch (e) { toast(errMsg(e)); } } }, t("fromSched"));
    fillRow = h("div", { class: "row" }, fillSel, fillBtn, schedBtn, h("span", { class: "muted" }, t("weekendHelp")));
  }
  const roster = h("div", { class: "card" }, h("h2", {}, t("roster")), fillRow, h("small", { class: "muted" }, t("fillHelp")), rosterEl, sumEl);

  // --- adjustments & deductions ---
  const adjFields = [];
  adjFields.push(field(t("late"), numIn("pLate", "late_minutes", 1), t("lateHelp") + money(R.perMinute)));
  adjFields.push(field(t("incentive"), numIn("pInc", "incentive", 1)), field(t("other"), numIn("pOth", "other_deduction", 1)));
  const govBox = (k, label) => h("label", { class: "check" }, h("input", { type: "checkbox", id: "g_" + k, checked: !!P.gov[k], disabled: locked, onchange: e => { P.gov[k] = e.target.checked; refresh(); } }), label);
  const shareSel = sel([[0.5, t("govShare")], [1, t("govFull")]], P.gov.share, { disabled: locked, onchange: e => { P.gov.share = +e.target.value; refresh(); } });
  const ledList = h("div", { class: "list" });
  for (const l of P.ledger) ledList.append(h("div", { class: "item", onclick: () => ledgerForm(l, re) },
    h("div", { class: "t" }, t("k_" + l.kind), l.kind === "shortage" && !(l.verified && l.authorized) && h("span", { class: "pill draft", style: "margin-left:6px" }, t("notDeducted"))),
    h("div", { class: "s" }, l.biz_date, l.note ? ` · ${l.note}` : ""), h("div", { class: "m money " + (l.kind === "bonus" ? "pos" : "neg") }, (l.kind === "bonus" ? "+" : "−") + money(l.amount))));
  const ded = h("div", { class: "card" }, h("h2", {}, t("deductions")),
    h("div", { class: "grid2" }, adjFields),
    h("div", { class: "row" }, h("b", {}, t("ledgerAuto")), h("span", { class: "sp" }), emp && h("button", { class: "btn sm", type: "button", onclick: () => ledgerForm({ employee_id: emp.id, kind: "advance", biz_date: P.end, amount: "" }, re) }, "+ " + t("led_add"))),
    P.ledger.length ? ledList : h("span", { class: "muted" }, t("none")),
    h("div", { class: "row" }, h("b", {}, t("gov")), shareSel), h("div", { class: "row" }, govBox("sss", "SSS"), govBox("philhealth", "PhilHealth"), govBox("pagibig", "Pag-IBIG")), h("small", { class: "muted" }, t("govHelp")));

  // --- result ---
  const tbl = h("table");
  function drawResult() { tbl.innerHTML = ""; tbl.append(...resultRows(R, P)); document.getElementById("barNet").textContent = money(R.net); for13.textContent = `${t("for13")}: ₱${money(R.basicFor13th)}`; }
  const for13 = h("small", { class: "muted" });
  const result = h("div", { class: "card" }, h("h2", {}, t("result")), h("div", { class: "tbl" }, tbl), for13);

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

  function refresh() { Object.assign(R, computePayroll(P.days, payOpts(P))); drawResult(); sumEl.textContent = summary(); }
  async function save(paid, extra = {}) {
    if (!P.employee_id) return toast(t("pickEmp"));
    const res = computePayroll(P.days, payOpts(P));
    try {
      const row = await db.savePayroll({ id: P.id || undefined, employee_id: P.employee_id, period_start: P.start, period_end: P.end, pay_type: P.pay_type, daily_rate: P.daily_rate, monthly_rate: P.monthly_rate, allowance_per_day: P.allowance_per_day,
        break_hours: P.break_hours, days: P.days, late_minutes: P.late_minutes, incentive: P.incentive, other_deduction: P.other_deduction, gov: P.gov, result: res, status: paid ? "paid" : P.status, ...extra });
      await db.attachLedger(P.ledger.map(l => l.id), row.id);
      P.id = row.id; toast(t("saved")); await re();
    } catch (e) { toast(errMsg(e)); }
  }
  function markPaid() {
    const dIn = h("input", { type: "date", id: "paidOn", value: today() });
    const vIn = sel([["CASH", "Cash"], ["GCASH", "GCash"], ["MAYA", "Maya"], ["METROBANK", "Metrobank"], ["SAVINGBOX", "Saving box"]], P.paid_via || "CASH", { id: "paidVia" });
    const close = sheet([h("h3", {}, t("markPaid")), h("div", { class: "grid2" }, field(t("paidOn"), dIn), field(t("paidVia"), vIn)),
      h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: () => close() }, t("cancel")), h("button", { class: "btn primary", onclick: async () => { close(); await save(true, { paid_on: dIn.value, paid_via: vIn.value }); } }, t("markPaid")))]);
  }
  async function unpay() { try { await db.savePayroll({ id: P.id, status: "draft", paid_on: null, paid_via: null }); await re(); } catch (e) { toast(errMsg(e)); } }
}

function payslip(P, emp, R) {
  const days = h("div", { class: "tbl" }, h("table", {}, h("tr", {}, h("th", {}, "Date"), h("th", {}, "Shift"), h("th", {}, "Type"), h("th", { class: "r" }, "Hrs"), h("th", { class: "r" }, "OT"), h("th", { class: "r" }, "ND"), h("th", { class: "r" }, "₱")),
    R.rows.filter(r => r.type !== "off").map(r => h("tr", {}, h("td", {}, r.date.slice(5)), h("td", {}, r.shift ? SHIFT_LABEL(r.shift) : "—"), h("td", {}, t("type_" + r.type)), h("td", { class: "r" }, r.hours || ""), h("td", { class: "r" }, r.ot || ""), h("td", { class: "r" }, r.nd || ""), h("td", { class: "r" }, money(r.amount))))));
  const rate = P.pay_type === "monthly" ? `₱${money(P.monthly_rate)}/mo` : `₱${money(P.daily_rate)}/day`;
  const close = sheet(h("div", { class: "slip" },
    h("div", { class: "head" }, h("div", {}, h("b", {}, "PALTONG RESTAURANT"), h("div", { class: "muted" }, "603 Remedios St. Malate Manila")), h("div", {}, h("b", {}, t("slip")), h("div", { class: "muted" }, `${P.start} ~ ${P.end}`))),
    h("div", { class: "grid2" }, h("div", {}, h("b", {}, emp?.name), h("div", { class: "muted" }, t("pos_" + (emp?.position || "other")))), h("div", {}, rate, h("div", { class: "muted" }, tf("summary", { d: R.daysWorked, h: R.hoursWorked, o: R.otHours, n: R.ndHours, s: R.silDays })))),
    h("table", {}, resultRows(R, P)), h("br"), days,
    P.status === "paid" && h("p", { class: "muted" }, `${t("paid")}: ${P.paid_on} · ${P.paid_via}`),
    h("div", { class: "sig" }, h("div", {}, "Employer / Paltong Restaurant"), h("div", {}, "Employee / " + (emp?.name || ""))),
    h("div", { class: "row noprint", style: "margin-top:14px" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: () => close() }, t("close")), h("button", { class: "btn primary", onclick: () => window.print() }, t("print")))));
}

/* ================= EMPLOYEES ================= */
function renderEmp() {
  const main = document.getElementById("main"); const owner = S.user?.role === "owner";
  const list = h("div", { class: "list" });
  const rateOf = e => e.pay_type === "monthly" ? `₱${money(e.monthly_rate)}/mo` : `₱${money(e.daily_rate)}/day`;
  for (const e of S.employees) list.append(h("div", { class: "item", onclick: () => owner && empForm(e) },
    h("div", { class: "t" }, e.name, " ", h("span", { class: "pill " + (e.position === "waiter" ? "waiter" : "") }, t("pos_" + e.position)), !e.active && h("span", { class: "pill", style: "margin-left:6px" }, "✕")),
    h("div", { class: "s" }, `${e.emp_no ? t("empNoLbl") + " " + e.emp_no + " · " : ""}${t("st_" + e.status)} · ${t("pt_" + (e.pay_type || "daily")).split(" (")[0]}${e.position === "rider" && +e.allowance_per_day ? ` · +₱${e.allowance_per_day}/day` : ""}${e.hired_on ? " · " + e.hired_on : ""} · ${e.pin_hash ? t("pinSet") : t("pinNotSet")}`), h("div", { class: "m money" }, rateOf(e))));
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_emp")), h("span", { class: "sp" }), owner && h("button", { class: "btn primary sm", onclick: () => empForm({ name: "", position: "waiter", daily_rate: S.settings.min_wage, monthly_rate: S.settings.kitchen_monthly, allowance_per_day: 0, pay_type: "daily", status: "probationary", active: true }) }, "+ " + t("emp_add"))), list));
}
function empForm(e) {
  const E = { ...e }; delete E.created_at; delete E.pin_hash; delete E.pin_fails; delete E.pin_locked_until;
  const name = h("input", { type: "text", id: "eName", value: E.name, required: true });
  const eno = h("input", { type: "text", id: "eNo", inputmode: "numeric", value: E.emp_no || "", placeholder: "00013" });
  const pt = sel([["daily", t("pt_daily")], ["monthly", t("pt_monthly")]], E.pay_type || "daily", { id: "ePt", onchange: sync });
  const pos = sel([["waiter", t("pos_waiter")], ["kitchen", t("pos_kitchen")], ["rider", t("pos_rider")], ["other", t("pos_other")]], E.position, { id: "ePos", onchange: () => {
    if (pos.value === "rider" && !+allow.value) allow.value = S.settings.rider_allowance ?? 100; sync(); } });
  const rate = h("input", { type: "number", id: "eRate", value: E.daily_rate, step: 1, min: 0 });
  const mrate = h("input", { type: "number", id: "eMRate", value: E.monthly_rate || S.settings.kitchen_monthly, step: 100, min: 0 });
  const allow = h("input", { type: "number", id: "eAllow", value: E.allowance_per_day || 0, step: 10, min: 0 });
  const st = sel([["regular", t("st_regular")], ["probationary", t("st_probationary")], ["fixed", t("st_fixed")], ["other", t("st_other")]], E.status, { id: "eSt" });
  const hired = h("input", { type: "date", id: "eHired", value: E.hired_on || "" }); const bday = h("input", { type: "date", id: "eBday", value: E.birthday || "" });
  const active = h("input", { type: "checkbox", id: "eActive", checked: E.active }); const note = h("input", { type: "text", id: "eNote", value: E.note || "" });
  const fDaily = field(t("daily"), rate), fMonthly = field(t("monthlyRate"), mrate), fAllow = field(t("allowDay"), allow);
  function sync() { fDaily.hidden = pt.value !== "daily"; fMonthly.hidden = pt.value !== "monthly"; fAllow.hidden = pos.value !== "rider"; }
  sync();
  const close = sheet(h("form", { onsubmit: async ev => { ev.preventDefault(); try {
      await db.saveEmployee({ ...E, emp_no: eno.value.trim() || null, name: name.value.trim(), position: pos.value, pay_type: pt.value, daily_rate: +rate.value, monthly_rate: +mrate.value, allowance_per_day: pos.value === "rider" ? +allow.value : 0, status: st.value, hired_on: hired.value || null, birthday: bday.value || null, active: active.checked, note: note.value || null });
      S.employees = await db.listEmployees(true); if (S.pay) S.pay.loaded = false; toast(t("saved")); close(); render(); } catch (er) { toast(errMsg(er)); } } },
    h("h3", {}, E.id ? E.name : t("emp_add")),
    h("div", { class: "grid2" }, field(t("empNo"), eno), field(t("emp_name"), name), field(t("emp_pos"), pos), field(t("emp_payType"), pt), fDaily, fMonthly, fAllow, field(t("emp_status"), st), field(t("emp_hired"), hired), field(t("emp_bday"), bday), field(t("emp_note"), note)),
    h("label", { class: "check" }, active, t("emp_active")),
    E.id && h("div", { class: "row" }, h("span", { class: "muted" }, e.pin_hash ? t("pinSet") : t("pinNotSet")), h("span", { class: "sp" }),
      h("button", { class: "btn sm", type: "button", id: "e-reset-pin", onclick: async () => { try { await db.resetEmpPin(E.id); S.employees = await db.listEmployees(true); toast(t("pinReset")); close(); render(); } catch (er) { toast(errMsg(er)); } } }, t("resetPin"))),
    h("div", { class: "row" }, E.id && h("button", { class: "btn danger sm", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deleteEmployee(E.id); S.employees = await db.listEmployees(true); close(); render(); }) }, t("delete")),
      h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: () => close() }, t("cancel")), h("button", { class: "btn primary", type: "submit" }, t("save")))));
}

/* ================= LEDGER ================= */
const LF = { employeeId: "", kind: "" };
const KINDS = ["advance", "shortage", "bonus", "other"];
async function renderLedger() {
  const main = document.getElementById("main"); const owner = S.user?.role === "owner";
  const rows = await db.listLedger({ employeeId: LF.employeeId || undefined, kind: LF.kind || undefined });
  const empSel = sel([["", t("led_filter_all")], ...S.employees.map(e => [e.id, e.name])], LF.employeeId, { onchange: e => { LF.employeeId = e.target.value; render(); } });
  const kindSel = sel([["", t("led_filter_all")], ...KINDS.map(k => [k, t("k_" + k)])], LF.kind, { onchange: e => { LF.kind = e.target.value; render(); } });
  const list = h("div", { class: "list" });
  for (const l of rows) {
    const p = periodForDate(l.biz_date);
    list.append(h("div", { class: "item", onclick: () => owner && ledgerForm(l, () => render()) },
      h("div", { class: "t" }, l.employees?.name, " · ", t("k_" + l.kind), " ", h("span", { class: "pill " + (l.payroll_id ? "paid" : "draft") }, l.payroll_id ? t("led_deducted") : t("led_pending"))),
      h("div", { class: "s" }, l.biz_date, " ", tf("led_applies", { p: periodLabel(p.start, p.end) }), l.note ? ` · ${l.note}` : "", l.kind === "shortage" && !(l.verified && l.authorized) ? " · ⚠ " + t("notDeducted") : ""),
      h("div", { class: "m money " + (l.kind === "bonus" ? "pos" : "neg") }, (l.kind === "bonus" ? "+" : "−") + money(l.amount))));
  }
  if (owner) main.append(await cashIssuesCard());
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_ledger")), h("span", { class: "sp" }), owner && h("button", { class: "btn primary sm", onclick: () => ledgerForm({ employee_id: S.employees[0]?.id || "", kind: "advance", biz_date: today(), amount: "" }, () => render()) }, "+ " + t("led_add"))),
    h("div", { class: "row" }, empSel, kindSel), h("small", { class: "muted" }, t("bonusHint")), rows.length ? list : h("span", { class: "muted" }, t("none"))));
}
// 캐시북 중간마감·마감 현금 부족 → 조사 후 책임 웨이터 지정 (자동 공제 아님)
async function cashIssuesCard() {
  let rows = []; try { rows = await db.listCashIssues(); } catch { return h("span"); }
  const open = rows.filter(r => r.status === "open"), done = rows.filter(r => r.status !== "open").slice(0, 10);
  const waiters = S.employees.filter(e => e.active && e.position === "waiter");
  const stg = r => r.stage === "mid" ? t("cbMid") : t("cbFinal");
  const item = r => h("div", { class: "item", "data-issue": r.id, onclick: () => r.status === "open" && issueForm(r, waiters) },
    h("div", { class: "t" }, `${r.biz_date} · ${stg(r)}`, " ", h("span", { class: "pill " + (r.status === "open" ? "draft" : r.status === "assigned" ? "waiter" : "paid") }, t("is_" + r.status))),
    h("div", { class: "s" }, `${t("cbCounted")} ₱${money(r.counted)} / ${t("cbBook")} ₱${money(r.expected)}` + (r.counted_by ? ` · ${t("cbBy")} ${r.counted_by}` : "") + (r.reason ? ` · ${t("cbReason")}: ${r.reason}` : "") + (r.on_duty?.length ? ` · ${t("cbDuty")}: ${r.on_duty.join(", ")}` : "") + (r.resolved_note ? ` · ${r.resolved_note}` : "")),
    h("div", { class: "m money neg" }, "−" + money(r.amount)));
  return h("div", { class: "card", id: "cash-issues" },
    h("div", { class: "row" }, h("h2", {}, t("cbTitle")), h("span", { class: "sp" }), open.length ? h("span", { class: "pill draft" }, open.length) : null),
    h("small", { class: "muted" }, t("cbHelp")),
    open.length ? h("div", { class: "list" }, open.map(item)) : h("span", { class: "muted" }, t("cbNone")),
    done.length ? h("details", {}, h("summary", { class: "muted" }, t("cbDone")), h("div", { class: "list" }, done.map(item))) : null);
}
function issueForm(r, waiters) {
  const emp = sel([["", "—"], ...waiters.map(e => [e.id, e.name])], waiters.find(e => e.name.toLowerCase() === String(r.counted_by || "").toLowerCase())?.id || "", { id: "iEmp" });
  const note = h("input", { type: "text", id: "iNote", placeholder: t("cbFoundPh") });
  const close = sheet([h("h3", {}, `${r.biz_date} · ${r.stage === "mid" ? t("cbMid") : t("cbFinal")} · −₱${money(r.amount)}`),
    h("p", { class: "muted" }, t("cbLaw")),
    field(t("cbWho"), emp, r.on_duty?.length ? `${t("cbDuty")}: ${r.on_duty.join(", ")}` : null),
    h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn primary", id: "iAssign", onclick: async () => {
      if (!emp.value) return toast(t("pickEmp"));
      try { await db.assignCashIssue(r.id, emp.value); toast(t("cbAssigned")); close(); render(); } catch (e) { toast(errMsg(e)); } } }, t("cbAssign"))),
    h("hr"),
    field(t("cbDismissLbl"), note),
    h("div", { class: "row" }, h("button", { class: "btn", onclick: () => close() }, t("cancel")), h("span", { class: "sp" }),
      h("button", { class: "btn", id: "iDismiss", onclick: async () => { try { await db.dismissCashIssue(r.id, note.value.trim()); toast(t("saved")); close(); render(); } catch (e) { toast(errMsg(e)); } } }, t("cbDismiss")))]);
}
function ledgerForm(l, after) {
  const L = { ...l }; delete L.employees; delete L.created_at; delete L.created_by;
  const empSel = sel(S.employees.map(e => [e.id, e.name]), L.employee_id, { id: "lEmp" });
  const kind = sel(KINDS.map(k => [k, t("k_" + k)]), L.kind, { id: "lKind", onchange: e => { shortBox.hidden = e.target.value !== "shortage"; } });
  const date = h("input", { type: "date", id: "lDate", value: L.biz_date, required: true }); const amt = h("input", { type: "number", id: "lAmt", value: L.amount, step: 1, min: 1, required: true });
  const note = h("input", { type: "text", id: "lNote", value: L.note || "" });
  const ver = h("input", { type: "checkbox", id: "lVer", checked: L.verified !== false }); const auth = h("input", { type: "checkbox", id: "lAuth", checked: !!L.authorized });
  const shortBox = h("div", { style: "display:grid;gap:6px", hidden: L.kind !== "shortage" }, h("label", { class: "check" }, ver, t("led_verified")), h("label", { class: "check" }, auth, t("led_auth")));
  const hint = h("small", { class: "muted" }); const upd = () => { const p = periodForDate(date.value || today()); hint.textContent = tf("led_applies", { p: periodLabel(p.start, p.end) }); };
  date.addEventListener("input", upd); upd();
  const close = sheet(h("form", { onsubmit: async ev => { ev.preventDefault(); try {
      await db.saveLedger({ ...L, employee_id: empSel.value, kind: kind.value, biz_date: date.value, amount: +amt.value, note: note.value || null, verified: kind.value === "shortage" ? ver.checked : true, authorized: auth.checked });
      toast(t("saved")); close(); after(); } catch (er) { toast(errMsg(er)); } } },
    h("h3", {}, t("led_add")),
    h("div", { class: "grid2" }, field(t("employee"), empSel), field(t("led_kind"), kind), field(t("led_date"), date, hint), field(t("led_amount"), amt), field(t("led_note"), note)), shortBox,
    h("div", { class: "row" }, L.id && h("button", { class: "btn danger sm", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deleteLedger(L.id); close(); after(); }) }, t("delete")),
      h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: () => close() }, t("cancel")), h("button", { class: "btn primary", type: "submit" }, t("save")))));
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
  const rider = h("input", { type: "number", id: "sRider", value: s.rider_allowance ?? 100, step: 10, disabled: !owner }); const kit = h("input", { type: "number", id: "sKit", value: s.kitchen_monthly ?? 30000, step: 100, disabled: !owner });
  const g = (k, l) => h("label", { class: "check" }, h("input", { type: "checkbox", id: "s_" + k, checked: !!s[k], disabled: !owner }), l);
  const sss = g("sss_on", "SSS"), ph = g("philhealth_on", "PhilHealth"), pag = g("pagibig_on", "Pag-IBIG");
  const share = sel([[0.5, t("govShare")], [1, t("govFull")]], s.gov_share, { disabled: !owner });
  main.append(h("div", { class: "card" }, h("h2", {}, t("tab_set")),
    h("div", { class: "grid2" }, field(t("set_wage"), wage), field(t("set_break"), brk), field(t("set_rider"), rider), field(t("set_kitchen"), kit)),
    h("div", {}, h("b", {}, t("set_gov"))), h("div", { class: "row" }, sss, ph, pag, share),
    h("div", { class: "row" }, h("span", {}, t("set_lang")), langSwitch()),
    owner && h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn primary", onclick: async () => { try {
      S.settings = await db.saveSettings({ min_wage: +wage.value, break_hours: +brk.value, rider_allowance: +rider.value, kitchen_monthly: +kit.value, sss_on: sss.firstChild.checked, philhealth_on: ph.firstChild.checked, pagibig_on: pag.firstChild.checked, gov_share: +share.value });
      toast(t("saved")); } catch (e) { toast(errMsg(e)); } } }, t("save")))),
    h("div", { class: "card" }, h("h2", {}, t("contract")), h("ul", { style: "margin:0;padding-left:18px;display:grid;gap:8px;font-size:14px" }, t("contractText").map(x => h("li", {}, x)))));
}

document.documentElement.lang = lang;
boot().catch(e => { root.innerHTML = ""; root.append(h("div", { class: "login" }, h("div", { class: "card" }, h("div", { class: "err" }, String(e.message || e))))); });
