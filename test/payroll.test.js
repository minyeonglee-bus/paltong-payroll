import assert from "node:assert/strict";
import { computePayroll as compute, shiftHours, periodForDate, periodOf, datesBetween, MONTHLY_FACTOR } from "../payroll-calc.js";
const computePayroll = (d, o) => compute(d, { scheme: "paper", ...o });   // paper-method block below

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} vs ${b}`);

// shifts
assert.deepEqual(shiftHours("8-18", 1), { span: 10, worked: 9, hours: 9, reg: 8, ot: 1, nd: 0 });
assert.deepEqual(shiftHours("18-4", 1), { span: 10, worked: 9, hours: 9, reg: 8, ot: 1, nd: 6 });
assert.deepEqual(shiftHours("8-20", 1), { span: 12, worked: 11, hours: 11, reg: 8, ot: 3, nd: 0 });
assert.deepEqual(shiftHours("", 1), { span: 0, worked: 0, hours: 0, reg: 0, ot: 0, nd: 0 });

// periods
assert.deepEqual(periodForDate("2026-10-01"), { start: "2026-10-01", end: "2026-10-15", half: 1 });
assert.deepEqual(periodForDate("2026-10-16"), { start: "2026-10-16", end: "2026-10-31", half: 2 });
assert.equal(periodOf(2026, 2, 2).end, "2026-02-28");

/* ---------- paper method: Maria card No.1 (690/day) 1/16–31: 690×13 · OT 552 (8h) · 지각 207 (180m) · 벌금 207 · CA 3,500 → 5,608 ---------- */
let days = datesBetween("2026-01-16", "2026-01-31").map((d, i) => i < 13 ? { date: d, shift: "8-18", type: "regular", ot: i < 8 ? 1 : 0 } : { date: d, shift: "", type: "off" });
let r = computePayroll(days, { payType: "daily", daily: 690, lateMinutes: 180, advances: 3500 });
assert.equal(r.daysWorked, 13); assert.equal(r.basic, 690 * 13);
assert.equal(r.hourly, 69); assert.equal(r.otHours, 8); assert.equal(r.otPay, 552);     // daily ÷ 10 × card OT hours, no 125%
assert.equal(r.late, 207); assert.equal(r.penalty, 207);                                 // 30 min = 34.5 → 180 min = 207, penalty = same
assert.equal(r.ndPay, 0);
assert.equal(r.gross, 690 * 13 + 552 - 207); assert.equal(r.net, 5608);

// 1/1 regular holiday not worked = +1 daily (June: 658×12 + 1/1 658); special holiday worked = +30% (Erika 2/25 +197)
r = computePayroll([{ date: "2026-01-01", shift: "", type: "holidayOff" }, { date: "2026-02-25", shift: "8-18", type: "special" }], { daily: 658 });
assert.equal(r.holidayOffPay, 658); assert.equal(r.basic, 658); near(r.premium, 197.4, "special +30%");
// regular holiday worked = daily + 1 daily; half day = ½ daily (Erika 9/1–15 half day −375)
r = computePayroll([{ date: "2026-04-09", shift: "8-18", type: "holiday" }, { date: "2026-09-03", shift: "8-13", type: "half" }], { daily: 750 });
assert.equal(r.basic, 750 + 375); assert.equal(r.premium, 750); assert.equal(r.halfDays, 1); assert.equal(r.daysWorked, 1);
// SIL paid at daily
r = computePayroll([{ date: "2026-10-01", shift: "", type: "sil" }], { daily: 718 }); assert.equal(r.silPay, 718); assert.equal(r.gross, 718);
// paper OT from the shift: a day is 10h, 08–19 → +1h, 08–20 → +2h; typed ot overrides, empty = auto
r = computePayroll([{ date: "2026-10-01", shift: "8-19", type: "regular" }, { date: "2026-10-02", shift: "8-20", type: "regular", ot: null }, { date: "2026-10-03", shift: "8-21", type: "regular", ot: 1 }, { date: "2026-10-04", shift: "8-18", type: "regular" }], { daily: 790 });
assert.equal(r.otHours, 4); assert.equal(r.otPay, 4 * 79); assert.equal(r.rows[0].ot, 1); assert.equal(r.rows[1].ot, 2); assert.equal(r.rows[2].ot, 1); assert.equal(r.rows[3].ot, 0);
// penalty can be switched off
r = computePayroll(days, { daily: 690, lateMinutes: 60, latePenalty: false }); assert.equal(r.late, 69); assert.equal(r.penalty, 0);
// net rounds up to whole peso
r = computePayroll(days, { daily: 718, lateMinutes: 7 }); assert.equal(r.net, Math.ceil(r.gross - r.penalty));
// statutory deductions on monthly equivalent
r = computePayroll(days, { daily: 718, advances: 1000, shortage: 250, gov: { sss: true, philhealth: true, pagibig: true }, govShare: 0.5 });
near(r.monthly, 718 * MONTHLY_FACTOR, "monthly equiv"); near(r.sss, 18500 * 0.05 / 2, "sss"); assert.equal(r.pagibig, 100);
assert.equal(r.net, Math.ceil(r.gross - 1000 - 250 - r.sss - r.philhealth - 100), "net w/ deductions");

/* ---------- RIDER / daily + ₱100 motor fee per duty day (June: fee 1,300 for 13 days) ---------- */
r = computePayroll(days, { payType: "daily", daily: 658, allowancePerDay: 100 });
assert.equal(r.allowance, 1300);
near(r.basicFor13th, 658 * 13, "13th excludes allowance & OT");

/* ---------- KITCHEN / monthly ₱30,000 OT-inclusive (Jonel) ---------- */
const dEq = 30000 / MONTHLY_FACTOR;
r = computePayroll(days, { payType: "monthly", monthly: 30000 });
assert.equal(r.basic, 15000); assert.equal(r.otPay, 0); assert.equal(r.otHours, 8); assert.equal(r.gross, 15000);
r = computePayroll([...days.slice(0, 12), { date: "2026-01-28", shift: "", type: "absent" }, days[13], days[14], days[15]], { payType: "monthly", monthly: 30000 });
near(r.absentDed, dEq, "absence pro-rata"); near(r.gross, 15000 - dEq, "gross after absence");
r = computePayroll([{ date: "2026-01-01", shift: "8-18", type: "holiday" }], { payType: "monthly", monthly: 30000 });
assert.equal(r.basic, 15000); near(r.premium, dEq, "holiday +1 daily equiv");
r = computePayroll(days, { payType: "monthly", monthly: 30000, lateMinutes: 60 }); near(r.late, dEq / 10, "monthly late = daily equiv ÷ 10 per hour");


/* ================= CONTRACT scheme (riders · Jonel · Genifer · Albert): ₱718, 8h, OT 125%, ND 10% ================= */
const C = (d, o) => compute(d, { scheme: "contract", ...o });
const cdays = datesBetween("2026-10-01", "2026-10-15").map(d => ({ date: d, shift: "8-18", type: "regular", ot: 5 }));  // typed ot is ignored under contract
cdays[1] = { ...cdays[1], type: "off", shift: "" }; cdays[8] = { ...cdays[8], type: "off", shift: "" };
r = C(cdays, { payType: "daily", daily: 718, breakHrs: 1 });
assert.equal(r.scheme, "contract"); assert.equal(r.daysWorked, 13); assert.equal(r.basic, 718 * 13); assert.equal(r.hourly, 89.75);
assert.equal(r.otHours, 13); near(r.otPay, 13 * (718 / 8) * 1.25, "OT 125%"); assert.equal(r.penalty, 0);
r = C(cdays, { daily: 718, lateMinutes: 30 }); near(r.late, 30 * 718 / 480, "late at daily/480, no penalty"); assert.equal(r.penalty, 0);
const hr = 718 / 8;
r = C([{ date: "2026-10-01", shift: "18-4", type: "holiday" }], { daily: 718 });
assert.equal(r.basic, 718); assert.equal(r.premium, 718); near(r.otPay, hr * 2.6, "hol OT"); near(r.ndPay, 6 * hr * 2 * 0.1, "hol ND");
r = C([{ date: "2026-10-01", shift: "8-18", type: "rest" }], { daily: 718 }); near(r.premium, 718 * 0.3, "rest day 130%");
r = C(cdays, { payType: "daily", daily: 718, allowancePerDay: 100 }); assert.equal(r.allowance, 1300);
r = C(cdays, { payType: "monthly", monthly: 30000 }); assert.equal(r.basic, 15000); assert.equal(r.otPay, 0); assert.equal(r.gross, 15000);
r = C([{ date: "2026-10-01", shift: "18-4", type: "holiday" }], { payType: "monthly", monthly: 30000 });
near(r.premium, 8 * (30000 / MONTHLY_FACTOR / 8), "monthly holiday +100%"); near(r.ndPay, 6 * (30000 / MONTHLY_FACTOR / 8) * 2 * 0.1, "monthly ND");
// default scheme is contract
assert.equal(compute(cdays, { daily: 718 }).scheme, "contract");

console.log("payroll tests OK");

/* ---------- app clock in/out → shifts ---------- */
import { pairPunches } from "../payroll-calc.js";
let pp = pairPunches([
  { kind: "in", at: "2026-10-20T08:02:00" }, { kind: "out", at: "2026-10-20T18:10:00" },
  { kind: "in", at: "2026-10-21T17:55:00" }, { kind: "out", at: "2026-10-22T04:05:00" },   // overnight → belongs to 10/21
  { kind: "out", at: "2026-10-23T03:30:00" },                                              // OUT only, before 06:00 → 10/22, incomplete
  { kind: "in", at: "2026-10-24T08:00:00" }, { kind: "out", at: "2026-10-24T12:00:00" }, { kind: "in", at: "2026-10-24T13:00:00" }, { kind: "out", at: "2026-10-24T19:00:00" }, // split day
  { kind: "in", at: "2026-10-25T08:00:00" },                                               // never clocked out
]);
assert.equal(pp["2026-10-20"].shift, "08:02-18:10"); assert.equal(pp["2026-10-20"].incomplete, false);
assert.equal(pp["2026-10-21"].shift, "17:55-04:05"); assert.equal(pp["2026-10-22"]?.shift, ""); assert.equal(pp["2026-10-22"].incomplete, true);
assert.equal(pp["2026-10-24"].shift, "08:00-19:00"); assert.equal(pp["2026-10-25"].incomplete, true);
assert.equal(shiftHours("17:55-04:05", 1).span, 10.17);
console.log("punch tests OK");
