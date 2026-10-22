import * as db from "./data.js";
import { computePayroll, shiftHours, paperOt, pairPunches, SHIFTS, SHIFT_LABEL, isPreset, parseShift, DAY_TYPES, dayTypesFor, periodOf, periodForDate, datesBetween, fmtDate, addDays } from "./payroll-calc.js";

/* ---------- i18n ---------- */
const I18N = {
  ko: {
    app: "Paltong 급여", login: "로그인", id: "아이디", pw: "비밀번호", logout: "로그아웃", changePw: "비밀번호 변경", newPw: "새 비밀번호 (6자 이상)",
    tab_pay: "급여 계산", tab_sched: "스케줄", tab_emp: "직원", tab_ledger: "가불·부족분·보너스", tab_hist: "급여 내역", tab_13: "13월급", tab_set: "설정",
    y13: "연도", y13help: "13월급 = 그 해 받은 기본급 합계 ÷ 12 (1년 미만은 받은 만큼만 = 자동 비례) · 12월 24일까지 지급. 기본급엔 초과근무·공휴일 가산·정비비·보너스가 안 들어가요. 앱에 저장된 급여(지급됨 + 작성중)를 더하고, 앱 쓰기 전 기본급은 직원 탭에서 손으로 넣어요.",
    c13_basicApp: "앱 기본급", c13_basicBefore: "앱 이전", c13_total: "기본급 합계", c13_periods: "기간 수", c13_amount: "13월급 (÷12)", c13_avg: "월평균 (1년↑)", c13_proj: "연말 예상", c13_status: "지급", c13_pay: "지급 기록", c13_paid: "지급됨", c13_unpaid: "미지급", c13_unpay: "지급 취소",
    c13_projHelp: "연말 예상 = 지금까지 평균 반월 기본급 × 남은 반월 수를 더한 값 ÷ 12 (참고용)", c13_total_row: "합계", c13_draftNote: "작성중 급여 포함",
    emp_before: "앱 이전 올해 기본급 (13월급용)", emp_beforeHelp: "앱 쓰기 전 올해 1월~9월에 받은 기본급 합계 (초과·수당 제외). 모르면 0",
    my13: "내 13월급", my13help: "올해 지급된 급여의 기본급(초과·야간·가산·정비비·인센티브 제외)으로 계산한 예상치예요. 1년 이상 근무면 한 달 평균, 1년 미만이면 합계 ÷ 12. 12월 24일 전 지급. 확정 금액은 관리자가 지급 기록한 값이에요.", my13_basic: "올해 기본급 합계 ({n}회 지급)", my13_by12: "÷ 12 (1년 미만)", my13_avg: "한 달 평균 (1년 이상)", my13_est: "예상 13월급", my13_1yr: "1년 이상", my13_under: "1년 미만",
    employee: "직원", period: "급여 기간", first: "1 – 15일", second: "16일 – 말일", month: "월",
    daily: "일급", monthlyRate: "월급 (초과근무 포함)", breakH: "식사 휴게 (시간/일)", allowDay: "정비비 (₱/근무일)",
    roster: "보름치 시프트 표", off: "휴무", wkend: "주말",
    type_regular: "근무", type_half: "반일 (½)", type_rest: "휴무일 근무 (130%)", type_special: "특별공휴일 근무 (+30%)", type_specialRest: "특별공휴일+휴무일 (150%)", type_holiday: "정규공휴일 근무 (+1일)", type_holidayRest: "정규공휴일+휴무일 (260%)", type_holidayOff: "정규공휴일 쉼 (1일)", type_sil: "유급휴가 (1일)", type_absent: "결근 (공제)", type_off: "휴무",
    fill: "채우기", fillHelp: "\"앱 출퇴근 불러오기\"를 누르면 직원이 앱에서 누른 출근·퇴근 시각이 날짜별 타임카드로 들어와요 (기준). 없는 날은 시프트로 채우거나 캐시북 스케줄을 불러오고, 쉬는 날은 날짜를 눌러 휴무로.",
    restDay: "주 휴무 요일", dow: ["일", "월", "화", "수", "목", "금", "토"],
    custom: "타임카드 (직접 입력)", inT: "출근", outT: "퇴근", otDay: "OT", otAuto: "비우면 시프트에서 자동 (10h 기본 + 1h 휴게 제외, 나머지가 OT · 12h = OT 1h) · 카드 숫자를 넣으면 그 값",
    late: "지각·조퇴 합계 (분)", lateHelp: "일급 ÷ 10 ÷ 60 · 분당 ₱", lateHelpC: "실제 미근무 분만 (일급 ÷ 8 ÷ 60) · 분당 ₱", incentive: "수동 인센티브·수당 (+)", other: "기타 공제 · 벌금 (−)",
    deductions: "공제 · 보너스", payout: "지급 방법", payoutVia: "지급 수단", payoutSplit: "일부를 GCash/계좌로 (금액)", payoutRest: "나머지 현금", payoutHelp: "명세서에 '지급: GCash 5,000 + Cash 2,075'처럼 찍혀요. 번호는 직원 정보의 GCash/계좌에서 가져와요.", payLine: "지급", ledgerAuto: "이 기간 자동 반영 (가불 · 현금 부족분 · 보너스)", none: "없음",
    gov: "법정 공제 (근로자 부담분)", govShare: "반달치 (½)", govFull: "한 달치", govHelp: "참고값 · SSS 5% · PhilHealth 2.5% · Pag-IBIG 2% (최대 ₱200)",
    result: "계산 내역", basic: "기본급 (근무일 × 일급)", basicC: "기본급 (근무시간 × 시급)", basicM: "기본급 (월급 ÷ 2)", premium: "공휴일 가산 (특별 +30% · 정규 +1일)", premiumC: "휴무일·공휴일 할증", ot: "초과근무 (시간 × 일급÷{h})", otC: "초과근무 125%", nd: "야간근무 가산 (10%)", otIncl: "초과근무 (월급 포함분 1h/일 이내 · 별도 지급 없음)", otExtra: "초과근무 (포함분 1h/일 초과 · 125%)", basicSplit: "　└ 기본급 {b} + 포함 OT {o}", penalty: "지각 벌금 (지각액과 동일)",
    silPay: "유급휴가", holOff: "정규공휴일 유급 (쉼)", allowance: "오토바이 정비비 ({d}일 × ₱{a})", absentDed: "결근 공제 ({d}일)",
    lateDed: "지각·조퇴 공제", gross: "총 지급액 (Gross)", dedHead: "── 공제 내역 ──", dedTotal: "공제 합계", otherManual: "수동 입력 (급여 계산 화면)", govSSS: "SSS (본인 부담)", govPH: "PhilHealth (본인 부담)", govPI: "Pag-IBIG (본인 부담)", adv: "가불금 (CA)", shortage: "현금 부족분", bonus: "보너스 (최고매출일 · 신메뉴 등)", net: "실수령액 (Net)",
    summary: "근무 {d}일{hd} · 초과 {o}h · 유급휴가 {s}일", summaryC: "근무 {d}일 · {h}h · 초과 {o}h · 야간 {n}h · 유급휴가 {s}일", halfSum: " + 반일 {n}", netLbl: "실수령액",
    for13: "13월급 산정용 기본급", riderNote: "배달비·유류비는 당일 현금 지급 (캐시북 직원 탭) · 급여에 포함 안 됨", monthlyNote: "월급 ₱30,000 = 기본 25,945 + 포함 OT 4,055 (08~18시 중 1h/일) · 일급 994.70 · 시급 124.34 · 그 밖의 초과근무(18시 이후)·휴무일 130%·공휴일·야간은 별도 · 결근·지각은 일급/시급 기준 공제 · 13월급은 기본 25,945 기준",
    save: "저장", saved: "저장됨", markPaid: "지급 완료로 기록", paid: "지급됨", draft: "작성중", unpay: "지급 취소", paidOn: "지급일", paidVia: "지급 계좌", slip: "급여명세서", print: "인쇄", printSimple: "간단 인쇄 (58mm)", printA4: "상세 인쇄 (A4)", printBatch: "일괄 인쇄 (A4 한 장에 6명)", delete: "삭제", confirmDel: "정말 삭제할까요?", yes: "삭제", cancel: "취소", close: "닫기",
    emp_add: "직원 추가", emp_name: "이름", emp_pos: "직위", pos_waiter: "웨이터/서버", pos_kitchen: "주방", pos_rider: "라이더", pos_other: "기타",
    emp_status: "고용 형태", st_regular: "정규직", st_probationary: "수습", st_fixed: "계약직", st_other: "기타", emp_hired: "입사일", emp_bday: "생일", emp_active: "재직 중", emp_note: "메모",
    emp_payType: "급여 형태", pt_daily: "일급", pt_monthly: "월급 (OT 포함)",
    led_add: "기록 추가", led_kind: "종류", k_advance: "가불", k_shortage: "현금 부족분", k_bonus: "보너스 (+)", k_other: "기타 공제", led_date: "날짜", led_amount: "금액", led_note: "메모",
    led_verified: "조사 완료 · 본인 책임 확인", led_auth: "서면 동의 받음", led_applies: "→ {p} 급여에 반영", led_deducted: "반영됨", led_pending: "미반영", led_filter_all: "전체",
    bonusHint: "계약서 6조 최고매출일 보너스 = 보름 중 매출 최고일 총매출 × 2% ÷ 그날 근무한 직원 수 (아래 버튼으로 캐시북+출퇴근에서 자동) · 주방 신메뉴 ₱500 (5조) · 생일 인센티브 ₱500 (3.4조, 직전 3개월 개근) · 개근 → 다음 달 유급휴가 1일 (3.2조)는 날짜 종류 '유급휴가'로",
    topBonus: "최고매출일 보너스 계산", topTitle: "최고매출일 보너스 (계약서 6조)", topDay: "최고매출일", topSales: "총매출", topPool: "풀 (2%)", topEach: "1인당", topStaff: "그날 근무 (출퇴근 기록 기준) — 체크 해제하면 제외", topSave: "보너스로 저장", topNone: "이 기간 캐시북 매출이 없어요", topDone: "{n}명에게 ₱{a} 보너스 저장했어요 (10/16 이후 급여에 자동 반영)", topExists: "이미 이 기간 최고매출일 보너스가 저장돼 있어요",
    hist_empty: "저장된 급여가 없어요. 급여 계산 탭에서 저장하세요.", total: "합계",
    set_wage: "기본 일급 (최저임금)", set_break: "기본 식사 휴게 (시간)", set_gov: "법정 공제 기본값", set_lang: "언어", set_rider: "라이더 정비비 (₱/근무일)", set_kitchen: "주방 월급 (총액)", set_mbasic: "월급 중 기본급 (나머지 = 포함 OT)", set_mot: "월급 포함 OT (시간/근무일)", set_hpd: "기존 방식 · 하루 기준 시간 (시프트가 이보다 길면 초과근무 · OT 시급 = 일급 ÷ 이 값)", set_penalty: "기존 방식 · 지각 벌금 (지각액과 같은 금액 추가 공제)", emp_scheme: "계산 방식", sch_contract: "718 계약서 (8h · OT 125% · 야간 10%)", sch_paper: "기존 종이 방식 · 구 계약서 (일급 × 근무일 · OT 일급÷10)", scheme_contract: "계약서", scheme_paper: "기존", penOn: "공제 (종이 방식)", penOff: "공제 안 함",
    contract: "계산 방식 (직원마다 직원 탭에서 선택)", contractText: [
      "【718 계약서 (2026-10-01 신계약 · Erika 제외)】 일급 ₱718 · 하루 8시간, 시급 = 일급 ÷ 8 · 시프트에서 8h 넘는 시간은 30분 단위 내림으로 초과근무 125% · 야간(22~06시) +10% (초과근무 시간도 포함 → 137.5%) · 휴무일 130% · 특별공휴일 130% · 정규공휴일 200%(쉬어도 100%) · 지각은 실제 미근무 분만 공제(벌금 없음)",
      "【기존 종이 방식 · 구 계약서 (Erika ₱750, 5개월 구 계약서)】 옛 일급 · 기본급 = 근무일 × 일급 (시프트 길이 무관, 반일 ½) · 하루 = 10시간 시프트 · 10시간 넘으면 1시간은 휴게(무급), 나머지가 초과근무 (12h 근무 = 10h 기본 + 1h 휴무 + 1h OT · 30분 단위) 또는 카드 숫자 직접 입력 · OT 1시간 = 일급 ÷ 10 (790 → 79) · 125%·야간 가산 없음 · 지각 = 분 × 일급 ÷ 10 ÷ 60 + 같은 금액 벌금 · 특별공휴일 +30% · 정규공휴일 +1일 (쉬어도 1일)",
      "공통 — 지급일 15일·30일 · 유급휴가 1일 = 일급 · 라이더 오토바이 정비비 ₱100/근무일 급여 포함(13월급 제외) · 배달비는 당일 지급 (급여 X) · 가불(CA) 1~15일 → 15일, 16일~ → 30일 급여에서 공제 · 실수령 1페소 올림",
      "주방 월급 계약 (Jonel) — ₱30,000 = 기본 25,945 + 포함 OT 4,055 (08~18시, 1h/일) · 일급 = 25,945×12÷313 = 994.70, 시급 124.34 · 반월 15,000 고정 · 18시 이후 OT 125%, 휴무일 근무 130%, 공휴일·야간 가산 별도 · 결근 994.70/일, 지각 2.07/분 공제 · 13월급은 기본 25,945 기준",
      "13월급 = 기본급(초과·야간·가산·정비비·인센티브 제외) 기준 · 1년 이상은 한 달 평균",
    ],
    noPerm: "권한이 없어요 (관리자만 가능)", paidLocked: "지급 완료된 급여는 관리자만 바꿀 수 있어요", loginFail: "아이디 또는 비밀번호가 틀려요",
    pickEmp: "직원을 먼저 고르세요", deleted: "삭제됨", weekendHelp: "금·토 = 주말",
    fromSched: "캐시북 스케줄 불러오기", fromPunch: "앱 출퇴근 불러오기", punchLoaded: "앱 출퇴근에서 {n}일 채웠어요{x}", punchIncomplete: " · {n}일은 출근/퇴근 한쪽이 없어서 비워뒀어요", punchNone: "이 기간 앱 출퇴근 기록이 없어요", punchList: "앱 출퇴근 기록 (이 기간)", punchAdd: "기록 추가", punchIn: "출근", punchOut: "퇴근", punchAt: "시각", punchAdmin: "관리자 입력",
    clock: "출퇴근", clockHelp: "출근할 때 · 퇴근할 때 눌러주세요. 이 기록이 급여 근무시간 기준이에요.", clockedIn: "출근 중 · {t}부터", clockedOut: "퇴근함 · {t}", notIn: "아직 출근 전", clockDone: "{k} 기록됨 {t}", clockDup: "방금 이미 눌렀어요", clockRecent: "최근 기록", clockToday: "오늘", schedLoaded: "캐시북 스케줄에서 {n}일 불러왔어요", schedNone: "이 기간 캐시북 스케줄에 이 직원이 없어요", fillAll: "전체 채우기", tapOff: "쉬는 날은 날짜를 눌러 휴무로 (다시 누르면 근무)",
    cbTitle: "캐시북 현금 부족 (확인 필요)", cbHelp: "중간마감·마감에서 센 현금이 장부보다 모자라면 여기 들어와요. 자동으로 빠지지 않아요 — 조사 후 책임 웨이터를 지정하고, 가불·부족분에서 '본인 책임 확인'과 '서면 동의'를 둘 다 체크해야 급여에서 공제돼요.", cbNone: "확인할 부족분이 없어요", cbDone: "처리한 것", cbMid: "중간마감", cbFinal: "마감", cbCounted: "센 현금", cbBook: "장부", cbBy: "센 사람", cbReason: "사유", cbDuty: "근무", is_open: "확인 필요", is_assigned: "웨이터 지정됨", is_dismissed: "해결됨 (공제 안 함)",
    cbLaw: "근무 중이었다는 이유만으로 나눠서 빼면 안 돼요. 본인에게 설명할 기회를 주고, 책임이 확인된 한 사람에게만 지정하세요. 지정 후 가불·부족분에서 '본인 책임 확인'과 '서면 동의 받음'을 체크해야 공제돼요.", cbWho: "책임 웨이터", cbAssign: "이 웨이터의 부족분으로 넣기 (미확인)", cbAssigned: "부족분에 넣었어요 — 확인·동의 체크 후 공제돼요", cbDismissLbl: "찾았거나 장부 실수였다면 (메모)", cbFoundPh: "예: 다음날 서랍에서 찾음 / 매출 입력 실수", cbDismiss: "해결됨 — 공제 안 함", notDeducted: "공제 전 (확인·동의 필요)",
    asStaff: "직원", asAdmin: "관리자", empNo: "직원 번호", pin: "PIN (숫자)", pinFirst: "처음이면 PIN 0000", pinWrong: "번호 또는 PIN이 틀려요", pinLocked: "5번 틀려서 10분 동안 잠겼어요",
    newPinTitle: "내 PIN 등록", newPinHelp: "처음 로그인이에요. 나만 아는 숫자 4~6자리로 PIN을 새로 정해주세요 (0000 안 됨).", newPin: "새 PIN", newPin2: "새 PIN 다시", pinMismatch: "두 PIN이 달라요", pinBad: "숫자 4~6자리로 정해주세요 (0000 안 됨)", pinSaved: "PIN을 등록했어요",
    myCalc: "내 급여 계산기 (예상)", myCalcHelp: "스케줄표 기준으로 미리 채워져 있어요 (바꿔서 계산해 볼 수 있어요). 시프트만 넣으면 예상 급여가 나와요. 가불·보너스·부족분은 빠져 있고, 실제 금액은 지급된 급여명세서 기준이에요.", est: "예상 실수령액",
    sched_tap: "눌러서 이 날 출퇴근 수정", sched_editHelp: "출근·퇴근 시각을 고치거나 지우고, 빠진 기록은 아래에서 추가 (밤 근무 퇴근은 다음날 날짜로)", sched_help: "칸을 누르면 그 날 출퇴근을 고칠 수 있어요. 위 줄 = 앱 출퇴근 실제 (출근–퇴근), 아래 회색 = 계획 (웨이터는 캐시북 스케줄, 주방·라이더는 관리자 입력 근무표). 노란 칸 = 퇴근 전/기록 한쪽 없음.", sched_legend: "실제 / 계획", sched_none: "—", mySched: "내 스케줄 (캐시북)", mySchedHelp: "오늘부터 2주 · 캐시북에 올라온 계획", sched_today: "오늘",
    myInfo: "내 정보", myInfoHelp: "연락처·주소·급여 받을 계좌·정부 번호는 직접 고칠 수 있어요. 이름·직책·급여는 관리자만 바꿀 수 있어요.", infoSaved: "내 정보를 저장했어요", empInfo: "직원 정보 (직원이 직접 수정 가능)", i_phone: "휴대폰", i_address: "주소", i_gcash: "GCash 번호", i_bank_name: "은행", i_bank_acct: "계좌번호", i_sss: "SSS 번호", i_philhealth: "PhilHealth 번호", i_pagibig: "Pag-IBIG 번호", i_tin: "TIN", i_emergency_name: "비상 연락 (이름·관계)", i_emergency_phone: "비상 연락 번호", myPay: "내 급여명세서", myLedger: "내 가불·부족분", myShifts: "내 근무 기록", notPaidYet: "아직 지급 전", noData: "아직 기록이 없어요", empNoLbl: "번호", resetPin: "PIN 초기화 (0000)", pinReset: "PIN을 0000으로 초기화했어요. 다음 로그인 때 본인이 다시 등록해요.", pinSet: "PIN 등록됨", pinNotSet: "PIN 미등록 (0000)",
  },
  en: {
    app: "Paltong Payroll", login: "Sign in", id: "ID", pw: "Password", logout: "Sign out", changePw: "Change password", newPw: "New password (6+ chars)",
    tab_pay: "Payroll", tab_sched: "Schedule", tab_emp: "Staff", tab_ledger: "Advances · shortages · bonuses", tab_hist: "History", tab_13: "13th month", tab_set: "Settings",
    y13: "Year", y13help: "13th-month pay = total basic salary earned in the year ÷ 12 (under a year: whatever was earned = automatic pro-rata) · due by Dec 24. Basic excludes OT, holiday extras, maintenance allowance and bonuses. Adds payrolls saved in the app (paid + draft); basic earned before the app is entered manually in the Staff tab.",
    c13_basicApp: "Basic (app)", c13_basicBefore: "Before app", c13_total: "Total basic", c13_periods: "Periods", c13_amount: "13th (÷12)", c13_avg: "Monthly avg (1yr+)", c13_proj: "Year-end est.", c13_status: "Paid", c13_pay: "Record payment", c13_paid: "Paid", c13_unpaid: "Unpaid", c13_unpay: "Undo",
    c13_projHelp: "Year-end estimate = current average basic per half-month × remaining half-months, added, ÷ 12 (reference only)", c13_total_row: "Total", c13_draftNote: "includes draft payrolls",
    emp_before: "Basic earned this year before the app (for 13th month)", emp_beforeHelp: "Basic salary received Jan–Sep this year before the app (no OT / allowances). 0 if unknown",
    my13: "My 13th-month pay", my13help: "Estimate from the basic pay (no OT, night diff, premiums, maintenance or incentives) of payrolls paid this year. 1 year+ of service = one month average; under a year = total ÷ 12. Paid by Dec 24. The final amount is what the admin records.", my13_basic: "Basic pay this year ({n} payrolls)", my13_by12: "÷ 12 (under 1 year)", my13_avg: "One-month average (1 year+)", my13_est: "Estimated 13th month", my13_1yr: "1 year+", my13_under: "under 1 year",
    employee: "Employee", period: "Pay period", first: "1st – 15th", second: "16th – end", month: "Month",
    daily: "Daily rate", monthlyRate: "Monthly salary (OT-inclusive)", breakH: "Meal break (hrs/day)", allowDay: "Maintenance (₱/duty day)",
    roster: "Half-month shift roster", off: "Off", wkend: "Weekend",
    type_regular: "Worked", type_half: "Half day (½)", type_rest: "Rest day worked (130%)", type_special: "Special holiday worked (+30%)", type_specialRest: "Special holiday + rest day (150%)", type_holiday: "Regular holiday worked (+1 day)", type_holidayRest: "Regular holiday + rest day (260%)", type_holidayOff: "Regular holiday off (1 day)", type_sil: "Paid leave (1 day)", type_absent: "Absent (deducted)", type_off: "Off",
    fill: "Fill", fillHelp: "\"Load app clock-ins\" fills each date with the in/out times the employee tapped in the app (the attendance record). Fill the rest with a shift or the Cash Book schedule; tap a date to make it a day off.",
    restDay: "Weekly rest day", dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    custom: "Time card (enter times)", inT: "In", outT: "Out", otDay: "OT", otAuto: "Empty = from the shift (10h base + 1h break, the rest is OT · 12h = 1h OT) · type the card figure to override",
    late: "Tardiness / undertime (minutes)", lateHelp: "daily ÷ 10 ÷ 60 · per minute ₱", lateHelpC: "actual unworked minutes only (daily ÷ 8 ÷ 60) · per minute ₱", incentive: "Manual incentive / allowance (+)", other: "Other deduction · penalty (−)",
    deductions: "Deductions · bonuses", payout: "Payout", payoutVia: "Paid via", payoutSplit: "Part by GCash / bank (amount)", payoutRest: "rest in cash", payoutHelp: "Shows on the payslip as 'Paid: GCash 5,000 + Cash 2,075'. The number comes from the employee's info (GCash / bank account).", payLine: "Paid", ledgerAuto: "Applied automatically this period (advances · shortage · bonuses)", none: "none",
    gov: "Statutory deductions (employee share)", govShare: "Half-month (½)", govFull: "Full month", govHelp: "Reference · SSS 5% · PhilHealth 2.5% · Pag-IBIG 2% (max ₱200)",
    result: "Computation", basic: "Basic pay (days × daily)", basicC: "Basic pay (hours × hourly)", basicM: "Basic pay (monthly ÷ 2)", premium: "Holiday extra (special +30% · regular +1 day)", premiumC: "Rest-day / holiday premium", ot: "Overtime (hours × daily÷{h})", otC: "Overtime 125%", nd: "Night differential (10%)", otIncl: "Overtime (within the built-in 1h/day · not paid separately)", otExtra: "Overtime (beyond the built-in 1h/day · 125%)", basicSplit: "　└ basic {b} + built-in OT {o}", penalty: "Late penalty (same as late amount)",
    silPay: "Paid leave", holOff: "Regular holiday paid (not worked)", allowance: "Motorcycle maintenance ({d} days × ₱{a})", absentDed: "Absence deduction ({d} days)",
    lateDed: "Tardiness / undertime", gross: "Gross pay", dedHead: "── Deductions ──", dedTotal: "Total deductions", otherManual: "manual entry (payroll screen)", govSSS: "SSS (employee share)", govPH: "PhilHealth (employee share)", govPI: "Pag-IBIG (employee share)", adv: "Cash advances (CA)", shortage: "Cash shortage", bonus: "Bonus (highest-sales day · new menu)", net: "Net pay",
    summary: "{d} days{hd} · OT {o}h · leave {s} days", summaryC: "{d} days · {h}h · OT {o}h · night {n}h · leave {s} days", halfSum: " + {n} half", netLbl: "Net pay",
    for13: "Basic for 13th-month pay", riderNote: "Delivery fee & fuel are paid same day in cash (cash book Staff tab) · not part of payroll", monthlyNote: "₱30,000 = basic 25,945 + built-in OT 4,055 (1h/day within 08–18) · daily 994.70 · hourly 124.34 · other OT (after 18:00), rest day 130%, holidays and night diff paid on top · absence & tardiness at the daily/hourly rate · 13th month on the basic 25,945",
    save: "Save", saved: "Saved", markPaid: "Record as paid", paid: "Paid", draft: "Draft", unpay: "Undo paid", paidOn: "Paid on", paidVia: "Paid via", slip: "Payslip", print: "Print", printSimple: "Print simple (58mm)", printA4: "Print detail (A4)", printBatch: "Print all (6 per A4)", delete: "Delete", confirmDel: "Delete this?", yes: "Delete", cancel: "Cancel", close: "Close",
    emp_add: "Add employee", emp_name: "Name", emp_pos: "Position", pos_waiter: "Waiter / Server", pos_kitchen: "Kitchen", pos_rider: "Rider", pos_other: "Other",
    emp_status: "Employment status", st_regular: "Regular", st_probationary: "Probationary", st_fixed: "Fixed-term", st_other: "Other", emp_hired: "Date hired", emp_bday: "Birthday", emp_active: "Active", emp_note: "Note",
    emp_payType: "Pay type", pt_daily: "Daily", pt_monthly: "Monthly (OT-inclusive)",
    led_add: "Add record", led_kind: "Kind", k_advance: "Advance", k_shortage: "Cash shortage", k_bonus: "Bonus (+)", k_other: "Other deduction", led_date: "Date", led_amount: "Amount", led_note: "Note",
    led_verified: "Investigated · responsibility established", led_auth: "Written authorization on file", led_applies: "→ applied to {p} payroll", led_deducted: "applied", led_pending: "pending", led_filter_all: "All",
    bonusHint: "Contract §6 highest-sales-day bonus = the period's top sales day × 2% ÷ staff who worked that day (button below computes it from the cash book + clock-ins) · kitchen new menu ₱500 (§5) · birthday incentive ₱500 (§3.4, 3 perfect months) · perfect month → 1 paid leave day (§3.2) as day type 'Paid leave'",
    topBonus: "Compute highest-sales-day bonus", topTitle: "Highest-sales-day bonus (contract §6)", topDay: "Highest-sales day", topSales: "Total sales", topPool: "Pool (2%)", topEach: "Each", topStaff: "On duty that day (from clock-ins) — untick to exclude", topSave: "Save as bonuses", topNone: "No cash book sales in this period", topDone: "Saved ₱{a} bonus for {n} staff (applied to the payroll of that period)", topExists: "A highest-sales-day bonus is already saved for this period",
    hist_empty: "No saved payrolls yet. Save one from the Payroll tab.", total: "Total",
    set_wage: "Default daily rate (minimum wage)", set_break: "Default meal break (hours)", set_gov: "Statutory deduction defaults", set_lang: "Language", set_rider: "Rider maintenance (₱/duty day)", set_kitchen: "Kitchen monthly default", set_mbasic: "Basic part of the monthly salary (rest = built-in OT)", set_mot: "Built-in OT in the monthly (hours/working day)", set_hpd: "Paper method · hours per day (OT hourly = daily ÷ this)", set_penalty: "Paper method · late penalty (extra deduction equal to the late amount)", emp_scheme: "Pay scheme", sch_contract: "₱718 contract (8h · OT 125% · night 10%)", sch_paper: "Paper method · old contract (daily × days · OT daily÷10)", scheme_contract: "contract", scheme_paper: "paper", penOn: "Deduct (paper method)", penOff: "Do not deduct",
    contract: "How pay is computed (chosen per employee in the Staff tab)", contractText: [
      "[₱718 contract (new contracts 2026-10-01, all staff except Erika)] ₱718/day · 8h/day, hourly = daily ÷ 8 · shift hours over 8 (rounded down to ½h) = overtime 125% · night (10pm–6am) +10% · rest day 130% · special holiday 130% · regular holiday 200% (100% if off) · late = actual unworked minutes only (no penalty)",
      "[Paper method · old contract (Erika ₱750, 5-month old contract)] the old daily rate · basic = days worked × daily (shift length doesn't matter, half day ½) · a day = a 10-hour shift · past 10h the first hour is the unpaid break, the rest is overtime (12h shift = 10h base + 1h break + 1h OT, ½h steps) or type the card figure · OT hour = daily ÷ 10 (790 → 79) · no 125%, no night diff · late = minutes × daily ÷ 10 ÷ 60 + a penalty of the same amount · special holiday +30% · regular holiday +1 day (also when off)",
      "Common — paydays 15th & 30th · paid leave 1 day = daily · rider motorcycle maintenance ₱100 per duty day in payroll (not in 13th month) · delivery fee paid same day (not payroll) · advance (CA) 1st–15th → 15th payroll, 16th on → 30th · net rounded up to the peso",
      "Kitchen monthly contract (Jonel) — ₱30,000 = basic 25,945 + built-in OT 4,055 (08–18, 1h/day) · daily = 25,945×12÷313 = 994.70, hourly 124.34 · fixed 15,000 per half · OT after 18:00 at 125%, rest day worked 130%, holiday and night extras on top · absence 994.70/day, tardiness 2.07/min · 13th month on the basic 25,945",
      "13th month on basic only (no OT, night diff, premiums, maintenance, incentives) · 1yr+ = one month average",
    ],
    noPerm: "No permission (owner only)", paidLocked: "A paid payroll can only be changed by the owner", loginFail: "Wrong ID or password",
    pickEmp: "Pick an employee first", deleted: "Deleted", weekendHelp: "Fri · Sat = weekend",
    fromSched: "Load Cash Book schedule", fromPunch: "Load app clock-ins", punchLoaded: "Filled {n} days from app clock-ins{x}", punchIncomplete: " · {n} days left empty (missing in or out)", punchNone: "No app clock-ins for this period", punchList: "App clock-ins (this period)", punchAdd: "Add record", punchIn: "In", punchOut: "Out", punchAt: "Time", punchAdmin: "entered by admin",
    clock: "Clock in / out", clockHelp: "Tap when you arrive and when you leave. These records are the basis of your paid hours.", clockedIn: "Clocked in · since {t}", clockedOut: "Clocked out · {t}", notIn: "Not clocked in yet", clockDone: "{k} recorded {t}", clockDup: "Already tapped a moment ago", clockRecent: "Recent", clockToday: "Today", schedLoaded: "Loaded {n} days from the Cash Book schedule", schedNone: "This employee isn’t on the Cash Book schedule for this period", fillAll: "Fill all", tapOff: "Tap a date to make it a day off (tap again to work)",
    cbTitle: "Cash Book shortages (to check)", cbHelp: "When counted cash at a mid-close or close is less than the book, it lands here. Nothing is deducted automatically — investigate, assign the responsible waiter, then tick both 'responsibility established' and 'written authorization' in Advances & shortages before it comes off pay.", cbNone: "No shortages to check", cbDone: "Handled", cbMid: "Mid-close", cbFinal: "Close", cbCounted: "Counted", cbBook: "Book", cbBy: "Counted by", cbReason: "Reason", cbDuty: "On duty", is_open: "To check", is_assigned: "Waiter assigned", is_dismissed: "Resolved (no deduction)",
    cbLaw: "Don’t split a shortage among everyone on duty. Give the waiter a chance to explain and assign it only to the one person found responsible. It is deducted only after you tick 'responsibility established' and 'written authorization on file'.", cbWho: "Responsible waiter", cbAssign: "Add as this waiter’s shortage (unverified)", cbAssigned: "Added — deducted after verification & authorization", cbDismissLbl: "Found it / book mistake (note)", cbFoundPh: "e.g. found in drawer next day / sale entered wrong", cbDismiss: "Resolved — no deduction", notDeducted: "not deducted (needs verification & consent)",
    asStaff: "Staff", asAdmin: "Admin", empNo: "Employee no.", pin: "PIN (numbers)", pinFirst: "First time? PIN is 0000", pinWrong: "Wrong number or PIN", pinLocked: "Locked for 10 minutes after 5 wrong tries",
    newPinTitle: "Set your PIN", newPinHelp: "First sign-in. Choose your own 4–6 digit PIN (not 0000).", newPin: "New PIN", newPin2: "New PIN again", pinMismatch: "The PINs don’t match", pinBad: "Use 4–6 digits (not 0000)", pinSaved: "PIN saved",
    myCalc: "My pay calculator (estimate)", myCalcHelp: "Pre-filled from the schedule (you can change it). Enter your shifts to see an estimate. Advances, bonuses and shortages are not included; the paid payslip is the official amount.", est: "Estimated net pay",
    sched_tap: "Tap to edit this day's clock records", sched_editHelp: "Fix or delete the in/out times, add a missing one below (an overnight clock-out goes on the next date)", sched_help: "Tap a cell to edit that day's clock records. Top line = actual app clock-in–out, grey line = plan (waiters: Cash Book schedule; kitchen & riders: roster entered by admin). Yellow = not clocked out / one side missing.", sched_legend: "actual / plan", sched_none: "—", mySched: "My schedule (Cash Book)", mySchedHelp: "Next 2 weeks · as planned in the Cash Book", sched_today: "today",
    myInfo: "My info", myInfoHelp: "You can update your contact, address, payout account and government numbers yourself. Name, position and pay are changed by the admin only.", infoSaved: "Your info is saved", empInfo: "Employee info (the employee can edit this)", i_phone: "Mobile", i_address: "Address", i_gcash: "GCash number", i_bank_name: "Bank", i_bank_acct: "Account number", i_sss: "SSS no.", i_philhealth: "PhilHealth no.", i_pagibig: "Pag-IBIG no.", i_tin: "TIN", i_emergency_name: "Emergency contact (name · relation)", i_emergency_phone: "Emergency contact number", myPay: "My payslips", myLedger: "My advances & shortages", myShifts: "My shifts", notPaidYet: "not paid yet", noData: "Nothing yet", empNoLbl: "No.", resetPin: "Reset PIN (0000)", pinReset: "PIN reset to 0000. They set a new one at next sign-in.", pinSet: "PIN set", pinNotSet: "PIN not set (0000)",
  },
};
let lang = "ko"; try { lang = localStorage.getItem("pp-lang") || "ko"; } catch {}
const t = k => I18N[lang][k] ?? I18N.ko[k] ?? k;
const tf = (k, vars) => Object.entries(vars).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, b), t(k));

