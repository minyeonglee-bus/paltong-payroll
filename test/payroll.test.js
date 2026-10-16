import assert from "node:assert/strict";
import { computePayroll, shiftHours, periodForDate, periodOf, weekOf, datesBetween, MONTHLY_FACTOR } from "../payroll-calc.js";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} vs ${b}`);

// shifts
assert.deepEqual(shiftHours("8-18", 1), { span: 10, worked: 9, hours: 8, ot: 1, nd: 0 });
assert.deepEqual(shiftHours("18-4", 1), { span: 10, worked: 9, hours: 8, ot: 1, nd: 6 });
assert.deepEqual(shiftHours("8-20", 1), { span: 12, worked: 11, hours: 8, ot: 3, nd: 0 });
assert.deepEqual(shiftHours("20-4", 1), { span: 8, worked: 7, hours: 7, ot: 0, nd: 6 });
assert.deepEqual(shiftHours("22-8", 1), { span: 10, worked: 9, hours: 8, ot: 1, nd: 8 });
assert.deepEqual(shiftHours("20-8", 1), { span: 12, worked: 11, hours: 8, ot: 3, nd: 8 });

// periods
assert.deepEqual(periodForDate("2026-10-01"), { start: "2026-10-01", end: "2026-10-15", half: 1 });
assert.deepEqual(periodForDate("2026-10-16"), { start: "2026-10-16", end: "2026-10-31", half: 2 });
assert.equal(periodOf(2026, 2, 2).end, "2026-02-28");
assert.deepEqual(weekOf("2026-10-16"), { start: "2026-10-12", end: "2026-10-18" }); // Fri → Mon..Sun
assert.deepEqual(weekOf("2026-10-12"), { start: "2026-10-12", end: "2026-10-18" });
assert.deepEqual(weekOf("2026-10-18"), { start: "2026-10-12", end: "2026-10-18" });

/* ---------- WAITER / daily ₱718 ---------- */
const days = datesBetween("2026-10-01", "2026-10-15").map(d => ({ date: d, shift: "8-18", type: "regular" }));
days[1] = { ...days[1], type: "off", shift: "" }; days[8] = { ...days[8], type: "off", shift: "" };
let r = computePayroll(days, { payType: "daily", daily: 718, breakHrs: 1 });
assert.equal(r.daysWorked, 13);
assert.equal(r.basic, 718 * 13);
near(r.otPay, 13 * (718 / 8) * 1.25, "OT");
assert.equal(r.net, r.gross);
r = computePayroll(days, { daily: 718, lateMinutes: 30 }); near(r.late, 30 * 718 / 480, "late");
r = computePayroll([{ date: "2026-10-01", shift: "", type: "sil" }, { date: "2026-10-02", shift: "", type: "holidayOff" }], { daily: 718 });
assert.equal(r.silPay, 718); assert.equal(r.holidayOffPay, 718); assert.equal(r.gross, 1436);
const hr = 718 / 8;
r = computePayroll([{ date: "2026-10-01", shift: "18-4", type: "holiday" }], { daily: 718 });
assert.equal(r.basic, 718); assert.equal(r.premium, 718); near(r.otPay, hr * 2.6, "hol OT"); near(r.ndPay, 6 * hr * 2 * 0.1, "hol ND");
r = computePayroll(days, { daily: 718, advances: 1000, shortage: 250, gov: { sss: true, philhealth: true, pagibig: true }, govShare: 0.5 });
near(r.monthly, 718 * MONTHLY_FACTOR, "monthly equiv"); near(r.sss, 18500 * 0.05 / 2, "sss"); assert.equal(r.pagibig, 100);
near(r.net, r.gross - 1000 - 250 - r.sss - r.philhealth - 100, "net w/ deductions");

/* ---------- RIDER / daily + ₱100 maintenance ---------- */
r = computePayroll(days, { payType: "daily", daily: 718, allowancePerDay: 100 });
assert.equal(r.allowance, 1300);                       // 13 duty days × 100
near(r.basicFor13th, 718 * 13, "13th excludes allowance");

/* ---------- KITCHEN / monthly ₱30,000 OT-inclusive ---------- */
const dEq = 30000 / MONTHLY_FACTOR, hEq = dEq / 8;    // 1150.16 / 143.77
r = computePayroll(days, { payType: "monthly", monthly: 30000 });
assert.equal(r.basic, 15000);                          // half-month fixed
assert.equal(r.otPay, 0); assert.equal(r.otHours, 13); // OT tracked but not paid
assert.equal(r.gross, 15000);
r = computePayroll([...days.slice(0, 12), { date: "2026-10-13", shift: "", type: "absent" }, days[13], days[14]], { payType: "monthly", monthly: 30000 });
near(r.absentDed, dEq, "absence pro-rata"); near(r.gross, 15000 - dEq, "gross after absence");
r = computePayroll([{ date: "2026-10-01", shift: "18-4", type: "holiday" }], { payType: "monthly", monthly: 30000 });
assert.equal(r.basic, 15000); near(r.premium, 8 * hEq, "holiday +100%"); near(r.ndPay, 6 * hEq * 2 * 0.1, "monthly ND"); assert.equal(r.otPay, 0);
r = computePayroll(days, { payType: "monthly", monthly: 30000, lateMinutes: 60 }); near(r.late, 60 * dEq / 480, "monthly late");
r = computePayroll(days, { payType: "monthly", monthly: 30000, gov: { sss: true }, govShare: 0.5 }); near(r.sss, 30000 * 0.05 / 2, "sss on 30k");

/* ---------- PART-TIME helper / weekly ₱2,000 ---------- */
const wk = [
  { date: "2026-10-12", type: "work", hours: 4, ot: 0 },   // Mon
  { date: "2026-10-13", type: "work", hours: 4, ot: 1 },   // Tue +1h OT
  { date: "2026-10-14", type: "work", hours: 4, ot: 0 },   // Wed
  { date: "2026-10-15", type: "off" },                     // Thu (designated off)
  { date: "2026-10-16", type: "work", hours: 4, ot: 0 },   // Fri
  { date: "2026-10-17", type: "work", hours: 4, ot: 0 },   // Sat
  { date: "2026-10-18", type: "off" },                     // Sun (designated off)
];
r = computePayroll(wk, { payType: "weekly" });
assert.equal(r.basic, 1500); assert.equal(r.allowance, 500); assert.equal(r.otPay, 80); assert.equal(r.gross, 2080); assert.equal(r.net, 2080);
// one absence + one extra (non-scheduled) day 3h
const wk2 = wk.map(d => ({ ...d })); wk2[2] = { date: "2026-10-14", type: "absent" }; wk2[6] = { date: "2026-10-18", type: "extra", hours: 3, ot: 0 };
r = computePayroll(wk2, { payType: "weekly" });
assert.equal(r.basic, 1200); assert.equal(r.allowance, 400); assert.equal(r.extraPay, 300); assert.equal(r.absentDays, 1); assert.equal(r.absentDed, 400);
assert.equal(r.gross, 1200 + 400 + 80 + 300);
// half day (2h) → half basic & half allowance
r = computePayroll([{ date: "2026-10-12", type: "work", hours: 2, ot: 0 }], { payType: "weekly" });
assert.equal(r.basic, 150); assert.equal(r.allowance, 50);
// advance repayment ₱500/wk capped by balance
r = computePayroll(wk, { payType: "weekly", advances: 500, advanceBalance: 1200 }); assert.equal(r.advances, 500); assert.equal(r.net, 1580);
r = computePayroll(wk, { payType: "weekly", advances: 500, advanceBalance: 300 }); assert.equal(r.advances, 300);

console.log("payroll tests OK");
