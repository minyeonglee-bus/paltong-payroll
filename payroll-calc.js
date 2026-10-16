// Paltong payroll math — pure functions, no DOM. Verified by test/payroll.test.js
//
// Two pay schemes, from the contracts (waiter / kitchen / rider):
//   daily    Waiter / Kitchen / Rider on daily rate (min wage ₱718). 8h/day, hourly = daily/8.
//            OT 125%, night +10%, rest day 130%, special holiday 130%, regular holiday 200% (100% if not worked).
//            Rider: + maintenance allowance ₱100 per duty day (not basic, not in 13th month). Delivery fee & fuel are paid same day, outside payroll.
//            Waiter: verified cash shortage may be deducted (written authorization).
//   monthly  Kitchen ₱30,000 all-inclusive: fixed monthly for 6 days × 8h; OT already included (no OT pay).
//            Night differential, holiday & rest-day premiums still paid per law. Unexcused absence / tardiness deducted pro-rata.
//            daily equivalent = monthly × 12 ÷ 313, hourly = that ÷ 8. Half-month basic = monthly ÷ 2.

// preset shifts; any "HH:MM-HH:MM" (time-card in/out) is also accepted
export const SHIFTS = ["8-18", "18-4", "8-20", "20-4", "22-8", "20-8", "20-6", "22-6", "22-4", "10-20", "12-22"];
const toMin = x => { if (x == null || x === "") return NaN; const [h, m = "0"] = String(x).split(":"); return (+h) * 60 + (+m); };
export const parseShift = v => { if (!v) return null; const [a, b] = String(v).split("-"); const s = toMin(a), e = toMin(b); return isNaN(s) || isNaN(e) ? null : { start: s, end: e }; };
export const SHIFT_LABEL = v => { const p = parseShift(v); if (!p) return v; const f = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; return `${f(p.start)}–${f(p.end)}`; };
export const isPreset = v => SHIFTS.includes(v);
export const MONTHLY_FACTOR = 313 / 12; // 6-day week → 313 paid days a year
export const ND_RATE = 0.10;

export const DAY_TYPES = {
  regular:     { pay: 1.00, ot: 1.25, worked: true },
  rest:        { pay: 1.30, ot: 1.69, worked: true },   // rest day worked
  special:     { pay: 1.30, ot: 1.69, worked: true },   // special non-working day worked
  specialRest: { pay: 1.50, ot: 1.95, worked: true },
  holiday:     { pay: 2.00, ot: 2.60, worked: true },   // regular holiday worked
  holidayRest: { pay: 2.60, ot: 3.38, worked: true },
  holidayOff:  { pay: 1.00, ot: 0,    worked: false, paidDay: true }, // regular holiday not worked → 100%
  sil:         { pay: 1.00, ot: 0,    worked: false, paidDay: true }, // SIL / attendance paid leave → 100%
  absent:      { pay: 0,    ot: 0,    worked: false, absent: true },  // unexcused absence (monthly: deducted)
  off:         { pay: 0,    ot: 0,    worked: false },
};
// which day types each scheme offers in the roster
export const DAY_TYPES_FOR = {
  daily:   ["regular", "rest", "special", "specialRest", "holiday", "holidayRest", "holidayOff", "sil", "off"],
  monthly: ["regular", "rest", "special", "specialRest", "holiday", "holidayRest", "holidayOff", "sil", "absent", "off"],
};

const r2 = n => Math.round((+n || 0) * 100) / 100;

/** shift "8-18" → hours in the shift, split into regular (≤8), overtime and night hours */
/** shift "8-18" or time-card "21:58-08:20" → span, regular hours (≤8), overtime (½-hour steps, rounded down) and night hours (22:00–06:00) */
export function shiftHours(shift, breakHrs = 1) {
  const p = parseShift(shift);
  if (!p) return { span: 0, worked: 0, hours: 0, ot: 0, nd: 0 };
  let a = p.start, b = p.end; if (b <= a) b += 1440;
  let ndMin = 0; for (let m = a; m < b; m += 5) { const hh = (m % 1440) / 60; if (hh >= 22 || hh < 6) ndMin += 5; }
  const span = (b - a) / 60;
  const worked = Math.max(0, span - (+breakHrs || 0));
  const hours = Math.min(8, Math.round(worked * 4) / 4);
  const ot = Math.max(0, Math.floor((worked - 8) * 2) / 2);
  return { span: Math.round(span * 100) / 100, worked: Math.round(worked * 100) / 100, hours, ot, nd: Math.round(ndMin / 60 * 2) / 2 };
}

// Government contributions (employee share) from monthly basic — reference values, check official tables yearly
export function sssEmployee(monthly) {
  const msc = Math.min(35000, Math.max(5000, Math.round((+monthly || 0) / 500) * 500));
  return r2(msc * 0.05);
}
export function philhealthEmployee(monthly) {
  const base = Math.min(100000, Math.max(10000, +monthly || 0));
  return r2(base * 0.05 / 2);
}
export function pagibigEmployee(monthly) {
  const m = +monthly || 0;
  return r2(Math.min(m, 10000) * (m <= 1500 ? 0.01 : 0.02));
}

/**
 * computePayroll(days, opts)
 *  opts.payType: 'daily' | 'monthly'
 *  days: [{ date, shift, type }]
 *  opts: { daily, monthly, breakHrs, allowancePerDay, lateMinutes, incentive, bonus,
 *          advances, shortage, otherDeduction, gov:{sss,philhealth,pagibig}, govShare: 1|0.5 }
 */