/* ---------- helpers ---------- */
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v; else if (v != null && v !== false) el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const money = v => (+v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const periodLabel = (s, e) => `${s.slice(0, 7)} · ${+s.slice(8) === 1 ? t("first") : t("second")}`;
let toastT; function toast(msg) { const el = document.getElementById("toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2200); }
function sheet(content) {
  const root = document.getElementById("sheetRoot"); root.innerHTML = "";
  const bg = h("div", { class: "sheet-bg", onclick: e => { if (e.target === bg) close(); } }, h("div", { class: "sheet" }, content));
  const close = () => root.innerHTML = ""; root.append(bg); return close;
}
function confirmSheet(msg, onYes) {
  const close = sheet([h("h3", {}, msg), h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: () => close() }, t("cancel")), h("button", { class: "btn danger", onclick: () => { close(); onYes(); } }, t("yes")))]);
}
function field(label, input, help) { return h("div", { class: "f" }, h("label", {}, label), input, help && h("small", {}, help)); }
function sel(opts, value, attrs = {}) {
  const s = h("select", attrs); for (const [v, l] of opts) s.append(h("option", { value: v }, l)); s.value = value; return s;
}
const errMsg = e => e.message === "NO_PERMISSION" ? t("noPerm") : e.message === "PAID_LOCKED" ? t("paidLocked") : e.message;
const payTypeOf = emp => emp?.pay_type || "daily";

