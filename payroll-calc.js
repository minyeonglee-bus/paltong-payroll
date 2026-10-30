// Paltong payroll math — pure functions, no DOM. Verified by test/payroll.test.js
//
// Two schemes, chosen per employee (pr_employees.scheme):
//
// scheme 'contract' — the ₱718 employment contract (riders, Jonel, Genifer, Albert …): 8h/day, hourly = daily/8.
//   OT 125% in ½-hour steps from the shift, night +10% (22–06), rest day 130%, special holiday 130%, regular holiday 200% (100% off).
//   Late = actual minutes × daily/480, no penalty.
//   Monthly ₱30,000 (Jonel, kitchen monthly contract): = basic 25,945 + built-in OT 4,055 (1h OT per working day, 08:00–18:00 incl. 1h break).
//   Daily rate = basic × 12 ÷ 313 (994.70), hourly = ÷ 8 (124.34). Half-month = 15,000 fixed. OT beyond the built-in hour, rest-day (130% full),
//   holiday extras and night diff paid on top; absence and tardiness deducted at the daily/hourly rate; 13th month on the basic 25,945.
//
// scheme 'paper' — the way payroll was done on the time cards Jan–Sep 2026 (Archie, Jonathan, Erika, Lilian, Lorence …), old daily rates:
//   daily    Worked day = 1 × daily rate, whatever the shift length. Half day = ½ daily.
//            A day is a 10-hour shift (e.g. 08–18, meal break inside). Past 10h the first hour is the meal break (unpaid), the rest is overtime
//            in ½-hour steps (12h shift = 10h base + 1h break + 1h OT; 08–19 → 0 OT),
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
/** paper scheme: a day is a 10h shift; past that, the first hour is the (unpaid) meal break, the rest is overtime in ½h steps → 12h shift = 10h base + 1h break + 1h OT */
export const paperOt = (sh, hpd = HOURS_PER_DAY, breakHrs = 1) => sh && sh.span > hpd ? Math.max(0, Math.floor((sh.span - hpd - (+breakHrs || 0)) * 2) / 2) : 0;

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
  if (!p) return { span: 0, worked: 0, hours: 0, reg: 0, ot: 0, nd: 0, ndOt: 0 };
  let a = p.start, b = p.end; if (b <= a) b += 1440;
  const otFrom = a + (8 + (+breakHrs || 0)) * 60;      // minutes after the first 8 worked hours (+ meal break) are overtime
  let ndMin = 0, ndOtMin = 0; for (let m = a; m < b; m += 5) { const hh = (m % 1440) / 60; if (hh >= 22 || hh < 6) { ndMin += 5; if (m >= otFrom) ndOtMin += 5; } }
  const span = (b - a) / 60;
  const worked = Math.max(0, span - (+breakHrs || 0));
  const hours = Math.round(worked * 4) / 4;
  return { span: Math.round(span * 100) / 100, worked: Math.round(worked * 100) / 100, hours, reg: Math.min(8, hours), ot: Math.max(0, Math.floor((worked - 8) * 2) / 2), nd: Math.round(ndMin / 60 * 2) / 2, ndOt: Math.round(ndOtMin / 60 * 2) / 2 };
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
 *          gov:{sss,philhealth,pagibig, fixed:{sss,philhealth,pagibig} monthly}, govShare: 1|0.5 }
 */