export function computePayroll(days, opts) {
  const payType = opts.payType || "daily";
  const isMonthly = payType === "monthly";
  const monthlyRate = +opts.monthly || 0;
  const daily = isMonthly ? monthlyRate / MONTHLY_FACTOR : (+opts.daily || 0);
  const hourly = daily / 8, perMin = daily / 480;
  const breakHrs = opts.breakHrs == null ? 1 : +opts.breakHrs;
  const allowancePerDay = +opts.allowancePerDay || 0;
  const otMult = +opts.otMultiplier > 0 ? +opts.otMultiplier : 1.25;
  const ndRate = opts.nightDiff === false ? 0 : ND_RATE; // night differential +10% (22:00–06:00); can be switched off in settings // contract: 125%; set 1.0 to pay OT at the plain hourly rate

  let basic = 0, premium = 0, otPay = 0, ndPay = 0, silPay = 0, holidayOffPay = 0, absentDed = 0;
  let daysWorked = 0, hoursWorked = 0, otHours = 0, ndHours = 0, silDays = 0, holidayOffDays = 0, absentDays = 0;
  const rows = [];
  for (const d of days || []) {
    const t = DAY_TYPES[d.type] || DAY_TYPES.regular;
    const sh = t.worked ? shiftHours(d.shift, breakHrs) : { hours: 0, ot: 0, nd: 0, worked: 0 };
    let base = 0, extra = 0, otp = 0, ndp = 0;
    if (t.paidDay) {
      if (!isMonthly) base = daily;                       // monthly: already inside the fixed salary
      if (d.type === "sil") { silPay += base; silDays++; } else { holidayOffPay += base; holidayOffDays++; }
    } else if (t.absent) {
      absentDays++; if (isMonthly) absentDed += daily;    // monthly: pro-rata deduction
    } else if (t.worked && sh.hours > 0) {
      if (!isMonthly) base = sh.hours * hourly;
      extra = sh.hours * hourly * (t.pay - 1);            // rest-day / holiday premium (both schemes)
      otp = isMonthly ? 0 : sh.ot * hourly * (t.ot / 1.25) * otMult;        // monthly ₱30,000 is OT-inclusive (contract 2.2)
      ndp = sh.nd * hourly * t.pay * ndRate;
      basic += base; premium += extra; otPay += otp; ndPay += ndp;
      daysWorked++; hoursWorked += sh.hours; otHours += sh.ot; ndHours += sh.nd;
    }
    rows.push({ date: d.date, shift: d.shift || "", type: d.type || "regular", hours: sh.hours, ot: sh.ot, nd: sh.nd, amount: r2(base + extra + otp + ndp - (t.absent && isMonthly ? daily : 0)) });
  }
  if (isMonthly) basic = monthlyRate / 2;                 // half-month fixed basic
  const allowance = allowancePerDay * daysWorked;         // rider maintenance ₱100 × duty days
  const lateMinutes = Math.max(0, +opts.lateMinutes || 0);
  const late = lateMinutes * perMin;
  const incentive = +opts.incentive || 0, bonus = +opts.bonus || 0;
  const gross = basic + premium + otPay + ndPay + silPay + holidayOffPay + allowance + incentive + bonus - late - absentDed;

  const monthly = isMonthly ? monthlyRate : daily * MONTHLY_FACTOR;
  const share = opts.govShare === 0.5 ? 0.5 : 1;
  const gov = opts.gov || {};
  const sss = gov.sss ? r2(sssEmployee(monthly) * share) : 0;
  const philhealth = gov.philhealth ? r2(philhealthEmployee(monthly) * share) : 0;
  const pagibig = gov.pagibig ? r2(pagibigEmployee(monthly) * share) : 0;
  const advances = +opts.advances || 0, shortage = +opts.shortage || 0, otherDeduction = +opts.otherDeduction || 0;
  const deductions = sss + philhealth + pagibig + advances + shortage + otherDeduction;

  return {
    payType, hourly: r2(hourly), dailyEquiv: r2(daily), perMinute: r2(perMin), monthly: r2(monthly),
    daysWorked, hoursWorked, otHours, ndHours, silDays, holidayOffDays, absentDays, lateMinutes, rows,
    basic: r2(basic), premium: r2(premium), otPay: r2(otPay), ndPay: r2(ndPay), silPay: r2(silPay), holidayOffPay: r2(holidayOffPay),
    allowance: r2(allowance), absentDed: r2(absentDed), late: r2(late), incentive: r2(incentive), bonus: r2(bonus), gross: r2(gross),
    sss, philhealth, pagibig, advances: r2(advances), shortage: r2(shortage), otherDeduction: r2(otherDeduction),
    deductions: r2(deductions), net: r2(gross - deductions),
    basicFor13th: r2(basic + silPay + holidayOffPay - late - absentDed), // 13th month = basic only (no allowance, OT, premiums, bonus)
  };
}

/** Contract 2.6: advance requested 1–15 → 15th payroll; 16–end → 30th payroll. */
export function periodForDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return day <= 15 ? periodOf(y, m, 1) : periodOf(y, m, 2);
}
export function periodOf(y, m, half) {
  const last = new Date(y, m, 0).getDate();
  const pad = n => String(n).padStart(2, "0");
  return half === 1
    ? { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-15`, half: 1 }
    : { start: `${y}-${pad(m)}-16`, end: `${y}-${pad(m)}-${pad(last)}`, half: 2 };
}
export function fmtDate(d) { const pad = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function datesBetween(start, end) {
  const out = []; const d = new Date(start + "T00:00:00"); const e = new Date(end + "T00:00:00");
  while (d <= e) { out.push(fmtDate(d)); d.setDate(d.getDate() + 1); }
  return out;
}
export function addDays(dateStr, n) { const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n); return fmtDate(d); }