/* ---------- state ---------- */
const S = { user: null, settings: null, employees: [], tab: "pay", pay: null };
const root = document.getElementById("root");

async function boot() {
  const ok = await db.init();
  if (!ok) return renderLogin();
  S.user = await db.me();
  S.settings = await db.getSettings().catch(() => ({ min_wage: 718, break_hours: 1, sss_on: false, philhealth_on: false, pagibig_on: false, gov_share: 0.5, rider_allowance: 100, kitchen_monthly: 30000 }));
  S.employees = await db.listEmployees(true);
  render();
}

let loginMode = "staff"; try { loginMode = localStorage.getItem("pp-login") || "staff"; } catch {}
function renderLogin(err) {
  if (loginMode === "staff") return renderStaffLogin(err);
  const id = h("input", { type: "text", id: "lid", autocomplete: "username", placeholder: "admin" });
  const pw = h("input", { type: "password", id: "lpw", autocomplete: "current-password" });
  const form = h("form", { onsubmit: async e => { e.preventDefault(); try { await db.signIn(id.value, pw.value); boot(); } catch { renderLogin(t("loginFail")); } } },
    h("div", { class: "card" }, h("h1", {}, t("app")), modeSwitch(), field(t("id"), id), field(t("pw"), pw), err && h("div", { class: "err" }, err),
      h("button", { class: "btn primary", type: "submit" }, t("login")), langSwitch()));
  root.innerHTML = ""; root.append(h("div", { class: "login" }, form));
}
function modeSwitch() {
  const set = m => { loginMode = m; try { localStorage.setItem("pp-login", m); } catch {} renderLogin(); };
  return h("div", { class: "row seg" },
    h("button", { type: "button", class: "btn sm", id: "mode-staff", "aria-pressed": loginMode === "staff", onclick: () => set("staff") }, t("asStaff")),
    h("button", { type: "button", class: "btn sm", id: "mode-admin", "aria-pressed": loginMode === "admin", onclick: () => set("admin") }, t("asAdmin")));
}
/* ================= 직원 본인 보기 (번호 + PIN) ================= */
const EMP = { no: "", pin: "", data: null };
function renderStaffLogin(err, typedNo) {
  let last = typedNo || ""; if (!last) try { last = localStorage.getItem("pp-empno") || ""; } catch {}
  const no = h("input", { type: "text", id: "eno", inputmode: "numeric", autocomplete: "username", placeholder: "00001", value: last });
  const pin = h("input", { type: "password", id: "epin", inputmode: "numeric", autocomplete: "current-password", maxlength: 6, placeholder: "••••" });
  const form = h("form", { onsubmit: async e => { e.preventDefault(); await staffSignIn(no.value, pin.value); } },
    h("div", { class: "card" }, h("h1", {}, t("app")), modeSwitch(), field(t("empNo"), no), field(t("pin"), pin, t("pinFirst")), err && h("div", { class: "err", id: "elogin-err" }, err),
      h("button", { class: "btn primary", type: "submit", id: "elogin" }, t("login")), langSwitch()));
  root.innerHTML = ""; root.append(h("div", { class: "login" }, form));
}
async function staffSignIn(no, pin) {
  try {
    await db.init();
    const v = await db.empView(no, pin);
    if (!v.ok) return renderStaffLogin(v.err === "locked" ? t("pinLocked") : t("pinWrong"), no);
    EMP.no = String(no).trim(); EMP.pin = String(pin);
    try { localStorage.setItem("pp-empno", EMP.no); } catch {}
    if (v.must_change) return renderSetPin(v.name);
    EMP.data = v; renderStaffHome();
  } catch (e) { renderStaffLogin(String(e.message || e), no); }
}
function renderSetPin(name, err) {
  const a = h("input", { type: "password", id: "np1", inputmode: "numeric", maxlength: 6 }), b = h("input", { type: "password", id: "np2", inputmode: "numeric", maxlength: 6 });
  const form = h("form", { onsubmit: async e => { e.preventDefault();
      if (a.value !== b.value) return renderSetPin(name, t("pinMismatch"));
      if (!/^[0-9]{4,6}$/.test(a.value) || a.value === "0000") return renderSetPin(name, t("pinBad"));
      try { const r = await db.empSetPin(EMP.no, EMP.pin, a.value); if (!r.ok) return renderSetPin(name, r.err === "locked" ? t("pinLocked") : t("pinBad"));
        toast(t("pinSaved")); await staffSignIn(EMP.no, a.value); } catch (er) { renderSetPin(name, String(er.message || er)); } } },
    h("div", { class: "card" }, h("h1", {}, t("newPinTitle")), h("p", { class: "muted" }, name ? name + " · " : "", t("newPinHelp")),
      field(t("newPin"), a), field(t("newPin2"), b), err && h("div", { class: "err", id: "np-err" }, err),
      h("button", { class: "btn primary", type: "submit", id: "np-save" }, t("save"))));
  root.innerHTML = ""; root.append(h("div", { class: "login" }, form));
}
const INFO_KEYS = ["phone", "address", "gcash", "bank_name", "bank_acct", "sss", "philhealth", "pagibig", "tin", "emergency_name", "emergency_phone"];
const infoInputs = (info, idp) => Object.fromEntries(INFO_KEYS.map(k => [k, h("input", { type: k === "address" ? "text" : /phone|gcash|acct/.test(k) ? "tel" : "text", id: idp + k, value: (info || {})[k] || "", maxlength: 200 })]));
/* ---- staff: own info (contact, payout, gov numbers) — pay fields are admin-only ---- */
function myInfoCard(emp) {
  const inp = infoInputs(emp.info, "mi-");
  const bday = h("input", { type: "date", id: "mi-bday", value: emp.birthday || "" });
  const save = h("button", { class: "btn primary", type: "submit", id: "mi-save" }, t("save"));
  return h("details", { class: "card", id: "my-info" }, h("summary", {}, h("b", {}, t("myInfo"))),
    h("small", { class: "muted" }, t("myInfoHelp")),
    h("form", { onsubmit: async e => { e.preventDefault(); save.disabled = true;
        try { const info = Object.fromEntries(INFO_KEYS.map(k => [k, inp[k].value.trim()]));
          const r = await db.empUpdateInfo(EMP.no, EMP.pin, info, bday.value || null);
          if (!r.ok) throw new Error(r.err === "locked" ? t("pinLocked") : r.err);
          emp.info = { ...(emp.info || {}), ...info }; if (bday.value) emp.birthday = bday.value; toast(t("infoSaved"));
        } catch (er) { toast(errMsg(er)); } save.disabled = false; } },
      h("div", { class: "grid2" }, field(t("emp_name"), h("div", { style: "padding:9px 0" }, emp.name)), field(t("emp_bday"), bday), ...INFO_KEYS.map(k => field(t("i_" + k), inp[k]))),
      save));
}
function renderStaffHome() {
  const v = EMP.data, emp = v.employee;
  root.innerHTML = "";
  const paid = v.payrolls.filter(p => p.status === "paid" && p.result);
  const payList = h("div", { class: "list", id: "my-pay" }, paid.length ? paid.map(p => h("div", { class: "item", onclick: () => {
      const P = { start: p.period_start, end: p.period_end, daily_rate: p.daily_rate, status: p.status, paid_on: p.paid_on, paid_via: p.paid_via };
      payslip({ ...P, pay_type: p.pay_type || 'daily', monthly_rate: p.monthly_rate }, { name: emp.name, position: emp.position }, p.result); } },
    h("div", { class: "t" }, periodLabel(p.period_start, p.period_end)), h("div", { class: "s" }, `${t("paid")} ${p.paid_on || ""} · ${p.paid_via || ""}`), h("div", { class: "m money" }, "₱" + money(p.result.net))))
    : h("span", { class: "muted" }, t("noData")));
  const ledList = h("div", { class: "list", id: "my-ledger" }, v.ledger.length ? v.ledger.map(l => { const p = periodForDate(l.biz_date);
    return h("div", { class: "item" }, h("div", { class: "t" }, t("k_" + l.kind), " ", h("span", { class: "pill " + (l.deducted ? "paid" : "draft") }, l.deducted ? t("led_deducted") : t("led_pending"))),
      h("div", { class: "s" }, l.biz_date, " ", t("led_applies").replace("{p}", periodLabel(p.start, p.end)), l.note ? ` · ${l.note}` : ""), h("div", { class: "m money " + (l.kind === "bonus" ? "pos" : "neg") }, (l.kind === "bonus" ? "+" : "−") + money(l.amount))); })
    : h("span", { class: "muted" }, t("noData")));
  const shifts = h("div", { id: "my-shifts" }, v.payrolls.length ? v.payrolls.map(p => h("details", { class: "card", style: "margin:0 0 8px" },
      h("summary", {}, h("b", {}, periodLabel(p.period_start, p.period_end)), " ", h("span", { class: "pill " + p.status }, p.status === "paid" ? t("paid") : t("notPaidYet"))),
      h("div", { class: "tbl" }, h("table", {}, (p.days || []).filter(d => d.type !== "off" || d.shift).map(d => h("tr", {}, h("td", {}, d.date.slice(5) + " " + t("dow")[new Date(d.date + "T00:00:00").getDay()]),
        h("td", {}, d.shift ? SHIFT_LABEL(d.shift) : "—"), h("td", {}, t("type_" + d.type)))))))) : h("span", { class: "muted" }, t("noData")));
  root.append(
    h("div", { class: "top" }, h("span", { class: "brand" }, t("app")), h("span", { class: "sp" }),
      h("span", { style: "opacity:.85;font-size:13px" }, `${emp.name} · ${t("empNoLbl")} ${emp.emp_no}`),
      h("button", { onclick: () => { setLangOnly(lang === "ko" ? "en" : "ko"); renderStaffHome(); } }, lang === "ko" ? "EN" : "한"),
      h("button", { id: "e-logout", onclick: () => { EMP.pin = ""; EMP.data = null; renderStaffLogin(); } }, t("logout"))),
    h("main", { id: "main" },
      clockCard(),
      staffCalcCard(emp, v),
      h("div", { class: "card" }, h("h2", {}, t("myPay")), payList),
      h("div", { class: "card" }, h("h2", {}, t("myLedger")), ledList),
      h("div", { class: "card" }, h("h2", {}, t("myShifts")), shifts),
      mySchedCard(v, emp),
      my13Card(v, emp),
      myInfoCard(emp)));
}
const addD = (d, n) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const planLabel = v => v === "off" ? t("off") : v === "sil" ? "SIL" : SHIFT_LABEL(v);
/* ---- staff: Cash Book plan for the next two weeks + own clock-ins ---- */
function mySchedCard(v, emp) {
  const lo = addD(today(), -1), hi = addD(today(), 14);
  const plan = (v.schedule || []).filter(r => r.day >= lo && r.day <= hi).sort((a, b) => a.day < b.day ? -1 : 1);
  const by = pairPunches((v.punches || []).map(q => ({ kind: q.kind, at: q.at })));
  const todayS = today();
  const rows = plan.map(r => h("tr", { class: r.day === todayS ? "today" : "" }, h("td", {}, r.day.slice(5) + " " + t("dow")[new Date(r.day + "T00:00:00").getDay()] + (r.day === todayS ? " · " + t("sched_today") : "")),
    h("td", {}, planLabel(r.shift)), h("td", { class: "muted" }, by[r.day]?.shift ? by[r.day].shift.replace("-", "–") : by[r.day]?.in ? fmtT(by[r.day].in) + "–?" : "")));
  return h("div", { class: "card" }, h("h2", {}, t("mySched")), h("small", { class: "muted" }, t("mySchedHelp")),
    rows.length ? h("div", { class: "tbl" }, h("table", {}, h("tr", {}, h("th", {}, t("month")), h("th", {}, t("roster")), h("th", {}, t("clock"))), ...rows)) : h("span", { class: "muted" }, t("noData")));
}
/* ---- staff 13th-month: estimate from paid payrolls this year (same math as the admin tab) ---- */
function my13Card(v, emp) {
  const year = new Date().getFullYear();
  const mine = (v.payrolls || []).filter(p => p.status === "paid" && p.result && p.period_start.startsWith(year + "-"));
  const basicApp = mine.reduce((a, p) => a + (+p.result.basicFor13th || 0), 0);
  const before = +emp.basic_before_year === year ? +emp.basic_before_app || 0 : 0;
  const total = basicApp + before, by12 = Math.round(total / 12 * 100) / 100;
  const monthAvg = mine.length ? Math.round(basicApp / mine.length * 2 * 100) / 100 : 0;
  const hired = emp.hired_on ? new Date(emp.hired_on + "T00:00:00") : null;
  const oneYear = hired ? (new Date(year, 11, 24) - hired) >= 365 * 86400000 : null;   // 1yr+ by Dec 24 → one month average
  const est = oneYear === false ? by12 : oneYear ? monthAvg : Math.max(by12, monthAvg);
  const tbl = h("table", {},
    h("tr", {}, h("td", {}, tf("my13_basic", { n: mine.length })), h("td", { class: "r" }, money(basicApp))),
    before ? h("tr", {}, h("td", {}, t("c13_basicBefore")), h("td", { class: "r" }, money(before))) : null,
    h("tr", { class: "sum" }, h("td", {}, t("c13_total")), h("td", { class: "r" }, money(total))),
    h("tr", {}, h("td", {}, t("my13_by12")), h("td", { class: "r" }, money(by12))),
    h("tr", {}, h("td", {}, t("my13_avg")), h("td", { class: "r" }, money(monthAvg))),
    h("tr", { class: "net" }, h("td", {}, t("my13_est") + (oneYear === null ? "" : oneYear ? ` (${t("my13_1yr")})` : ` (${t("my13_under")})`)), h("td", { class: "r" }, money(est))));
  const paidList = (v.thirteenth || []).map(x => h("div", { class: "item" }, h("div", { class: "t" }, `${x.year} · ${t("tab_13")} · ${t("c13_paid")}`), h("div", { class: "s" }, `${t("c13_total")} ₱${money(x.basic_total)} · ${x.paid_on || ""} ${x.paid_via || ""}`), h("div", { class: "m money" }, "₱" + money(x.amount))));
  return h("div", { class: "card" }, h("h2", {}, t("my13")), h("small", { class: "muted" }, t("my13help")), h("div", { class: "tbl" }, tbl), paidList.length ? h("div", { class: "list" }, paidList) : null);
}
/* ---- staff clock in / out: the app record is the attendance basis ---- */
const fmtT = d => { d = new Date(d); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const fmtDT = d => { d = new Date(d); return `${d.getMonth() + 1}/${d.getDate()} ${t("dow")[d.getDay()]} ${fmtT(d)}`; };
function clockCard() {
  const punches = (EMP.data?.punches || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
  const last = punches[0];
  const inNow = last && last.kind === "in";
  const status = !last ? t("notIn") : inNow ? tf("clockedIn", { t: fmtDT(last.at) }) : tf("clockedOut", { t: fmtDT(last.at) });
  const press = async kind => {
    const btns = document.querySelectorAll("#clock button"); btns.forEach(b => b.disabled = true);
    try {
      const r = await db.punch(EMP.no, EMP.pin, kind);
      if (!r.ok) { toast(r.err === "locked" ? t("pinLocked") : t("pinWrong")); return; }
      if (r.dup) { toast(t("clockDup")); return; }
      toast(tf("clockDone", { k: t(kind === "in" ? "punchIn" : "punchOut"), t: fmtT(r.at) }));
      EMP.data = await db.empView(EMP.no, EMP.pin); renderStaffHome();
    } catch (e) { toast(errMsg(e)); btns.forEach(b => b.disabled = false); }
  };
  const recent = punches.slice(0, 10);
  return h("div", { class: "card", id: "clock" }, h("h2", {}, t("clock")), h("p", { class: "muted", style: "margin:0" }, t("clockHelp")),
    h("div", { class: "clockStatus" + (inNow ? " in" : "") }, status),
    h("div", { class: "clockBtns" },
      h("button", { class: "btn primary big", type: "button", id: "clock-in", disabled: !!inNow, onclick: () => press("in") }, "▶ " + t("punchIn")),
      h("button", { class: "btn big", type: "button", id: "clock-out", disabled: !last || !inNow, onclick: () => press("out") }, "■ " + t("punchOut"))),
    recent.length ? h("details", {}, h("summary", { class: "muted" }, t("clockRecent")), h("div", { class: "list" }, recent.map(p => h("div", { class: "item" },
      h("div", { class: "t" }, t(p.kind === "in" ? "punchIn" : "punchOut"), p.source === "admin" ? h("span", { class: "pill draft", style: "margin-left:6px" }, t("punchAdmin")) : null), h("div", { class: "s" }, fmtDT(p.at)))))) : null);
}
/* ---- staff self-calculator: shifts + statutory deductions only, nothing saved ---- */
const SC = { month: null, half: null, days: [], gov: { sss: false, philhealth: false, pagibig: false, share: 0.5 }, fillShift: "8-18" };
// 미리 계산: 비어 있는 날은 스케줄표(계획) 기준으로 채움
const planDay = (date, sh) => !sh ? { date, shift: "", type: "off" } : sh === "off" ? { date, shift: "", type: "off" } : sh === "sil" ? { date, shift: "", type: "sil" } : { date, shift: sh, type: "regular" };
function staffCalcCard(emp, v) {
  const planBy = Object.fromEntries((v?.schedule || []).map(r => [r.day, r.shift]));
  const monthly = (emp.pay_type || "daily") === "monthly";
  if (!SC.month) { const d = new Date(); SC.half = d.getDate() <= 15 ? 1 : 2; SC.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
  const setPeriod = () => { const [y, m] = SC.month.split("-").map(Number); const p = periodOf(y, m, SC.half); SC.start = p.start; SC.end = p.end;
    const by = Object.fromEntries(SC.days.map(d => [d.date, d])); SC.days = datesBetween(p.start, p.end).map(d => by[d] || planDay(d, planBy[d])); };
  setPeriod();
  const opts = () => ({ scheme: schemeOf(emp), payType: emp.pay_type || "daily", daily: +emp.daily_rate, monthly: +emp.monthly_rate || 0, breakHrs: 1, allowancePerDay: +emp.allowance_per_day || 0, gov: SC.gov, govShare: +SC.gov.share === 1 ? 1 : 0.5, hoursPerDay: +(EMP.data?.settings?.hours_per_day) || 10, latePenalty: EMP.data?.settings?.late_penalty !== false, monthlyBasic: +(EMP.data?.settings?.monthly_basic) || 25945, otIncluded: EMP.data?.settings?.monthly_ot_incl ?? 1 });
  let R = computePayroll(SC.days, opts());
  const monthIn = h("input", { type: "month", id: "scMonth", value: SC.month, onchange: e => { SC.month = e.target.value; setPeriod(); draw(); } });
  const halfSel = sel([[1, t("first")], [2, t("second")]], SC.half, { id: "scHalf", onchange: e => { SC.half = +e.target.value; setPeriod(); draw(); } });
  const fillSel = sel(SHIFTS.map(v => [v, SHIFT_LABEL(v)]), SC.fillShift, { onchange: e => SC.fillShift = e.target.value });
  const fillBtn = h("button", { class: "btn sm", type: "button", onclick: () => { for (const d of SC.days) { d.shift = SC.fillShift; d.type = "regular"; } draw(); } }, t("fillAll"));
  const rosterEl = h("div", { class: "roster" }), sumEl = h("p", { class: "muted" }), tbl = h("table"), netEl = h("div", { class: "net", style: "font:700 24px var(--mono);color:var(--good)" });
  const govBox = (k, label) => h("label", { class: "check" }, h("input", { type: "checkbox", id: "sc_" + k, checked: !!SC.gov[k], onchange: e => { SC.gov[k] = e.target.checked; draw(); } }), label);
  const shareSel = sel([[0.5, t("govShare")], [1, t("govFull")]], SC.gov.share, { onchange: e => { SC.gov.share = +e.target.value; draw(); } });
  function draw() {
    R = computePayroll(SC.days, opts());
    rosterEl.innerHTML = "";
    for (const d of SC.days) {
      const dow = new Date(d.date + "T00:00:00").getDay(); const wk = dow === 5 || dow === 6;
      const sh = DAY_TYPES[d.type]?.worked ? shiftHours(d.shift, 1) : null;
      const toggle = () => { if (d.type === "off") { d.shift = d.shift || SC.fillShift; d.type = "regular"; } else { d.shift = ""; d.type = "off"; } draw(); };
      rosterEl.append(h("div", { class: "day" + (d.type === "off" ? " off" : "") + (d.type === "sil" ? " sil" : "") + (/holiday|special|absent/.test(d.type) ? " hol" : "") + (wk ? " wknd" : "") },
        h("div", { class: "d", role: "button", style: "cursor:pointer", onclick: toggle }, t("dow")[dow], h("b", {}, +d.date.slice(8))),
        ...(() => { const c = shiftPicker(d, false, () => draw(), SC.fillShift); return [c[0],
        sel(dayTypesFor(schemeOf(emp), emp.pay_type).map(k => [k, t("type_" + k)]), d.type, { "aria-label": "day type", onchange: e => { d.type = e.target.value; if (!DAY_TYPES[d.type].worked) d.shift = ""; else if (!d.shift) d.shift = SC.fillShift; draw(); } }), c[1]]; })(),
        DAY_TYPES[d.type]?.worked && !monthly && schemeOf(emp) === "paper" && otInput(d, false, calc, +(EMP.data?.settings?.hours_per_day) || 10, +(EMP.data?.settings?.break_hours) || 1),
        sh && sh.worked > 0 && h("div", { class: "hrs" }, hrsLine(sh, schemeOf(emp) === "paper", monthly, +(EMP.data?.settings?.hours_per_day) || 10, +(EMP.data?.settings?.break_hours) || 1))));
    }
    calc();
  }
  function calc() {
    R = computePayroll(SC.days, opts());
    sumEl.textContent = summaryText(R);
    tbl.innerHTML = ""; tbl.append(...resultRows(R, { pay_type: emp.pay_type || "daily", allowance_per_day: +emp.allowance_per_day || 0 }));
    netEl.textContent = "₱" + money(R.net);
  }
  draw();
  const rate = monthly ? `₱${money(emp.monthly_rate)}/mo` : `₱${money(emp.daily_rate)}/day`;
  return h("div", { class: "card", id: "my-calc" }, h("h2", {}, t("myCalc")), h("small", { class: "muted" }, t("myCalcHelp")),
    h("div", { class: "grid2" }, field(t("month"), monthIn), field(t("period"), halfSel), field(monthly ? t("monthlyRate") : t("daily"), h("div", { class: "money", style: "padding:9px 0" }, rate))),
    h("div", { class: "row" }, fillSel, fillBtn, h("span", { class: "muted" }, t("weekendHelp"))), h("small", { class: "muted" }, t("tapOff")),
    rosterEl, sumEl,
    h("div", { class: "row" }, h("b", {}, t("gov")), shareSel), h("div", { class: "row" }, govBox("sss", "SSS"), govBox("philhealth", "PhilHealth"), govBox("pagibig", "Pag-IBIG")), h("small", { class: "muted" }, t("govHelp")),
    h("div", { class: "tbl" }, tbl),
    h("div", { class: "row" }, h("span", { class: "muted" }, t("est")), h("span", { class: "sp" }), netEl));
}
function setLangOnly(l) { lang = l; try { localStorage.setItem("pp-lang", l); } catch {} document.documentElement.lang = l; }
function langSwitch() {
  return h("div", { class: "row" },
    h("button", { type: "button", class: "btn sm", "aria-pressed": lang === "ko", onclick: () => setLang("ko") }, "한국어"),
    h("button", { type: "button", class: "btn sm", "aria-pressed": lang === "en", onclick: () => setLang("en") }, "English"));
}
function setLang(l) { lang = l; try { localStorage.setItem("pp-lang", l); } catch {} document.documentElement.lang = l; S.user ? render() : EMP.data ? renderStaffHome() : renderLogin(); }

function render() {
  root.innerHTML = "";
  const tabs = [["pay", t("tab_pay")], ["sched", t("tab_sched")], ["emp", t("tab_emp")], ["ledger", t("tab_ledger")], ["hist", t("tab_hist")], ["m13", t("tab_13")], ["set", t("tab_set")]];
  root.append(
    h("div", { class: "top" }, h("span", { class: "brand" }, t("app")), h("span", { class: "sp" }),
      h("span", { class: "muted", style: "color:inherit;opacity:.8;font-size:13px" }, S.user?.name || ""),
      h("button", { onclick: () => setLang(lang === "ko" ? "en" : "ko") }, lang === "ko" ? "EN" : "한"),
      h("button", { onclick: menu }, "⋯")),
    h("div", { class: "tabs", role: "tablist" }, tabs.map(([k, l]) => h("button", { role: "tab", "aria-selected": S.tab === k, onclick: () => { S.tab = k; render(); } }, l))),
    h("main", { id: "main" }));
  ({ pay: renderPay, sched: renderSched, emp: renderEmp, ledger: renderLedger, hist: renderHist, m13: render13, set: renderSet })[S.tab]();
}
function menu() {
  const close = sheet([
    h("h3", {}, S.user?.name || ""),
    h("button", { class: "btn", onclick: () => { close(); changePw(); } }, t("changePw")),
    h("button", { class: "btn", onclick: async () => { await db.signOut(); location.reload(); } }, t("logout")),
    h("button", { class: "btn ghost", onclick: () => close() }, t("close")),
  ]);
}
function changePw() {
  const pw = h("input", { type: "password", id: "npw", minlength: 6 });
  const close = sheet(h("form", { onsubmit: async e => { e.preventDefault(); try { await db.changePassword(pw.value); toast(t("saved")); close(); } catch (er) { toast(errMsg(er)); } } },
    h("h3", {}, t("changePw")), field(t("newPw"), pw), h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: () => close() }, t("cancel")), h("button", { class: "btn primary", type: "submit" }, t("save")))));
}

