// Data layer — everything that talks to Supabase lives here.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { CONFIG } from "./config.js";

let sb;
const must = ({ data, error }) => { if (error) throw friendly(error); return data; };
function friendly(error) {
  const m = String(error.message || error);
  const e = new Error(/PAID_LOCKED/.test(m) ? "PAID_LOCKED" : /row-level security|permission/i.test(m) ? "NO_PERMISSION" : m);
  e.raw = m; return e;
}
export const idToEmail = id => { id = String(id || "").trim().toLowerCase(); return id.includes("@") ? id : `${id}@paltong.app`; };

export async function init() {
  sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data } = await sb.auth.getSession();
  return !!data.session;
}
export async function signIn(id, password) {
  const { error } = await sb.auth.signInWithPassword({ email: idToEmail(id), password });
  if (error) throw new Error(error.message);
}
export async function signOut() { await sb.auth.signOut(); }
export async function changePassword(pw) { must(await sb.auth.updateUser({ password: pw })); }
export async function me() {
  const { data } = await sb.auth.getUser(); if (!data.user) return null;
  const row = must(await sb.from("staff").select("*").eq("user_id", data.user.id).maybeSingle());
  return row ? { ...row, email: data.user.email } : { user_id: data.user.id, name: data.user.email, role: "staff", email: data.user.email };
}

export async function getSettings() { return must(await sb.from("pr_settings").select("*").eq("id", 1).single()); }
export async function saveSettings(patch) { return must(await sb.from("pr_settings").update(patch).eq("id", 1).select().single()); }

export async function listEmployees(all = false) {
  let q = sb.from("pr_employees").select("*").order("active", { ascending: false }).order("name");
  if (!all) q = q.eq("active", true);
  return must(await q);
}
export async function saveEmployee(row) {
  return row.id ? must(await sb.from("pr_employees").update(row).eq("id", row.id).select().single())
                : must(await sb.from("pr_employees").insert(row).select().single());
}
export async function deleteEmployee(id) { must(await sb.from("pr_employees").delete().eq("id", id)); }

