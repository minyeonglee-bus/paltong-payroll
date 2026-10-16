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

export async function getPayroll(employeeId, start, end) {
  return must(await sb.from("pr_payrolls").select("*").eq("employee_id", employeeId).eq("period_start", start).eq("period_end", end).maybeSingle());
}
export async function listPayrolls({ from, to, employeeId } = {}) {
  let q = sb.from("pr_payrolls").select("*, employees:pr_employees(name, position)").order("period_start", { ascending: false }).limit(300);
  if (from) q = q.gte("period_start", from);
  if (to) q = q.lte("period_end", to);
  if (employeeId) q = q.eq("employee_id", employeeId);
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
export async function resetEmpPin(id) { must(await sb.rpc("pr_emp_reset_pin", { p_id: id })); }

// ---------- 캐시북 현금 부족 (중간마감·마감) → 확인 필요 목록 ----------
export async function listCashIssues() { return must(await sb.from("pr_cash_issues").select("*").order("biz_date", { ascending: false }).order("created_at", { ascending: false }).limit(200)); }
export async function assignCashIssue(id, employeeId) { return must(await sb.rpc("pr_cash_issue_assign", { p_issue: id, p_employee: employeeId })); }
export async function dismissCashIssue(id, note) { return must(await sb.from("pr_cash_issues").update({ status: "dismissed", resolved_note: note || null }).eq("id", id).select().single()); }

// ---------- 캐시북 근무 스케줄 (shifts) 불러오기 ----------
export async function cashbookShifts(from, to) { return must(await sb.from("shifts").select("day, staff_name, shift").gte("day", from).lte("day", to)); }

// ---------- 13th-month pay ----------
export async function listThirteenth(year) { return must(await sb.from("pr_thirteenth").select("*").eq("year", year)); }
export async function saveThirteenth(row) {
  return must(await sb.from("pr_thirteenth").upsert(row, { onConflict: "employee_id,year" }).select().single());
}
export async function deleteThirteenth(id) { must(await sb.from("pr_thirteenth").delete().eq("id", id)); }
export async function listPayrollsYear(year) {
  return must(await sb.from("pr_payrolls").select("employee_id, period_start, period_end, status, result").gte("period_start", `${year}-01-01`).lte("period_start", `${year}-12-31`).limit(2000));
}