function resultRows(R, P) {
const monthly = P.pay_type === "monthly";
  const rows = []; const row = (l, v, cls = "") => rows.push(h("tr", { class: cls }, h("td", {}, l), h("td", { class: "r" }, v)));
  const paper = R.scheme === "paper";
  row(monthly ? t("basicM") : paper ? t("basic") : t("basicC"), money(R.basic));
  if (R.premium) row(paper ? t("premium") : t("premiumC"), money(R.premium));
  if (monthly && R.builtInOt) row(tf("basicSplit", { b: money(R.monthlyBasic / 2), o: money(R.builtInOt) }), "");
  if (monthly && R.otPay) row(`${t("otExtra")} (${R.otHours}h)`, money(R.otPay)); else if (monthly && R.otHours) row(`${t("otIncl")} · ${R.otHours}h`, "0.00"); else if (R.otPay) row(paper ? `${tf("ot", { h: R.hoursPerDay || 10 })} ${R.otHours}h × ₱${money(R.hourly)}` : `${t("otC")} (${R.otHours}h)`, money(R.otPay));
  if (R.ndPay) row(`${t("nd")} (${R.ndHours}h)`, money(R.ndPay));
  if (R.silPay) row(`${t("silPay")} (${R.silDays})`, money(R.silPay)); if (R.holidayOffPay) row(t("holOff"), money(R.holidayOffPay));
  if (R.allowance) row(tf("allowance", { d: R.daysWorked, a: money(P.allowance_per_day ?? (R.daysWorked ? R.allowance / R.daysWorked : 0)) }), money(R.allowance));
  // ledger items (advances / shortage / other / bonus) itemized by date when we have them (live payroll or saved with the result)
  const items = (R.ledgerItems || P.ledger || []).filter(l => l.kind !== "shortage" || (l.verified && l.authorized));
  const itemsOf = k => items.filter(l => l.kind === k);
  const itemRow = (l, sign, cls) => row(`　· ${l.biz_date ? l.biz_date.slice(5).replace("-", "/") : ""} ${l.note ? l.note : t("k_" + l.kind)}`, sign + money(l.amount), cls + " sub");
  const bonusItems = itemsOf("bonus");
  if (R.bonus) { row(t("bonus"), money(R.bonus)); bonusItems.forEach(l => itemRow(l, "+", "")); }
  if (R.incentive) row(t("incentive"), money(R.incentive));
  if (R.absentDed) row(tf("absentDed", { d: R.absentDays }), "−" + money(R.absentDed), "neg");
  if (R.late) row(`${t("lateDed")} (${R.lateMinutes}m)`, "−" + money(R.late), "neg");
  row(t("gross"), money(R.gross), "sum");
  const dedTotal = (+R.advances || 0) + (+R.shortage || 0) + (+R.sss || 0) + (+R.philhealth || 0) + (+R.pagibig || 0) + (+R.penalty || 0) + (+R.otherDeduction || 0);
  if (dedTotal) row(t("dedHead"), "", "head");
  const adv = itemsOf("advance");
  if (R.advances) { row(`${t("adv")} (${adv.length || 1})`, "−" + money(R.advances), "neg"); adv.forEach(l => itemRow(l, "−", "neg")); }
  const sh = itemsOf("shortage");
  if (R.shortage) { row(t("shortage"), "−" + money(R.shortage), "neg"); sh.forEach(l => itemRow(l, "−", "neg")); }
  if (R.sss) row(t("govSSS"), "−" + money(R.sss), "neg"); if (R.philhealth) row(t("govPH"), "−" + money(R.philhealth), "neg"); if (R.pagibig) row(t("govPI"), "−" + money(R.pagibig), "neg");
  if (R.penalty) row(t("penalty"), "−" + money(R.penalty), "neg");
  if (R.otherDeduction) { const oth = itemsOf("other"); const manual = Math.round(((+R.otherDeduction || 0) - oth.reduce((a, l) => a + +l.amount, 0)) * 100) / 100;
    row(t("other"), "−" + money(R.otherDeduction), "neg"); oth.forEach(l => itemRow(l, "−", "neg")); if (manual > 0.001) row(`　· ${t("otherManual")}`, "−" + money(manual), "neg sub"); }
  if (dedTotal) row(t("dedTotal"), "−" + money(dedTotal), "sum neg");
  row(`${t("net")} = ${money(R.gross)} − ${money(dedTotal)}`, money(R.net), "net");
  return rows;
}