export function computePayroll(days, opts) {
  const scheme = opts.scheme === "paper" ? "paper" : "contract";
  const paper = scheme === "paper";
  const payType = opts.payType || "daily";
  const isMonthly = payType === "monthly";
  const monthlyRate = +opts.monthly || 0;
  const monthlyBasic = isMonthly ? (+opts.monthlyBasic > 0 && +opts.monthlyBasic <= monthlyRate ? +opts.monthlyBasic : monthlyRate) : 0;   // part of the monthly that is basic wage (rest = built-in OT)
  const otIncl = isMonthly ? Math.max(0, opts.otIncluded == null ? 1 : +opts.otIncluded || 0) : 0;   // built-in OT hours per regular working day (contract 2.1: 1h)
  const daily = isMonthly ? monthlyBasic / MONTHLY_FACTOR : (+opts.daily || 0);
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
    const ot = !t.worked ? 0 : paper ? (d.ot != null && d.ot !== "" ? Math.max(0, +d.ot || 0) : paperOt(sh, hpd, breakHrs)) : sh.ot;   // paper: shift past 10h, or typed from the card · contract: from the shift
    const nd = paper ? 0 : sh.nd, ndOt = paper ? 0 : Math.min(sh.ndOt || 0, nd, sh.ot);
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
        extra = sh.reg * hourly * (isMonthly && d.type === "rest" ? t.pay : t.pay - 1);   // premium; monthly: a rest day is outside the salary → 130% in full
        otp = isMonthly ? Math.max(0, ot - (d.type === "regular" ? otIncl : 0)) * hourly * t.ot : ot * hourly * t.ot;   // OT 125% (169% / 260% premium days); monthly: beyond the built-in hour
        ndp = ((nd - ndOt) * t.pay + ndOt * t.ot) * hourly * ndRate;   // night +10% of the rate applicable to the hour (incl. OT hours: 137.5% on ordinary days)
      }
      basic += base; premium += extra; otPay += otp; ndPay += ndp;
      if (d.type === "half") halfDays++; else daysWorked++;
      hoursWorked += paper ? sh.span : sh.reg; otHours += ot; ndHours += nd;
    }
    rows.push({ date: d.date, shift: d.shift || "", ...(d.card ? { card: d.card } : {}), type: d.type || "regular", hours: paper ? sh.span : sh.reg, ot, nd, amount: r2(base + extra + otp + ndp - (t.absent && isMonthly ? daily : 0)) });
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
  const share = opts.govShare === 0.5 ? 0.5 : opts.govShare === 0 ? 0 : 1;   // 0 = not this payroll (monthly amount taken on the 30th)
  const gov = opts.gov || {};
  // gov.fixed = monthly amounts actually remitted for this employee (e.g. SSS 450, Pag-IBIG 200) → used instead of the table estimate
  const fx = gov.fixed || {};
  const govAmt = (k, est) => !gov[k] ? 0 : r2((+fx[k] > 0 ? +fx[k] : est(monthly)) * share);
  const sss = govAmt("sss", sssEmployee);
  const philhealth = govAmt("philhealth", philhealthEmployee);
  const pagibig = govAmt("pagibig", pagibigEmployee);
  const advances = +opts.advances || 0, shortage = +opts.shortage || 0, otherDeduction = +opts.otherDeduction || 0;
  const deductions = sss + philhealth + pagibig + advances + shortage + otherDeduction + penalty;

  return {
    scheme, payType, hourly: r2(hourly), dailyEquiv: r2(daily), perMinute: r2(perMin), monthly: r2(monthly), hoursPerDay: hpd,
    daysWorked, halfDays, hoursWorked, otHours, ndHours, silDays, holidayOffDays, absentDays, lateMinutes, rows,
    basic: r2(basic), premium: r2(premium), otPay: r2(otPay), ndPay: r2(ndPay), silPay: r2(silPay), holidayOffPay: r2(holidayOffPay),
    allowance: r2(allowance), absentDed: r2(absentDed), late: r2(late), penalty: r2(penalty), incentive: r2(incentive), bonus: r2(bonus), gross: r2(gross),
    sss, philhealth, pagibig, advances: r2(advances), shortage: r2(shortage), otherDeduction: r2(otherDeduction),
    deductions: r2(deductions), net: Math.ceil(r2(gross - deductions)), // net paid in whole pesos, rounded up
    monthlyBasic: r2(monthlyBasic), builtInOt: r2(isMonthly ? (monthlyRate - monthlyBasic) / 2 : 0),
    basicFor13th: r2((isMonthly ? monthlyBasic / 2 : basic) + silPay - late - absentDed), // 13th month = basic wage only: no built-in OT, allowance, OT, night diff, holiday extra, bonus
  };
}

/** pay periods: 1–15 and 16–30 (Feb: 16–28/29). In a 31-day month the 30th's night shift (crosses midnight) and the whole 31st
 *  are paid in the next 1–15 payroll (carried over, 소급 이월) — the 30th payroll is handed out before that work is done. */
