// Paltong payroll math — pure functions, no DOM. Verified by test/payroll.test.js
//
// Two schemes, chosen per employee (pr_employees.scheme):
//
// scheme 'contract' — the ₱718 employment contract (riders, Jonel, Genifer, Albert …): 8h/day, hourly = daily/8.
//   OT 125% in ½-hour steps from the shift, night +10% (22–06), rest day 130%, special holiday 130%, regular holiday 200% (100% off).
//   Late = actual minutes × daily/480, no penalty. Monthly ₱30,000 (Jonel): half = 15,000, OT included, premiums/ND paid, absence pro-rata.
//
// scheme 'paper' — the way payroll was done on the time cards Jan–Sep 2026 (Archie, Jonathan, Erika, Lilian, Lorence …), old daily rates:
//   daily    Worked day = 1 × daily rate, whatever the shift length. Half day = ½ daily.
//            A day is a 10-hour shift (e.g. 08–18, meal break inside). Shift time past 10h = overtime in ½-hour steps (08–19 → +1h),
//            or the hours written on the card can be typed instead. OT hour = daily ÷ 10. No 125%, no night differential.
//            Late/undertime = minutes × daily ÷ 10 ÷ 60 (e.g. 690/day → 1.15/min, 30 min = 34.5),
//            plus a penalty of the same amount (벌금 = 지각액) when latePenalty is on.
//            Special holiday worked +30% of daily. Regular holiday: +1 daily (worked → 2×, not worked → 1×).
//            SIL / paid leave = 1 daily. Rider: + motor maintenance ₱100 per duty day (not basic, not in 13th month).
//            Delivery fee is paid the same day and never enters payroll. Cash advances (CA) are deducted.
//   monthly  Kitchen ₱30,000 all-inclusive: half-month basic = monthly ÷ 2, OT included (not paid).
//            Unexcused absence deducted pro-rata (monthly × 12 ÷ 313 per day). Holiday extra still +1 daily equivalent.

// preset shifts; any "HH:MM-HH:MM" (time-card in/out) is also accepted. Shift is a record only — pay is per day, OT is typed by hand.
export const SHIFTS = ["8-18", "18-4", "8-20", "20-4", "22-8", "20-8", "20-6", "22-6", "22-4", "10-20", "12-22"];
const toMin = x => { if (x == null || x === "") return NaN; const [h, m = "0"] = String(x).split(":"); return (+h) * 60 + (+m); };
export const parseShift = v => { if (!v) return null; const [a, b] = String(v).split("-"); const s = toMin(a), e = toMin(b); return isNaN(s) || isNaN(e) ? null : { start: s, end: e }; };
export const SHIFT_LABEL = v => { const p = parseShift(v); if (!p) return v; const f = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; return `${f(p.start)}–${f(p.end)}`; };
export const isPreset = v => SHIFTS.includes(v);
export const MONTHLY_FACTOR = 313 / 12; // 6-day week → 313 paid days a year
export const HOURS_PER_DAY = 10;        // paper: a day = 10h shift; OT hourly = daily ÷ 10
/** paper scheme: overtime from the shift = span past hoursPerDay, ½-hour steps */
export const paperOt = (sh, hpd = HOURS_PER_DAY) => sh && sh.span > 0 ? Math.max(0, Math.floor((sh.span - hpd) * 2) / 2) : 0;

export const ND_RATE = 0.10;
export const SCHEMES = ["contract", "paper"];
export const DAY_TYPES = {
  regular:     { pay: 1.00, ot: 1.25, worked: true },
  half:        { pay: 0.50, ot: 1.25, worked: true },                 // paper: half day → ½ daily
  rest:        { pay: 1.30, ot: 1.69, worked: true },                 // contract: rest day worked
  special:     { pay: 1.30, ot: 1.69, worked: true },                 // special holiday worked → +30%
  specialRest: { pay: 1.50, ot: 1.95, worked: true },
  holiday:     { pay: 2.00, ot: 2.60, worked: true },                 // regular holiday worked → +100%
  holidayRest: { pay: 2.60, ot: 3.38, worked: true },
  holidayOff:  { pay: 1.00, ot: 0,    worked: false, paidDay: true }, // regular holiday not worked → 1 daily (e.g. 1/1)
  sil:         { pay: 1.00, ot: 0,    worked: false, paidDay: true }, // SIL / paid leave → 1 daily
  absent:      { pay: 0,    ot: 0,    worked: false, absent: true },  // unexcused absence (monthly: deducted)
  off:         { pay: 0,    ot: 0,    worked: false },
};
// which day types each scheme offers in the roster
export const DAY_TYPES_FOR = {
  contract: { daily:   ["regular", "rest", "special", "specialRest", "holiday", "holidayRest", "holidayOff", "sil", "off"],
              monthly: ["regular", "rest", "special", "specialRest", "holiday", "holidayRest", "holidayOff", "sil", "absent", "off"] },
  paper:    { daily:   ["regular", "half", "special", "holiday", "holidayOff", "sil", "off"],
              monthly: ["regular", "half", "special", "holiday", "holidayOff", "sil", "absent", "off"] },
};
export const dayTypesFor = (scheme, payType) => (DAY_TYPES_FOR[scheme] || DAY_TYPES_FOR.contract)[payType === "monthly" ? "monthly" : "daily"];