const summaryText = R => R.scheme === "paper" ? tf("summary", { d: R.daysWorked, hd: R.halfDays ? tf("halfSum", { n: R.halfDays }) : "", o: R.otHours, s: R.silDays }) : tf("summaryC", { d: R.daysWorked, h: R.hoursWorked, o: R.otHours, n: R.ndHours || 0, s: R.silDays });
const schemeOf = emp => emp?.scheme === "paper" ? "paper" : "contract";
const hrsLine = (sh, paper, monthly, hpd = 10, brk = 1) => !sh || !(sh.worked > 0) ? "" : paper ? `${sh.span}h` + (paperOt(sh, hpd, brk) ? ` · OT ${paperOt(sh, hpd, brk)}h` : "") : `${sh.reg}h` + (sh.ot ? ` · OT ${sh.ot}h${monthly ? " (incl.)" : ""}` : "") + (sh.nd ? ` · ND ${sh.nd}h` : "");
/* per-day overtime hours as written on the time card */
function otInput(d, locked, onChange, hpd = 10, brk = 1) {
  const auto = paperOt(shiftHours(d.shift, 0), hpd, brk);
  return h("label", { class: "otin", title: t("otAuto") }, t("otDay"), h("input", { type: "number", step: 0.5, min: 0, max: 12, value: d.ot ?? "", placeholder: String(auto), disabled: locked, "aria-label": "OT hours", oninput: e => { d.ot = e.target.value === "" ? null : Math.max(0, +e.target.value || 0); onChange(); } }), "h");
}
/* shift picker: preset list + "time card" with in/out time inputs; value is "8-18" or "HH:MM-HH:MM" */
function shiftPicker(d, locked, onChange, fillShift) {
  const custom = d.shift && !isPreset(d.shift);
  const selEl = sel([["", t("off")], ...SHIFTS.map(v => [v, SHIFT_LABEL(v)]), ["custom", t("custom")]], custom ? "custom" : d.shift, { disabled: locked, "aria-label": "shift", onchange: e => {
    const v = e.target.value;
    if (v === "custom") { const p = parseShift(d.shift || fillShift) || { start: 480, end: 1080 }; d.shift = `${mm(p.start)}-${mm(p.end)}`; }
    else d.shift = v;
    if (!d.shift && DAY_TYPES[d.type].worked) d.type = "off"; if (d.shift && !DAY_TYPES[d.type].worked) d.type = "regular"; onChange(); } });
  if (!custom) return [selEl];
  const p = parseShift(d.shift);
  const tIn = h("input", { type: "time", value: mm(p.start), disabled: locked, "aria-label": t("inT"), oninput: e => { if (e.target.value) { d.shift = `${e.target.value}-${mm(parseShift(d.shift).end)}`; onChange(false); } } });
  const tOut = h("input", { type: "time", value: mm(p.end), disabled: locked, "aria-label": t("outT"), oninput: e => { if (e.target.value) { d.shift = `${mm(parseShift(d.shift).start)}-${e.target.value}`; onChange(false); } } });
  return [selEl, h("div", { class: "row", style: "grid-column:1/-1;gap:4px;flex-wrap:nowrap" }, tIn, h("span", { class: "muted" }, "→"), tOut)];
}
const mm = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/* ================= PAYROLL TAB ================= */
function defaultPay() {
  const d = new Date(); const half = d.getDate() <= 15 ? 1 : 2; const p = periodOf(d.getFullYear(), d.getMonth() + 1, half);
  return { employee_id: "", month: p.start.slice(0, 7), half, start: p.start, end: p.end, id: null, status: "draft", loaded: false,
    pay_type: "daily", daily_rate: +S.settings.min_wage || 718, monthly_rate: +S.settings.kitchen_monthly || 30000, allowance_per_day: 0,
    break_hours: +S.settings.break_hours || 1, days: [], late_minutes: 0, incentive: 0, other_deduction: 0,
    gov: { sss: !!S.settings.sss_on, philhealth: !!S.settings.philhealth_on, pagibig: !!S.settings.pagibig_on, share: +S.settings.gov_share || 0.5 },
    ledger: [], paid_on: null, paid_via: null, pay_via: "CASH", pay_split: 0, restDow: 1, fillShift: "8-18" };
}
function emptyDay(date) { return { date, shift: "", type: "off" }; }
async function loadPay(P) {
  const emp = S.employees.find(e => e.id === P.employee_id);
  P.pay_type = payTypeOf(emp);
  const [y, m] = P.month.split("-").map(Number); const p = periodOf(y, m, P.half); P.start = p.start; P.end = p.end;
  const dates = datesBetween(P.start, P.end);
  if (emp) {
    const row = await db.getPayroll(P.employee_id, P.start, P.end);
    if (row) {
      Object.assign(P, { id: row.id, status: row.status, daily_rate: +row.daily_rate, monthly_rate: +row.monthly_rate || +emp.monthly_rate, allowance_per_day: +row.allowance_per_day,
        break_hours: +row.break_hours, late_minutes: row.late_minutes, incentive: +row.incentive, other_deduction: +row.other_deduction, gov: row.gov, paid_on: row.paid_on, paid_via: row.paid_via, note: row.note || "", result: row.result || null, pay_via: row.result?.payout?.via || row.paid_via || "CASH", pay_split: +(row.result?.payout?.split || 0) });
      const byDate = Object.fromEntries((row.days || []).map(d => [d.date, d]));
      P.days = dates.map(d => byDate[d] || emptyDay(d));
    } else {
      Object.assign(P, { id: null, status: "draft", daily_rate: +emp.daily_rate, monthly_rate: +emp.monthly_rate || +S.settings.kitchen_monthly, allowance_per_day: +emp.allowance_per_day || 0,
        late_minutes: 0, incentive: 0, other_deduction: 0, paid_on: null, paid_via: null, note: "", result: null, pay_via: emp.info?.gcash ? "GCASH" : "CASH", pay_split: 0 });
      // 새 급여: 스케줄표(계획) 기준으로 미리 채움 — 실제 출퇴근은 "앱 출퇴근 불러오기"로 덮어쓰기
      let plan = {}; try { plan = Object.fromEntries((await db.cashbookShifts(P.start, P.end)).filter(r => String(r.staff_name || "").trim().toLowerCase() === String(emp.name).trim().toLowerCase() && r.shift).map(r => [r.day, r.shift])); } catch { }
      P.days = dates.map(d => planDay(d, plan[d]));
    }
    const led = await db.listLedger({ employeeId: P.employee_id });
    const inPeriod = l => periodForDate(l.biz_date).start === P.start;
    P.ledger = led.filter(l => (P.id && l.payroll_id === P.id) || (!l.payroll_id && inPeriod(l)));
    if (emp.position !== "waiter") P.ledger = P.ledger.filter(l => l.kind !== "shortage");
  } else { P.days = dates.map(d => emptyDay(d)); P.ledger = []; }
}
function payOpts(P) {
  const sum = k => P.ledger.filter(l => l.kind === k && (k !== "shortage" || (l.verified && l.authorized))).reduce((a, l) => a + +l.amount, 0);
  const o = { scheme: schemeOf(S.employees.find(e => e.id === P.employee_id)), payType: P.pay_type, daily: P.daily_rate, monthly: P.monthly_rate, breakHrs: P.break_hours, allowancePerDay: P.allowance_per_day,
    lateMinutes: P.late_minutes, incentive: P.incentive, bonus: sum("bonus"), advances: sum("advance"), shortage: sum("shortage"),
    otherDeduction: (+P.other_deduction || 0) + sum("other"), gov: P.gov, govShare: +P.gov.share === 1 ? 1 : 0.5, hoursPerDay: +S.settings.hours_per_day || 10, latePenalty: S.settings.late_penalty !== false, monthlyBasic: +S.settings.monthly_basic || 25945, otIncluded: S.settings.monthly_ot_incl ?? 1 };
  return o;
}
async function renderPay() {
  const main = document.getElementById("main");
  if (!S.pay) S.pay = defaultPay();
  if (!S.pay.loaded) { await loadPay(S.pay); S.pay.loaded = true; }
  const P = S.pay;
  const emp = S.employees.find(e => e.id === P.employee_id);
  const owner = S.user?.role === "owner";
  const locked = P.status === "paid";
  // a paid payroll shows the figures it was paid with (stored result), not a fresh recomputation
  const calc = () => locked && P.result && P.result.net != null ? { ...P.result } : computePayroll(P.days, payOpts(P));
  const R = calc();
  const monthly = P.pay_type === "monthly";
  const re = async () => { P.loaded = false; render(); };

  // --- header ---
  const empSel = sel([["", "—"], ...S.employees.filter(e => e.active || e.id === P.employee_id).map(e => [e.id, e.name])], P.employee_id, { id: "pEmp", onchange: async e => { P.employee_id = e.target.value; await re(); } });
  const monthIn = h("input", { type: "month", id: "pMonth", value: P.month, onchange: async e => { P.month = e.target.value; await re(); } });
  const halfSel = sel([[1, t("first")], [2, t("second")]], P.half, { id: "pHalf", onchange: async e => { P.half = +e.target.value; await re(); } });
  const numIn = (id, key, step, obj = P) => h("input", { type: "number", id, value: obj[key], step, min: 0, disabled: locked, oninput: e => { obj[key] = +e.target.value || 0; refresh(); } });
  const headFields = [field(t("employee"), empSel)];
  headFields.push(field(t("month"), monthIn), field(t("period"), halfSel));
  if (monthly) headFields.push(field(t("monthlyRate"), numIn("pMonthly", "monthly_rate", 100)));
  else headFields.push(field(t("daily"), numIn("pDaily", "daily_rate", 1)));
  headFields.push(field(t("breakH"), numIn("pBreak", "break_hours", 0.5)));
  if (emp?.position === "rider") headFields.push(field(t("allowDay"), numIn("pAllow", "allowance_per_day", 10)));
  const note = monthly ? t("monthlyNote") : emp?.position === "rider" ? t("riderNote") : null;
  const head = h("div", { class: "card" },
    h("div", { class: "row" }, h("h2", {}, t("tab_pay")), h("span", { class: "sp" }), P.id && h("span", { class: "pill " + P.status }, locked ? t("paid") : t("draft")),
      emp && h("span", { class: "pill " + (emp.position || "") }, t("pos_" + emp.position), " · ", t("pt_" + P.pay_type).split(" (")[0], " · ", t("scheme_" + schemeOf(emp)))),
    h("div", { class: "grid2" }, headFields), note && h("small", { class: "muted" }, note), P.note && h("div", { class: "muted", style: "padding:8px 10px;border-left:3px solid var(--gold);background:var(--bg);border-radius:6px" }, "📝 " + P.note));

  // --- roster ---
  const rosterEl = h("div", { class: "roster", id: "roster" });
  const sumEl = h("p", { class: "muted", id: "rosterSum" });
  const summary = () => summaryText(R);
  const paper = schemeOf(emp) === "paper";
  const hrsText = sh => hrsLine(sh, paper, monthly, +S.settings.hours_per_day || 10, P.break_hours);
  const refreshHrs = d => { const el = rosterEl.querySelector(`.hrs[data-d="${d.date}"]`); if (el) el.textContent = hrsText(DAY_TYPES[d.type]?.worked ? shiftHours(d.shift, P.break_hours) : null); };
  function drawRoster() {
    rosterEl.innerHTML = "";
    for (const d of P.days) {
      const dt = new Date(d.date + "T00:00:00"); const dow = dt.getDay(); const wk = dow === 5 || dow === 6;   // 주말 = 금·토
      const toggle = () => { if (locked) return; if (d.type === "off") { d.shift = d.shift || P.fillShift; d.type = "regular"; } else { d.shift = ""; d.type = "off"; d.ot = null; } drawRoster(); refresh(); };
      const lbl = h("div", { class: "d", role: "button", title: t("off"), style: locked ? "" : "cursor:pointer", onclick: toggle }, t("dow")[dow], h("b", {}, +d.date.slice(8)));
      const sh = DAY_TYPES[d.type]?.worked ? shiftHours(d.shift, P.break_hours) : null;
      const cls = "day" + (d.type === "off" ? " off" : "") + (d.type === "sil" ? " sil" : "") + (/holiday|special|absent/.test(d.type) ? " hol" : "") + (wk ? " wknd" : "");
      const shiftCtl = shiftPicker(d, locked, (redraw = true) => { if (redraw) drawRoster(); else { refreshHrs(d); const o = rosterEl.querySelector(`.otin[data-d="${d.date}"] input`); if (o) o.placeholder = String(paperOt(shiftHours(d.shift, 0), +S.settings.hours_per_day || 10, P.break_hours)); } refresh(); }, P.fillShift);
      const typeSel = sel(dayTypesFor(schemeOf(emp), P.pay_type).map(k => [k, t("type_" + k)]), d.type, { disabled: locked, "aria-label": "day type", onchange: e => { d.type = e.target.value; if (!DAY_TYPES[d.type].worked) d.shift = ""; else if (!d.shift) d.shift = P.fillShift; drawRoster(); refresh(); } });
      const hrsEl = h("div", { class: "hrs", "data-d": d.date }, hrsText(sh));
      const otEl = DAY_TYPES[d.type]?.worked && !monthly && paper ? otInput(d, locked, refresh, +S.settings.hours_per_day || 10, P.break_hours) : null; if (otEl) otEl.dataset.d = d.date;
      rosterEl.append(h("div", { class: cls }, lbl, shiftCtl[0], typeSel, shiftCtl[1], otEl, hrsEl));
    }
    sumEl.textContent = summary();
  }
  let fillRow;
  {
    const fillSel = sel(SHIFTS.map(v => [v, SHIFT_LABEL(v)]), P.fillShift, { onchange: e => P.fillShift = e.target.value });
    const fillBtn = h("button", { class: "btn sm", type: "button", id: "fillAll", disabled: locked, onclick: () => { for (const d of P.days) { d.shift = P.fillShift; d.type = "regular"; } drawRoster(); refresh(); } }, t("fillAll"));
    const schedBtn = h("button", { class: "btn sm", type: "button", id: "fromSched", disabled: locked || !emp, onclick: async () => {
      try {
        const rows = (await db.cashbookShifts(P.start, P.end)).filter(r => String(r.staff_name || "").trim().toLowerCase() === String(emp.name).trim().toLowerCase() && r.shift);
        if (!rows.length) return toast(t("schedNone"));
        const by = Object.fromEntries(rows.map(r => [r.day, r.shift]));
        let n = 0;
        for (const d of P.days) { const sh = by[d.date]; if (!sh) continue; n++;
          if (sh === "off") { d.shift = ""; d.type = "off"; } else if (sh === "sil") { d.shift = ""; d.type = "sil"; } else if (SHIFTS.includes(sh)) { d.shift = sh; if (!DAY_TYPES[d.type]?.worked) d.type = "regular"; } }
        drawRoster(); refresh(); toast(tf("schedLoaded", { n }));
      } catch (e) { toast(errMsg(e)); } } }, t("fromSched"));
    const punchBtn = h("button", { class: "btn sm primary", type: "button", id: "fromPunch", disabled: locked || !emp, onclick: async () => {
      try {
        const rows = await db.listPunches(P.employee_id, P.start, P.end);
        if (!rows.length) return toast(t("punchNone"));
        const by = pairPunches(rows.map(r => ({ kind: r.kind, at: r.punched_at })));
        let n = 0, inc = 0;
        for (const d of P.days) { const x = by[d.date]; if (!x) continue;
          if (x.shift) { d.shift = x.shift; if (!DAY_TYPES[d.type]?.worked) d.type = "regular"; n++; } else { inc++; } }
        drawRoster(); refresh(); toast(tf("punchLoaded", { n, x: inc ? tf("punchIncomplete", { n: inc }) : "" }));
      } catch (e) { toast(errMsg(e)); } } }, t("fromPunch"));
    fillRow = h("div", { class: "row" }, punchBtn, fillSel, fillBtn, schedBtn, h("span", { class: "muted" }, t("weekendHelp")));
  }
  const punchBox = h("div", { class: "list" });
  const punchDet = h("details", { ontoggle: async e => { if (e.target.open) await loadPunchList(); } }, h("summary", { class: "muted" }, t("punchList")), punchBox);
  async function loadPunchList() {
    if (!emp) return; punchBox.innerHTML = "";
    try {
      const rows = await db.listPunches(P.employee_id, P.start, P.end);
      for (const r of rows) punchBox.append(h("div", { class: "item" },
        h("div", { class: "t" }, t(r.kind === "in" ? "punchIn" : "punchOut"), r.source === "admin" ? h("span", { class: "pill draft", style: "margin-left:6px" }, t("punchAdmin")) : null),
        h("div", { class: "s" }, fmtDT(r.punched_at)),
        owner && h("button", { class: "btn sm danger m", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deletePunch(r.id); await loadPunchList(); }) }, "✕")));
      if (!rows.length) punchBox.append(h("span", { class: "muted" }, t("punchNone")));
      if (owner) {
        const kind = sel([["in", t("punchIn")], ["out", t("punchOut")]], "in", {}), at = h("input", { type: "datetime-local", value: P.start + "T08:00" });
        punchBox.append(h("div", { class: "row" }, kind, at, h("button", { class: "btn sm", type: "button", onclick: async () => { if (!at.value) return;
          try { await db.addPunch({ employee_id: P.employee_id, kind: kind.value, punched_at: new Date(at.value).toISOString() }); await loadPunchList(); } catch (e) { toast(errMsg(e)); } } }, "+ " + t("punchAdd"))));
      }
    } catch (e) { punchBox.append(h("span", { class: "err" }, errMsg(e))); }
  }
  const roster = h("div", { class: "card" }, h("h2", {}, t("roster")), fillRow, h("small", { class: "muted" }, t("fillHelp")), rosterEl, sumEl, punchDet);

  // --- adjustments & deductions ---
  const adjFields = [];
  adjFields.push(field(t("late"), numIn("pLate", "late_minutes", 1), t(paper ? "lateHelp" : "lateHelpC") + money(R.perMinute)));
  adjFields.push(field(t("incentive"), numIn("pInc", "incentive", 1)), field(t("other"), numIn("pOth", "other_deduction", 1)));
  const govBox = (k, label) => h("label", { class: "check" }, h("input", { type: "checkbox", id: "g_" + k, checked: !!P.gov[k], disabled: locked, onchange: e => { P.gov[k] = e.target.checked; refresh(); } }), label);
  const shareSel = sel([[0.5, t("govShare")], [1, t("govFull")]], P.gov.share, { disabled: locked, onchange: e => { P.gov.share = +e.target.value; refresh(); } });
  const ledList = h("div", { class: "list" });
  for (const l of P.ledger) ledList.append(h("div", { class: "item", onclick: () => ledgerForm(l, re) },
    h("div", { class: "t" }, t("k_" + l.kind), l.kind === "shortage" && !(l.verified && l.authorized) && h("span", { class: "pill draft", style: "margin-left:6px" }, t("notDeducted"))),
    h("div", { class: "s" }, l.biz_date, l.note ? ` · ${l.note}` : ""), h("div", { class: "m money " + (l.kind === "bonus" ? "pos" : "neg") }, (l.kind === "bonus" ? "+" : "−") + money(l.amount))));
  const payViaSel = sel(PAY_VIAS, P.pay_via || "CASH", { disabled: locked, onchange: e => { P.pay_via = e.target.value; refresh(); } });
  const ded = h("div", { class: "card" }, h("h2", {}, t("deductions")),
    h("div", { class: "grid2" }, adjFields),
    h("div", { class: "row" }, h("b", {}, t("ledgerAuto")), h("span", { class: "sp" }), emp && h("button", { class: "btn sm", type: "button", onclick: () => ledgerForm({ employee_id: emp.id, kind: "advance", biz_date: P.end, amount: "" }, re) }, "+ " + t("led_add"))),
    P.ledger.length ? ledList : h("span", { class: "muted" }, t("none")),
    h("div", { class: "row" }, h("b", {}, t("payout")), payViaSel, h("span", { class: "muted" }, t("payoutSplit")), numIn("pSplit", "pay_split", 100), h("span", { class: "muted", id: "payRest" })), h("small", { class: "muted" }, t("payoutHelp")),
    h("div", { class: "row" }, h("b", {}, t("gov")), shareSel), h("div", { class: "row" }, govBox("sss", "SSS"), govBox("philhealth", "PhilHealth"), govBox("pagibig", "Pag-IBIG")), h("small", { class: "muted" }, t("govHelp")));

  // --- result ---
  const tbl = h("table");
  function drawResult() { const pr = document.getElementById("payRest"); if (pr) pr.textContent = P.pay_split > 0 && P.pay_via !== "CASH" ? `→ ${payoutText(payoutOf(P, R, emp), emp)}` : ""; tbl.innerHTML = ""; tbl.append(...resultRows(R, P)); document.getElementById("barNet").textContent = money(R.net); for13.textContent = `${t("for13")}: ₱${money(R.basicFor13th)}`; }
  const for13 = h("small", { class: "muted" });
  const result = h("div", { class: "card" }, h("h2", {}, t("result")), h("div", { class: "tbl" }, tbl), for13);

  // --- actions ---
  const bar = h("div", { class: "bar" }, h("div", { class: "in" },
    h("div", {}, h("div", { class: "lbl" }, t("netLbl"), emp ? ` · ${emp.name}` : "", ` · ${periodLabel(P.start, P.end)}`), h("div", { class: "net" }, "₱", h("span", { id: "barNet" }, "0"))),
    h("span", { class: "sp" }),
    P.id && h("button", { class: "btn", type: "button", onclick: () => payslip(P, emp, R) }, t("slip")),
    owner && !locked && h("button", { class: "btn primary", type: "button", onclick: () => save(false) }, t("save")),
    owner && !locked && P.id && h("button", { class: "btn", type: "button", onclick: () => markPaid() }, t("markPaid")),
    owner && locked && h("button", { class: "btn", type: "button", onclick: () => unpay() }, t("unpay")),
    owner && P.id && h("button", { class: "btn danger sm", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.detachLedger(P.id); await db.deletePayroll(P.id); toast(t("deleted")); await re(); }) }, t("delete"))));

  main.append(head, roster, ded, result, bar);
  drawRoster(); drawResult();

  function refresh() { Object.assign(R, calc()); drawResult(); sumEl.textContent = summary(); }
  async function save(paid, extra = {}) {
    if (!P.employee_id) return toast(t("pickEmp"));
    const res = computePayroll(P.days, payOpts(P));
    res.payout = payoutOf(P, res, emp);
    res.ledgerItems = P.ledger.map(l => ({ kind: l.kind, biz_date: l.biz_date, amount: +l.amount, note: l.note || "", verified: l.verified, authorized: l.authorized }));
    try {
      const row = await db.savePayroll({ id: P.id || undefined, employee_id: P.employee_id, period_start: P.start, period_end: P.end, pay_type: P.pay_type, daily_rate: P.daily_rate, monthly_rate: P.monthly_rate, allowance_per_day: P.allowance_per_day,
        break_hours: P.break_hours, days: P.days, late_minutes: P.late_minutes, incentive: P.incentive, other_deduction: P.other_deduction, gov: P.gov, result: res, status: paid ? "paid" : P.status, ...extra });
      await db.attachLedger(P.ledger.map(l => l.id), row.id);
      P.id = row.id; toast(t("saved")); await re();
    } catch (e) { toast(errMsg(e)); }
  }
  function markPaid() {
    const dIn = h("input", { type: "date", id: "paidOn", value: today() });
    const vIn = sel([["CASH", "Cash"], ["GCASH", "GCash"], ["MAYA", "Maya"], ["METROBANK", "Metrobank"], ["SAVINGBOX", "Saving box"]], P.paid_via || P.pay_via || "CASH", { id: "paidVia" });
    const close = sheet([h("h3", {}, t("markPaid")), h("div", { class: "grid2" }, field(t("paidOn"), dIn), field(t("paidVia"), vIn)),
      h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: () => close() }, t("cancel")), h("button", { class: "btn primary", onclick: async () => { close(); await save(true, { paid_on: dIn.value, paid_via: vIn.value }); } }, t("markPaid")))]);
  }
  async function unpay() { try { await db.savePayroll({ id: P.id, status: "draft", paid_on: null, paid_via: null }); await re(); } catch (e) { toast(errMsg(e)); } }
}