export async function listLedger({ employeeId, from, to, kind, unpaidOnly } = {}) {
  let q = sb.from("pr_ledger").select("*, employees:pr_employees(name)").order("biz_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (employeeId) q = q.eq("employee_id", employeeId);
  if (from) q = q.gte("biz_date", from);
  if (to) q = q.lte("biz_date", to);
  if (kind) q = q.eq("kind", kind);
  if (unpaidOnly) q = q.is("payroll_id", null);
  return must(await q);
}
export async function saveLedger(row) {
  return row.id ? must(await sb.from("pr_ledger").update(row).eq("id", row.id).select().single())
                : must(await sb.from("pr_ledger").insert(row).select().single());
}
export async function deleteLedger(id) { must(await sb.from("pr_ledger").delete().eq("id", id)); }
export async function attachLedger(ids, payrollId) { if (ids.length) must(await sb.from("pr_ledger").update({ payroll_id: payrollId }).in("id", ids)); }
export async function detachLedger(payrollId) { must(await sb.from("pr_ledger").update({ payroll_id: null }).eq("payroll_id", payrollId)); }

// by period start: old second-half rows were saved as 16–31, new ones are 16–30 (saving an old draft moves its end to the 30th)
export async function getPayroll(employeeId, start) {
  return must(await sb.from("pr_payrolls").select("*").eq("employee_id", employeeId).eq("period_start", start).order("period_end", { ascending: false }).limit(1).maybeSingle());
}
export async function listPayrolls({ from, to, employeeId, status } = {}) {
  let q = sb.from("pr_payrolls").select("*, employees:pr_employees(name, position, info)").order("period_start", { ascending: false }).limit(300);
  if (from) q = q.gte("period_start", from);
  if (to) q = q.lte("period_end", to);
  if (employeeId) q = q.eq("employee_id", employeeId);
  if (status) q = q.eq("status", status);
  return must(await q);
}
export async function savePayroll(row) {
  return row.id ? must(await sb.from("pr_payrolls").update(row).eq("id", row.id).select().single())
                : must(await sb.from("pr_payrolls").insert(row).select().single());
}
export async function deletePayroll(id) { must(await sb.from("pr_payrolls").delete().eq("id", id)); }

// ---------- 직원 본인 보기 (번호 + PIN, 로그인 계정 없이) ----------
export async function empView(no, pin) { return must(await sb.rpc("pr_emp_view", { p_no: String(no).trim(), p_pin: String(pin) })); }
export async function empSetPin(no, oldPin, newPin) { return must(await sb.rpc("pr_emp_set_pin", { p_no: String(no).trim(), p_old: String(oldPin), p_new: String(newPin) })); }
export async function empUpdateInfo(no, pin, info, birthday) { return must(await sb.rpc("pr_emp_update_info", { p_no: String(no).trim(), p_pin: String(pin), p_info: info, p_birthday: birthday })); }
export async function resetEmpPin(id) { must(await sb.rpc("pr_emp_reset_pin", { p_id: id })); }

// ---------- 캐시북 현금 부족 (중간마감·마감) → 확인 필요 목록 ----------
export async function listCashIssues() { return must(await sb.from("pr_cash_issues").select("*").order("biz_date", { ascending: false }).order("created_at", { ascending: false }).limit(200)); }
export async function assignCashIssue(id, employeeId) { return must(await sb.rpc("pr_cash_issue_assign", { p_issue: id, p_employee: employeeId })); }
export async function dismissCashIssue(id, note) { return must(await sb.from("pr_cash_issues").update({ status: "dismissed", resolved_note: note || null }).eq("id", id).select().single()); }

// ---------- 캐시북 근무 스케줄 (shifts) 불러오기 ----------
// 주방·라이더 등 캐시북 로그인이 없는 직원은 pr_plan (관리자 입력) — 같은 사람·같은 날이면 pr_plan이 우선
export async function cashbookShifts(from, to) {
  const [cb, pl] = await Promise.all([
    sb.from("shifts").select("day, staff_name, shift").gte("day", from).lte("day", to),
    sb.from("pr_plan").select("day, shift, pr_employees(name)").gte("day", from).lte("day", to)]);
  const plan = must(pl).filter(r => r.shift && r.pr_employees).map(r => ({ day: r.day, staff_name: r.pr_employees.name, shift: r.shift }));
  const key = r => String(r.staff_name || "").trim().toLowerCase() + "|" + r.day, has = new Set(plan.map(key));
  return plan.concat(must(cb).filter(r => !has.has(key(r))));
}

// ---------- 13th-month pay ----------
export async function listThirteenth(year) { return must(await sb.from("pr_thirteenth").select("*").eq("year", year)); }
export async function saveThirteenth(row) {
  return must(await sb.from("pr_thirteenth").upsert(row, { onConflict: "employee_id,year" }).select().single());
}
export async function deleteThirteenth(id) { must(await sb.from("pr_thirteenth").delete().eq("id", id)); }
export async function listPayrollsYear(year) {
  return must(await sb.from("pr_payrolls").select("employee_id, period_start, period_end, status, result").gte("period_start", `${year}-01-01`).lte("period_start", `${year}-12-31`).limit(2000));
}

// ---------- 출퇴근 (직원이 앱에서 버튼 · 앱 기록이 근태 기준) ----------
export async function punch(no, pin, kind) { return must(await sb.rpc("pr_punch", { p_no: String(no).trim(), p_pin: String(pin), p_kind: kind })); }
/** owner: punches for a period (+ next-morning punches so an overnight shift's OUT is included) */
export async function listPunches(employeeId, from, to) {
  const a = new Date(from + "T00:00:00"), b = new Date(to + "T00:00:00"); b.setHours(b.getHours() + 36);
  return must(await sb.from("pr_punches").select("*").eq("employee_id", employeeId).gte("punched_at", a.toISOString()).lt("punched_at", b.toISOString()).order("punched_at"));
}
export async function addPunch(row) { return must(await sb.from("pr_punches").insert({ ...row, source: "admin" }).select().single()); }
export async function deletePunch(id) { must(await sb.from("pr_punches").delete().eq("id", id)); }
/** cash book sales per day (for the contract §6 highest-sales-day bonus) */
export async function cashbookSalesByDay(from, to) {
  const rows = must(await sb.from("entries").select("biz_date, amount").eq("kind", "sale").gte("biz_date", from).lte("biz_date", to));
  const by = {}; for (const r of rows) by[r.biz_date] = (by[r.biz_date] || 0) + (+r.amount || 0); return by;
}
/** owner: everyone's punches for a period (+36h for overnight outs) */
export async function listPunchesAll(from, to) {
  const a = new Date(from + "T00:00:00"), b = new Date(to + "T00:00:00"); b.setHours(b.getHours() + 36);
  return must(await sb.from("pr_punches").select("*").gte("punched_at", a.toISOString()).lt("punched_at", b.toISOString()).order("punched_at"));
}
export async function updatePunch(id, patch) { return must(await sb.from("pr_punches").update({ ...patch, source: "admin" }).eq("id", id).select().single()); }