const r2 = n => Math.round((+n || 0) * 100) / 100;

/** shift "8-18" or time-card "21:58-08:20" → span, worked hours after the meal break, and (contract) regular ≤8h / OT in ½h steps / night hours 22–06 */
export function shiftHours(shift, breakHrs = 1) {
  const p = parseShift(shift);
  if (!p) return { span: 0, worked: 0, hours: 0, reg: 0, ot: 0, nd: 0 };
  let a = p.start, b = p.end; if (b <= a) b += 1440;
  let ndMin = 0; for (let m = a; m < b; m += 5) { const hh = (m % 1440) / 60; if (hh >= 22 || hh < 6) ndMin += 5; }
  const span = (b - a) / 60;
  const worked = Math.max(0, span - (+breakHrs || 0));
  const hours = Math.round(worked * 4) / 4;
  return { span: Math.round(span * 100) / 100, worked: Math.round(worked * 100) / 100, hours, reg: Math.min(8, hours), ot: Math.max(0, Math.floor((worked - 8) * 2) / 2), nd: Math.round(ndMin / 60 * 2) / 2 };
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
 *  days: [{ date, shift, type, ot }]   ot = (paper) overtime hours written on the time card for that day
 *  opts: { scheme:'contract'|'paper', payType:'daily'|'monthly', daily, monthly, breakHrs, hoursPerDay (paper, 10), latePenalty (paper, true),
 *          allowancePerDay, lateMinutes, incentive, bonus, advances, shortage, otherDeduction,
 *          gov:{sss,philhealth,pagibig}, govShare: 1|0.5 }
 */
export function computePayroll(days, opts) {
  const scheme = opts.scheme === "paper" ? "paper" : "contract";
  const paper = scheme === "paper";
  const payType = opts.payType || "daily";
  const isMonthly = payType === "monthly";
  const monthlyRate = +opts.monthly || 0;
  const daily = isMonthly ? monthlyRate / MONTHLY_FACTOR : (+opts.daily || 0);
  const hpd = paper ? (+opts.hoursPerDay > 0 ? +opts.hoursPerDay : HOURS_PER_DAY) : 8;
  const hourly = daily / hpd, perMin = hourly / 60;
  const breakHrs = opts.breakHrs == null ? 1 : +opts.breakHrs;
  const allowancePerDay = +opts.allowancePerDay || 0;
  const latePenalty = paper && opts.latePenalty !== false;
  const ndRate = paper ? 0 : ND_RATE;

  let basic = 0, premium = 0, otPay = 0, ndPay = 0, silPay = 0, holidayOffPay = 0, absentDed = 0;
  let daysWorked = 0, halfDays = 0, hoursWorked = 0, otHours = 0, ndHours = 0, silDays = 0, holidayOffDays = 0, absentDays = 0;
  const rows = [];
  for (const d of days || []) {
    const t = DAY_TYPES[d.type] || DAY_TYPES.regular;
    const sh = t.worked ? shiftHours(d.shift, breakHrs) : { hours: 0, worked: 0, reg: 0, ot: 0, nd: 0 };
    const ot = !t.worked ? 0 : paper ? (d.ot != null && d.ot !== "" ? Math.max(0, +d.ot || 0) : paperOt(sh, hpd)) : sh.ot;   // paper: shift past 10h, or typed from the card · contract: from the shift
    const nd = paper ? 0 : sh.nd;
    let base = 0, extra = 0, otp = 0, ndp = 0;
    if (t.paidDay) {
      if (!isMonthly) base = daily;                       // monthly: already inside the fixed salary
      if (d.type === "sil") { silPay += base; silDays++; } else { holidayOffPay += base; holidayOffDays++; }
    } else if (t.absent) {
      absentDays++; if (isMonthly) absentDed += daily;    // monthly: pro-rata deduction
    } else if (t.worked && (paper || sh.reg > 0)) {
      if (paper) {
        if (!isMonthly) base = daily * Math.min(1, t.pay);  // full day (or ½ for half day), whatever the shift length
        extra = daily * Math.max(0, t.pay - 1);             // special +30% / regular holiday +100%
        otp = isMonthly ? 0 : ot * hourly;                  // card OT hours × (daily ÷ 10); monthly is OT-inclusive
      } else {
        if (!isMonthly) base = sh.reg * hourly;             // hours × hourly (daily ÷ 8)
        extra = sh.reg * hourly * (t.pay - 1);              // rest-day / holiday premium
        otp = isMonthly ? 0 : ot * hourly * t.ot;           // OT 125% (169% / 260% on premium days); monthly is OT-inclusive
        ndp = nd * hourly * t.pay * ndRate;                 // night differential +10%
      }
      basic += base; premium += extra; otPay += otp; ndPay += ndp;
      if (d.type === "half") halfDays++; else daysWorked++;
      hoursWorked += paper ? sh.span : sh.reg; otHours += ot; ndHours += nd;
    }
    rows.push({ date: d.date, shift: d.shift || "", type: d.type || "regular", hours: paper ? sh.span : sh.reg, ot, nd, amount: r2(base + extra + otp + ndp - (t.absent && isMonthly ? daily : 0)) });
  }
  if (isMonthly) basic = monthlyRate / 2;                 // half-month fixed basic
  const dutyDays = daysWorked + halfDays;
  const allowance = allowancePerDay * dutyDays;           // rider maintenance ₱100 × duty days
  const lateMinutes = Math.max(0, +opts.lateMinutes || 0);
  const late = lateMinutes * perMin;
  const penalty = latePenalty ? late : 0;                 // paper: 벌금 = same amount as the late deduction
  const incentive = +opts.incentive || 0, bonus = +opts.bonus || 0;
  const gross = basic + premium + otPay + ndPay + silPay + holidayOffPay + allowance + incentive + bonus - late - absentDed;

  const monthly = isMonthly ? monthlyRate : daily * MONTHLY_FACTOR;
  const share = opts.govShare === 0.5 ? 0.5 : 1;
  const gov = opts.gov || {};
  const sss = gov.sss ? r2(sssEmployee(monthly) * share) : 0;
  const philhealth = gov.philhealth ? r2(philhealthEmployee(monthly) * share) : 0;
  const pagibig = gov.pagibig ? r2(pagibigEmployee(monthly) * share) : 0;
  const advances = +opts.advances || 0, shortage = +opts.shortage || 0, otherDeduction = +opts.otherDeduction || 0;
  const deductions = sss + philhealth + pagibig + advances + shortage + otherDeduction + penalty;

  return {
    scheme, payType, hourly: r2(hourly), dailyEquiv: r2(daily), perMinute: r2(perMin), monthly: r2(monthly), hoursPerDay: hpd,
    daysWorked, halfDays, hoursWorked, otHours, ndHours, silDays, holidayOffDays, absentDays, lateMinutes, rows,
    basic: r2(basic), premium: r2(premium), otPay: r2(otPay), ndPay: r2(ndPay), silPay: r2(silPay), holidayOffPay: r2(holidayOffPay),
    allowance: r2(allowance), absentDed: r2(absentDed), late: r2(late), penalty: r2(penalty), incentive: r2(incentive), bonus: r2(bonus), gross: r2(gross),
    sss, philhealth, pagibig, advances: r2(advances), shortage: r2(shortage), otherDeduction: r2(otherDeduction),
    deductions: r2(deductions), net: Math.ceil(r2(gross - deductions)), // net paid in whole pesos, rounded up
    basicFor13th: r2(basic + silPay - late - absentDed), // 13th month = basic only: no allowance, OT, night diff, holiday extra, bonus
  };
}

/** advance requested 1–15 → 15th payroll; 16–end → 30th payroll. */
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