function payslip(P, emp, R) {
  const days = h("div", { class: "tbl" }, h("table", {}, h("tr", {}, h("th", {}, "Date"), h("th", {}, "Shift"), h("th", {}, "Type"), h("th", { class: "r" }, "Hrs"), h("th", { class: "r" }, "OT"), R.ndHours ? h("th", { class: "r" }, "ND") : null, h("th", { class: "r" }, "₱")),
    R.rows.filter(r => r.type !== "off").map(r => h("tr", {}, h("td", {}, r.date.slice(5)), h("td", {}, r.shift ? SHIFT_LABEL(r.shift) : "—"), h("td", {}, t("type_" + r.type)), h("td", { class: "r" }, r.hours || ""), h("td", { class: "r" }, r.ot ? `+${r.ot}h` : ""), R.ndHours ? h("td", { class: "r" }, r.nd || "") : null, h("td", { class: "r" }, money(r.amount))))));
  const rate = P.pay_type === "monthly" ? `₱${money(P.monthly_rate)}/mo` : `₱${money(P.daily_rate)}/day`;
  const close = sheet(h("div", { class: "slip" },
    h("div", { class: "head" }, h("div", {}, h("b", {}, "PALTONG RESTAURANT"), h("div", { class: "muted" }, "603 Remedios St. Malate Manila")), h("div", {}, h("b", {}, t("slip")), h("div", { class: "muted" }, `${P.start} ~ ${P.end}`))),
    h("div", { class: "grid2" }, h("div", {}, h("b", {}, emp?.name), h("div", { class: "muted" }, t("pos_" + (emp?.position || "other")))), h("div", {}, rate, h("div", { class: "muted" }, summaryText(R)))),
    h("table", {}, resultRows(R, P)), h("br"), days,
    h("p", { class: "muted" }, `${t("payLine")}: ${payoutText(R.payout || payoutOf(P, R, emp), emp)}` + (P.status === "paid" ? ` · ${P.paid_on}` : "")), P.note && h("p", { class: "muted" }, P.note),
    h("div", { class: "sig" }, h("div", {}, "Employer / Paltong Restaurant"), h("div", {}, "Employee / " + (emp?.name || ""))),
    h("div", { class: "row noprint", style: "margin-top:14px" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: () => close() }, t("close")),
      h("button", { class: "btn", onclick: () => printSlip("detail") }, t("printA4")), h("button", { class: "btn primary", onclick: () => printSlip("simple") }, t("printSimple")))));
}
// simple = 58mm receipt printer (print station): summary only, no day table; detail = A4 with the day table
function printSlip(mode) {
  document.body.classList.toggle("print-simple", mode === "simple");
  const done = () => { document.body.classList.remove("print-simple"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}

/* ================= SCHEDULE: everyone × every day — actual clock-ins (app) over the Cash Book plan ================= */
const SCH = { month: null, half: null };
async function renderSched() {
  const main = document.getElementById("main");
  if (!SCH.month) { const d = new Date(); SCH.half = d.getDate() <= 15 ? 1 : 2; SCH.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
  const [y, m] = SCH.month.split("-").map(Number); const p = periodOf(y, m, SCH.half);
  const monthIn = h("input", { type: "month", value: SCH.month, onchange: e => { SCH.month = e.target.value; render(); } });
  const halfSel = sel([[1, t("first")], [2, t("second")]], SCH.half, { onchange: e => { SCH.half = +e.target.value; render(); } });
  const card = h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_sched")), h("span", { class: "sp" }), monthIn, halfSel), h("small", { class: "muted" }, t("sched_help")));
  main.append(card);
  try {
    const [punches, plan] = await Promise.all([db.listPunchesAll(p.start, p.end), db.cashbookShifts(p.start, p.end)]);
    const dates = datesBetween(p.start, p.end); const todayS = today();
    const byEmp = {}; for (const q of punches) (byEmp[q.employee_id] = byEmp[q.employee_id] || []).push({ id: q.id, kind: q.kind, at: q.punched_at, source: q.source });
    const owner = S.user?.role === "owner";
    const planBy = {}; for (const r of plan) planBy[String(r.staff_name).trim().toLowerCase() + "|" + r.day] = r.shift;
    const ORDER = ["waiter", "kitchen", "rider", "other"];
    const emps = S.employees.filter(e => e.active && e.name !== "test").sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position));
    const tbl = h("table", { class: "sched" },
      h("tr", {}, h("th", {}, t("employee")), ...dates.map(d => { const dt = new Date(d + "T00:00:00"); return h("th", { class: (d === todayS ? "today " : "") + ((dt.getDay() === 5 || dt.getDay() === 6) ? "wk" : "") }, `${+d.slice(8)}`, h("small", {}, t("dow")[dt.getDay()])); })),
      ...emps.flatMap((e, i) => { const by = pairPunches(byEmp[e.id] || []);
        const grp = i === 0 || emps[i - 1].position !== e.position
          ? [h("tr", { class: "grp" }, h("th", { colspan: dates.length + 1 }, `${t("pos_" + e.position)} · ${emps.filter(x => x.position === e.position).length}`))] : [];
        return [...grp, h("tr", {}, h("td", { class: "nm" }, e.name), ...dates.map(d => {
          const a = by[d]; const pl = planBy[e.name.trim().toLowerCase() + "|" + d];
          const act = a ? (a.shift ? a.shift.replace("-", "–") : (a.in ? fmtT(a.in) + "–?" : "?–" + fmtT(a.out))) : "";
          const raw = (byEmp[e.id] || []).filter(q => { const dt = new Date(q.at); const ds = fmtDate(dt); return ds === d || (ds === addDays(d, 1) && dt.getHours() < 12); });
          return h("td", { class: (a && a.incomplete ? "inc " : "") + (!a && (!pl || pl === "off" || pl === "sil") ? "off" : "") + (owner ? " edit" : ""), title: owner ? t("sched_tap") : "", onclick: owner ? () => punchDaySheet(e, d, raw) : null }, h("div", { class: "act" }, act || (pl && pl !== "off" && pl !== "sil" ? "" : t("sched_none"))), pl ? h("div", { class: "pl" }, planLabel(pl)) : null);
        }))]; }));
    card.append(h("div", { class: "tbl" }, tbl));
  } catch (e) { card.append(h("p", { class: "err" }, errMsg(e))); }
}

/* ---- schedule cell → edit that day's clock records (owner) ---- */
function punchDaySheet(emp, date, raw) {
  const rows = raw.slice().sort((a, b) => new Date(a.at) - new Date(b.at));
  const toLocal = at => { const d = new Date(at); return `${fmtDate(d)}T${fmtT(d)}`; };
  const list = h("div", { class: "list" });
  const line = q => { const kind = sel([["in", t("punchIn")], ["out", t("punchOut")]], q.kind, {}); const at = h("input", { type: "datetime-local", value: toLocal(q.at) });
    return h("div", { class: "row", style: "flex-wrap:nowrap;gap:6px" }, kind, at, q.source === "card" || q.source === "admin" ? h("span", { class: "pill draft" }, q.source === "card" ? "card" : t("punchAdmin")) : null,
      h("button", { class: "btn sm", type: "button", onclick: async () => { try { await db.updatePunch(q.id, { kind: kind.value, punched_at: new Date(at.value).toISOString() }); toast(t("saved")); close(); render(); } catch (e) { toast(errMsg(e)); } } }, t("save")),
      h("button", { class: "btn sm danger", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { try { await db.deletePunch(q.id); close(); render(); } catch (e) { toast(errMsg(e)); } }) }, "✕")); };
  rows.forEach(q => list.append(line(q)));
  if (!rows.length) list.append(h("span", { class: "muted" }, t("punchNone")));
  const addKind = sel([["in", t("punchIn")], ["out", t("punchOut")]], rows.length && rows[rows.length - 1].kind === "in" ? "out" : "in", {});
  const addAt = h("input", { type: "datetime-local", value: rows.length && rows[rows.length - 1].kind === "in" ? `${addDays(date, 1)}T08:00` : `${date}T08:00` });
  const close = sheet([h("h3", {}, `${emp.name} · ${date}`), h("p", { class: "muted" }, t("sched_editHelp")), list,
    h("div", { class: "row", style: "flex-wrap:nowrap;gap:6px" }, addKind, addAt, h("button", { class: "btn sm primary", type: "button", onclick: async () => { if (!addAt.value) return;
      try { await db.addPunch({ employee_id: emp.id, kind: addKind.value, punched_at: new Date(addAt.value).toISOString() }); toast(t("saved")); close(); render(); } catch (e) { toast(errMsg(e)); } } }, "+ " + t("punchAdd"))),
    h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: () => close() }, t("close")))]);
}

