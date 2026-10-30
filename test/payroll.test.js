import assert from "node:assert/strict";
import { computePayroll as compute, shiftHours, periodForDate, periodOf, datesBetween, MONTHLY_FACTOR, carriesOver, paidDays, isNightShift } from "../payroll-calc.js";
const computePayroll = (d, o) => compute(d, { scheme: "paper", ...o });   // paper-method block below

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} vs ${b}`);

// shifts
assert.deepEqual(shiftHours("8-18", 1), { span: 10, worked: 9, hours: 9, reg: 8, ot: 1, nd: 0, ndOt: 0 });
assert.deepEqual(shiftHours("18-4", 1), { span: 10, worked: 9, hours: 9, reg: 8, ot: 1, nd: 6, ndOt: 1 });   // 03–04 is the OT hour, at night
assert.deepEqual(shiftHours("8-20", 1), { span: 12, worked: 11, hours: 11, reg: 8, ot: 3, nd: 0, ndOt: 0 });
assert.deepEqual(shiftHours("", 1), { span: 0, worked: 0, hours: 0, reg: 0, ot: 0, nd: 0, ndOt: 0 });

// periods
assert.deepEqual(periodForDate("2026-10-01"), { start: "2026-10-01", end: "2026-10-15", half: 1, carry: [] });   // September has 30 days
assert.deepEqual(periodForDate("2026-10-16"), { start: "2026-10-16", end: "2026-10-30", half: 2, monthEnd: "2026-10-31" });
assert.equal(periodForDate("2026-10-31").start, "2026-11-01");          // 31st → next 15th payroll
assert.equal(periodForDate("2026-12-31").start, "2027-01-01");
assert.equal(periodOf(2026, 2, 2).end, "2026-02-28");
assert.equal(periodOf(2026, 11, 2).end, "2026-11-30");
assert.deepEqual(periodOf(2026, 11, 1).carry, ["2026-10-30", "2026-10-31"]);
assert.deepEqual(periodOf(2026, 12, 1).carry, []);                       // November has 30 days
assert.deepEqual(periodOf(2027, 1, 1).carry, ["2026-12-30", "2026-12-31"]);
assert.ok(isNightShift("20-4") && isNightShift("22-8") && !isNightShift("8-18") && !isNightShift("12-22"));
assert.ok(carriesOver("2026-10-30", "20-4") && !carriesOver("2026-10-30", "8-18") && !carriesOver("2026-11-30", "20-4") && carriesOver("2026-10-31", "8-18"));
// 16–30: the 30th night shift drops out …
assert.deepEqual(paidDays([{ date: "2026-10-29", shift: "20-4" }, { date: "2026-10-30", shift: "20-4" }]).map(d => d.date), ["2026-10-29"]);
assert.equal(paidDays([{ date: "2026-10-30", shift: "8-18" }]).length, 1);
// … and comes back in 1–15 with the 31st; a carried 30th day shift was already paid → not counted again
assert.deepEqual(paidDays([{ date: "2026-10-30", shift: "20-4", carry: true }, { date: "2026-10-31", shift: "8-18", carry: true }, { date: "2026-11-01", shift: "8-18" }]).map(d => d.date), ["2026-10-30", "2026-10-31", "2026-11-01"]);
assert.equal(paidDays([{ date: "2026-10-30", shift: "8-18", carry: true }]).length, 0);

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
// paper OT from the shift: a day is 10h; past that 1h is the unpaid break, the rest is OT → 08–19 → 0, 08–20 (12h) → +1h, 08–21 → +2h; typed ot overrides, empty = auto
r = computePayroll([{ date: "2026-10-01", shift: "8-19", type: "regular" }, { date: "2026-10-02", shift: "8-20", type: "regular", ot: null }, { date: "2026-10-03", shift: "8-21", type: "regular", ot: 1 }, { date: "2026-10-04", shift: "8-18", type: "regular" }, { date: "2026-10-05", shift: "19:57-08:13", type: "regular" }], { daily: 790 });
assert.equal(r.rows[0].ot, 0); assert.equal(r.rows[1].ot, 1); assert.equal(r.rows[2].ot, 1); assert.equal(r.rows[3].ot, 0); assert.equal(r.rows[4].ot, 1);   // Lilian 12.27h → 1h OT
assert.equal(r.otHours, 3); assert.equal(r.otPay, 3 * 79);
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
assert.equal(r.basic, 718); assert.equal(r.premium, 718); near(r.otPay, hr * 2.6, "hol OT"); near(r.ndPay, (5 * 2 + 1 * 2.6) * hr * 0.1, "hol ND (OT hour at 260%)");
// contract 2.4.1: night hour inside overtime = 137.5% (125% + 10% of it); rider 17:48–04:00 → 9h after break, 1h OT at 03–04 (night)
r = C([{ date: "2026-10-16", shift: "17:48-04:00", type: "regular" }], { daily: 718 });
assert.equal(r.otHours, 1); near(r.ndPay, (5 * 1 + 1 * 1.25) * hr * 0.1, "ND incl. OT hour");
r = C([{ date: "2026-10-01", shift: "8-18", type: "rest" }], { daily: 718 }); near(r.premium, 718 * 0.3, "rest day 130%");
r = C(cdays, { payType: "daily", daily: 718, allowancePerDay: 100 }); assert.equal(r.allowance, 1300);
r = C(cdays, { payType: "monthly", monthly: 30000 }); assert.equal(r.basic, 15000); assert.equal(r.otPay, 0); assert.equal(r.gross, 15000);   // 08–18 = 8h + 1h built-in OT → nothing extra
/* Jonel monthly contract: 30,000 = basic 25,945 + built-in OT 4,055 (1h/day); daily 994.70, hourly 124.34 */
const jd = 25945 / MONTHLY_FACTOR, jh = jd / 8; near(jd, 994.70, "daily 994.70"); near(jh, 124.34, "hourly 124.34");
r = C(cdays, { payType: "monthly", monthly: 30000, monthlyBasic: 25945 });
assert.equal(r.basic, 15000); assert.equal(r.otPay, 0); assert.equal(r.builtInOt, 2027.5); near(r.basicFor13th, 12972.5, "13th on basic 25,945");
r = C([{ date: "2026-10-13", shift: "07:59-18:48", type: "regular" }], { payType: "monthly", monthly: 30000, monthlyBasic: 25945 });
assert.equal(r.otHours, 1.5); near(r.otPay, 0.5 * jh * 1.25, "OT beyond the built-in hour");
r = C([{ date: "2026-10-18", shift: "8-18", type: "rest" }], { payType: "monthly", monthly: 30000, monthlyBasic: 25945 });
near(r.premium, 8 * jh * 1.3, "rest day worked: 130% in full"); near(r.otPay, 1 * jh * 1.69, "rest-day OT 169%, no built-in");
r = C([{ date: "2026-10-01", shift: "8-18", type: "holiday" }], { payType: "monthly", monthly: 30000, monthlyBasic: 25945 }); near(r.premium, 8 * jh, "holiday +100%");
r = C(cdays, { payType: "monthly", monthly: 30000, monthlyBasic: 25945, lateMinutes: 10 }); near(r.late, 20.72, "3.3: 10 min late = 20.72");
r = C([...cdays.slice(0, 12), { date: "2026-10-13", shift: "", type: "absent" }, cdays[13], cdays[14]], { payType: "monthly", monthly: 30000, monthlyBasic: 25945 }); near(r.absentDed, jd, "absence at 994.70");
r = C([{ date: "2026-10-01", shift: "18-4", type: "holiday" }], { payType: "monthly", monthly: 30000 });
near(r.premium, 8 * (30000 / MONTHLY_FACTOR / 8), "monthly holiday +100%"); near(r.ndPay, (5 * 2 + 1 * 2.6) * (30000 / MONTHLY_FACTOR / 8) * 0.1, "monthly ND");
// default scheme is contract
assert.equal(compute(cdays, { daily: 718 }).scheme, "contract");

/* fixed monthly gov amounts (Noemie: SSS 450, Pag-IBIG 200 per month) → half per payroll */
{ const r = compute(cdays, { scheme: "contract", daily: 718, gov: { sss: true, pagibig: true, philhealth: false, fixed: { sss: 450, pagibig: 200 } }, govShare: 0.5 });
  assert.equal(r.sss, 225); assert.equal(r.pagibig, 100); assert.equal(r.philhealth, 0);
  const r2 = compute(cdays, { scheme: "contract", daily: 718, gov: { sss: false, pagibig: true, fixed: { sss: 450, pagibig: 200 } }, govShare: 1 });
  assert.equal(r2.sss, 0); assert.equal(r2.pagibig, 200); }

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

// time card → paid part of the shift: early in not paid, late out only when ≥ 60 min
{
  const { paidShift } = await import("../payroll-calc.js");
  assert.equal(paidShift("18-4", "17:54-07:06"), "18:00-07:06");
  assert.equal(paidShift("18-4", "17:54-04:22"), "18-4");
  assert.equal(paidShift("20-6", "20:59-06:05"), "20:59-06:00");
  assert.equal(paidShift("8-20", "07:52-21:47"), "08:00-21:47");
  assert.equal(paidShift("22-8", "22:11-08:04"), "22:11-08:00");
  console.log("paidShift tests OK");
}
