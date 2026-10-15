// Paltong payroll math — pure functions, no DOM. Verified by test/payroll.test.js
// Contract: daily rate (min wage ₱718), 8 working hours/day, hourly = daily / 8.
// DOLE premiums applied multiplicatively; night differential +10% for 22:00–06:00.

export const SHIFTS = ["8-18", "18-4", "8-20", "20-4", "22-8", "20-8"];
export const SHIFT_LABEL = v => { const [a, b] = v.split("-"); return `${a.padStart(2, "0")}:00–${b.padStart(2, "0")}:00`; };

export const DAY_TYPES = {
  regular:     { pay: 1.00, ot: 1.25, worked: true },
  rest:        { pay: 1.30, ot: 1.69, worked: true },   // rest day worked
  special:     { pay: 1.30, ot: 1.69, worked: true },   // special non-working day worked
  specialRest: { pay: 1.50, ot: 1.95, worked: true },
  holiday:     { pay: 2.00, ot: 2.60, worked: true },   // regular holiday worked
  holidayRest: { pay: 2.60, ot: 3.38, worked: true },
  holidayOff:  { pay: 1.00, ot: 0,    worked: false, paidDay: true }, // regular holiday not worked → 100%
  sil:         { pay: 1.00, ot: 0,    worked: false, paidDay: true }, // SIL / attendance paid leave → 100%
  off:         { pay: 0,    ot: 0,    worked: false },
};
export const ND_RATE = 0.10;
export const MONTHLY_FACTOR = 313 / 12; // 6-day week → 313 paid days a year

const r2 = n => Math.round((+n || 0) * 100) / 100;

/** shift "8-18" → hours in the shift, split into regular (≤8), overtime and night hours */
export function shiftHours(shift, breakHrs = 1) {
  if (!shift || !SHIFTS.includes(shift)) return { span: 0, worked: 0, hours: 0, ot: 0, nd: 0 };
  let [a, b] = shift.split("-").map(Number); if (b <= a) b += 24;
  let nd = 0; for (let h = a; h < b; h++) { const hh = h % 24; if (hh >= 22 || hh < 6) nd++; }
  const worked = Math.max(0, b - a - (+breakHrs || 0));
  return { span: b - a, worked, hours: Math.min(8, worked), ot: Math.max(0, worked - 8), nd };
}

// Government contributions (employee share) estimated from monthly basic — reference values, check official tables yearly
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
 * days: [{ date, shift, type }]   shift ∈ SHIFTS or "" ; type ∈ DAY_TYPES keys
 * opts: { daily, breakHrs, lateMinutes, advances, shortage, otherDeduction, incentive,
 *         gov: { sss, philhealth, pagibig }, govShare: 1 | 0.5 }
 */
export function computePayroll(days, opts) {
  const daily = +opts.daily || 0, hourly = daily / 8, perMin = daily / 480;
  const breakHrs = opts.breakHrs == null ? 1 : +opts.breakHrs;
  let basic = 0, premium = 0, otPay = 0, ndPay = 0, silPay = 0, holidayOffPay = 0;
  let daysWorked = 0, hoursWorked = 0, otHours = 0, ndHours = 0, silDays = 0, holidayOffDays = 0;
  const rows = [];
  for (const d of days || []) {
    const t = DAY_TYPES[d.type] || DAY_TYPES.regular;
    const sh = t.worked ? shiftHours(d.shift, breakHrs) : { hours: 0, ot: 0, nd: 0, worked: 0 };
    let base = 0, extra = 0, otp = 0, ndp = 0;
    if (t.paidDay) {
      base = daily;
      if (d.type === "sil") { silPay += base; silDays++; } else { holidayOffPay += base; holidayOffDays++; }
    } else if (t.worked && sh.hours > 0) {
      base = sh.hours * hourly; extra = sh.hours * hourly * (t.pay - 1);
      otp = sh.ot * hourly * t.ot; ndp = sh.nd * hourly * t.pay * ND_RATE;
      basic += base; premium += extra; otPay += otp; ndPay += ndp;
      daysWorked++; hoursWorked += sh.hours; otHours += sh.ot; ndHours += sh.nd;
    }
    rows.push({ date: d.date, shift: d.shift || "", type: d.type || "regular", hours: sh.hours, ot: sh.ot, nd: sh.nd, amount: r2(base + extra + otp + ndp) });
  }
  const lateMinutes = Math.max(0, +opts.lateMinutes || 0);
  const late = lateMinutes * perMin;
  const incentive = +opts.incentive || 0;
  const gross = basic + premium + otPay + ndPay + silPay + holidayOffPay + incentive - late;

  const monthly = daily * MONTHLY_FACTOR;
  const share = opts.govShare === 0.5 ? 0.5 : 1;
  const gov = opts.gov || {};
  const sss = gov.sss ? r2(sssEmployee(monthly) * share) : 0;
  const philhealth = gov.philhealth ? r2(philhealthEmployee(monthly) * share) : 0;
  const pagibig = gov.pagibig ? r2(pagibigEmployee(monthly) * share) : 0;
  const advances = +opts.advances || 0, shortage = +opts.shortage || 0, otherDeduction = +opts.otherDeduction || 0;
  const deductions = sss + philhealth + pagibig + advances + shortage + otherDeduction;

  return {
    hourly: r2(hourly), perMinute: r2(perMin), monthly: r2(monthly),
    daysWorked, hoursWorked, otHours, ndHours, silDays, holidayOffDays, lateMinutes, rows,
    basic: r2(basic), premium: r2(premium), otPay: r2(otPay), ndPay: r2(ndPay), silPay: r2(silPay), holidayOffPay: r2(holidayOffPay),
    late: r2(late), incentive: r2(incentive), gross: r2(gross),
    sss, philhealth, pagibig, advances: r2(advances), shortage: r2(shortage), otherDeduction: r2(otherDeduction),
    deductions: r2(deductions), net: r2(gross - deductions),
  };
}

/** Contract 2.6: advance requested 1–15 → 15th payroll; 16–end → 30th payroll. Returns the period that absorbs it. */
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
export function datesBetween(start, end) {
  const out = []; const d = new Date(start + "T00:00:00"); const e = new Date(end + "T00:00:00");
  const pad = n => String(n).padStart(2, "0");
  while (d <= e) { out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); d.setDate(d.getDate() + 1); }
  return out;
}