/* ================= EMPLOYEES ================= */
function renderEmp() {
  const main = document.getElementById("main"); const owner = S.user?.role === "owner";
  const list = h("div", { class: "list" });
  const rateOf = e => e.pay_type === "monthly" ? `₱${money(e.monthly_rate)}/mo` : `₱${money(e.daily_rate)}/day`;
  for (const e of S.employees) list.append(h("div", { class: "item", onclick: () => owner && empForm(e) },
    h("div", { class: "t" }, e.name, " ", h("span", { class: "pill " + (e.position || "") }, t("pos_" + e.position)), !e.active && h("span", { class: "pill", style: "margin-left:6px" }, "✕")),
    h("div", { class: "s" }, `${e.emp_no ? t("empNoLbl") + " " + e.emp_no + " · " : ""}${t("st_" + e.status)} · ${t("pt_" + (e.pay_type || "daily")).split(" (")[0]}${e.position === "rider" && +e.allowance_per_day ? ` · +₱${e.allowance_per_day}/day` : ""} · ${t("scheme_" + schemeOf(e))}${e.hired_on ? " · " + e.hired_on : ""} · ${e.pin_hash ? t("pinSet") : t("pinNotSet")}`), h("div", { class: "m money" }, rateOf(e))));
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_emp")), h("span", { class: "sp" }), owner && h("button", { class: "btn primary sm", onclick: () => empForm({ name: "", position: "waiter", daily_rate: S.settings.min_wage, monthly_rate: S.settings.kitchen_monthly, allowance_per_day: 0, pay_type: "daily", status: "probationary", active: true }) }, "+ " + t("emp_add"))), list));
}
function empForm(e) {
  const E = { ...e }; delete E.created_at; delete E.pin_hash; delete E.pin_fails; delete E.pin_locked_until;
  const name = h("input", { type: "text", id: "eName", value: E.name, required: true });
  const eno = h("input", { type: "text", id: "eNo", inputmode: "numeric", value: E.emp_no || "", placeholder: "00013" });
  const pt = sel([["daily", t("pt_daily")], ["monthly", t("pt_monthly")]], E.pay_type || "daily", { id: "ePt", onchange: sync });
  const sch = sel([["contract", t("sch_contract")], ["paper", t("sch_paper")]], schemeOf(E), { id: "eScheme" });
  const pos = sel([["waiter", t("pos_waiter")], ["kitchen", t("pos_kitchen")], ["rider", t("pos_rider")], ["other", t("pos_other")]], E.position, { id: "ePos", onchange: () => {
    if (pos.value === "rider" && !+allow.value) allow.value = S.settings.rider_allowance ?? 100; sync(); } });
  const rate = h("input", { type: "number", id: "eRate", value: E.daily_rate, step: 1, min: 0 });
  const mrate = h("input", { type: "number", id: "eMRate", value: E.monthly_rate || S.settings.kitchen_monthly, step: 100, min: 0 });
  const allow = h("input", { type: "number", id: "eAllow", value: E.allowance_per_day || 0, step: 10, min: 0 });
  const st = sel([["regular", t("st_regular")], ["probationary", t("st_probationary")], ["fixed", t("st_fixed")], ["other", t("st_other")]], E.status, { id: "eSt" });
  const hired = h("input", { type: "date", id: "eHired", value: E.hired_on || "" }); const bday = h("input", { type: "date", id: "eBday", value: E.birthday || "" });
  const active = h("input", { type: "checkbox", id: "eActive", checked: E.active }); const note = h("input", { type: "text", id: "eNote", value: E.note || "" });
  const before = h("input", { type: "number", id: "eBefore", value: E.basic_before_app || 0, step: 1, min: 0 });
  const infoIn = infoInputs(E.info, "ei-");
  const fDaily = field(t("daily"), rate), fMonthly = field(t("monthlyRate"), mrate), fAllow = field(t("allowDay"), allow);
  function sync() { fDaily.hidden = pt.value !== "daily"; fMonthly.hidden = pt.value !== "monthly"; fAllow.hidden = pos.value !== "rider"; }
  sync();
  const close = sheet(h("form", { onsubmit: async ev => { ev.preventDefault(); try {
      await db.saveEmployee({ ...E, info: { ...(E.info || {}), ...Object.fromEntries(INFO_KEYS.map(k => [k, infoIn[k].value.trim()])) }, emp_no: eno.value.trim() || null, name: name.value.trim(), position: pos.value, pay_type: pt.value, scheme: sch.value, daily_rate: +rate.value, monthly_rate: +mrate.value, allowance_per_day: pos.value === "rider" ? +allow.value : 0, status: st.value, hired_on: hired.value || null, birthday: bday.value || null, active: active.checked, note: note.value || null, basic_before_app: +before.value || 0, basic_before_year: new Date().getFullYear() });
      S.employees = await db.listEmployees(true); if (S.pay) S.pay.loaded = false; toast(t("saved")); close(); render(); } catch (er) { toast(errMsg(er)); } } },
    h("h3", {}, E.id ? E.name : t("emp_add")),
    h("div", { class: "grid2" }, field(t("empNo"), eno), field(t("emp_name"), name), field(t("emp_pos"), pos), field(t("emp_payType"), pt), field(t("emp_scheme"), sch), fDaily, fMonthly, fAllow, field(t("emp_status"), st), field(t("emp_hired"), hired), field(t("emp_bday"), bday), field(t("emp_note"), note), field(t("emp_before"), before, t("emp_beforeHelp"))),
    h("details", { id: "e-info" }, h("summary", {}, t("empInfo")), h("div", { class: "grid2" }, ...INFO_KEYS.map(k => field(t("i_" + k), infoIn[k])))),
    h("label", { class: "check" }, active, t("emp_active")),
    E.id && h("div", { class: "row" }, h("span", { class: "muted" }, e.pin_hash ? t("pinSet") : t("pinNotSet")), h("span", { class: "sp" }),
      h("button", { class: "btn sm", type: "button", id: "e-reset-pin", onclick: async () => { try { await db.resetEmpPin(E.id); S.employees = await db.listEmployees(true); toast(t("pinReset")); close(); render(); } catch (er) { toast(errMsg(er)); } } }, t("resetPin"))),
    h("div", { class: "row" }, E.id && h("button", { class: "btn danger sm", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deleteEmployee(E.id); S.employees = await db.listEmployees(true); close(); render(); }) }, t("delete")),
      h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: () => close() }, t("cancel")), h("button", { class: "btn primary", type: "submit" }, t("save")))));
}

/* ---- contract §6: semi-monthly highest-sales-day bonus = top day's sales × 2% ÷ staff who worked that day ---- */
async function topBonusSheet() {
  const d = new Date(); const p0 = periodOf(d.getFullYear(), d.getMonth() + 1, d.getDate() <= 15 ? 1 : 2);
  const mIn = h("input", { type: "month", value: p0.start.slice(0, 7) }); const hSel = sel([[1, t("first")], [2, t("second")]], p0.half, {});
  const body = h("div", {}); let cur = null;
  async function calc() {
    body.innerHTML = ""; cur = null;
    const [y, m] = mIn.value.split("-").map(Number); const p = periodOf(y, m, +hSel.value);
    try {
      const sales = await db.cashbookSalesByDay(p.start, p.end);
      const days = Object.entries(sales).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      if (!days.length) { body.append(h("p", { class: "muted" }, t("topNone"))); return; }
      const [top, total] = days[0]; const pool = Math.round(total * 0.02 * 100) / 100;
      const punches = await db.listPunchesAll(p.start, p.end);
      const worked = new Set(); for (const q of punches) { if (q.kind === "in" && fmtDate(new Date(q.punched_at)) === top) worked.add(q.employee_id); }
      const elig = S.employees.filter(e => e.active && ["kitchen", "waiter", "rider"].includes(e.position) && e.pay_type !== "monthly");
      const existing = await db.listLedger({ kind: "bonus" });
      const dup = existing.some(l => l.biz_date === top && /최고매출|highest/i.test(l.note || ""));
      const boxes = elig.map(e => ({ e, cb: h("input", { type: "checkbox", checked: worked.has(e.id) }) }));
      const eachEl = h("b", {});
      const upd = () => { const n = boxes.filter(b => b.cb.checked).length; eachEl.textContent = n ? "₱" + money(Math.round(pool / n * 100) / 100) : "—"; };
      boxes.forEach(b => b.cb.onchange = upd); upd();
      cur = { p, top, total, pool, boxes };
      body.append(h("div", { class: "grid2" }, h("div", {}, h("div", { class: "muted" }, t("topDay")), h("b", {}, top)), h("div", {}, h("div", { class: "muted" }, t("topSales")), h("b", {}, "₱" + money(total))),
          h("div", {}, h("div", { class: "muted" }, t("topPool")), h("b", {}, "₱" + money(pool))), h("div", {}, h("div", { class: "muted" }, t("topEach")), eachEl)),
        h("p", { class: "muted" }, t("topStaff")), h("div", { class: "row", style: "flex-wrap:wrap" }, boxes.map(b => h("label", { class: "check" }, b.cb, b.e.name))),
        dup && h("p", { class: "err" }, t("topExists")));
    } catch (e) { body.append(h("p", { class: "err" }, errMsg(e))); }
  }
  mIn.onchange = calc; hSel.onchange = calc;
  const close = sheet([h("h3", {}, t("topTitle")), h("div", { class: "row" }, mIn, hSel), body,
    h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: () => close() }, t("cancel")),
      h("button", { class: "btn primary", type: "button", onclick: async () => {
        if (!cur) return; const on = cur.boxes.filter(b => b.cb.checked); if (!on.length) return;
        const each = Math.round(cur.pool / on.length * 100) / 100;
        try {
          for (const b of on) await db.saveLedger({ employee_id: b.e.id, kind: "bonus", biz_date: cur.top, amount: each, note: `최고매출일 보너스 ${cur.top} 매출 ₱${money(cur.total)} × 2% ÷ ${on.length}명 (계약서 6조)`, verified: true, authorized: true });
          toast(tf("topDone", { n: on.length, a: money(each) })); close(); render();
        } catch (e) { toast(errMsg(e)); } } }, t("topSave")))]);
  await calc();
}
/* ================= LEDGER ================= */
const LF = { employeeId: "", kind: "" };
const KINDS = ["advance", "shortage", "bonus", "other"];
async function renderLedger() {
  const main = document.getElementById("main"); const owner = S.user?.role === "owner";
  const rows = await db.listLedger({ employeeId: LF.employeeId || undefined, kind: LF.kind || undefined });
  const empSel = sel([["", t("led_filter_all")], ...S.employees.map(e => [e.id, e.name])], LF.employeeId, { onchange: e => { LF.employeeId = e.target.value; render(); } });
  const kindSel = sel([["", t("led_filter_all")], ...KINDS.map(k => [k, t("k_" + k)])], LF.kind, { onchange: e => { LF.kind = e.target.value; render(); } });
  const list = h("div", { class: "list" });
  for (const l of rows) {
    const p = periodForDate(l.biz_date);
    list.append(h("div", { class: "item", onclick: () => owner && ledgerForm(l, () => render()) },
      h("div", { class: "t" }, l.employees?.name, " · ", t("k_" + l.kind), " ", h("span", { class: "pill " + (l.payroll_id ? "paid" : "draft") }, l.payroll_id ? t("led_deducted") : t("led_pending"))),
      h("div", { class: "s" }, l.biz_date, " ", tf("led_applies", { p: periodLabel(p.start, p.end) }), l.note ? ` · ${l.note}` : "", l.kind === "shortage" && !(l.verified && l.authorized) ? " · ⚠ " + t("notDeducted") : ""),
      h("div", { class: "m money " + (l.kind === "bonus" ? "pos" : "neg") }, (l.kind === "bonus" ? "+" : "−") + money(l.amount))));
  }
  if (owner) main.append(await cashIssuesCard());
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_ledger")), h("span", { class: "sp" }), owner && h("button", { class: "btn primary sm", onclick: () => ledgerForm({ employee_id: S.employees[0]?.id || "", kind: "advance", biz_date: today(), amount: "" }, () => render()) }, "+ " + t("led_add"))),
    h("div", { class: "row" }, empSel, kindSel), h("small", { class: "muted" }, t("bonusHint")),
    owner && h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", id: "topBonus", onclick: topBonusSheet }, "🏆 " + t("topBonus"))),
    rows.length ? list : h("span", { class: "muted" }, t("none"))));
}
// 캐시북 중간마감·마감 현금 부족 → 조사 후 책임 웨이터 지정 (자동 공제 아님)
async function cashIssuesCard() {
  let rows = []; try { rows = await db.listCashIssues(); } catch { return h("span"); }
  const open = rows.filter(r => r.status === "open"), done = rows.filter(r => r.status !== "open").slice(0, 10);
  const waiters = S.employees.filter(e => e.active && e.position === "waiter");
  const stg = r => r.stage === "mid" ? t("cbMid") : t("cbFinal");
  const item = r => h("div", { class: "item", "data-issue": r.id, onclick: () => r.status === "open" && issueForm(r, waiters) },
    h("div", { class: "t" }, `${r.biz_date} · ${stg(r)}`, " ", h("span", { class: "pill " + (r.status === "open" ? "draft" : r.status === "assigned" ? "waiter" : "paid") }, t("is_" + r.status))),
    h("div", { class: "s" }, `${t("cbCounted")} ₱${money(r.counted)} / ${t("cbBook")} ₱${money(r.expected)}` + (r.counted_by ? ` · ${t("cbBy")} ${r.counted_by}` : "") + (r.reason ? ` · ${t("cbReason")}: ${r.reason}` : "") + (r.on_duty?.length ? ` · ${t("cbDuty")}: ${r.on_duty.join(", ")}` : "") + (r.resolved_note ? ` · ${r.resolved_note}` : "")),
    h("div", { class: "m money neg" }, "−" + money(r.amount)));
  return h("div", { class: "card", id: "cash-issues" },
    h("div", { class: "row" }, h("h2", {}, t("cbTitle")), h("span", { class: "sp" }), open.length ? h("span", { class: "pill draft" }, open.length) : null),
    h("small", { class: "muted" }, t("cbHelp")),
    open.length ? h("div", { class: "list" }, open.map(item)) : h("span", { class: "muted" }, t("cbNone")),
    done.length ? h("details", {}, h("summary", { class: "muted" }, t("cbDone")), h("div", { class: "list" }, done.map(item))) : null);
}
function issueForm(r, waiters) {
  const emp = sel([["", "—"], ...waiters.map(e => [e.id, e.name])], waiters.find(e => e.name.toLowerCase() === String(r.counted_by || "").toLowerCase())?.id || "", { id: "iEmp" });
  const note = h("input", { type: "text", id: "iNote", placeholder: t("cbFoundPh") });
  const close = sheet([h("h3", {}, `${r.biz_date} · ${r.stage === "mid" ? t("cbMid") : t("cbFinal")} · −₱${money(r.amount)}`),
    h("p", { class: "muted" }, t("cbLaw")),
    field(t("cbWho"), emp, r.on_duty?.length ? `${t("cbDuty")}: ${r.on_duty.join(", ")}` : null),
    h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn primary", id: "iAssign", onclick: async () => {
      if (!emp.value) return toast(t("pickEmp"));
      try { await db.assignCashIssue(r.id, emp.value); toast(t("cbAssigned")); close(); render(); } catch (e) { toast(errMsg(e)); } } }, t("cbAssign"))),
    h("hr"),
    field(t("cbDismissLbl"), note),
    h("div", { class: "row" }, h("button", { class: "btn", onclick: () => close() }, t("cancel")), h("span", { class: "sp" }),
      h("button", { class: "btn", id: "iDismiss", onclick: async () => { try { await db.dismissCashIssue(r.id, note.value.trim()); toast(t("saved")); close(); render(); } catch (e) { toast(errMsg(e)); } } }, t("cbDismiss")))]);
}
function ledgerForm(l, after) {
  const L = { ...l }; delete L.employees; delete L.created_at; delete L.created_by;
  const empSel = sel(S.employees.map(e => [e.id, e.name]), L.employee_id, { id: "lEmp" });
  const kind = sel(KINDS.map(k => [k, t("k_" + k)]), L.kind, { id: "lKind", onchange: e => { shortBox.hidden = e.target.value !== "shortage"; } });
  const date = h("input", { type: "date", id: "lDate", value: L.biz_date, required: true }); const amt = h("input", { type: "number", id: "lAmt", value: L.amount, step: 1, min: 1, required: true });
  const note = h("input", { type: "text", id: "lNote", value: L.note || "" });
  const ver = h("input", { type: "checkbox", id: "lVer", checked: L.verified !== false }); const auth = h("input", { type: "checkbox", id: "lAuth", checked: !!L.authorized });
  const shortBox = h("div", { style: "display:grid;gap:6px", hidden: L.kind !== "shortage" }, h("label", { class: "check" }, ver, t("led_verified")), h("label", { class: "check" }, auth, t("led_auth")));
  const hint = h("small", { class: "muted" }); const upd = () => { const p = periodForDate(date.value || today()); hint.textContent = tf("led_applies", { p: periodLabel(p.start, p.end) }); };
  date.addEventListener("input", upd); upd();
  const close = sheet(h("form", { onsubmit: async ev => { ev.preventDefault(); try {
      await db.saveLedger({ ...L, employee_id: empSel.value, kind: kind.value, biz_date: date.value, amount: +amt.value, note: note.value || null, verified: kind.value === "shortage" ? ver.checked : true, authorized: auth.checked });
      toast(t("saved")); close(); after(); } catch (er) { toast(errMsg(er)); } } },
    h("h3", {}, t("led_add")),
    h("div", { class: "grid2" }, field(t("employee"), empSel), field(t("led_kind"), kind), field(t("led_date"), date, hint), field(t("led_amount"), amt), field(t("led_note"), note)), shortBox,
    h("div", { class: "row" }, L.id && h("button", { class: "btn danger sm", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deleteLedger(L.id); close(); after(); }) }, t("delete")),
      h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: () => close() }, t("cancel")), h("button", { class: "btn primary", type: "submit" }, t("save")))));
}

