import assert from "node:assert/strict";
import { computePayroll, shiftHours, periodForDate, periodOf, datesBetween } from "../payroll-calc.js";

// shifts
assert.deepEqual(shiftHours("8-18", 1), { span: 10, worked: 9, hours: 8, ot: 1, nd: 0 });
assert.deepEqual(shiftHours("18-4", 1), { span: 10, worked: 9, hours: 8, ot: 1, nd: 6 });
assert.deepEqual(shiftHours("8-20", 1), { span: 12, worked: 11, hours: 8, ot: 3, nd: 0 });
assert.deepEqual(shiftHours("20-4", 1), { span: 8, worked: 7, hours: 7, ot: 0, nd: 6 });
assert.deepEqual(shiftHours("22-8", 1), { span: 10, worked: 9, hours: 8, ot: 1, nd: 8 });
assert.deepEqual(shiftHours("20-8", 1), { span: 12, worked: 11, hours: 8, ot: 3, nd: 8 });
assert.deepEqual(shiftHours("", 1).worked, 0);

// periods (contract 2.6)
assert.deepEqual(periodForDate("2026-10-01"), { start: "2026-10-01", end: "2026-10-15", half: 1 });
assert.deepEqual(periodForDate("2026-10-16"), { start: "2026-10-16", end: "2026-10-31", half: 2 });
assert.equal(periodOf(2026, 2, 2).end, "2026-02-28");
assert.equal(datesBetween("2026-10-16", "2026-10-31").length, 16);

// 13 regular days on 8-18, min wage 718
const days = datesBetween("2026-10-01", "2026-10-15").map(d => ({ date: d, shift: "8-18", type: "regular" }));
days[1].type = "off"; days[1].shift = ""; days[8].type = "off"; days[8].shift = "";
let r = computePayroll(days, { daily: 718, breakHrs: 1 });
assert.equal(r.daysWorked, 13);
assert.equal(r.basic, 718 * 13);                       // 9334
assert.equal(r.otPay, +(13 * (718 / 8) * 1.25).toFixed(2)); // 1 OT hour per day
assert.equal(r.ndPay, 0);
assert.equal(r.net, r.gross);

// late minutes
r = computePayroll(days, { daily: 718, lateMinutes: 30 });
assert.equal(r.late, +(30 * 718 / 480).toFixed(2)); // 44.88

// SIL and holidayOff paid 100%
r = computePayroll([{ date: "2026-10-01", shift: "", type: "sil" }, { date: "2026-10-02", shift: "", type: "holidayOff" }], { daily: 718 });
assert.equal(r.silPay, 718); assert.equal(r.holidayOffPay, 718); assert.equal(r.silDays, 1); assert.equal(r.gross, 1436);

// regular holiday worked 200%, OT 260%, ND on holiday = hourly*2*10%
r = computePayroll([{ date: "2026-10-01", shift: "18-4", type: "holiday" }], { daily: 718 });
const hr = 718 / 8;
assert.equal(r.basic, 718); assert.equal(r.premium, 718);
assert.equal(r.otPay, +(1 * hr * 2.6).toFixed(2));
assert.equal(r.ndPay, +(6 * hr * 2 * 0.1).toFixed(2));

// deductions: advance + verified shortage + gov half
r = computePayroll(days, { daily: 718, advances: 1000, shortage: 250, gov: { sss: true, philhealth: true, pagibig: true }, govShare: 0.5 });
assert.equal(r.monthly, +(718 * 313 / 12).toFixed(2)); // 18727.83
assert.equal(r.sss, +(18500 * 0.05 / 2).toFixed(2));   // MSC 18,500 → 925 → half 462.5
assert.equal(r.philhealth, +(18727.83 * 0.05 / 2 / 2).toFixed(2));
assert.equal(r.pagibig, 100);                           // 200 cap → half
assert.equal(r.net, +(r.gross - 1000 - 250 - r.sss - r.philhealth - 100).toFixed(2));

console.log("payroll tests OK");