const pad2 = n => String(n).padStart(2, "0");
const lastDay = (y, m) => new Date(y, m, 0).getDate();
/** advance / ledger dated 1–15 → 15th payroll; 16–30 → 30th payroll; 31st → next month's 15th payroll. */
export function periodForDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return day <= 15 ? periodOf(y, m, 1) : day <= 30 ? periodOf(y, m, 2) : (m === 12 ? periodOf(y + 1, 1, 1) : periodOf(y, m + 1, 1));
}
export function periodOf(y, m, half) {
  const last = lastDay(y, m);
  if (half !== 1) return { start: `${y}-${pad2(m)}-16`, end: `${y}-${pad2(m)}-${pad2(Math.min(last, 30))}`, half: 2, monthEnd: `${y}-${pad2(m)}-${pad2(last)}` };
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const carry = lastDay(py, pm) === 31 ? [`${py}-${pad2(pm)}-30`, `${py}-${pad2(pm)}-31`] : [];   // previous month's 30th night + 31st
  return { start: `${y}-${pad2(m)}-01`, end: `${y}-${pad2(m)}-15`, half: 1, carry };
}
/** shift that crosses midnight (18-4, 20-6, 22-8 …) */
export const isNightShift = v => { const p = parseShift(v); return !!p && p.end <= p.start; };
/** this date+shift is paid in the next payroll: the 30th's night shift in a 31-day month, or anything on the 31st */
export function carriesOver(date, shift) {
  const [y, m, d] = date.split("-").map(Number);
  return d === 31 || (d === 30 && lastDay(y, m) === 31 && isNightShift(shift));
}
/** the roster days that count in this payroll: own days minus the ones carried out, plus carried-in rows (carry: true) */
export const paidDays = days => (days || []).filter(d => d.carry ? carriesOver(d.date, d.shift) || +d.date.slice(8) === 31 : !carriesOver(d.date, d.shift));
export function fmtDate(d) { const pad = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function datesBetween(start, end) {
  const out = []; const d = new Date(start + "T00:00:00"); const e = new Date(end + "T00:00:00");
  while (d <= e) { out.push(fmtDate(d)); d.setDate(d.getDate() + 1); }
  return out;
}
export function addDays(dateStr, n) { const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n); return fmtDate(d); }

/**
 * pairPunches(punches) — app clock-in/out records → one shift per date.
 *  punches: [{ kind:'in'|'out', at: Date|string }]  (any order)
 *  returns { [date]: { shift:"HH:MM-HH:MM"|"", in:Date|null, out:Date|null, incomplete:boolean } }
 *  A session belongs to the date of its IN; an OUT before 06:00 with no open IN belongs to the previous date.
 *  Several sessions on one date → first IN to last OUT. Missing IN or OUT → incomplete (shift left empty).
 */
export function pairPunches(punches) {
  const list = (punches || []).map(p => ({ kind: p.kind, at: p.at instanceof Date ? p.at : new Date(p.at) })).filter(p => !isNaN(p.at)).sort((a, b) => a.at - b.at);
  const hhmm = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const days = {};
  const day = (date) => days[date] || (days[date] = { in: null, out: null, incomplete: false, sessions: 0 });
  let open = null;
  for (const p of list) {
    if (p.kind === "in") {
      if (open) { day(open.date).incomplete = true; }                 // IN after IN: previous session never closed
      open = { date: fmtDate(p.at), at: p.at };
      const d = day(open.date); d.sessions++; if (!d.in || p.at < d.in) d.in = p.at;
    } else {
      if (open) {
        const d = day(open.date); if (!d.out || p.at > d.out) d.out = p.at; open = null;
      } else {                                                         // OUT without IN
        const dt = p.at.getHours() < 6 ? addDays(fmtDate(p.at), -1) : fmtDate(p.at);
        const d = day(dt); d.incomplete = true; if (!d.out || p.at > d.out) d.out = p.at;
      }
    }
  }
  if (open) day(open.date).incomplete = true;
  for (const [, d] of Object.entries(days)) {
    if (!d.in || !d.out) d.incomplete = true;
    d.shift = d.in && d.out ? `${hhmm(d.in)}-${hhmm(d.out)}` : "";
  }
  return days;
}

/**
 * paidShift(planned, actual) — the part of a time-card shift that is paid.
 * Early clock-in is not paid (pay starts at the scheduled start; a late arrival starts later).
 * Staying past the scheduled end counts only when it is 60 minutes or more (otherwise pay stops at the scheduled end).
 * planned "18-4", actual "17:54-07:06" → "18:00-07:06"; actual "17:54-04:22" → "18-4".
 */
export function paidShift(planned, actual, minExtra = 60) {
  const P = parseShift(planned), A = parseShift(actual);
  if (!P || !A) return actual || planned || "";
  const toM = x => x;   // parseShift already gives minutes
  const s = toM(P.start); let e = toM(P.end); if (e <= s) e += 1440;
  let i = toM(A.start); if (i < s - 720) i += 1440; if (i > s + 720) i -= 1440;
  let o = toM(A.end); while (o <= i) o += 1440;
  const st = Math.max(s, i), en = o - e >= minExtra ? o : Math.min(e, o);
  if (en <= st) return actual;
  const f = m => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  return st === s && en === e ? planned : `${f(st)}-${f(en)}`;
}