/* ================= HISTORY ================= */
const HF = { month: "" };
async function renderHist() {
  const main = document.getElementById("main");
  const rows = await db.listPayrolls(HF.month ? { from: HF.month + "-01", to: HF.month + "-31" } : {});
  const mIn = h("input", { type: "month", value: HF.month, onchange: e => { HF.month = e.target.value; render(); } });
  const groups = {}; for (const r of rows) (groups[r.period_start + "|" + r.period_end] ||= []).push(r);
  const out = [];
  for (const [k, g] of Object.entries(groups)) {
    const [s, e] = k.split("|"); const tot = g.reduce((a, r) => a + (+r.result?.net || 0), 0);
    out.push(h("div", { class: "card" }, h("div", { class: "row" }, h("h3", {}, periodLabel(s, e)), h("span", { class: "sp" }), h("span", { class: "money" }, `${t("total")} ₱${money(tot)}`),
        h("button", { class: "btn sm", type: "button", onclick: () => batchPrint(g, s, e) }, "🖨 " + t("printBatch"))),
      h("div", { class: "list" }, g.map(r => h("div", { class: "item", onclick: () => { S.pay = { ...defaultPay(), employee_id: r.employee_id, month: s.slice(0, 7), half: +s.slice(8) === 1 ? 1 : 2, loaded: false }; S.tab = "pay"; render(); } },
        h("div", { class: "t" }, r.employees?.name, " ", h("span", { class: "pill " + r.status }, r.status === "paid" ? t("paid") : t("draft"))),
        h("div", { class: "s" }, `${t("pos_" + (r.employees?.position || "other"))} · ${r.result?.daysWorked ?? 0}d · OT ${r.result?.otHours ?? 0}h` + (r.paid_on ? ` · ${r.paid_on} ${r.paid_via || ""}` : "")),
        h("div", { class: "m money" }, "₱" + money(r.result?.net)))))));
  }
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_hist")), h("span", { class: "sp" }), mIn)), ...(out.length ? out : [h("p", { class: "muted" }, t("hist_empty"))]));
}

/* ---- payout: how the net is handed over (cash / GCash / bank, optionally split) ---- */
const PAY_VIAS = [["CASH", "Cash"], ["GCASH", "GCash"], ["MAYA", "Maya"], ["METROBANK", "Metrobank"], ["SAVINGBOX", "Saving box"]];
const viaLabel = v => (PAY_VIAS.find(x => x[0] === v) || [v, v])[1];
function payoutOf(P, R, emp) {
  const via = P.pay_via || P.paid_via || "CASH", net = +R.net || 0, split = Math.min(net, Math.max(0, +P.pay_split || 0));
  const parts = via !== "CASH" && split > 0 && split < net ? [{ via, amount: split }, { via: "CASH", amount: Math.round((net - split) * 100) / 100 }] : [{ via, amount: net }];
  return { via, split: via !== "CASH" ? split : 0, parts };
}
function payoutText(po, emp) {
  if (!po || !po.parts) return "";
  const acct = v => v === "GCASH" && emp?.info?.gcash ? ` ${emp.info.gcash}` : v === "METROBANK" && emp?.info?.bank_acct ? ` ${emp.info.bank_acct}` : "";
  return po.parts.map(x => `${viaLabel(x.via)}${acct(x.via)} ₱${money(x.amount)}`).join(" + ");
}
/* ---- batch print: all payslips of a period, tiled 2 × 3 per A4 (6 per sheet) ---- */
function slipCompact(r) {
  const R = r.result || {}; const emp = r.employees || {};
  const P = { pay_type: r.pay_type || "daily", allowance_per_day: +r.allowance_per_day || 0 };
  const rate = P.pay_type === "monthly" ? `₱${money(r.monthly_rate)}/mo` : `₱${money(r.daily_rate)}/day`;
  return h("div", { class: "slip mini" },
    h("div", { class: "head" }, h("div", {}, h("b", {}, "PALTONG RESTAURANT"), h("div", { class: "muted" }, "603 Remedios St. Malate Manila")), h("div", {}, h("b", {}, t("slip")), h("div", { class: "muted" }, `${r.period_start} ~ ${r.period_end}`))),
    h("div", { class: "grid2" }, h("div", {}, h("b", {}, emp.name), h("div", { class: "muted" }, t("pos_" + (emp.position || "other")))), h("div", {}, rate, h("div", { class: "muted" }, R.net != null ? summaryText(R) : ""))),
    R.net != null ? h("table", {}, resultRows(R, P)) : h("p", { class: "muted" }, t("draft")),
    h("p", { class: "muted" }, `${t("payLine")}: ${R.payout ? payoutText(R.payout, emp) : (r.paid_via ? viaLabel(r.paid_via) + " ₱" + money(R.net) : "")}` + (r.status === "paid" ? ` · ${r.paid_on || ""}` : ` · ${t("notPaidYet")}`)),
    h("div", { class: "sig" }, h("div", {}, "Employer"), h("div", {}, "Employee / " + (emp.name || ""))));
}
function batchPrint(rows, s, e) {
  const sorted = rows.slice().sort((a, b) => String(a.employees?.name).localeCompare(String(b.employees?.name)));
  const box = h("div", { id: "batchPrint" }, sorted.map(slipCompact));
  document.body.append(box); document.body.classList.add("print-batch");
  const done = () => { box.remove(); document.body.classList.remove("print-batch"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
  setTimeout(() => { if (document.body.contains(box)) done(); }, 60000);
}

/* ================= 13TH MONTH ================= */
const M13 = { year: new Date().getFullYear() };
async function render13() {
  const main = document.getElementById("main"); const owner = S.user?.role === "owner";
  const year = M13.year;
  const [rows, paid] = await Promise.all([db.listPayrollsYear(year), db.listThirteenth(year).catch(() => [])]);
  const paidBy = Object.fromEntries(paid.map(x => [x.employee_id, x]));
  const now = new Date(); const elapsedHalves = year < now.getFullYear() ? 24 : (now.getMonth()) * 2 + (now.getDate() > 15 ? 2 : 1);
  const yIn = h("input", { type: "number", id: "y13", value: year, step: 1, min: 2025, max: 2100, style: "width:110px", onchange: e => { M13.year = +e.target.value || year; render(); } });
  const tbl = h("table"); let tot = 0, totBasic = 0, totAvg = 0;
  tbl.append(h("tr", {}, h("th", {}, t("employee")), h("th", { class: "r" }, t("c13_periods")), h("th", { class: "r" }, t("c13_basicApp")), h("th", { class: "r" }, t("c13_basicBefore")), h("th", { class: "r" }, t("c13_total")), h("th", { class: "r" }, t("c13_amount")), h("th", { class: "r" }, t("c13_avg")), h("th", { class: "r" }, t("c13_proj")), h("th", {}, t("c13_status"))));
  for (const e of S.employees.filter(e => e.active || rows.some(r => r.employee_id === e.id))) {
    const mine = rows.filter(r => r.employee_id === e.id);
    const basicApp = mine.reduce((a, r) => a + (+r.result?.basicFor13th || 0), 0);
    const before = e.basic_before_year === year ? +e.basic_before_app || 0 : 0;
    const total = basicApp + before, amount = Math.round(total / 12 * 100) / 100;
    const avg = mine.length ? basicApp / mine.length : 0;
    const monthAvg = mine.length ? Math.round(basicApp / mine.length * 2 * 100) / 100 : 0; // 1년 이상 근속자: 한 달치 = 보름 평균 × 2
    const proj = Math.round((total + avg * Math.max(0, 24 - elapsedHalves - (before ? 0 : 0))) / 12 * 100) / 100;
    const p = paidBy[e.id]; tot += amount; totBasic += total; totAvg += monthAvg;
    const drafts = mine.filter(r => r.status !== "paid").length;
    tbl.append(h("tr", {},
      h("td", {}, e.name, drafts ? h("small", { class: "muted" }, ` · ${drafts} ${t("draft")}`) : null),
      h("td", { class: "r" }, mine.length), h("td", { class: "r" }, money(basicApp)), h("td", { class: "r" }, money(before)), h("td", { class: "r" }, money(total)),
      h("td", { class: "r" }, h("b", {}, money(amount))), h("td", { class: "r" }, h("b", {}, money(monthAvg))), h("td", { class: "r muted" }, money(proj)),
      h("td", {}, p ? h("span", { class: "row", style: "gap:6px" }, h("span", { class: "pill paid" }, `${t("c13_paid")} ₱${money(p.amount)}`), h("small", { class: "muted" }, p.paid_on || ""), owner && h("button", { class: "btn sm ghost", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deleteThirteenth(p.id); render(); }) }, t("c13_unpay")))
                    : owner ? h("button", { class: "btn sm", type: "button", onclick: () => pay13(e, year, total, amount, monthAvg) }, t("c13_pay")) : h("span", { class: "pill draft" }, t("c13_unpaid")))));
  }
  tbl.append(h("tr", { class: "sum" }, h("td", {}, t("c13_total_row")), h("td", {}), h("td", {}), h("td", {}), h("td", { class: "r" }, money(totBasic)), h("td", { class: "r" }, money(tot)), h("td", { class: "r" }, money(totAvg)), h("td", {}), h("td", {})));
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_13")), h("span", { class: "sp" }), h("span", { class: "muted" }, t("y13")), yIn),
    h("small", { class: "muted" }, t("y13help")), h("div", { class: "tbl" }, tbl), h("small", { class: "muted" }, t("c13_projHelp"))));
}
function pay13(e, year, total, amount, monthAvg = 0) {
  const dIn = h("input", { type: "date", id: "p13On", value: today() });
  const vIn = sel([["CASH", "Cash"], ["GCASH", "GCash"], ["MAYA", "Maya"], ["METROBANK", "Metrobank"], ["SAVINGBOX", "Saving box"]], "CASH", { id: "p13Via" });
  const aIn = h("input", { type: "number", id: "p13Amt", value: amount, step: 1, min: 0 });
  const close = sheet([h("h3", {}, `${e.name} · ${year} ${t("tab_13")}`), h("p", { class: "muted" }, `${t("c13_total")} ₱${money(total)} ÷ 12 = ₱${money(amount)} · ${t("c13_avg")} ₱${money(monthAvg)}`),
    monthAvg ? h("div", { class: "row", style: "gap:6px" }, h("button", { class: "btn sm ghost", type: "button", onclick: () => { aIn.value = amount; } }, "÷12"), h("button", { class: "btn sm ghost", type: "button", onclick: () => { aIn.value = monthAvg; } }, t("c13_avg"))) : null,
    h("div", { class: "grid2" }, field(t("c13_amount"), aIn), field(t("paidOn"), dIn), field(t("paidVia"), vIn)),
    h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: () => close() }, t("cancel")), h("button", { class: "btn primary", onclick: async () => { try {
      await db.saveThirteenth({ employee_id: e.id, year, basic_total: total, amount: +aIn.value, paid_on: dIn.value, paid_via: vIn.value }); toast(t("saved")); close(); render(); } catch (er) { toast(errMsg(er)); } } }, t("c13_pay")))]);
}

/* ================= SETTINGS ================= */
function renderSet() {
  const main = document.getElementById("main"); const owner = S.user?.role === "owner"; const s = S.settings;
  const wage = h("input", { type: "number", id: "sWage", value: s.min_wage, step: 1, disabled: !owner }); const brk = h("input", { type: "number", id: "sBrk", value: s.break_hours, step: 0.5, disabled: !owner });
  const rider = h("input", { type: "number", id: "sRider", value: s.rider_allowance ?? 100, step: 10, disabled: !owner }); const kit = h("input", { type: "number", id: "sKit", value: s.kitchen_monthly ?? 30000, step: 100, disabled: !owner });
  const hpd = h("input", { type: "number", id: "sHpd", value: s.hours_per_day ?? 10, step: 1, min: 1, disabled: !owner });
  const mBasic = h("input", { type: "number", id: "sMBasic", value: s.monthly_basic ?? 25945, step: 1, min: 0, disabled: !owner }); const mOt = h("input", { type: "number", id: "sMOt", value: s.monthly_ot_incl ?? 1, step: 0.5, min: 0, disabled: !owner });
  const penSel = sel([["1", t("penOn")], ["0", t("penOff")]], s.late_penalty === false ? "0" : "1", { id: "sPen", disabled: !owner });
  const g = (k, l) => h("label", { class: "check" }, h("input", { type: "checkbox", id: "s_" + k, checked: !!s[k], disabled: !owner }), l);
  const sss = g("sss_on", "SSS"), ph = g("philhealth_on", "PhilHealth"), pag = g("pagibig_on", "Pag-IBIG");
  const share = sel([[0.5, t("govShare")], [1, t("govFull")]], s.gov_share, { disabled: !owner });
  main.append(h("div", { class: "card" }, h("h2", {}, t("tab_set")),
    h("div", { class: "grid2" }, field(t("set_wage"), wage), field(t("set_break"), brk), field(t("set_rider"), rider), field(t("set_kitchen"), kit), field(t("set_mbasic"), mBasic), field(t("set_mot"), mOt), field(t("set_hpd"), hpd), field(t("set_penalty"), penSel)),
    h("div", {}, h("b", {}, t("set_gov"))), h("div", { class: "row" }, sss, ph, pag, share),
    h("div", { class: "row" }, h("span", {}, t("set_lang")), langSwitch()),
    owner && h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn primary", onclick: async () => { try {
      S.settings = await db.saveSettings({ min_wage: +wage.value, break_hours: +brk.value, rider_allowance: +rider.value, kitchen_monthly: +kit.value, hours_per_day: +hpd.value || 10, late_penalty: penSel.value === "1", monthly_basic: +mBasic.value || 25945, monthly_ot_incl: +mOt.value || 0, sss_on: sss.firstChild.checked, philhealth_on: ph.firstChild.checked, pagibig_on: pag.firstChild.checked, gov_share: +share.value });
      toast(t("saved")); } catch (e) { toast(errMsg(e)); } } }, t("save")))),
    h("div", { class: "card" }, h("h2", {}, t("contract")), h("ul", { style: "margin:0;padding-left:18px;display:grid;gap:8px;font-size:14px" }, t("contractText").map(x => h("li", {}, x)))));
}

document.documentElement.lang = lang;
boot().catch(e => { root.innerHTML = ""; root.append(h("div", { class: "login" }, h("div", { class: "card" }, h("div", { class: "err" }, String(e.message || e))))); });
