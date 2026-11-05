import * as db from "./data.js";
import { applyHolidays, computePayroll, shiftHours, paperOt, pairPunches, SHIFTS, SHIFT_LABEL, isPreset, parseShift, DAY_TYPES, dayTypesFor, periodOf, periodForDate, datesBetween, fmtDate, addDays, isNightShift, carriesOver, paidDays, paidShift } from "./payroll-calc.js";

/* ---------- i18n ---------- */
const I18N = {
  ko: {
    ackBtn: "확인했어요", ackFirst: "먼저 명세서를 열어 확인해 주세요", ackQ: "명세서 내용(근무 시간·금액·공제)을 확인했나요?", ackDone: "확인함 ✓ {d}", ackPill: "직원 확인 ✓", ackWait: "직원 확인 전",
    myFinal: "이번 급여 (확정)", myFinalOpen: "명세서 보기", cardCol: "타임카드",
    share: "확정 · 직원 공개", unshare: "확정 취소", sharedPill: "확정", sharedStaff: "확정 · 지급 예정", shareHelp: "확정하면 금액이 고정되고 직원 본인 화면에 명세서가 그대로 보여요",
    emp_full: "성명 (명세서용 풀네임)", emp_fullHelp: "급여명세서에 이 이름이 나와요. 비우면 위 이름", emp_resigned: "퇴사일", emp_resignedHelp: "넣으면 급여·스케줄 목록에서 빠져요. 직원 로그인은 13th month 지급일 + 7일까지 열려 있다가 막혀요", resign13: "퇴사 정산 · 13th month", resign13Help: "퇴사한 해의 기본급 ÷ 12. 퇴사일로부터 30일 안에 지급 (DOLE LA 06-20)", resignDue: "지급 기한 {d}", accessUntil: "직원 로그인 {d}까지", accessOpen: "13th month 지급 후 7일 뒤 로그인 막힘", pinClosed: "퇴사 처리돼서 더 이상 로그인할 수 없어요", punchResigned: "퇴사일 이후에는 출퇴근을 찍을 수 없어요", resignedTag: "퇴사 {d}",
    app: "Paltong 급여", login: "로그인", id: "아이디", pw: "비밀번호", logout: "로그아웃", changePw: "비밀번호 변경", newPw: "새 비밀번호 (6자 이상)",
    tab_pay: "급여 계산", tab_sched: "스케줄", tab_emp: "직원", tab_ledger: "가불·부족분·보너스", tab_hist: "급여 내역", tab_13: "13월급", tab_set: "설정",
    y13: "연도", y13help: "13월급 = 그 해 받은 기본급 합계 ÷ 12 (1년 미만은 받은 만큼만 = 자동 비례) · 12월 24일까지 지급. 기본급엔 초과근무·공휴일 가산·정비비·보너스가 안 들어가요. 앱에 저장된 급여(지급됨 + 작성중)를 더하고, 앱 쓰기 전 기본급은 직원 탭에서 손으로 넣어요.",
    c13_basicApp: "앱 기본급", c13_basicBefore: "앱 이전", c13_total: "기본급 합계", c13_periods: "기간 수", c13_amount: "13월급 (÷12)", c13_avg: "월평균 (1년↑)", c13_proj: "연말 예상", c13_status: "지급", c13_pay: "지급 기록", c13_paid: "지급됨", c13_unpaid: "미지급", c13_unpay: "지급 취소",
    c13_projHelp: "연말 예상 = 지금까지 평균 반월 기본급 × 남은 반월 수를 더한 값 ÷ 12 (참고용)", c13_total_row: "합계", c13_draftNote: "작성중 급여 포함",
    emp_before: "앱 이전 올해 기본급 (13월급용)", emp_beforeHelp: "앱 쓰기 전 올해 1월~9월에 받은 기본급 합계 (초과·수당 제외). 모르면 0",
    sil_title: "유급휴가 (SIL)", lv_title: "휴가 신청", lv_help: "종류를 고르고 시작일~끝일을 정하면 한 번에 신청돼요 (최대 14일). 7일 이상 남은 날을 4일 이하로 신청하면 바로 승인돼서 스케줄에 들어가요. 7일이 안 남았거나 5일 이상이면 사장님이 승인해요.", lv_kind: "종류", lv_off: "1 Day off", lv_sil: "SIL", lv_mpv: "Monthly paid vacation", lv_offS: "휴무 (무급)", lv_off7: "Day off는 7일 전까지만 신청할 수 있어요 ({d}부터)", pend_title: "🔔 승인 대기", push_ask: "📲 신청·승인 알림을 이 폰으로 받기", push_on: "푸시 켜기", push_later: "나중에", push_done: "✅ 푸시 알림을 켰어요 — 테스트 알림을 보냈어요", push_ios: "아이폰은 먼저 공유 → '홈 화면에 추가' 후, 홈 화면 아이콘으로 열어서 눌러 주세요", push_unsup: "이 브라우저는 푸시 알림을 지원하지 않아요 (안드로이드는 Chrome)", push_denied: "알림이 차단돼 있어요 → 브라우저 설정 → 사이트 설정 → 알림 → 허용", push_menu: "🔔 푸시 알림", push_state_on: "이 기기: 받는 중 ✅", push_state_off: "이 기기: 안 받음", push_test: "테스트 보내기", push_off: "이 기기 끄기", push_devices: "등록된 기기 {n}대", pend_leave: "휴가 {n}", pend_punch: "출퇴근 사유 {n}", pend_cash: "현금 부족 {n}", lv_silS: "유급휴가 · 남은 {n}일", lv_mpvS: "개근 휴가 · {n}일", k_lv_off: "휴무", k_lv_sil: "SIL", k_lv_mpv: "개근 휴가", lv_from: "시작일", lv_to: "끝일 (하루면 비워두기)", lv_days: "{n}일 · {d}", lv_q: "{k} · {d} ({n}일)을 신청할까요? {w}", lv_qAuto: "바로 승인돼서 스케줄에 들어가요.", lv_qShort: "7일이 안 남아서 사장님 승인 후 확정돼요.", lv_qLong: "5일 이상이라 사장님 승인 후 확정돼요.", lv_auto: "✅ 승인됐어요 · 스케줄에 반영했어요", lv_manual: "신청했어요 · 사장님 승인 대기", lv_pickKind: "종류를 골라 주세요", lv_max: "한 번에 14일까지 신청할 수 있어요", lv_order: "끝일이 시작일보다 빨라요", lv_noMpv: "{m}에 쓸 개근 휴가가 없어요 (사용 가능 {n}일)", lv_alreadyOff: "{d}: 이미 휴무예요", lv_warn: "⚠️ 스케줄 규칙", mpv_title: "월 개근 휴가 (계약서 3.2조)", mpv_help: "그 달에 무단결근이 없고 1분 이상 지각이 없으면, 다음 달 안에 쓸 수 있는 유급휴가 1일이 자동으로 생겨요. 다음 달 말일이 지나면 없어지고 돈으로 바꿀 수 없어요. 그 달 급여 두 번이 확정되면 판정돼요.", mpv_row: "{m} 개근 → {c} 사용", mpv_st_counting: "이번 달 진행 중", mpv_st_waiting: "급여 확정 후 판정", mpv_st_none: "개근 아님", mpv_st_available: "사용 가능 1일 · {e}까지", mpv_st_pending: "신청 대기 중", mpv_st_used: "사용함 {d}", mpv_st_expired: "기한 지남", mpv_col: "개근 휴가", intro_rewatch: "앱 설명 영상 다시 보기", intro_sub: "앱 사용 설명 영상이에요. 끝까지 보고 확인을 눌러야 다음으로 넘어가요.", intro_err: "영상을 불러올 수 없어요. 인터넷 연결을 확인하고 다시 열어 주세요.", sig_contract: "계약서에 한 사인과 똑같이 해 주세요.", sig_previewQ: "계약서 사인과 똑같나요? 저장하면 바꿀 수 없어요.", bd_title: "🎂 생일 인센티브 (자동)", bd_help: "생일 전 3개월 동안 지각·조퇴·결근이 없으면 생일 날짜로 ₱{a} 보너스가 자동으로 들어가요 (생일이 있는 컷오프 급여에 포함). 생일 당일에 판정하고, 결과와 이유가 여기 남아요. 생일은 직원 정보에서 넣거나 직원이 내 정보에서 넣어요.", bd_paid: "지급 ₱{a}", bd_denied: "미지급", bd_norec: "기록 부족 (직접 확인)", bd_ok: "예정 · 지금까지 문제 없음", bd_bad: "예정 · 문제 있음", bd_none: "생일이 입력된 직원이 없어요", bd_missing: "생일 미입력: {n}", sig_title: "최초로 사인 해 주세요", sr_title: "유급휴가 신청", sr_help: "쉬고 싶은 날을 고르고 신청하면 관리자가 승인해요. 승인되면 스케줄에 SIL로 들어가고 그날은 유급이에요. 내일부터 신청할 수 있어요.", sr_day: "날짜", sr_reason: "사유 (선택)", sr_send: "SIL 신청", sr_q: "{d} — {n}일 신청할까요? 관리자 승인 후 확정돼요.", sr_done: "신청했어요 · 관리자 승인 대기", sr_left: "신청 가능 {n}일", sr_list: "내 휴가 신청", sr_cancel: "신청 취소", sr_need: "날짜를 골라 주세요", sr_past: "{d}: 내일부터 6개월 안의 날짜만 신청할 수 있어요", sr_dup: "{d}: 이미 SIL이거나 신청한 날이에요", sr_nobal: "남은 SIL이 부족해요 (신청 가능 {n}일)", st_cancelled: "취소", sr_adminTitle: "🌴 휴가 신청 확인", sr_adminHelp: "7일 이상 전 + 4일 이하 신청은 자동 승인돼서 여기엔 기록만 남아요. 7일이 안 남았거나 5일 이상인 신청만 사장님이 승인해요 (기간은 한 번에). 휴무 → 스케줄 OFF (무급) · SIL·개근 휴가 → 스케줄 SIL (유급, 캐시북엔 휴무). 휴무가 스케줄 규칙에 걸리면 ⚠️로 보여줘요.", sr_none: "확인할 SIL 신청이 없어요", sr_curPlan: "현재 스케줄", sr_leftAfter: "남은 SIL {n}일", sig_help: "아래 칸에 손가락으로 사인해 주세요. 이 사인은 사유서·확인서·가불 확인서·급여명세서(확인한 것)에 들어가요. 한 번 저장하면 직접 바꿀 수 없어요 (관리자만 초기화).", sig_clear: "다시 쓰기", sig_save: "사인 저장", sig_empty: "사인을 해 주세요", sig_saved: "사인을 저장했어요", sig_mine: "내 사인", sig_on: "사인 등록됨 {d}", sig_off: "사인 미등록", sig_reset: "사인 초기화", sig_resetDone: "사인을 지웠어요. 다음 로그인 때 다시 사인해요.", doc_title: "📁 서류", doc_help: "COE·계약서 등 PDF나 사진을 보관해요 (1개 최대 8MB). 사장님만 볼 수 있어요.", doc_name: "서류 이름", doc_namePh: "예: COE", doc_file: "파일 (PDF·사진)", doc_up: "올리기", doc_none: "보관된 서류가 없어요", doc_open: "열기", doc_need: "파일을 골라 주세요", doc_big: "파일이 너무 커요 (최대 8MB)", doc_type: "PDF·PNG·JPG·WEBP만 올릴 수 있어요", doc_saved: "서류를 저장했어요", doc_delQ: "이 서류를 삭제할까요?", doc_loading: "불러오는 중…", doc_needTbl: "서류 기능 DB 설정 전이에요 (supabase/pr_docs.sql 실행 필요)", stab_home: "홈", stab_adv: "가불", adv_title: "가불 신청", adv_help: "신청하면 바로 자동 승인돼요. 신청한 날짜가 들어가는 급여에서 공제돼요. 현금은 매장에서, GCash는 GCash로 받아요. 캐시북에도 자동으로 기록돼요.", adv_via: "받는 방법", adv_cash: "💵 현금", adv_gcash: "📱 GCash", adv_viaNeed: "현금 또는 GCash를 골라 주세요", adv_viaL: "{v}로 받음", adv_amount: "금액 (₱)", adv_reason: "사유 (선택)", adv_send: "가불 신청", adv_q: "₱{a} 가불을 {v}로 신청할까요? 자동 승인되고 {p} 급여에서 공제돼요.", adv_done: "가불 신청 완료 · 자동 승인", adv_bad: "1 이상 금액을 적어 주세요", adv_lim: "이번 컷오프 가불 한도", adv_limHelp: "한도 = 이번 컷오프 급여 (스케줄 {d}일 기준) − 공제 예정분 − 이미 받은 가불", adv_limM: "한도 = 월급의 절반 − 공제 예정분 − 이미 받은 가불", adv_pay: "이번 컷오프 급여", adv_dLate: "지각 공제 ({m}분)", adv_dShort: "현금 부족분", adv_dOther: "기타 공제", adv_dGov: "법정 공제 (SSS 등)", adv_left: "신청 가능", adv_usedL: "이미 받은 가불", adv_over: "한도를 넘었어요. 이번 컷오프에 더 신청할 수 있는 금액은 ₱{a}이에요.", adv_none: "이번 컷오프에는 더 신청할 수 없어요 (한도 다 씀 또는 스케줄 없음).", adv_list: "내 가불 내역", adv_print: "가불 확인서", adv_app: "📱 앱 신청", adv_needSig: "먼저 사인을 등록해 주세요", sil_selfT: "올해 이미 쓴 유급휴가 (SIL)", sil_selfHelp: "앱에 기록되지 않은 날만 적어 주세요 (반일은 0.5). 아래 '이미 기록된 SIL'은 빼고 세요. ⚠️ 한 번 저장하면 직접 고칠 수 없어요. 틀렸으면 관리자에게 말해 주세요.", sil_selfRec: "이미 앱에 기록된 SIL (세지 마세요): {d}", sil_selfRecNone: "앱에 기록된 SIL은 아직 없어요", sil_selfQ: "올해 이미 쓴 SIL을 {n}일로 저장할까요? 저장하면 다시 고칠 수 없어요.", sil_selfDone: "저장됨 · {n}일 ({d}) · 수정은 관리자에게", sil_locked: "이미 저장해서 고칠 수 없어요. 관리자에게 말해 주세요.", sil_bad: "0~30 사이 숫자로 적어 주세요 (0.5 단위)", sil_selfAdm: "직원 입력 {d}", sil_help: "법정 유급휴가 (SIL): 기본 일수 − 사용한 날 = 남은 날. 스케줄에 SIL로 잡힌 날은 예정으로 따로 빼요. 개근 휴가(계약서 3.2조)는 따로 계산해요.", sil_base: "기본", sil_before: "앱 이전 사용", sil_earned: "개근 +", sil_used: "사용", sil_planned: "예정", sil_left: "남음", sil_months: "개근 기록", sil_perfect: "개근 ✓ → {c}에 +1", sil_not: "지각·결석 있음", sil_none: "아직 없음", sil_dates: "사용한 날", sil_plDates: "예정된 날", p13_title: "13월급 (12월까지 근무 기준 예상)", p13_help: "올해 확정·지급된 급여의 기본급과, 12월 31일까지 계속 근무한다고 가정한 남은 기간(평균 기본급)으로 계산했어요. 초과·야간·가산·인센티브는 빠져요.", p13_req: "11월 7일부터 요청 가능", p13_open: "13월급 명세서 보기", p13_ack: "확인했어요", p13_acked: "확인함 {d}", p13_period: "기간", p13_basic: "기본급", p13_estRow: "예상", p13_sum: "기본급 합계 (12월까지)", p13_by12: "합계 ÷ 12", p13_avgM: "한 달 평균 (1년 이상 근무)", p13_final: "예상 13월급", p13_note: "12월까지 근무했다고 가정한 예상 금액이에요. 실제 근무에 따라 달라질 수 있고, 확정 금액은 관리자가 지급 기록한 값이에요.", p13_due: "13월급 (12월까지 근무 기준)", p13_dueHelp: "직원 화면과 같은 계산이에요. 확정 급여의 기본급 + 남은 기간 평균. 직원이 명세서를 보고 확인을 누르면 표시돼요.", p13_notAck: "확인 전", p13_toDate: "지금까지", my13: "내 13월급", my13help: "올해 지급된 급여의 기본급(초과·야간·가산·정비비·인센티브 제외)으로 계산한 예상치예요. 1년 이상 근무면 한 달 평균, 1년 미만이면 합계 ÷ 12. 12월 24일 전 지급. 확정 금액은 관리자가 지급 기록한 값이에요.", my13_basic: "올해 기본급 합계 ({n}회 지급)", my13_by12: "÷ 12 (1년 미만)", my13_avg: "한 달 평균 (1년 이상)", my13_est: "예상 13월급", my13_1yr: "1년 이상", my13_under: "1년 미만",
    employee: "직원", period: "급여 기간", first: "1 – 15일", second: "16 – 30일", month: "월",
    daily: "일급", monthlyRate: "월급 (초과근무 포함)", breakH: "식사 휴게 (시간/일)", allowDay: "정비비 (₱/근무일)",
    roster: "보름치 시프트 표", off: "휴무", wkend: "주말",
    type_regular: "근무", type_half: "반일 (½)", type_rest: "휴무일 근무 (130%)", type_special: "특별공휴일 근무 (+30%)", type_specialRest: "특별공휴일+휴무일 (150%)", type_holiday: "정규공휴일 근무 (+1일)", type_holidayRest: "정규공휴일+휴무일 (260%)", type_holidayOff: "정규공휴일 쉼 (1일)", type_sil: "유급휴가 (1일)", type_absent: "결근 (공제)", type_off: "휴무",
    fill: "채우기", fillHelp: "\"앱 출퇴근 불러오기\"를 누르면 직원이 앱에서 누른 출근·퇴근 시각이 날짜별 타임카드로 들어와요 (기준). 없는 날은 시프트로 채우거나 캐시북 스케줄을 불러오고, 쉬는 날은 날짜를 눌러 휴무로.",
    restDay: "주 휴무 요일", dow: ["일", "월", "화", "수", "목", "금", "토"],
    custom: "타임카드 (직접 입력)", inT: "출근", outT: "퇴근", otDay: "OT", otAuto: "비우면 시프트에서 자동 (10h 기본 + 1h 휴게 제외, 나머지가 OT · 12h = OT 1h) · 카드 숫자를 넣으면 그 값",
    late: "지각·조퇴 합계 (분)", lateHelp: "일급 ÷ 10 ÷ 60 · 분당 ₱", lateHelpC: "실제 미근무 분만 (일급 ÷ 8 ÷ 60) · 분당 ₱", incentive: "수동 인센티브·수당 (+)", other: "기타 공제 (−)",
    deductions: "공제 · 보너스", payout: "지급 방법", payoutVia: "지급 수단", payoutSplit: "일부를 GCash/계좌로 (금액)", payoutRest: "나머지 현금", payoutHelp: "명세서에 '지급: GCash 5,000 + Cash 2,075'처럼 찍혀요. 번호는 직원 정보의 GCash/계좌에서 가져와요.", payLine: "지급", ledgerAuto: "이 기간 자동 반영 (가불 · 현금 부족분 · 보너스)", none: "없음",
    gov: "법정 공제 (근로자 부담분)", perMonth: "월", govFixed: "법정 공제 고정액 (월, 본인 부담)", govFixedHelp: "실제 납부하는 월 금액 — 급여(보름)마다 절반씩 공제. 비우면 공제 안 함 (급여 화면 체크 시 표 기준 추정)", govShare: "매 급여 절반씩 (15일·30일)", govFull: "30일 급여에서 한 달치 한 번", govHelp: "그 달 보험료를 그 달 급여에서 공제해요 (절반씩 = 15일·30일에 반씩 / 한 번 = 30일에 전액). 직원 탭 고정액이 있으면 그 금액, 없으면 참고값 SSS 5% · PhilHealth 2.5% · Pag-IBIG 2% (최대 ₱200)",
    result: "계산 내역", basic: "기본급 (근무일 × 일급)", basicC: "기본급 (근무시간 × 시급)", basicM: "기본급 (월급 ÷ 2)", premium: "공휴일 가산 (특별 +30% · 정규 +1일)", premiumC: "휴무일·공휴일 할증", ot: "초과근무 (시간 × 일급÷{h})", otC: "초과근무 125%", nd: "야간근무 가산 (10%)", otIncl: "초과근무 (월급 포함분 1h/일 이내 · 별도 지급 없음)", otExtra: "초과근무 (포함분 1h/일 초과 · 125%)", basicSplit: "　└ 기본급 {b} + 포함 OT {o}", penalty: "지각 벌금 (지각액과 동일)",
    silPay: "유급휴가", holOff: "정규공휴일 유급 (쉼)", allowance: "오토바이 정비비 ({d}일 × ₱{a})", absentDed: "결근 공제 ({d}일)",
    lateDed: "지각·조퇴 공제", gross: "총 지급액 (Gross)", dedHead: "── 공제 내역 ──", dedTotal: "공제 합계", otherManual: "수동 입력 (급여 계산 화면)", govSSS: "SSS (본인 부담)", govPH: "PhilHealth (본인 부담)", govPI: "Pag-IBIG (본인 부담)", adv: "가불금 (CA)", shortage: "현금 부족분", bonus: "보너스 (최고매출일 · 신메뉴 등)", net: "실수령액 (Net)",
    summary: "근무 {d}일{hd} · 초과 {o}h · 유급휴가 {s}일", summaryC: "근무 {d}일 · {h}h · 초과 {o}h · 야간 {n}h · 유급휴가 {s}일", halfSum: " + 반일 {n}", netLbl: "실수령액",
    for13: "13월급 산정용 기본급", riderNote: "배달비·유류비는 당일 현금 지급 (캐시북 직원 탭) · 급여에 포함 안 됨", monthlyNote: "월급 ₱30,000 = 기본 25,945 + 포함 OT 4,055 (08~18시 중 1h/일) · 일급 994.70 · 시급 124.34 · 그 밖의 초과근무(18시 이후)·휴무일 130%·공휴일·야간은 별도 · 결근·지각은 일급/시급 기준 공제 · 13월급은 기본 25,945 기준",
    save: "저장", saved: "저장됨", markPaid: "지급 완료로 기록", paid: "지급됨", draft: "작성중", unpay: "지급 취소", paidOn: "지급일", paidVia: "지급 계좌", slip: "급여명세서", print: "인쇄", printSimple: "간단 인쇄 (58mm)", printA4: "상세 인쇄 (A4)", printBatch: "일괄 인쇄 (A4 한 장에 6명)", delete: "삭제", confirmDel: "정말 삭제할까요?", yes: "삭제", cancel: "취소", no: "아니요", ok: "네", close: "닫기",
    emp_add: "직원 추가", emp_name: "이름", emp_pos: "직위", pos_waiter: "웨이터/서버", pos_kitchen: "주방", pos_rider: "라이더", pos_other: "기타",
    emp_status: "고용 형태", st_regular: "정규직", st_probationary: "수습", st_fixed: "계약직", st_other: "기타", emp_hired: "입사일", emp_bday: "생일", emp_active: "재직 중", emp_note: "메모",
    emp_payType: "급여 형태", pt_daily: "일급", pt_monthly: "월급 (OT 포함)",
    led_add: "기록 추가", led_kind: "종류", k_advance: "가불", k_shortage: "현금 부족분", k_bonus: "보너스 (+)", k_other: "기타 공제", led_date: "날짜", led_amount: "금액", led_note: "메모", led_noteKo: "메모 (한국어)", led_noteEn: "메모 (영어)", led_noteHelp: "영어 화면·영어 명세서엔 영어 메모가 나와요 (비우면 한국어 메모)",
    led_verified: "조사 완료 · 본인 책임 확인", led_auth: "서면 동의 받음", led_applies: "→ {p} 급여에 반영", led_deducted: "반영됨", led_pending: "미반영", led_filter_all: "전체",
    bonusHint: "계약서 6조 최고매출일 보너스 = 보름 중 매출 최고일 총매출 × 2% ÷ 그날 근무한 직원 수 (아래 버튼으로 캐시북+출퇴근에서 자동) · 주방 신메뉴 ₱500 (5조) · 생일 인센티브 ₱500 (3.4조, 직전 3개월 개근) · 개근 → 다음 달 유급휴가 1일 (3.2조)는 날짜 종류 '유급휴가'로",
    topBonus: "최고매출일 보너스 계산", topTitle: "최고매출일 보너스 (계약서 6조)", topDay: "최고매출일", topSales: "총매출", topPool: "풀 (2%)", topEach: "1인당", topStaff: "그날 근무 (출퇴근 기록 기준) — 체크 해제하면 제외", topSave: "보너스로 저장", topNone: "이 기간 캐시북 매출이 없어요", topDone: "{n}명에게 ₱{a} 보너스 저장했어요 (10/16 이후 급여에 자동 반영)", topExists: "이미 이 기간 최고매출일 보너스가 저장돼 있어요",
    hist_empty: "저장된 급여가 없어요. 급여 계산 탭에서 저장하세요.", total: "합계",
    holReg: "정규 공휴일", holSp: "특별 휴일", hol_title: "공휴일 달력", hol_help: "여기 있는 날은 급여에 자동으로 들어가요. 일하면 특별 휴일 130% · 정규 공휴일 200% (휴무일에 일하면 150% / 260%), 정규 공휴일에 안 일하면 100% 지급. 새 휴일(예: 이드 알피트르)은 발표되면 추가해 주세요.", hol_add: "추가", carryIn: "↩ 이월", carryInNone: "제외", carryOut: "→ 다음 급여", carryHelp: "급여는 1–15일 · 16–30일. 31일이 있는 달의 16–30일 급여는 29일 야간 퇴근(30일 아침)까지예요. 30일 근무(주간·야간 모두)와 31일 근무는 다음 1–15일 급여에 자동으로 이월돼요 (↩ 표시 줄).",
    tab_due: "지급 예정", due_help: "저장 안 해도 자동 계산: 캐시북 스케줄 + 앱 출퇴근(있는 날은 실제 시간) + 가불·보너스·부족분·법정공제. 급여 계산 탭에서 저장한 직원은 저장한 내용으로. 실수령 = 총급여 − 공제. 이름을 누르면 급여 계산 탭에서 열려요.",
    due_total: "지급 예정 합계", due_people: "{n}건", due_payday: "지급일 {d}", due_overdue: "지급일 지남", due_byVia: "지급 수단별",
    due_ppl: "{n}명", due_auto: "자동", due_saved: "저장됨", due_days: "근무", due_calc: "스케줄로 계산 중…", due_paidX: "지급 완료 {n}명 제외: {names}", due_prev: "이전 기간 미지급 (저장된 급여)", due_cnt: "인원", due_gross: "총급여", due_ded: "공제", due_net: "실수령", due_list: "직원별 명단", due_missingHelp: "저장해야 합계에 들어가요.",
    due_missing: "이번 기간 ({p}) 아직 저장 안 한 직원", due_empty: "지급 예정 급여가 없어요. 전부 지급 완료예요.",
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
    clock: "출퇴근", clockHelp: "출근할 때 · 퇴근할 때 눌러주세요. 이 기록이 급여 근무시간 기준이에요.", clockedIn: "출근 중 · {t}부터", clockedOut: "퇴근함 · {t}", notIn: "아직 출근 전", clockDone: "{k} 기록됨 {t}", clockDup: "방금 이미 눌렀어요", clockRecent: "최근 기록", schedLoaded: "캐시북 스케줄에서 {n}일 불러왔어요", schedNone: "이 기간 캐시북 스케줄에 이 직원이 없어요", fillAll: "전체 채우기", tapOff: "쉬는 날은 날짜를 눌러 휴무로 (다시 누르면 근무)",
    cbTitle: "캐시북 현금 부족 (확인 필요)", cbHelp: "중간마감·마감에서 센 현금이 장부보다 모자라면 여기 들어와요. 자동으로 빠지지 않아요 — 조사 후 책임 웨이터를 지정하고, 가불·부족분에서 '본인 책임 확인'과 '서면 동의'를 둘 다 체크해야 급여에서 공제돼요.", cbNone: "확인할 부족분이 없어요", cbDone: "처리한 것", cbMid: "중간마감", cbFinal: "마감", cbCounted: "센 현금", cbBook: "장부", cbBy: "센 사람", cbReason: "사유", cbDuty: "근무", is_open: "확인 필요", is_assigned: "웨이터 지정됨", is_dismissed: "해결됨 (공제 안 함)",
    cbLaw: "근무 중이었다는 이유만으로 나눠서 빼면 안 돼요. 본인에게 설명할 기회를 주고, 책임이 확인된 한 사람에게만 지정하세요. 지정 후 가불·부족분에서 '본인 책임 확인'과 '서면 동의 받음'을 체크해야 공제돼요.", cbWho: "책임 웨이터", cbAssign: "이 웨이터의 부족분으로 넣기 (미확인)", cbAssigned: "부족분에 넣었어요 — 확인·동의 체크 후 공제돼요", cbDismissLbl: "찾았거나 장부 실수였다면 (메모)", cbFoundPh: "예: 다음날 서랍에서 찾음 / 매출 입력 실수", cbDismiss: "해결됨 — 공제 안 함", notDeducted: "공제 전 (확인·동의 필요)",
    asStaff: "직원", asAdmin: "관리자", empNo: "직원 번호", pin: "PIN (숫자)", pinFirst: "처음이면 PIN 0000", pinWrong: "번호 또는 PIN이 틀려요", pinLocked: "5번 틀려서 10분 동안 잠겼어요",
    newPinTitle: "내 PIN 등록", newPinHelp: "처음 로그인이에요. 나만 아는 숫자 4~6자리로 PIN을 새로 정해주세요 (0000 안 됨).", newPin: "새 PIN", newPin2: "새 PIN 다시", pinMismatch: "두 PIN이 달라요", pinBad: "숫자 4~6자리로 정해주세요 (0000 안 됨)", pinSaved: "PIN을 등록했어요",
    a2h_title: "홈 화면에 추가하기", a2h_btn: "홈 화면에 추가", a2h_later: "나중에", a2h_ios: "아래 공유 버튼 ⬆️ → '홈 화면에 추가'를 누르면 앱처럼 열 수 있어요.", a2h_other: "브라우저 메뉴 ⋮ → '홈 화면에 추가' 또는 '앱 설치'를 눌러 주세요.", a2h_inapp: "메신저 안에서는 추가가 안 돼요. 오른쪽 위 ⋯ → '브라우저로 열기'(Chrome/Safari) 후 다시 추가해 주세요.", awayErr: "매장에서만 출퇴근할 수 있어요. 매장 와이파이에 연결하거나 휴대폰 위치(GPS)를 켜고 다시 눌러 주세요.", locWait: "위치 확인 중…", sg_title: "매장에서만 출퇴근", sg_help: "켜면 매장 와이파이(등록한 인터넷) 또는 매장 반경 안(GPS) 둘 중 하나가 맞을 때만 출퇴근이 돼요. 통신사가 매장 인터넷 주소를 바꾸면 매장에서 '이 인터넷 등록'을 다시 눌러 주세요.", sg_on: "사용", sg_ips: "등록된 매장 인터넷", sg_ipAdd: "지금 이 인터넷을 매장으로 등록 (매장 와이파이에서)", sg_loc: "매장 위치", sg_locSet: "지금 위치를 매장 위치로 등록 (매장에서)", sg_radius: "허용 반경 (m)", sg_none: "없음", sg_locErr: "위치를 가져올 수 없어요. 위치 권한을 허용해 주세요.", rulesTitle: "근태 규칙 (간단히)", rules: ["일찍 출근: ① 교대자가 일찍 퇴근 → 그 직원 이름 선택 (확인서, 그 직원에게 확인 알림) · 승인 시 추가 지급 ② 지각하지 않으려고 (개인) → 확인서, 정상 시간으로 기록.", "지각: 사유 적기 (사유서). 늦은 시간만큼 급여에서 빠지고, 그 달 개근 보너스(SIL +1)도 없어요.", "일찍 퇴근: 사유 적기 (사유서). 실제 퇴근 시간까지만 계산.", "늦게 퇴근: ① 교대자가 늦게 옴 → 그 직원 이름 선택 (확인서, 알림) ② 업무상 이유 (확인서) → 승인 시 추가 지급 ③ 개인 사유 (사유서) → 추가 지급 없음.", "추가 지급은 1분 단위, 관리자 승인 후에만 지급돼요."], rulesHall: "홀 직원: 마감·캐시북(장부)으로 늦게 퇴근하는 건 반려 대상이에요. 장부 마감은 퇴근 시간 전에 끝내야 해요.", eqCover: "교대자가 일찍 퇴근해서 (업무) · 확인서", eqPersonal: "지각하지 않으려고 (개인 사유) · 확인서 · 정상 시간으로 기록", liTitle: "지각했어요", liLbl: "지각 사유 (사유서에 들어가요)", eoTitle: "일찍 퇴근해요", eoLbl: "일찍 퇴근하는 사유 (사유서에 들어가요)", loRelief: "교대자가 늦게 와서 (업무) · 확인서", loWork: "업무상 이유 · 확인서", loPersonal: "개인 사유 · 사유서 (추가 급여 없음)", whoLbl: "누구 때문인가요? (For who?)", whoHelp: "선택한 직원에게 확인 알림이 가요.", whoNeed: "직원을 선택해 주세요", whoSent: "저장했어요 · 관리자 승인 대기 · {n}에게 확인 알림을 보냈어요", mnTitle: "확인 요청", mnCover: "{n}님이 {t}에 '당신이 일찍 퇴근해서 일찍 출근했다'고 적었어요. 맞나요?", mnRelief: "{n}님이 {t}에 '당신이 늦게 와서 늦게 퇴근했다'고 적었어요. 맞나요?", mnYes: "맞아요", mnNo: "아니에요", lt_conf: "확인서", loTitle: "늦게 퇴근해요", loQ: "왜 늦게 퇴근하나요?", loYes: "네, 업무 때문에 (오버타임 동의서 · 추가 급여)", loNo: "아니요, 개인 사유 (사유서 · 추가 급여 없음)", cbQ: "업무상 이유가 캐시북(장부 마감)인가요?", cbYes: "네, 캐시북 / 장부 마감", cbNo: "아니요, 다른 업무", cbMsg: "장부 마감은 퇴근 시간 전에 모두 끝내야 해서 초과근무로 인정되지 않아요 (반려). 퇴근은 그대로 기록돼요.", rsnWork: "업무 내용 (오버타임 동의서에 들어가요)", rsnPersonal: "사유 (사유서에 들어가요)", lt_ot: "오버타임 동의서", lt_ex: "사유서", eqTitle: "일찍 출근했어요", eqQ: "왜 일찍 출근했나요?", eqYes: "네, 업무 때문에 (추가 급여 · 사유 적기)", eqNo: "아니요, 개인 사유 (집이 가까워서 등) · 정상 시간으로 기록", rsnTitle: "스케줄과 다른 시간이에요", rsnPlan: "스케줄", rsnNow: "지금", rsnLate: "{n}분 늦음", rsnEarly: "{n}분 일찍", rsnNoShift: "오늘 스케줄 없음", rsnLbl: "사유 (필수)", rsnPh: "예: 교통 체증으로 늦었습니다 / 손님이 많아 늦게 퇴근했습니다", rsnNeed: "사유를 적어 주세요", rsnSend: "사유 저장하고 찍기", rsnSent: "저장했어요 · 관리자 확인 대기", st_pending: "확인 대기", st_approved: "승인", st_rejected: "반려", rv_title: "출퇴근 사유 확인", rv_help: "스케줄과 1분이라도 다른 출퇴근은 직원이 사유를 적고, 관리자가 승인해야 확정돼요. 늦은 출근은 승인하면 사유 인정으로 정상 출근 처리되어 차감이 없고, '확인됨'(사유 불인정)이나 확인 전이면 늦은 시간만큼 급여에서 빠져요. 일찍 출근은 직원이 '업무 때문'을 고르고 사유를 적은 경우만 승인 대상이고, 승인하면 일찍 온 시간만큼 더 지급돼요('개인 사유'를 고르면 정상 시간으로 기록). 늦은 퇴근은 승인하면 늦게 남은 시간만큼 초과근무로 더 지급되고(1분 단위), 확인 전이나 '확인됨'이면 지급 안 돼요.", rv_none: "확인할 사유가 없어요", rv_void: "무효 (잘못 누름)", rv_ok: "승인", rv_no: "확인됨", rv_st_rejected: "확인됨", rv_print: "사유서 인쇄", rv_done: "최근 처리 (30일)", rv_letter: "사유서", myEst: "이번 급여 예상", myEstNote: "안내: 스케줄표 기준이므로 달라질 수 있으며, 공제금(가불·법정 공제 등)이 있으면 금액 보정이 있을 수 있습니다.", myEstDays: "스케줄 {n}일 기준", myCalc: "내 급여 계산기 (예상)", myCalcHelp: "스케줄표 기준으로 미리 채워져 있어요 (바꿔서 계산해 볼 수 있어요). 시프트만 넣으면 예상 급여가 나와요. 가불·보너스·부족분은 빠져 있고, 실제 금액은 지급된 급여명세서 기준이에요.", est: "예상 실수령액",
    sched_tap: "눌러서 이 날 출퇴근 수정", sched_editHelp: "출근·퇴근 시각을 고치거나 지우고, 빠진 기록은 아래에서 추가 (밤 근무 퇴근은 다음날 날짜로)", sched_help: "칸을 누르면 그 날 출퇴근을 고칠 수 있어요. 위 줄 = 급여에 들어가는 시간 (승인·반려 반영, ⏳ = 확인 대기), 작은 줄 = 실제 찍은 시간 (다를 때만), 아래 회색 = 계획 (웨이터는 캐시북 스케줄, 주방·라이더는 관리자 입력 근무표). 노란 칸 = 퇴근 전/기록 한쪽 없음.", sched_legend: "실제 / 계획", sched_real: "실제", sched_none: "—", mySched: "내 스케줄 (캐시북)", mySchedHelp: "오늘부터 2주 · 캐시북에 올라온 계획", sched_today: "오늘",
    myInfo: "내 정보", myInfoHelp: "연락처·주소·급여 받을 계좌·정부 번호는 직접 고칠 수 있어요. 이름·직책·급여는 관리자만 바꿀 수 있어요.", infoSaved: "내 정보를 저장했어요", empInfo: "직원 정보 (직원이 직접 수정 가능)", i_phone: "휴대폰", i_address: "주소", i_gcash: "GCash 번호", i_bank_name: "은행", i_bank_acct: "계좌번호", i_sss: "SSS 번호", i_philhealth: "PhilHealth 번호", i_pagibig: "Pag-IBIG 번호", i_tin: "TIN", i_emergency_name: "비상 연락 (이름·관계)", i_emergency_phone: "비상 연락 번호", myPay: "내 급여명세서", myLedger: "내 가불·부족분", myShifts: "내 근무 기록", notPaidYet: "아직 지급 전", noData: "아직 기록이 없어요", empNoLbl: "번호", resetPin: "PIN 초기화 (0000)", pinReset: "PIN을 0000으로 초기화했어요. 다음 로그인 때 본인이 다시 등록해요.", pinSet: "PIN 등록됨", pinNotSet: "PIN 미등록 (0000)",
  },
  en: {
    ackBtn: "I confirm", ackFirst: "Open your payslip and check it first", ackQ: "Have you checked your payslip (hours, amounts, deductions)?", ackDone: "Confirmed ✓ {d}", ackPill: "Employee confirmed ✓", ackWait: "Not yet confirmed",
    myFinal: "Your payslip (final)", myFinalOpen: "View payslip", cardCol: "Time card",
    share: "Finalize · show to staff", unshare: "Undo finalize", sharedPill: "Final", sharedStaff: "Final · to be paid", shareHelp: "Finalizing locks the figures and shows this payslip to the employee",
    emp_full: "Full name (for payslips)", emp_fullHelp: "Printed on payslips. Empty = the name above", emp_resigned: "Resigned on", emp_resignedHelp: "Removes them from payroll & schedule lists. Staff login stays open until 7 days after the 13th-month payment, then closes", resign13: "Final pay · 13th month", resign13Help: "Basic earned in the year of resignation ÷ 12. Due within 30 days of separation (DOLE LA 06-20)", resignDue: "Due by {d}", accessUntil: "Staff login until {d}", accessOpen: "Login closes 7 days after the 13th-month payment", pinClosed: "Your account was closed after resignation", punchResigned: "You can't clock in or out after your resignation date", resignedTag: "Resigned {d}",
    app: "Paltong Payroll", login: "Sign in", id: "ID", pw: "Password", logout: "Sign out", changePw: "Change password", newPw: "New password (6+ chars)",
    tab_pay: "Payroll", tab_sched: "Schedule", tab_emp: "Staff", tab_ledger: "Advances · shortages · bonuses", tab_hist: "History", tab_13: "13th month", tab_set: "Settings",
    y13: "Year", y13help: "13th-month pay = total basic salary earned in the year ÷ 12 (under a year: whatever was earned = automatic pro-rata) · due by Dec 24. Basic excludes OT, holiday extras, maintenance allowance and bonuses. Adds payrolls saved in the app (paid + draft); basic earned before the app is entered manually in the Staff tab.",
    c13_basicApp: "Basic (app)", c13_basicBefore: "Before app", c13_total: "Total basic", c13_periods: "Periods", c13_amount: "13th (÷12)", c13_avg: "Monthly avg (1yr+)", c13_proj: "Year-end est.", c13_status: "Paid", c13_pay: "Record payment", c13_paid: "Paid", c13_unpaid: "Unpaid", c13_unpay: "Undo",
    c13_projHelp: "Year-end estimate = current average basic per half-month × remaining half-months, added, ÷ 12 (reference only)", c13_total_row: "Total", c13_draftNote: "includes draft payrolls",
    emp_before: "Basic earned this year before the app (for 13th month)", emp_beforeHelp: "Basic salary received Jan–Sep this year before the app (no OT / allowances). 0 if unknown",
    sil_title: "Paid leave (SIL)", lv_title: "Leave request", lv_help: "Choose the type and the first and last day — the whole period is sent at once (up to 14 days). 7 or more days ahead and 4 days or less → approved right away and put in the schedule. Less than 7 days ahead, or 5 days or more → the manager approves it.", lv_kind: "Type", lv_off: "1 Day off", lv_sil: "SIL", lv_mpv: "Monthly paid vacation", lv_offS: "Day off (unpaid)", lv_off7: "A day off must be requested at least 7 days ahead (from {d})", pend_title: "🔔 Waiting for approval", push_ask: "📲 Get request/approval alerts on this phone", push_on: "Turn on push", push_later: "Later", push_done: "✅ Push is on — a test alert was sent", push_ios: "On iPhone: Share → Add to Home Screen first, then open from the icon and tap again", push_unsup: "This browser does not support push (use Chrome on Android)", push_denied: "Notifications are blocked — allow them in the browser site settings", push_menu: "🔔 Push alerts", push_state_on: "This device: on ✅", push_state_off: "This device: off", push_test: "Send test", push_off: "Turn off on this device", push_devices: "{n} device(s)", pend_leave: "Leave {n}", pend_punch: "Clock reasons {n}", pend_cash: "Cash shortage {n}", lv_silS: "Paid leave · {n} left", lv_mpvS: "Perfect attendance · {n}", k_lv_off: "Day off", k_lv_sil: "SIL", k_lv_mpv: "Monthly paid vacation", lv_from: "First day", lv_to: "Last day (empty = one day)", lv_days: "{n} day(s) · {d}", lv_q: "Request {k} · {d} ({n} day(s))? {w}", lv_qAuto: "It is approved right away and put in the schedule.", lv_qShort: "Less than 7 days ahead, so the manager must approve it.", lv_qLong: "5 days or more, so the manager must approve it.", lv_auto: "✅ Approved · added to the schedule", lv_manual: "Sent · waiting for the manager", lv_pickKind: "Choose the type", lv_max: "Up to 14 days per request", lv_order: "The last day is before the first day", lv_noMpv: "No monthly paid vacation for {m} ({n} available)", lv_alreadyOff: "{d}: already a day off", lv_warn: "⚠️ Schedule rules", mpv_title: "Monthly paid vacation (Contract §3.2)", mpv_help: "No unauthorized absence and no tardiness of 1 minute or more in a month → 1 paid leave day you can use in the next month. It is added automatically, ends after the last day of that next month, and cannot be converted to cash. It is decided when both payrolls of the month are final.", mpv_row: "{m} perfect → use in {c}", mpv_st_counting: "This month — in progress", mpv_st_waiting: "Decided after payroll", mpv_st_none: "Not perfect", mpv_st_available: "1 day available · until {e}", mpv_st_pending: "Request pending", mpv_st_used: "Used {d}", mpv_st_expired: "Expired", mpv_col: "Monthly vac.", intro_rewatch: "Watch the app video again", intro_sub: "This video explains the app. Watch it to the end and confirm to continue.", intro_err: "The video could not load. Check the internet connection and open the app again.", sig_contract: "Sign exactly the same as your signature on your contract.", sig_previewQ: "Is this the same as your contract signature? You cannot change it after saving.", bd_title: "🎂 Birthday incentive (automatic)", bd_help: "If there is no late, early-out or absence in the 3 months before the birthday, a ₱{a} bonus dated the birthday is added automatically (paid in the cutoff with the birthday). Decided on the birthday; the result and the reason stay here. Birthdays are set in the Staff tab or by the employee in My info.", bd_paid: "Paid ₱{a}", bd_denied: "Not paid", bd_norec: "Not enough records (check by hand)", bd_ok: "Upcoming · no problem so far", bd_bad: "Upcoming · has a problem", bd_none: "No employee has a birthday entered", bd_missing: "No birthday: {n}", sig_title: "Please sign first", sr_title: "Request paid leave (SIL)", sr_help: "Pick the days you want off and send the request; the manager approves it. Once approved the day is SIL in the schedule and it is paid. You can request from tomorrow.", sr_day: "Date", sr_reason: "Reason (optional)", sr_send: "Request SIL", sr_q: "Request {n} day(s): {d}? It is final after the manager approves.", sr_done: "Requested · waiting for the manager", sr_left: "{n} day(s) available", sr_list: "My leave requests", sr_cancel: "Cancel request", sr_need: "Pick a date", sr_past: "{d}: only dates from tomorrow up to 6 months ahead", sr_dup: "{d}: already SIL or already requested", sr_nobal: "Not enough SIL left ({n} day(s) available)", st_cancelled: "Cancelled", sr_adminTitle: "🌴 Leave requests", sr_adminHelp: "Requests 7+ days ahead and 4 days or less are approved automatically and only listed here. Requests less than 7 days ahead or 5+ days long need your approval (the whole period at once). Day off → OFF (unpaid) · SIL and monthly paid vacation → SIL (paid; the Cash Book shows off). Day-off requests that break schedule rules show ⚠️.", sr_none: "No SIL requests to check", sr_curPlan: "Current schedule", sr_leftAfter: "{n} SIL day(s) left", sig_help: "Sign with your finger in the box below. This signature goes on explanation letters, confirmations, cash-advance slips and payslips you confirmed. Once saved you cannot change it yourself (only the admin can reset it).", sig_clear: "Clear", sig_save: "Save signature", sig_empty: "Please sign", sig_saved: "Signature saved", sig_mine: "My signature", sig_on: "Signature on file {d}", sig_off: "No signature", sig_reset: "Reset signature", sig_resetDone: "Signature removed. They sign again at next sign-in.", doc_title: "📁 Documents", doc_help: "Keep COE, contracts and other PDFs or photos here (max 8MB each). Only the owner can see them.", doc_name: "Document name", doc_namePh: "e.g. COE", doc_file: "File (PDF / photo)", doc_up: "Upload", doc_none: "No documents yet", doc_open: "Open", doc_need: "Choose a file", doc_big: "The file is too big (max 8MB)", doc_type: "Only PDF, PNG, JPG or WEBP", doc_saved: "Document saved", doc_delQ: "Delete this document?", doc_loading: "Loading…", doc_needTbl: "Documents are not set up in the database yet (run supabase/pr_docs.sql)", stab_home: "Home", stab_adv: "Advance", adv_title: "Request a cash advance", adv_help: "Requests are approved automatically. It is deducted from the payroll that includes the request date. Cash is given at the restaurant; GCash is sent to your GCash. It is also recorded in the Cash Book automatically.", adv_via: "How do you want to receive it?", adv_cash: "💵 Cash", adv_gcash: "📱 GCash", adv_viaNeed: "Choose Cash or GCash", adv_viaL: "via {v}", adv_amount: "Amount (₱)", adv_reason: "Reason (optional)", adv_send: "Request advance", adv_q: "Request a ₱{a} advance by {v}? It is approved automatically and deducted from the {p} payroll.", adv_done: "Advance requested · auto-approved", adv_bad: "Enter an amount of at least 1", adv_lim: "Advance limit this cutoff", adv_limHelp: "Limit = your pay this cutoff ({d} scheduled days) − deductions due − advances already taken", adv_limM: "Limit = half your monthly salary − deductions due − advances already taken", adv_pay: "Pay this cutoff", adv_dLate: "Late deduction ({m} min)", adv_dShort: "Cash shortage", adv_dOther: "Other deductions", adv_dGov: "Statutory (SSS etc.)", adv_left: "You can request", adv_usedL: "Already taken", adv_over: "Over the limit. You can request up to ₱{a} more this cutoff.", adv_none: "No more advances this cutoff (limit used up or no schedule).", adv_list: "My advances", adv_print: "Advance slip", adv_app: "📱 app request", adv_needSig: "Please register your signature first", sil_selfT: "SIL already used this year", sil_selfHelp: "Enter only the days NOT already recorded in the app (half day = 0.5). Do not count the 'already recorded' days below. ⚠️ Once saved you cannot change it. If it is wrong, tell the admin.", sil_selfRec: "SIL already recorded in the app (do not count these): {d}", sil_selfRecNone: "No SIL recorded in the app yet", sil_selfQ: "Save {n} SIL days already used this year? You cannot change it after saving.", sil_selfDone: "Saved · {n} days ({d}) · ask the admin to change it", sil_locked: "Already saved, so you cannot change it. Please tell the admin.", sil_bad: "Enter a number from 0 to 30 (steps of 0.5)", sil_selfAdm: "entered by staff {d}", sil_help: "Service Incentive Leave (SIL): base days − days used = days left. Days set as SIL in the schedule are shown separately as planned. The monthly paid vacation (Contract §3.2) is counted separately.", sil_base: "Base", sil_before: "Used before the app", sil_earned: "Perfect +", sil_used: "Used", sil_planned: "Planned", sil_left: "Left", sil_months: "Perfect attendance", sil_perfect: "Perfect ✓ → +1 in {c}", sil_not: "late / absent", sil_none: "none yet", sil_dates: "Days used", sil_plDates: "Planned days", p13_title: "13th month (estimate if you work until December)", p13_help: "Basic pay from this year's finalized/paid payrolls, plus the remaining periods up to December 31 at your average basic pay (as if you keep working). No OT, night diff, premiums or incentives.", p13_req: "You can request it from November 7", p13_open: "View 13th-month slip", p13_ack: "I confirm", p13_acked: "Confirmed {d}", p13_period: "Period", p13_basic: "Basic pay", p13_estRow: "estimate", p13_sum: "Total basic (to December)", p13_by12: "Total ÷ 12", p13_avgM: "One-month average (1 year+ of service)", p13_final: "Estimated 13th month", p13_note: "This is an estimate assuming you work until December. It may change with your actual work; the final amount is what the manager records when paying.", p13_due: "13th month (if working until December)", p13_dueHelp: "Same calculation as the staff screen: basic pay from finalized payrolls + remaining periods at the average. Shows when the employee viewed the slip and pressed confirm.", p13_notAck: "not yet", p13_toDate: "so far", my13: "My 13th-month pay", my13help: "Estimate from the basic pay (no OT, night diff, premiums, maintenance or incentives) of payrolls paid this year. 1 year+ of service = one month average; under a year = total ÷ 12. Paid by Dec 24. The final amount is what the admin records.", my13_basic: "Basic pay this year ({n} payrolls)", my13_by12: "÷ 12 (under 1 year)", my13_avg: "One-month average (1 year+)", my13_est: "Estimated 13th month", my13_1yr: "1 year+", my13_under: "under 1 year",
    employee: "Employee", period: "Pay period", first: "1st – 15th", second: "16th – 30th", month: "Month",
    daily: "Daily rate", monthlyRate: "Monthly salary (OT-inclusive)", breakH: "Meal break (hrs/day)", allowDay: "Maintenance (₱/duty day)",
    roster: "Half-month shift roster", off: "Off", wkend: "Weekend",
    type_regular: "Worked", type_half: "Half day (½)", type_rest: "Rest day worked (130%)", type_special: "Special holiday worked (+30%)", type_specialRest: "Special holiday + rest day (150%)", type_holiday: "Regular holiday worked (+1 day)", type_holidayRest: "Regular holiday + rest day (260%)", type_holidayOff: "Regular holiday off (1 day)", type_sil: "Paid leave (1 day)", type_absent: "Absent (deducted)", type_off: "Off",
    fill: "Fill", fillHelp: "\"Load app clock-ins\" fills each date with the in/out times the employee tapped in the app (the attendance record). Fill the rest with a shift or the Cash Book schedule; tap a date to make it a day off.",
    restDay: "Weekly rest day", dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    custom: "Time card (enter times)", inT: "In", outT: "Out", otDay: "OT", otAuto: "Empty = from the shift (10h base + 1h break, the rest is OT · 12h = 1h OT) · type the card figure to override",
    late: "Tardiness / undertime (minutes)", lateHelp: "daily ÷ 10 ÷ 60 · per minute ₱", lateHelpC: "actual unworked minutes only (daily ÷ 8 ÷ 60) · per minute ₱", incentive: "Manual incentive / allowance (+)", other: "Other deductions (−)",
    deductions: "Deductions · bonuses", payout: "Payout", payoutVia: "Paid via", payoutSplit: "Part by GCash / bank (amount)", payoutRest: "rest in cash", payoutHelp: "Shows on the payslip as 'Paid: GCash 5,000 + Cash 2,075'. The number comes from the employee's info (GCash / bank account).", payLine: "Paid", ledgerAuto: "Applied automatically this period (advances · shortage · bonuses)", none: "none",
    gov: "Statutory deductions (employee share)", perMonth: "mo", govFixed: "Fixed statutory deductions (monthly, employee share)", govFixedHelp: "Monthly amount actually remitted — half is deducted each payroll. Leave empty for none (ticking it on the payroll screen uses the table estimate)", govShare: "Half each payroll (15th & 30th)", govFull: "Whole month once, on the 30th payroll", govHelp: "The month's contribution comes out of that month's pay (half each = half on the 15th and half on the 30th / once = all on the 30th). Uses the fixed amount from the Staff tab, otherwise the reference SSS 5% · PhilHealth 2.5% · Pag-IBIG 2% (max ₱200)",
    result: "Computation", basic: "Basic pay (days × daily)", basicC: "Basic pay (hours × hourly)", basicM: "Basic pay (monthly ÷ 2)", premium: "Holiday extra (special +30% · regular +1 day)", premiumC: "Rest-day / holiday premium", ot: "Overtime (hours × daily÷{h})", otC: "Overtime 125%", nd: "Night differential (10%)", otIncl: "Overtime (within the built-in 1h/day · not paid separately)", otExtra: "Overtime (beyond the built-in 1h/day · 125%)", basicSplit: "　└ basic {b} + built-in OT {o}", penalty: "Late penalty (same as late amount)",
    silPay: "Paid leave", holOff: "Regular holiday paid (not worked)", allowance: "Motorcycle maintenance ({d} days × ₱{a})", absentDed: "Absence deduction ({d} days)",
    lateDed: "Tardiness / undertime", gross: "Gross pay", dedHead: "── Deductions ──", dedTotal: "Total deductions", otherManual: "manual entry (payroll screen)", govSSS: "SSS (employee share)", govPH: "PhilHealth (employee share)", govPI: "Pag-IBIG (employee share)", adv: "Cash advances (CA)", shortage: "Cash shortage", bonus: "Bonus (highest-sales day · new menu)", net: "Net pay",
    summary: "{d} days{hd} · OT {o}h · leave {s} days", summaryC: "{d} days · {h}h · OT {o}h · night {n}h · leave {s} days", halfSum: " + {n} half", netLbl: "Net pay",
    for13: "Basic for 13th-month pay", riderNote: "Delivery fee & fuel are paid same day in cash (cash book Staff tab) · not part of payroll", monthlyNote: "₱30,000 = basic 25,945 + built-in OT 4,055 (1h/day within 08–18) · daily 994.70 · hourly 124.34 · other OT (after 18:00), rest day 130%, holidays and night diff paid on top · absence & tardiness at the daily/hourly rate · 13th month on the basic 25,945",
    save: "Save", saved: "Saved", markPaid: "Record as paid", paid: "Paid", draft: "Draft", unpay: "Undo paid", paidOn: "Paid on", paidVia: "Paid via", slip: "Payslip", print: "Print", printSimple: "Print simple (58mm)", printA4: "Print detail (A4)", printBatch: "Print all (6 per A4)", delete: "Delete", confirmDel: "Delete this?", yes: "Delete", cancel: "Cancel", no: "No", ok: "Yes", close: "Close",
    emp_add: "Add employee", emp_name: "Name", emp_pos: "Position", pos_waiter: "Waiter / Server", pos_kitchen: "Kitchen", pos_rider: "Rider", pos_other: "Other",
    emp_status: "Employment status", st_regular: "Regular", st_probationary: "Probationary", st_fixed: "Fixed-term", st_other: "Other", emp_hired: "Date hired", emp_bday: "Birthday", emp_active: "Active", emp_note: "Note",
    emp_payType: "Pay type", pt_daily: "Daily", pt_monthly: "Monthly (OT-inclusive)",
    led_add: "Add record", led_kind: "Kind", k_advance: "Advance", k_shortage: "Cash shortage", k_bonus: "Bonus (+)", k_other: "Other deduction", led_date: "Date", led_amount: "Amount", led_note: "Note", led_noteKo: "Note (Korean)", led_noteEn: "Note (English)", led_noteHelp: "Shown when the app or payslip is in English (falls back to the Korean note)",
    led_verified: "Investigated · responsibility established", led_auth: "Written authorization on file", led_applies: "→ applied to {p} payroll", led_deducted: "applied", led_pending: "pending", led_filter_all: "All",
    bonusHint: "Contract §6 highest-sales-day bonus = the period's top sales day × 2% ÷ staff who worked that day (button below computes it from the cash book + clock-ins) · kitchen new menu ₱500 (§5) · birthday incentive ₱500 (§3.4, 3 perfect months) · perfect month → 1 paid leave day (§3.2) as day type 'Paid leave'",
    topBonus: "Compute highest-sales-day bonus", topTitle: "Highest-sales-day bonus (contract §6)", topDay: "Highest-sales day", topSales: "Total sales", topPool: "Pool (2%)", topEach: "Each", topStaff: "On duty that day (from clock-ins) — untick to exclude", topSave: "Save as bonuses", topNone: "No cash book sales in this period", topDone: "Saved ₱{a} bonus for {n} staff (applied to the payroll of that period)", topExists: "A highest-sales-day bonus is already saved for this period",
    hist_empty: "No saved payrolls yet. Save one from the Payroll tab.", total: "Total",
    holReg: "regular holiday", holSp: "special day", hol_title: "Holiday calendar", hol_help: "Days listed here are included in payroll automatically. Worked: special day 130% · regular holiday 200% (on a rest day 150% / 260%); a regular holiday not worked is paid 100%. Add new ones (e.g. Eid al-Fitr) when they are announced.", hol_add: "Add", carryIn: "↩ carried", carryInNone: "excluded", carryOut: "→ next pay", carryHelp: "Pay periods are 1–15 and 16–30. In a 31-day month the 16–30 pay covers work up to the 29th's night shift (clock-out on the morning of the 30th). All work on the 30th (day or night) and the 31st is carried into the next 1–15 payroll automatically (rows marked ↩).",
    tab_due: "To pay", due_help: "Calculated automatically, nothing to save: Cash Book schedule + app clock-ins (actual times where present) + advances, bonuses, shortages, gov deductions. Staff already saved in the Payroll tab use what was saved. Net = gross − deductions. Tap a name to open it.",
    due_total: "Total to pay", due_people: "{n} payslips", due_payday: "Pay day {d}", due_overdue: "Past pay day", due_byVia: "By payout method",
    due_ppl: "{n} staff", due_auto: "auto", due_saved: "saved", due_days: "Worked", due_calc: "Calculating from the schedule…", due_paidX: "{n} already paid, not included: {names}", due_prev: "Earlier periods not paid yet (saved)", due_cnt: "Staff", due_gross: "Gross", due_ded: "Deductions", due_net: "Net pay", due_list: "Per employee", due_missingHelp: "Save them to include them in the total.",
    due_missing: "Not saved yet this period ({p})", due_empty: "Nothing left to pay — every saved payroll is paid.",
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
    a2h_title: "Add to Home Screen", a2h_btn: "Add to Home Screen", a2h_later: "Later", a2h_ios: "Tap the Share button ⬆️ below → 'Add to Home Screen' to open it like an app.", a2h_other: "Open the browser menu ⋮ → 'Add to Home screen' or 'Install app'.", a2h_inapp: "You can't add it from inside Messenger. Tap ⋯ (top right) → 'Open in browser' (Chrome/Safari), then add it.", awayErr: "You can only clock in/out at the restaurant. Connect to the restaurant Wi-Fi or turn on your phone's location (GPS) and try again.", locWait: "Checking location…", sg_title: "Clock in/out only at the restaurant", sg_help: "When on, clocking works only on the restaurant Wi-Fi (registered internet) or inside the restaurant radius (GPS). If the internet provider changes the restaurant's address, press 'register this internet' again at the restaurant.", sg_on: "On", sg_ips: "Registered restaurant internet", sg_ipAdd: "Register this internet as the restaurant (on the restaurant Wi-Fi)", sg_loc: "Restaurant location", sg_locSet: "Set my current location as the restaurant (at the restaurant)", sg_radius: "Allowed radius (m)", sg_none: "none", sg_locErr: "Couldn't get the location. Please allow location access.", rulesTitle: "Attendance rules (short)", rules: ["Early in: ① your previous-shift coworker left early → pick their name (confirmation; they get an alert) · paid if approved ② to avoid being late (personal) → confirmation, recorded as normal time.", "Late in: write the reason (explanation letter). The late time is deducted, and no perfect-attendance SIL bonus that month.", "Early out: write the reason (explanation letter). Paid only up to your clock-out.", "Late out: ① your next-shift coworker came late → pick their name (confirmation, alert) ② work reason (confirmation) → paid if approved ③ personal reason (explanation letter) → no extra pay.", "Extra pay is counted per minute and only after the manager approves."], rulesHall: "Hall staff: staying late for closing / the Cash Book is rejected. The books must be closed before your shift ends.", eqCover: "My previous shift coworker left early (work) · confirmation", eqPersonal: "To avoid being late (personal) · confirmation · recorded as normal time", liTitle: "You are late", liLbl: "Reason for being late (goes on the explanation letter)", eoTitle: "You are leaving early", eoLbl: "Reason for leaving early (goes on the explanation letter)", loRelief: "My next shift coworker came late (work) · confirmation", loWork: "Work reason · confirmation", loPersonal: "Personal reason · explanation letter (no extra pay)", whoLbl: "For who?", whoHelp: "The coworker you pick gets a confirmation alert.", whoNeed: "Please pick a coworker", whoSent: "Saved · waiting for the manager · {n} got a confirmation alert", mnTitle: "Please confirm", mnCover: "{n} wrote that they came in early on {t} because you (previous shift) left early. Is that right?", mnRelief: "{n} wrote that they stayed late on {t} because you (next shift) came late. Is that right?", mnYes: "Yes, that's right", mnNo: "No", lt_conf: "Confirmation", loTitle: "You are leaving late", loQ: "Why are you leaving late?", loYes: "Yes, for work (overtime agreement · extra pay)", loNo: "No, personal (explanation letter · no extra pay)", cbQ: "Is the work reason the Cash Book (closing the books)?", cbYes: "Yes, Cash Book / closing", cbNo: "No, other work", cbMsg: "The Cash Book must be fully closed before your shift ends, so this is not counted as overtime (rejected). Your clock-out is still recorded.", rsnWork: "What work (goes on the overtime agreement)", rsnPersonal: "Reason (goes on the explanation letter)", lt_ot: "Overtime agreement", lt_ex: "Explanation letter", eqTitle: "You are early", eqQ: "Why did you come in early?", eqYes: "Yes, for work (extra pay · write the reason)", eqNo: "No, personal (e.g. I live nearby) · record as normal time", rsnTitle: "This is different from your schedule", rsnPlan: "Schedule", rsnNow: "Now", rsnLate: "{n} min late", rsnEarly: "{n} min early", rsnNoShift: "No shift scheduled today", rsnLbl: "Reason (required)", rsnPh: "e.g. Heavy traffic / Stayed late because the restaurant was busy", rsnNeed: "Please write the reason", rsnSend: "Save reason and clock", rsnSent: "Saved · waiting for the manager", st_pending: "Waiting", st_approved: "Approved", st_rejected: "Rejected", rv_title: "Clock-in/out reasons", rv_help: "Any clock in/out that differs from the schedule (even 1 minute) needs a written reason from the employee and the manager's approval. An approved late clock-in counts as on time (reason accepted, no deduction); if marked 'Noted' (reason not accepted) or still pending, the late time is deducted. An early clock-in needs approval only when the employee chose 'for work' and wrote a reason; if approved, the early time is paid ('personal' is recorded as normal time). An approved late clock-out is paid as overtime for the extra time (per minute); pending or 'Noted' is not paid.", rv_none: "Nothing to review", rv_void: "Void (pressed by mistake)", rv_ok: "Approve", rv_no: "Noted", rv_st_rejected: "Noted", rv_print: "Print letter", rv_done: "Recently decided (30 days)", rv_letter: "Explanation letter", myEst: "Expected pay this period", myEstNote: "Note: based on the schedule, so it may change. If there are deductions (cash advances, statutory contributions, etc.), the amount may be adjusted.", myEstDays: "based on {n} scheduled days", myCalc: "My pay calculator (estimate)", myCalcHelp: "Pre-filled from the schedule (you can change it). Enter your shifts to see an estimate. Advances, bonuses and shortages are not included; the paid payslip is the official amount.", est: "Estimated net pay",
    sched_tap: "Tap to edit this day's clock records", sched_editHelp: "Fix or delete the in/out times, add a missing one below (an overnight clock-out goes on the next date)", sched_help: "Tap a cell to edit that day's clock records. Top line = time that goes into pay (approve / reject applied, ⏳ = waiting), small line = actual clock time (only when different), grey line = plan (waiters: Cash Book schedule; kitchen & riders: roster entered by admin). Yellow = not clocked out / one side missing.", sched_legend: "actual / plan", sched_real: "actual", sched_none: "—", mySched: "My schedule (Cash Book)", mySchedHelp: "Next 2 weeks · as planned in the Cash Book", sched_today: "today",
    myInfo: "My info", myInfoHelp: "You can update your contact, address, payout account and government numbers yourself. Name, position and pay are changed by the admin only.", infoSaved: "Your info is saved", empInfo: "Employee info (the employee can edit this)", i_phone: "Mobile", i_address: "Address", i_gcash: "GCash number", i_bank_name: "Bank", i_bank_acct: "Account number", i_sss: "SSS no.", i_philhealth: "PhilHealth no.", i_pagibig: "Pag-IBIG no.", i_tin: "TIN", i_emergency_name: "Emergency contact (name · relation)", i_emergency_phone: "Emergency contact number", myPay: "My payslips", myLedger: "My advances & shortages", myShifts: "My shifts", notPaidYet: "not paid yet", noData: "Nothing yet", empNoLbl: "No.", resetPin: "Reset PIN (0000)", pinReset: "PIN reset to 0000. They set a new one at next sign-in.", pinSet: "PIN set", pinNotSet: "PIN not set (0000)",
  },
};
let lang = "ko"; try { lang = localStorage.getItem("pp-lang") || "ko"; } catch {}
const t = k => I18N[lang][k] ?? I18N.ko[k] ?? k;
const pinErr = (err, fallback = "pinWrong") => t(err === "locked" ? "pinLocked" : err === "closed" ? "pinClosed" : err === "resigned" ? "punchResigned" : fallback);
// 재직 중이거나, 이 기간 시작일 이후 퇴사한 직원 (마지막 급여 계산용)
const onPayroll = (e, start) => e.active || (!!e.resigned_on && e.resigned_on >= start);
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
const noteOf = l => !l ? "" : lang === "en" ? (l.note_en || l.note || "") : (l.note || l.note_en || "");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const periodLabel = (s, e) => `${s.slice(0, 7)} · ${+s.slice(8) === 1 ? t("first") : t("second")}`;
let toastT; function toast(msg) { const el = document.getElementById("toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2200); }
function sheet(content) {
  const root = document.getElementById("sheetRoot"); root.innerHTML = "";
  const bg = h("div", { class: "sheet-bg", onclick: e => { if (e.target === bg) close(); } }, h("div", { class: "sheet" }, content));
  const close = () => root.innerHTML = ""; root.append(bg); return close;
}
// opts.ask = true → 질문용 (아니요 / 네), 기본은 삭제 확인 (취소 / 삭제)
function confirmSheet(msg, onYes, opts = {}) {
  const ask = !!opts.ask;
  const close = sheet([h("h3", {}, msg), h("div", { class: "row" }, h("span", { class: "sp" }),
    h("button", { class: "btn", id: ask ? "ask-no" : null, onclick: () => close() }, t(ask ? "no" : "cancel")),
    h("button", { class: "btn " + (ask ? "primary" : "danger"), id: ask ? "ask-yes" : null, onclick: () => { close(); onYes(); } }, t(ask ? "ok" : "yes")))]);
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

let HOL = {};
async function boot() {
  const ok = await db.init();
  try { HOL = Object.fromEntries((await db.listHolidays()).map(x => [x.day, x])); } catch {}
  if (!ok) {
    // staff phone that signed in before → straight in, until Sign out
    let no = ""; try { no = localStorage.getItem("pp-empno") || ""; } catch {}
    if (loginMode === "staff" && no && savedTok()) return staffSignIn(no, "tok:" + savedTok());
    return renderLogin();
  }
  S.user = await db.me();
  S.settings = await db.getSettings().catch(() => ({ min_wage: 718, break_hours: 1, sss_on: false, philhealth_on: false, pagibig_on: false, gov_share: 0.5, rider_allowance: 100, kitchen_monthly: 30000 }));
  S.employees = await db.listEmployees(true);
  try { S.sigs = await db.listSignatures(); } catch { S.sigs = {}; }
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
const EMP = { no: "", pin: "", data: null, tab: "home" };
function renderStaffLogin(err, typedNo) {
  let last = typedNo || ""; if (!last) try { last = localStorage.getItem("pp-empno") || ""; } catch {}
  const no = h("input", { type: "text", id: "eno", inputmode: "numeric", autocomplete: "username", placeholder: "00001", value: last });
  const pin = h("input", { type: "password", id: "epin", inputmode: "numeric", autocomplete: "current-password", maxlength: 6, placeholder: "••••" });
  const form = h("form", { onsubmit: async e => { e.preventDefault(); await staffSignIn(no.value, pin.value); } },
    h("div", { class: "card" }, h("h1", {}, t("app")), modeSwitch(), field(t("empNo"), no), field(t("pin"), pin, t("pinFirst")), err && h("div", { class: "err", id: "elogin-err" }, err),
      h("button", { class: "btn primary", type: "submit", id: "elogin" }, t("login")), langSwitch()));
  root.innerHTML = ""; root.append(h("div", { class: "login" }, form));
}
/* staying signed in: after a PIN sign-in the phone keeps a device token (never the PIN) until Sign out */
const TOK_KEY = "pp-emp-tok";
const savedTok = () => { try { return localStorage.getItem(TOK_KEY) || ""; } catch { return ""; } };
const saveTok = tok => { try { tok ? localStorage.setItem(TOK_KEY, tok) : localStorage.removeItem(TOK_KEY); } catch {} };
async function staffSignIn(no, pin) {
  const auto = String(pin).startsWith("tok:");
  try {
    await db.init();
    const v = await db.empView(no, pin);
    if (!v.ok) { if (auto) { saveTok(""); return renderStaffLogin(null, no); } return renderStaffLogin(pinErr(v.err), no); }
    EMP.no = String(no).trim(); EMP.pin = String(pin);
    try { localStorage.setItem("pp-empno", EMP.no); } catch {}
    if (v.must_change) return renderSetPin(v.name);
    if (!auto) try { const r = await db.empToken(EMP.no, pin); if (r.ok && r.token) { saveTok(r.token); EMP.pin = "tok:" + r.token; } } catch {}
    EMP.data = v; EMP.tab = "home"; renderStaffHome();
  } catch (e) { if (auto) return renderStaffLogin(null, no); renderStaffLogin(String(e.message || e), no); }
}
async function staffLogout() {
  const pin = EMP.pin; EMP.pin = ""; EMP.data = null; saveTok("");
  if (pin.startsWith("tok:")) try { await db.empLogout(EMP.no, pin); } catch {}
  renderStaffLogin();
}
function renderSetPin(name, err) {
  const a = h("input", { type: "password", id: "np1", inputmode: "numeric", maxlength: 6 }), b = h("input", { type: "password", id: "np2", inputmode: "numeric", maxlength: 6 });
  const form = h("form", { onsubmit: async e => { e.preventDefault();
      if (a.value !== b.value) return renderSetPin(name, t("pinMismatch"));
      if (!/^[0-9]{4,6}$/.test(a.value) || a.value === "0000") return renderSetPin(name, t("pinBad"));
      try { const r = await db.empSetPin(EMP.no, EMP.pin, a.value); if (!r.ok) return renderSetPin(name, pinErr(r.err, "pinBad"));
        toast(t("pinSaved")); await staffSignIn(EMP.no, a.value); } catch (er) { renderSetPin(name, String(er.message || er)); } } },
    h("div", { class: "card" }, h("h1", {}, t("newPinTitle")), h("p", { class: "muted" }, name ? name + " · " : "", t("newPinHelp")),
      field(t("newPin"), a), field(t("newPin2"), b), err && h("div", { class: "err", id: "np-err" }, err),
      h("button", { class: "btn primary", type: "submit", id: "np-save" }, t("save"))));
  root.innerHTML = ""; root.append(h("div", { class: "login" }, form));
}
const fullName = e => String(e?.info?.full_name || "").trim() || e?.name || "";
// riders have no meal break (they are on the road the whole shift) → every hour of the shift is paid
const breakFor = (emp, base) => emp?.position === "rider" ? 0 : (base == null || base === "" ? 1 : +base);
// payslip note: text after "[[ACK]]" is a separate statement the employee signs (e.g. "computation requested by the employee")
// several "[[ACK]]" parts = several statements, each with its own employee signature line
const noteParts = note => { const [main, ...acks] = String(note || "").split("[[ACK]]"); return { main: main.trim(), acks: acks.map(a => a.trim()).filter(Boolean) }; };
const ackBlock = (acks, name, sig, ackAt) => acks.length ? acks.map(a => h("div", { class: "slipAck" }, h("div", { class: "slipNote" }, a), h("div", { class: "sig one" }, h("div", {}, sig ? sigImg(sig, "") : null, "Employee / " + name, h("br"), "Signature · Date" + (sig ? " · " + fmtD(ackAt) : ""))))) : null;
// employee signature on a payslip: only once the employee has confirmed (ack) that payslip
const empSig = emp => emp?.signature || sigOf(emp?.id);
const slipSig = (emp, ackAt) => ackAt && empSig(emp) ? sigImg(empSig(emp), "") : null; // positioned above the signature line by CSS (.slip .sig .sigImg)
const INFO_KEYS = ["phone", "address", "gcash", "bank_name", "bank_acct", "sss", "philhealth", "pagibig", "tin", "emergency_name", "emergency_phone"];
const infoInputs = (info, idp) => Object.fromEntries(INFO_KEYS.map(k => [k, h("input", { type: k === "address" ? "text" : /phone|gcash|acct/.test(k) ? "tel" : "text", id: idp + k, value: (info || {})[k] || "", maxlength: 200 })]));
/* ---- signature: drawn once by the employee, printed on letters, advance slips and confirmed payslips ---- */
const sigOf = id => (S.sigs || {})[id] || null;
const sigImg = (sig, style = "") => sig?.image ? h("img", { src: sig.image, alt: "signature", class: "sigImg", style }) : null;
const fmtD = d => d ? new Date(d).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" }) : "";
function sigPad() {
  const W = 600, H = 220, c = h("canvas", { width: W, height: H, id: "sig-pad", style: "width:100%;max-width:600px;aspect-ratio:600/220;background:#fff;border:2px dashed var(--line2);border-radius:10px;touch-action:none;display:block" });
  const g = c.getContext("2d"); g.lineWidth = 3.2; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#111";
  let down = false, last = null, inked = 0;
  const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  c.addEventListener("pointerdown", e => { down = true; last = pt(e); c.setPointerCapture?.(e.pointerId); e.preventDefault(); });
  c.addEventListener("pointermove", e => { if (!down) return; const p = pt(e); g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); inked += Math.hypot(p[0] - last[0], p[1] - last[1]); last = p; e.preventDefault(); });
  const up = () => { down = false; }; c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up); c.addEventListener("pointerleave", up);
  return { el: c, empty: () => inked < 40, clear: () => { g.clearRect(0, 0, W, H); inked = 0; },
    // crop to the ink so the saved image is small and fills the signature line
    data: () => { const d = g.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const m = 8; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
      const o = document.createElement("canvas"); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext("2d").drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
      return o.toDataURL("image/png"); } };
}
const TL = {
  introTitle: "Panoorin muna ang video",
  introSub: "Ito ang paliwanag kung paano gamitin ang app. Panoorin hanggang dulo.",
  introLeft: "Natitira: {s} segundo",
  introDone: "Tapos na ang video ✓",
  introCheck: "Napanood ko ang buong video at naintindihan ko.",
  introNext: "Susunod: pumirma →",
  sigTitle: "Pumirma ka",
  sigContract: "Dapat KAPAREHO ng pirma mo sa KONTRATA.",
  sigLocked: "Hindi na ito mababago pagkatapos i-save.",
  sigQ: "Kapareho ba ito ng pirma mo sa kontrata?",
};
const INTRO_SRC = "intro-tl.mp4";
// plays the intro without letting the viewer skip ahead or speed it up; onEnd fires once it has played to the end
function introVideo(onEnd, onProgress) {
  const v = h("video", { src: INTRO_SRC, playsinline: true, controls: true, preload: "auto", controlslist: "nodownload noplaybackrate", disablepictureinpicture: true, id: "intro-video",
    style: "width:100%;max-height:70vh;background:#000;border-radius:10px;display:block" });
  let maxT = 0, ended = false;
  v.addEventListener("timeupdate", () => { if (!v.seeking && v.currentTime > maxT && v.currentTime - maxT < 1.5) maxT = v.currentTime; onProgress && onProgress(maxT, v.duration || 0); });
  v.addEventListener("seeking", () => { if (v.currentTime > maxT + 0.5) v.currentTime = maxT; });
  v.addEventListener("ratechange", () => { if (v.playbackRate !== 1) v.playbackRate = 1; });
  v.addEventListener("ended", () => { maxT = v.duration; if (!ended) { ended = true; onEnd && onEnd(); } });
  return v;
}
function renderIntro() {
  const chk = h("input", { type: "checkbox", id: "intro-ok", disabled: true });
  const next = h("button", { class: "btn primary", type: "button", id: "intro-next", disabled: true }, TL.introNext);
  const prog = h("div", { class: "muted", id: "intro-prog", style: "margin:8px 0" }, "");
  const err = h("div", { class: "err", hidden: true }, t("intro_err"));
  const vid = introVideo(() => { prog.textContent = TL.introDone; chk.disabled = false; },
    (m, d) => { if (d && chk.disabled) prog.textContent = TL.introLeft.replace("{s}", Math.max(0, Math.ceil(d - m))); });
  vid.addEventListener("error", () => { err.hidden = false; });
  chk.onchange = () => { next.disabled = !chk.checked; };
  next.onclick = async () => { next.disabled = true;
    try { const r = await db.empIntroDone(EMP.no, EMP.pin); if (!r.ok) throw new Error(pinErr(r.err));
      EMP.data = await db.empView(EMP.no, EMP.pin); renderStaffHome();
    } catch (e) { toast(errMsg(e)); next.disabled = false; } };
  root.innerHTML = "";
  root.append(h("div", { class: "login" }, h("div", { class: "card", style: "max-width:640px" },
    h("h1", {}, "🎬 " + TL.introTitle), h("p", { style: "margin:0 0 2px" }, TL.introSub), h("p", { class: "muted", style: "margin:0 0 10px" }, t("intro_sub")),
    vid, prog, err,
    h("label", { class: "check", style: "margin:8px 0 12px" }, chk, " ", h("b", {}, TL.introCheck)),
    h("div", { class: "row" }, h("span", { class: "sp" }), next))));
}
function introSheet() { sheet([h("h3", {}, "🎬 " + t("intro_rewatch")), introVideo(), h("div", { class: "row", style: "margin-top:10px" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: () => document.getElementById("sheetRoot").innerHTML = "" }, t("close")))]); }
function renderSignFirst(err) {
  const pad = sigPad(), save = h("button", { class: "btn primary", type: "button", id: "sig-save" }, t("sig_save"));
  const doSave = async img => { save.disabled = true;
    try { const r = await db.empSetSignature(EMP.no, EMP.pin, img);
      if (!r.ok && r.err === "need_intro") { EMP.data = await db.empView(EMP.no, EMP.pin); return renderIntro(); }
      if (!r.ok && r.err !== "sig_locked") throw new Error(r.err === "bad_value" ? t("sig_empty") : pinErr(r.err));
      toast(t("sig_saved")); EMP.data = await db.empView(EMP.no, EMP.pin); renderStaffHome();
    } catch (e) { save.disabled = false; renderSignFirst(errMsg(e)); } };
  save.onclick = () => { if (pad.empty()) return toast(t("sig_empty")); const img = pad.data();
    const close = sheet([h("h3", {}, TL.sigQ), h("p", { class: "muted", style: "margin:0 0 8px" }, t("sig_previewQ")),
      h("div", { style: "background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px;text-align:center" }, h("img", { src: img, alt: "signature", id: "sig-preview", style: "max-width:100%;max-height:120px" })),
      h("p", { style: "margin:8px 0;font-weight:700;color:var(--bad)" }, "⚠️ " + TL.sigLocked),
      h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", id: "sig-redo", onclick: () => { close(); pad.clear(); } }, "↺ " + t("sig_clear")),
        h("button", { class: "btn primary", id: "sig-confirm", onclick: () => { close(); doSave(img); } }, "✓ " + t("sig_save")))]); };
  root.innerHTML = "";
  root.append(h("div", { class: "login" }, h("div", { class: "card", style: "max-width:640px" }, h("h1", {}, "✍️ " + TL.sigTitle + " · " + t("sig_title")),
    h("div", { style: "background:#FFF4D6;border:1px solid var(--gold);border-radius:8px;padding:10px;margin-bottom:8px" },
      h("b", { style: "font-size:16px" }, "📄 " + TL.sigContract), h("div", {}, t("sig_contract")), h("div", { style: "margin-top:4px;color:var(--bad);font-weight:700" }, "⚠️ " + TL.sigLocked)),
    h("p", { class: "muted" }, (EMP.data?.employee?.name ? EMP.data.employee.name + " · " : "") + t("sig_help")), pad.el,
    err && h("div", { class: "err" }, err),
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn", type: "button", onclick: () => pad.clear() }, t("sig_clear")), h("span", { class: "sp" }), save),
    h("div", { class: "row", style: "margin-top:6px" }, langSwitch()))));
}
/* print one document on its own page (letters, advance slips) */
function printOneDoc(inner) {
  const box = h("div", { id: "printOne" }, inner);
  document.getElementById("printOne")?.remove(); document.body.append(box); document.body.classList.add("print-one");
  const done = () => { box.remove(); document.body.classList.remove("print-one"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done); window.print(); setTimeout(() => { if (document.body.contains(box)) done(); }, 60000);
}
// signature line used on printed letters: signature image above the line, name/date below
const sigLine = (label, sig, date) => h("div", { style: "flex:1;font-size:13px" }, h("div", { style: "height:64px;display:flex;align-items:flex-end;justify-content:center" }, sigImg(sig, "max-height:60px;max-width:100%")),
  h("div", { style: "border-top:1px solid #000;padding-top:4px" }, label + (date ? " · " + date : "")));
function printAdvance(l, emp, sig) {
  const name = fullName(emp), p = periodForDate(l.biz_date);
  const reason = String(l.note || "").replace(/^📱 가불 신청 \(자동 승인\)( · )?/, "") || "";
  const row = (a, b) => h("tr", {}, h("th", { style: "text-align:left;width:38%;padding:6px;border:1px solid #999;background:#f3f3f3" }, a), h("td", { style: "padding:6px;border:1px solid #999" }, b));
  printOneDoc(h("div", { class: "slip", style: "font-family:Arial,sans-serif;color:#000;background:#fff;padding:24px;max-width:720px" },
    h("h2", { style: "text-align:center;margin:0 0 4px" }, "CASH ADVANCE / 가불 확인서"), h("div", { style: "text-align:center;margin-bottom:16px" }, "Paltong Restaurant"),
    h("table", { style: "width:100%;border-collapse:collapse;font-size:14px" },
      row("Employee name", name), row("Position", emp?.position || ""), row("Date", fmtD(l.biz_date + "T12:00:00+08:00")),
      row("Amount", "₱" + money(l.amount)), l.pay_via ? row("Received by", l.pay_via === "GCASH" ? "GCash" : "Cash") : null, row("Deducted from payroll", `${p.start} ~ ${p.end}`),
      row("Requested", l.self_req_at ? "In the app · auto-approved · " + new Date(l.self_req_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "Recorded by the manager"),
      reason ? row("Reason", reason) : null),
    h("p", { style: "font-size:13px;margin:14px 0 0" }, `I received a cash advance of ₱${money(l.amount)} and I authorize Paltong Restaurant to deduct this amount from my salary for the payroll period ${p.start} ~ ${p.end}.`),
    h("div", { style: "display:flex;gap:40px;margin-top:36px" }, sigLine("Employee signature", sig, fmtD(l.self_req_at || l.created_at)), sigLine("Manager signature", null, ""))));
}
/* ---- staff: cash advance tab ---- */
function myAdvTab(v, emp) {
  const L = v.adv_limit || null, left = L ? +L.left : 0;
  const amt = h("input", { type: "number", id: "adv-amt", min: 1, max: left || 1, step: 1, inputmode: "numeric", placeholder: "500" });
  const rsn = h("input", { type: "text", id: "adv-rsn", maxlength: 200 });
  const send = h("button", { class: "btn primary", type: "submit", id: "adv-send" }, t("adv_send"));
  let via = "";
  const viaBtn = (code, lbl) => h("button", { class: "btn", type: "button", "data-via": code, style: "flex:1;padding:12px;font-weight:700",
    onclick: ev => { via = code; ev.currentTarget.parentNode.querySelectorAll("[data-via]").forEach(b => { const on = b.dataset.via === via; b.classList.toggle("primary", on); b.setAttribute("aria-pressed", on); }); } }, lbl);
  const viaRow = h("div", { id: "adv-via", style: "margin-top:8px" }, h("label", { style: "display:block;font-size:13px;margin-bottom:4px" }, t("adv_via")),
    h("div", { class: "row", style: "gap:8px" }, viaBtn("CASH", t("adv_cash")), viaBtn("GCASH", t("adv_gcash"))));
  const viaName = v => v === "GCASH" ? "GCash" : t("adv_cash").replace(/^\S+\s/, "");
  const td = today(), per = periodForDate(td);
  const form = h("form", { class: "card", id: "adv-form", onsubmit: e => { e.preventDefault();
      const a = +amt.value; if (!(a >= 1)) return toast(t("adv_bad"));
      if (L && a > left) return toast(tf("adv_over", { a: money(left) }));
      if (!via) return toast(t("adv_viaNeed"));
      confirmSheet(tf("adv_q", { a: money(a), v: viaName(via), p: periodLabel(per.start, per.end) }), async () => { send.disabled = true;
        try { const r = await db.empAdvance(EMP.no, EMP.pin, a, rsn.value.trim(), via);
          if (!r.ok) { if (r.err === "need_sig") { toast(t("adv_needSig")); return renderSignFirst(); }
            throw new Error(r.err === "over_limit" ? tf("adv_over", { a: money(r.limit?.left || 0) }) : r.err === "bad_value" ? t("adv_bad") : r.err === "bad_via" ? t("adv_viaNeed") : pinErr(r.err)); }
          toast(t("adv_done")); EMP.data = await db.empView(EMP.no, EMP.pin); EMP.tab = "adv"; renderStaffHome();
        } catch (er) { toast(errMsg(er)); send.disabled = false; } }, { ask: true }); } },
    h("h2", {}, t("adv_title")), h("small", { class: "muted" }, t("adv_help")),
    L ? h("div", { id: "adv-limit", style: "margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:8px" },
      h("div", { class: "row", style: "align-items:baseline;flex-wrap:wrap" }, h("b", {}, t("adv_lim")), h("span", { class: "muted" }, " " + periodLabel(L.start, L.end)), h("span", { class: "sp" }),
        h("span", { class: "muted" }, t("adv_left") + " "), h("span", { class: "money", style: "font-size:24px;font-weight:800" }, "₱" + money(left))),
      h("small", { class: "muted" }, emp.pay_type === "monthly" ? t("adv_limM") : tf("adv_limHelp", { d: L.days })),
      h("table", { class: "lines", style: "width:100%;font-size:13px;margin-top:6px" },
        [[t("adv_pay"), L.pay ?? L.limit, ""], [tf("adv_dLate", { m: L.late_min || 0 }), L.late, "−"], [t("adv_dShort"), L.shortage, "−"], [t("adv_dOther"), L.other, "−"], [t("adv_dGov"), L.gov, "−"], [t("adv_usedL"), L.used, "−"]]
          .filter(([, val, sg], i) => i === 0 || +val > 0).map(([lbl, val, sg]) => h("tr", {}, h("td", {}, lbl), h("td", { class: "r money" }, sg + "₱" + money(val)))))) : null,
    left > 0 || !L ? h("div", { class: "grid2", style: "margin-top:8px" }, field(t("adv_amount"), amt), field(t("adv_reason"), rsn)) : h("p", { class: "muted" }, t("adv_none")),
    left > 0 || !L ? viaRow : null,
    left > 0 || !L ? send : null);
  const advs = (v.ledger || []).filter(l => l.kind === "advance");
  const list = h("div", { class: "card", id: "adv-list" }, h("h2", {}, t("adv_list")), advs.length ? h("div", { class: "list" }, advs.map(l => { const p = periodForDate(l.biz_date);
    const why = noteOf(l).replace(/^📱 (가불 신청 \(자동 승인\)|Advance request \(auto-approved\))( · )?/, "");
    return h("div", { class: "item" }, h("div", { class: "t" }, l.biz_date, " ", h("span", { class: "pill " + (l.deducted ? "paid" : "draft") }, l.deducted ? t("led_deducted") : t("led_pending")), l.self_req_at ? " " + t("adv_app") : ""),
      h("div", { class: "s" }, tf("led_applies", { p: periodLabel(p.start, p.end) }), l.pay_via ? " · " + tf("adv_viaL", { v: viaName(l.pay_via) }) : "", why ? ` · ${why}` : "",
        h("div", {}, h("button", { class: "btn sm", type: "button", style: "margin-top:6px", onclick: () => printAdvance(l, emp, v.signature) }, "🖨 " + t("adv_print")))),
      h("div", { class: "m money neg" }, "−" + money(l.amount))); })) : h("span", { class: "muted" }, t("noData")));
  return [form, list];
}
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
          if (!r.ok) throw new Error(["locked", "closed", "resigned"].includes(r.err) ? pinErr(r.err) : r.err);
          emp.info = { ...(emp.info || {}), ...info }; if (bday.value) emp.birthday = bday.value; toast(t("infoSaved"));
        } catch (er) { toast(errMsg(er)); } save.disabled = false; } },
      h("div", { class: "grid2" }, field(t("emp_name"), h("div", { style: "padding:9px 0" }, emp.name)), field(t("emp_bday"), bday), ...INFO_KEYS.map(k => field(t("i_" + k), inp[k]))),
      save),
    mySilSelf(EMP.data?.sil_sum),
    h("div", { style: "margin-top:12px" }, h("button", { class: "btn sm", type: "button", id: "mi-intro", onclick: introSheet }, "🎬 " + t("intro_rewatch"))),
    EMP.data?.signature ? h("div", { id: "mi-sig", style: "margin-top:14px;padding-top:12px;border-top:1px solid var(--line)" }, h("b", {}, t("sig_mine")), h("div", {}, sigImg(EMP.data.signature, "max-height:70px;background:#fff;border-radius:6px;padding:4px")), h("small", { class: "muted" }, tf("sig_on", { d: fmtD(EMP.data.signature.signed_at) }))) : null);
}
/* ---- staff: SIL already used this year — entered once, then locked (owner can still change it) ---- */
function mySilSelf(x) {
  if (!x) return null;
  const box = h("div", { id: "mi-sil", style: "margin-top:14px;padding-top:12px;border-top:1px solid var(--line)" }, h("b", {}, t("sil_selfT")));
  if (x.self_set_at) return box.append(h("p", { class: "muted", style: "margin:6px 0 0" }, tf("sil_selfDone", { n: +x.used_before || 0, d: new Date(x.self_set_at).toLocaleDateString() }))), box;
  const inp = h("input", { type: "number", id: "mi-sil-n", step: 0.5, min: 0, max: 30, inputmode: "decimal", value: "", style: "width:90px;text-align:right" });
  const btn = h("button", { class: "btn primary", type: "button", id: "mi-sil-save", onclick: () => {
    const n = inp.value === "" ? NaN : +inp.value;
    if (!(n >= 0 && n <= 30 && n * 2 === Math.floor(n * 2))) return toast(t("sil_bad"));
    confirmSheet(tf("sil_selfQ", { n }) + ((x.used || []).length ? " · " + tf("sil_selfRec", { d: (x.used || []).slice().sort().map(d => d.slice(5).replace("-", "/")).join(", ") }) : ""), async () => { btn.disabled = true;
      try { const r = await db.empSetSil(EMP.no, EMP.pin, n);
        if (!r.ok) throw new Error(r.err === "sil_locked" ? t("sil_locked") : r.err === "bad_value" ? t("sil_bad") : pinErr(r.err));
        toast(t("saved")); EMP.data = await db.empView(EMP.no, EMP.pin); renderStaffHome();
      } catch (er) { toast(errMsg(er)); btn.disabled = false; } }, { ask: true }); } }, t("save"));
  const rec = (x.used || []).slice().sort();
  box.append(h("small", { class: "muted", style: "display:block;margin:4px 0 6px" }, t("sil_selfHelp")),
    h("div", { id: "mi-sil-rec", style: "margin:0 0 8px;padding:6px 8px;border-radius:6px;background:#FFF4D6;font-size:13px" },
      rec.length ? tf("sil_selfRec", { d: rec.map(d => d.slice(5).replace("-", "/")).join(", ") + ` (${rec.length})` }) : t("sil_selfRecNone")), h("div", { class: "row", style: "gap:8px;align-items:center" }, inp, btn));
  return box;
}
function renderStaffHome() {
  const v = EMP.data, emp = v.employee;
  if (!emp.intro_seen_at) return renderIntro();
  if (!v.signature) return renderSignFirst();
  root.innerHTML = "";
  const paid = v.payrolls.filter(p => (p.status === "paid" || p.shared) && p.result);
  const payList = h("div", { class: "list", id: "my-pay" }, paid.length ? paid.map(p => h("div", { class: "item", onclick: () => {
      const P = { start: p.period_start, end: p.period_end, daily_rate: p.daily_rate, status: p.status, paid_on: p.paid_on, paid_via: p.paid_via, note: p.note || "" };
      payslip({ ...P, ack_at: p.ack_at, pay_type: p.pay_type || 'daily', monthly_rate: p.monthly_rate }, { name: emp.name, position: emp.position, info: emp.info, signature: v.signature }, p.result); } },
    h("div", { class: "t" }, periodLabel(p.period_start, p.period_end)), h("div", { class: "s" }, p.status === "paid" ? `${t("paid")} ${p.paid_on || ""} · ${viaLabel(slipVia(p.paid_via || ""))}` : t("sharedStaff")), h("div", { class: "m money" }, "₱" + money(p.result.net))))
    : h("span", { class: "muted" }, t("noData")));
  const ledList = h("div", { class: "list", id: "my-ledger" }, v.ledger.length ? v.ledger.map(l => { const p = periodForDate(l.biz_date);
    return h("div", { class: "item" }, h("div", { class: "t" }, t("k_" + l.kind), " ", h("span", { class: "pill " + (l.deducted ? "paid" : "draft") }, l.deducted ? t("led_deducted") : t("led_pending"))),
      h("div", { class: "s" }, l.biz_date, " ", t("led_applies").replace("{p}", periodLabel(p.start, p.end)), noteOf(l) ? ` · ${noteOf(l)}` : ""), h("div", { class: "m money " + (l.kind === "bonus" ? "pos" : "neg") }, (l.kind === "bonus" ? "+" : "−") + money(l.amount))); })
    : h("span", { class: "muted" }, t("noData")));
  const shifts = h("div", { id: "my-shifts" }, v.payrolls.length ? v.payrolls.map(p => h("details", { class: "card", style: "margin:0 0 8px" },
      h("summary", {}, h("b", {}, periodLabel(p.period_start, p.period_end)), " ", h("span", { class: "pill " + (p.status === "paid" || p.shared ? "paid" : "draft") }, p.status === "paid" ? t("paid") : p.shared ? t("sharedStaff") : t("notPaidYet"))),
      h("div", { class: "tbl" }, h("table", {}, (p.days || []).filter(d => d.type !== "off" || d.shift).map(d => h("tr", {}, h("td", {}, d.date.slice(5) + " " + t("dow")[new Date(d.date + "T00:00:00").getDay()]),
        h("td", {}, d.card || (d.shift ? SHIFT_LABEL(d.shift) : "—")), h("td", {}, t("type_" + d.type)))))))) : h("span", { class: "muted" }, t("noData")));
  const openSlip = p => payslip({ start: p.period_start, end: p.period_end, daily_rate: p.daily_rate, status: p.status, paid_on: p.paid_on, paid_via: p.paid_via, note: p.note || "", ack_at: p.ack_at, pay_type: p.pay_type || "daily", monthly_rate: p.monthly_rate }, { name: emp.name, position: emp.position, info: emp.info, signature: v.signature }, p.result);
  const finals = v.payrolls.filter(p => p.shared && p.status !== "paid" && p.result);
  const finalCard = finals.length ? h("div", { class: "card", id: "my-final", style: "border:2px solid var(--gold)" }, h("h2", {}, t("myFinal")),
    ...finals.map(p => { let seen = false;
      const ack = p.ack_at ? h("span", { class: "pill paid", id: "my-ack-done" }, tf("ackDone", { d: new Date(p.ack_at).toLocaleDateString() }))
        : h("button", { class: "btn", type: "button", id: "my-ack", onclick: () => { if (!seen) return toast(t("ackFirst"));
            confirmSheet(t("ackQ"), async () => { try { const r = await db.empAck(EMP.no, EMP.pin, p.period_start); if (!r.ok) throw new Error(pinErr(r.err, "noData"));
              p.ack_at = new Date().toISOString(); renderStaffHome(); } catch (er) { toast(errMsg(er)); } }, { ask: true }); } }, t("ackBtn"));
      return h("div", { class: "row", style: "align-items:center;flex-wrap:wrap" },
        h("div", {}, h("b", {}, periodLabel(p.period_start, p.period_end)), h("div", { class: "muted" }, t("sharedStaff"))),
        h("span", { class: "sp" }), h("div", { class: "money", style: "font-size:26px;font-weight:800" }, "₱" + money(p.result.net)),
        h("button", { class: "btn primary", type: "button", onclick: () => { seen = true; openSlip(p); } }, t("myFinalOpen")), ack); })) : null;
  root.append(
    h("div", { class: "top" }, h("span", { class: "brand" }, t("app")), h("span", { class: "sp" }),
      h("span", { style: "opacity:.85;font-size:13px" }, `${emp.name} · ${t("empNoLbl")} ${emp.emp_no}`),
      h("button", { onclick: () => { setLangOnly(lang === "ko" ? "en" : "ko"); renderStaffHome(); } }, lang === "ko" ? "EN" : "한"),
      h("button", { id: "e-logout", onclick: staffLogout }, t("logout"))),
    h("div", { class: "tabs", role: "tablist", id: "staff-tabs" }, [["home", t("stab_home")], ["adv", t("stab_adv")]].map(([k, l]) => h("button", { role: "tab", id: "stab-" + k, "aria-selected": String((EMP.tab || "home") === k), onclick: () => { EMP.tab = k; renderStaffHome(); } }, l))),
    h("main", { id: "main" }, ...(EMP.tab === "adv" ? myAdvTab(v, emp) : [
      finalCard,
      mentionsCard(v),
      myEstCard(emp, v),
      clockCard(),
      h("div", { class: "card" }, h("h2", {}, t("myPay")), payList),
      h("div", { class: "card" }, h("h2", {}, t("myLedger")), ledList),
      h("div", { class: "card" }, h("h2", {}, t("myShifts")), shifts),
      mySchedCard(v, emp),
      mySilCard(v),
      my13Card(v, emp),
      myInfoCard(emp)])));
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
/* ---- 13th month projected to December 31 (same math on the staff screen and the admin due tab) ---- */
function proj13(periods, year, emp) {
  // periods: [{ start, end, basic }] from finalized / paid payrolls of `year`
  const got = periods.filter(x => x.start.startsWith(year + "-")).sort((a, b) => a.start < b.start ? -1 : 1);
  const before = +emp.basic_before_year === year ? +emp.basic_before_app || 0 : 0;
  const avg = got.length ? got.reduce((a, x) => a + x.basic, 0) / got.length : 0;
  const last = got.length ? got[got.length - 1].start : null;
  const rest = [];
  for (let m = 1; m <= 12; m++) for (const half of [1, 2]) { const pp = periodOf(year, m, half); if (last && pp.start > last) rest.push({ start: pp.start, end: pp.end, basic: Math.round(avg * 100) / 100, est: true }); }
  const rows = [...got, ...rest];
  const total = Math.round((rows.reduce((a, x) => a + x.basic, 0) + before) * 100) / 100;
  const by12 = Math.round(total / 12 * 100) / 100, monthAvg = Math.round(avg * 2 * 100) / 100;
  const hired = emp.hired_on ? new Date(emp.hired_on + "T00:00:00") : null;
  const oneYear = hired ? (new Date(year, 11, 24) - hired) >= 365 * 86400000 : null;
  const amount = oneYear === false ? by12 : Math.max(by12, monthAvg);   // same rule as before: 1 year+ (or hire date unknown) → the larger of ÷12 and one-month average
  const toDate = Math.round((got.reduce((a, x) => a + x.basic, 0) + before) * 100) / 100;
  return { rows, before, total, by12, monthAvg, oneYear, amount, toDate };
}
function slip13(emp, year, P) {
  const tb = h("table", { class: "lines" }, h("tr", {}, h("th", {}, t("p13_period")), h("th", { class: "r" }, t("p13_basic"))),
    ...P.rows.map(x => h("tr", { class: x.est ? "muted" : "" }, h("td", {}, periodLabel(x.start, x.end) + (x.est ? ` (${t("p13_estRow")})` : "")), h("td", { class: "r" }, money(x.basic)))),
    P.before ? h("tr", {}, h("td", {}, t("c13_basicBefore")), h("td", { class: "r" }, money(P.before))) : null,
    h("tr", { class: "sum" }, h("td", {}, t("p13_sum")), h("td", { class: "r" }, money(P.total))),
    h("tr", {}, h("td", {}, t("p13_by12")), h("td", { class: "r" }, money(P.by12))),
    P.oneYear !== false ? h("tr", {}, h("td", {}, t("p13_avgM")), h("td", { class: "r" }, money(P.monthAvg))) : null,
    h("tr", { class: "net" }, h("td", {}, t("p13_final")), h("td", { class: "r" }, "₱" + money(P.amount))));
  const slip = h("div", { class: "slip" }, h("div", { class: "slipHead" }, h("b", {}, "PALTONG RESTAURANT"), h("div", {}, `13th Month Pay · ${year}`)),
    h("div", {}, h("b", {}, emp.info?.full_name || emp.name), " · ", t("pos_" + (emp.position || "other"))),
    h("div", { class: "tbl" }, tb), h("p", { class: "muted", style: "font-size:13px" }, t("p13_note")), h("p", { style: "font-weight:700" }, "📅 " + t("p13_req")));
  const close = sheet([slip, h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: () => printSlip() }, "🖨"), h("button", { class: "btn", type: "button", onclick: () => close() }, t("close") || "Close"))]);
}
function my13Card(v, emp) {
  const year = new Date().getFullYear();
  const periods = (v.payrolls || []).filter(p => (p.status === "paid" || p.shared) && p.result).map(p => ({ start: p.period_start, end: p.period_end, basic: +p.result.basicFor13th || 0 }));
  const P = proj13(periods, year, emp);
  const ack = (v.ack13 || []).find(a => a.year === year);
  let seen = false;
  const paidList = (v.thirteenth || []).map(x => h("div", { class: "item" }, h("div", { class: "t" }, `${x.year} · ${t("tab_13")} · ${t("c13_paid")}`), h("div", { class: "s" }, `${t("c13_total")} ₱${money(x.basic_total)} · ${x.paid_on || ""} ${viaLabel(slipVia(x.paid_via || ""))}`), h("div", { class: "m money" }, "₱" + money(x.amount))));
  const ackEl = ack ? h("span", { class: "pill paid", id: "my13-acked" }, tf("p13_acked", { d: new Date(ack.ack_at).toLocaleDateString() }))
    : h("button", { class: "btn", type: "button", id: "my13-ack", onclick: () => { if (!seen) return toast(t("ackFirst"));
        confirmSheet(t("ackQ"), async () => { try { const r = await db.empAck13(EMP.no, EMP.pin, year, P.amount); if (!r.ok) throw new Error(pinErr(r.err, "noData"));
          EMP.data.ack13 = [...(EMP.data.ack13 || []), { year, ack_at: new Date().toISOString(), amount: P.amount }]; renderStaffHome(); } catch (er) { toast(errMsg(er)); } }, { ask: true }); } }, t("p13_ack"));
  return h("div", { class: "card", id: "my-13" },
    h("div", { class: "row", style: "align-items:center;flex-wrap:wrap" },
      h("div", {}, h("h2", { style: "margin:0" }, t("p13_title")), h("div", { class: "muted" }, `${year} · ${t("p13_toDate")} ₱${money(P.toDate)}`)),
      h("span", { class: "sp" }), h("div", { class: "money", style: "font-size:26px;font-weight:800" }, "₱" + money(P.amount))),
    h("p", { style: "margin:6px 0;font-weight:700" }, "📅 " + t("p13_req")),
    h("div", { class: "row", style: "flex-wrap:wrap" }, h("button", { class: "btn primary", type: "button", id: "my13-open", onclick: () => { seen = true; slip13(emp, year, P); } }, t("p13_open")), ackEl),
    h("small", { class: "muted" }, t("p13_help")),
    paidList.length ? h("div", { class: "list" }, paidList) : null);
}
/* ---- SIL (paid leave) balance: base − used (monthly paid vacation §3.2 is separate) ---- */
const silNums = x => { const used = (x.used || []).length + (+x.used_before || 0), pl = (x.planned || []).length;
  return { base: +x.allowance || 0, earned: 0, used, planned: pl, left: (+x.allowance || 0) - used - pl }; };
const fmtLvDay = d => d.slice(5).replace("-", "/") + " " + t("dow")[new Date(d + "T00:00:00").getDay()];
const lvRange = days => days.length === 1 ? fmtLvDay(days[0]) : fmtLvDay(days[0]) + " ~ " + fmtLvDay(days[days.length - 1]);
const lvGroups = rows => { const m = new Map(); rows.forEach(r => { const k = r.grp || r.id; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
  return [...m.values()].map(g => g.sort((p, q) => (p.day < q.day ? -1 : 1))); };
const lvKind = r => r.kind || "sil";
const mpvAvail = x => (x.mpv || []).reduce((n, m) => n + (m.status === "available" ? +m.left || 0 : 0), 0);
function mpvBox(x) {
  const list = (x.mpv || []).slice().reverse(); if (!list.length) return null;
  const st = m => tf("mpv_st_" + m.status, { e: (m.expires || "").slice(5).replace("-", "/"), d: (m.used || []).map(d => d.slice(5).replace("-", "/")).join(", ") });
  return h("div", { id: "my-mpv", style: "margin-top:14px;padding-top:12px;border-top:1px solid var(--line)" },
    h("div", { class: "row", style: "align-items:baseline" }, h("b", {}, t("mpv_title")), h("span", { class: "sp" }), h("span", { class: "money", style: "font-weight:800" }, String(mpvAvail(x)))),
    h("small", { class: "muted", style: "display:block;margin:4px 0 6px" }, t("mpv_help")),
    list.length ? h("div", { class: "list" }, list.map(m => h("div", { class: "item" }, h("div", { class: "t" }, tf("mpv_row", { m: m.month, c: m.credit })),
      h("div", { class: "s" }, h("span", { class: "pill " + (m.status === "available" ? "paid" : m.status === "none" || m.status === "expired" ? "late" : "draft") }, st(m)))))) : null);
}
function mySilCard(v) {
  const x = v.sil_sum; if (!x) return null; const n = silNums(x);
  const box = (k, val, strong) => h("div", { style: "flex:1;min-width:70px;border:1px solid var(--line);border-radius:8px;padding:8px;text-align:center" }, h("small", { class: "muted" }, t(k)), h("div", { style: `font:700 ${strong ? 26 : 20}px var(--mono)` }, String(val)));
  return h("div", { class: "card", id: "my-sil" }, h("h2", {}, `${t("sil_title")} · ${x.year}`),
    h("div", { class: "row", style: "gap:8px;flex-wrap:wrap" }, box("sil_base", n.base), box("sil_used", n.used), box("sil_planned", n.planned), box("sil_left", n.left, true)),
    (x.used || []).length ? h("p", { class: "muted", style: "margin:8px 0 0" }, t("sil_dates") + ": " + x.used.slice().sort().map(d => d.slice(5).replace("-", "/")).join(", ")) : null,
    (x.planned || []).length ? h("p", { class: "muted", style: "margin:4px 0 0" }, t("sil_plDates") + ": " + x.planned.map(d => d.slice(5).replace("-", "/")).join(", ")) : null,
    h("small", { class: "muted" }, t("sil_help")),
    mpvBox(x),
    silReqBox(v, n));
}
/* ---- staff: leave request — 1 day off / SIL / monthly paid vacation, a whole period at once (owner approves) ---- */
function silReqBox(v, n) {
  const reqs = v.sil_reqs || [], x = v.sil_sum || {};
  const pendSil = reqs.filter(r => r.status === "pending" && lvKind(r) === "sil").length;
  const avail = { off: null, sil: Math.max(0, n.left - pendSil), mpv: mpvAvail(x) };
  const minD = addD(today(), 1), maxD = addD(today(), 180);
  let kind = "";
  const fromIn = h("input", { type: "date", id: "lv-from", min: minD, max: maxD });
  const toIn = h("input", { type: "date", id: "lv-to", min: minD, max: maxD });
  const prev = h("div", { class: "muted", id: "lv-prev", style: "font-size:13px;margin-top:4px" });
  const rangeDays = () => { const f = fromIn.value, to = toIn.value || f; if (!f) return []; const out = []; for (let d = f; d <= to && out.length < 15; d = addD(d, 1)) out.push(d); return out; };
  const draw = () => { const ds = rangeDays(); prev.textContent = ds.length ? tf("lv_days", { n: ds.length, d: lvRange(ds) }) : ""; };
  fromIn.onchange = () => { if (toIn.value && toIn.value < fromIn.value) toIn.value = ""; toIn.min = fromIn.value || minD; draw(); };
  toIn.onchange = draw;
  const offMin = addD(today(), 7);
  const kBtn = (k, sub) => h("button", { class: "btn", type: "button", "data-kind": k, style: "flex:1;min-width:96px;padding:10px 6px;display:block;text-align:center",
    onclick: ev => { kind = k; ev.currentTarget.parentNode.querySelectorAll("[data-kind]").forEach(b => { const on = b.dataset.kind === kind; b.classList.toggle("primary", on); b.setAttribute("aria-pressed", on); }); } },
    h("div", { style: "font-weight:700" }, t("lv_" + k)), h("small", {}, sub));
  const kinds = h("div", { class: "row", id: "lv-kinds", style: "gap:6px;flex-wrap:wrap" },
    kBtn("off", t("lv_offS")), kBtn("sil", tf("lv_silS", { n: avail.sil })), (x.mpv || []).length ? kBtn("mpv", tf("lv_mpvS", { n: avail.mpv })) : null);
  const rsn = h("input", { type: "text", id: "sr-reason", maxlength: 200 });
  const send = h("button", { class: "btn primary", type: "button", id: "sr-send", onclick: () => {
    if (!kind) return toast(t("lv_pickKind"));
    if (!fromIn.value) return toast(t("sr_need"));
    if (toIn.value && toIn.value < fromIn.value) return toast(t("lv_order"));
    const ds = rangeDays(); if (ds.length > 14) return toast(t("lv_max"));
    if (ds[0] < minD || ds[ds.length - 1] > maxD) return toast(tf("sr_past", { d: fmtLvDay(ds[0] < minD ? ds[0] : ds[ds.length - 1]) }));
    if (kind === "sil" && ds.length > avail.sil) return toast(tf("sr_nobal", { n: avail.sil }));
    const w = ds.length >= 5 ? t("lv_qLong") : ds[0] < offMin ? t("lv_qShort") : t("lv_qAuto");
    confirmSheet(tf("lv_q", { k: t("k_lv_" + kind), d: lvRange(ds), n: ds.length, w }), async () => { send.disabled = true;
      try { const r = await db.empLeaveRequest(EMP.no, EMP.pin, kind, ds[0], ds[ds.length - 1], rsn.value.trim());
        if (!r.ok) throw new Error(r.err === "past" ? tf("sr_past", { d: fmtLvDay(String(r.day)) }) : r.err === "dup" ? tf("sr_dup", { d: fmtLvDay(String(r.day)) })
          : r.err === "already_off" ? tf("lv_alreadyOff", { d: fmtLvDay(String(r.day)) }) : r.err === "no_balance" ? tf("sr_nobal", { n: r.left })
          : r.err === "no_mpv" ? tf("lv_noMpv", { m: r.month, n: r.left }) : r.err === "off_7days" ? tf("lv_off7", { d: fmtLvDay(String(r.min)) }) : r.err === "bad_value" ? t("lv_max") : pinErr(r.err));
        toast(r.auto ? t("lv_auto") : t("lv_manual")); EMP.data = await db.empView(EMP.no, EMP.pin); renderStaffHome(); setTimeout(() => document.getElementById("sil-req")?.scrollIntoView({ block: "center" }), 50);
      } catch (e) { toast(errMsg(e)); send.disabled = false; } }, { ask: true }); } }, t("sr_send"));
  const pill = st => h("span", { class: "pill " + (st === "approved" ? "paid" : st === "rejected" ? "late" : "draft") }, t("st_" + st));
  const groups = lvGroups(reqs).sort((p, q) => (p[0].day < q[0].day ? 1 : -1));
  return h("div", { id: "sil-req", style: "margin-top:14px;padding-top:12px;border-top:1px solid var(--line)" },
    h("b", {}, t("lv_title")), h("small", { class: "muted", style: "display:block;margin:4px 0 8px" }, t("lv_help")),
    h("label", { style: "display:block;font-size:13px;margin-bottom:4px" }, t("lv_kind")), kinds,
    h("div", { class: "grid2", style: "margin-top:8px" }, field(t("lv_from"), fromIn), field(t("lv_to"), toIn)), prev,
    field(t("sr_reason"), rsn), h("div", { class: "row", style: "margin-top:8px" }, h("span", { class: "sp" }), send),
    groups.length ? h("div", { style: "margin-top:10px" }, h("div", { class: "muted", style: "font-size:13px" }, t("sr_list")), h("div", { class: "list" }, groups.map(g => {
      const r = g[0], pend = g.some(z => z.status === "pending"), st = pend ? "pending" : r.status;
      return h("div", { class: "item" },
        h("div", { class: "t" }, h("b", {}, t("k_lv_" + lvKind(r))), " · ", lvRange(g.map(z => String(z.day))), g.length > 1 ? ` (${g.length})` : "", " ", pill(st)),
        h("div", { class: "s" }, [r.reason, r.note].filter(Boolean).join(" · ")),
        pend ? h("button", { class: "btn sm ghost", type: "button", onclick: async () => { try {
          const x2 = r.grp ? await db.empLeaveCancel(EMP.no, EMP.pin, r.grp) : await db.empSilCancel(EMP.no, EMP.pin, r.id); if (!x2.ok) throw new Error(x2.err);
          EMP.data = await db.empView(EMP.no, EMP.pin); renderStaffHome(); } catch (e) { toast(errMsg(e)); } } }, t("sr_cancel")) : null); }))) : null);
}
async function silAdminCard() {
  const year = new Date().getFullYear(), owner = S.user?.role === "owner";
  const card = h("div", { class: "card", id: "sil-admin" }, h("h2", {}, `${t("sil_title")} · ${year}`), h("small", { class: "muted" }, t("sil_help")));
  let all = {}; try { all = await db.silAll(year); } catch (e) { card.append(h("p", { class: "muted" }, errMsg(e))); return card; }
  const tb = h("table", {}, h("tr", {}, h("th", {}, t("employee")), h("th", { class: "r" }, t("sil_base")), h("th", { class: "r" }, t("sil_before")), h("th", { class: "r" }, t("mpv_col")), h("th", { class: "r" }, t("sil_used")), h("th", { class: "r" }, t("sil_planned")), h("th", { class: "r" }, t("sil_left"))));
  for (const e of S.employees.filter(e => e.active && e.name !== "test")) {
    const x = all[e.id]; if (!x) continue; const n = silNums(x);
    const inp = (k, val) => h("input", { type: "number", step: 0.5, min: 0, value: val, disabled: !owner, style: "width:64px;text-align:right", onchange: async ev => {
      try { await db.saveSil({ employee_id: e.id, year, allowance: k === "allowance" ? +ev.target.value : n.base, used_before: k === "used_before" ? +ev.target.value : +x.used_before || 0 }); toast(t("saved")); render(); } catch (er) { toast(errMsg(er)); } } });
    const title = [(x.used || []).length ? t("sil_dates") + ": " + x.used.slice().sort().join(", ") : "", (x.planned || []).length ? t("sil_plDates") + ": " + x.planned.join(", ") : ""].filter(Boolean).join(" · ");
    tb.append(h("tr", { title }, h("td", {}, e.name), h("td", { class: "r" }, inp("allowance", n.base)), h("td", { class: "r" }, inp("used_before", +x.used_before || 0), x.self_set_at ? h("div", { class: "muted", style: "font-size:11px" }, "🔒 " + tf("sil_selfAdm", { d: x.self_set_at.slice(5, 10).replace("-", "/") })) : null),
      h("td", { class: "r", title: (x.mpv || []).map(m => m.month + " " + m.status).join(" · ") }, String(mpvAvail(x))), h("td", { class: "r" }, String(n.used)), h("td", { class: "r" }, String(n.planned)), h("td", { class: "r" }, h("b", { style: n.left < 0 ? "color:var(--bad)" : "" }, String(n.left)))));
  }
  card.append(h("div", { class: "tbl" }, tb));
  return card;
}
/* ---- owner: 13th month section in the due tab ---- */
async function due13Card() {
  const year = new Date().getFullYear();
  const card = h("div", { class: "card", id: "due-13" }, h("h2", {}, `${t("p13_due")} · ${year}`), h("small", { class: "muted" }, t("p13_dueHelp")));
  let rows = [], paid = [], acks = [];
  try { [rows, paid, acks] = await Promise.all([db.listPayrollsYear(year), db.listThirteenth(year).catch(() => []), db.listAck13(year).catch(() => [])]); } catch (e) { card.append(h("p", { class: "muted" }, errMsg(e))); return card; }
  const tb = h("table", {}, h("tr", {}, h("th", {}, t("employee")), h("th", { class: "r" }, t("p13_toDate")), h("th", { class: "r" }, t("p13_final")), h("th", {}, t("ackBtn")), h("th", {}, t("c13_status"))));
  let tot = 0;
  for (const e of S.employees.filter(e => e.active && !e.resigned_on && e.name !== "test")) {
    const periods = rows.filter(r => r.employee_id === e.id && (r.status === "paid" || r.shared_at) && r.result).map(r => ({ start: r.period_start, end: r.period_end, basic: +r.result.basicFor13th || 0 }));
    const P = proj13(periods, year, e); tot += P.amount;
    const a = acks.find(x => x.employee_id === e.id), pd = paid.find(x => x.employee_id === e.id);
    tb.append(h("tr", {}, h("td", {}, h("a", { href: "#", onclick: ev => { ev.preventDefault(); slip13(e, year, P); } }, e.name)),
      h("td", { class: "r" }, money(P.toDate)), h("td", { class: "r" }, h("b", {}, money(P.amount))),
      h("td", {}, a ? h("span", { class: "pill paid" }, "✓ " + new Date(a.ack_at).toLocaleDateString()) : h("span", { class: "pill draft" }, t("p13_notAck"))),
      h("td", {}, pd ? h("span", { class: "pill paid" }, `${t("c13_paid")} ₱${money(pd.amount)}`) : h("button", { class: "btn sm", type: "button", onclick: () => pay13(e, year, P.total, P.amount, P.monthAvg) }, t("c13_pay")))));
  }
  tb.append(h("tr", { class: "sum" }, h("td", {}, t("c13_total_row")), h("td", {}), h("td", { class: "r" }, h("b", {}, money(tot))), h("td", {}), h("td", {})));
  card.append(h("div", { class: "tbl" }, tb));
  return card;
}
/* ---- staff clock in / out: the app record is the attendance basis ---- */
const fmtT = d => { d = new Date(d); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const fmtDT = d => { d = new Date(d); return `${d.getMonth() + 1}/${d.getDate()} ${t("dow")[d.getDay()]} ${fmtT(d)}`; };
const getLoc = () => new Promise(res => { if (!navigator.geolocation) return res(null);
  navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }); });
const devText = (plan, dev) => plan == null || plan === "off" || plan === "sil" || dev == null ? t("rsnNoShift") : dev > 0 ? tf("rsnLate", { n: dev }) : tf("rsnEarly", { n: -dev });
/* clock in / out outside the schedule → why?  (cover/relief/work → 확인서 · personal / late / early-out → 사유서) */
function askReason(kind, r, loc) {
  const head = () => h("p", {}, h("b", {}, t(kind === "in" ? "punchIn" : "punchOut")), " · ", t("rsnPlan"), " ", r.plan && !/^(off|sil)$/.test(r.plan) ? SHIFT_LABEL(r.plan) : "—",
    " · ", t("rsnNow"), " ", fmtT(r.at), h("br"), h("b", { style: "color:var(--bad)" }, devText(r.plan, r.dev)));
  const send = async (reason, msg, close) => { try { const x = await db.punch(EMP.no, EMP.pin, kind, reason, loc || await getLoc());
      if (!x.ok) return toast(x.err === "away" ? t("awayErr") : x.need_reason ? t("rsnNeed") : pinErr(x.err)); close && close();
      toast(x.dup ? t("clockDup") : msg || t("rsnSent")); EMP.data = await db.empView(EMP.no, EMP.pin); renderStaffHome(); } catch (e) { toast(errMsg(e)); } };
  const choose = (title, q, opts) => { const close = sheet([h("h3", {}, title), head(), h("p", { style: "font-weight:700" }, q),
      h("div", { style: "display:grid;gap:8px" }, ...opts.map(([id, label, fn, primary]) => h("button", { class: "btn" + (primary ? " primary" : ""), type: "button", id, onclick: () => { close(); fn(); } }, label)),
        h("button", { class: "btn ghost", type: "button", onclick: () => close() }, t("cancel")))]); };
  const write = (title, label, prefix) => { const ta = h("textarea", { id: "rsn-text", rows: 3, placeholder: t("rsnPh"), style: "width:100%" });
    const close = sheet([h("h3", {}, title), head(), field(label, ta),
      h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: () => close() }, t("cancel")),
        h("button", { class: "btn primary", id: "rsn-send", onclick: () => { const txt = ta.value.trim(); if (!txt) return toast(t("rsnNeed")); send(prefix + txt, null, close); } }, t("rsnSend")))]);
    setTimeout(() => ta.focus(), 50); };
  const who = (title, prefix) => { const list = (EMP.data?.coworkers || []);
    const pick = sel([["", "—"], ...list.map(c => [c.id, `${c.name} (${t("pos_" + (c.position || "other"))})`])], "", { id: "who-sel" });
    const close = sheet([h("h3", {}, title), head(), field(t("whoLbl"), pick), h("small", { class: "muted" }, t("whoHelp")),
      h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: () => close() }, t("cancel")),
        h("button", { class: "btn primary", id: "who-send", onclick: () => { if (!pick.value) return toast(t("whoNeed"));
          const nm = list.find(c => c.id === pick.value)?.name || ""; send(prefix + pick.value, tf("whoSent", { n: nm }), close); } }, t("rsnSend")))]); };
  if (r.early) return choose(t("eqTitle"), t("eqQ"), [
    ["eq-cover", t("eqCover"), () => who(t("eqCover"), "#cover:"), true],
    ["eq-personal", t("eqPersonal"), () => send("#personal", tf("clockDone", { k: t("punchIn"), t: fmtT(r.at) }))]]);
  if (r.late_in) return write(t("liTitle"), t("liLbl"), "");
  if (r.early_out) return write(t("eoTitle"), t("eoLbl"), "");
  if (r.late_out) { const hall = (EMP.data?.employee?.position || "") === "waiter";
    return choose(t("loTitle"), t("loQ"), [
      ["lo-relief", t("loRelief"), () => who(t("loRelief"), "#relief:"), true],
      ["lo-work", t("loWork"), () => !hall ? write(t("loWork"), t("rsnWork"), "#work:") : choose(t("loWork"), t("cbQ"), [
        ["cb-yes", t("cbYes"), () => { const c3 = sheet([h("p", { style: "font-weight:700" }, t("cbMsg")), h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn primary", type: "button", id: "cb-ok", onclick: () => send("#cashbook", t("cbMsg"), c3) }, t("ok")))]); }],
        ["cb-no", t("cbNo"), () => write(t("loWork"), t("rsnWork"), "#work:"), true]])],
      ["lo-personal", t("loPersonal"), () => write(t("loPersonal"), t("rsnPersonal"), "#personal:")]]); }
  return write(t("rsnTitle"), t("rsnLbl"), "");   // no shift that day
}
/* ---- staff: a coworker wrote your name (covered for you / stayed because you were late) → confirm ---- */
function mentionsCard(v) {
  const list = (v.mentions || []); if (!list.length) return null;
  return h("div", { class: "card", id: "my-mentions", style: list.some(m => !m.ack_at) ? "border:2px solid var(--gold)" : "" }, h("h2", {}, "🔔 " + t("mnTitle")),
    h("div", { class: "list" }, list.map(m => h("div", { class: "item", style: "display:block" },
      h("div", {}, tf(m.mode === "cover" ? "mnCover" : "mnRelief", { n: m.by, t: fmtDT(m.at) })),
      m.ack_at ? h("span", { class: "pill " + (m.ok ? "paid" : "late") }, m.ok ? t("mnYes") : t("mnNo"))
        : h("div", { class: "row", style: "gap:6px;margin-top:6px" },
            h("button", { class: "btn sm primary", type: "button", onclick: async () => { try { const r = await db.mentionAck(EMP.no, EMP.pin, m.id, true); if (!r.ok) throw new Error(pinErr(r.err, "noData")); EMP.data = await db.empView(EMP.no, EMP.pin); renderStaffHome(); } catch (e) { toast(errMsg(e)); } } }, t("mnYes")),
            h("button", { class: "btn sm", type: "button", onclick: async () => { try { const r = await db.mentionAck(EMP.no, EMP.pin, m.id, false); if (!r.ok) throw new Error(pinErr(r.err, "noData")); EMP.data = await db.empView(EMP.no, EMP.pin); renderStaffHome(); } catch (e) { toast(errMsg(e)); } } }, t("mnNo")))))));
}
/* ---- owner: leave requests from the staff app (a period is decided at once) ---- */
async function silReqCard() {
  let rows = []; try { rows = await db.silReqList(); } catch (e) { return h("span"); }
  const decide = async (g, ok) => { const r = g[0]; try { const x = r.grp ? await db.leaveDecide(r.grp, ok) : await db.silDecide(r.id, ok); if (!x.ok) throw new Error(x.err); toast(t("saved")); render(); } catch (e) { toast(errMsg(e)); } };
  const line = g => { const r = g[0], k = lvKind(r), pend = g.some(z => z.status === "pending"), st = pend ? "pending" : r.status, warn = pend ? (r.warn || []) : [];
    const plans = [...new Set(g.map(z => z.plan ? planLabel(z.plan) : "—"))].join(", ");
    return h("div", { class: "item", style: "display:block" + (warn.length ? ";border-left:3px solid var(--gold);padding-left:8px" : "") },
      h("div", { class: "row", style: "align-items:center;flex-wrap:wrap;gap:6px" }, h("b", {}, r.name),
        h("span", { class: "pill " + (k === "off" ? "draft" : "paid") }, t("k_lv_" + k)), h("span", {}, lvRange(g.map(z => String(z.day))) + (g.length > 1 ? ` (${g.length})` : "")),
        h("span", { class: "pill " + (st === "approved" ? "paid" : st === "rejected" ? "late" : "draft") }, t("st_" + st)), h("span", { class: "sp" }),
        pend ? h("button", { class: "btn sm primary", onclick: () => decide(g, true) }, t("rv_ok")) : null,
        pend ? h("button", { class: "btn sm", onclick: () => decide(g, false) }, t("rv_no")) : null),
      h("div", { class: "muted", style: "font-size:13px" }, [r.reason ? "“" + r.reason + "”" : "", t("sr_curPlan") + " " + plans,
        k === "sil" ? tf("sr_leftAfter", { n: Math.max(0, +r.left) }) : k === "mpv" ? tf("lv_mpvS", { n: Math.max(0, +r.left) }) : ""].filter(Boolean).join(" · ")),
      warn.length ? h("div", { style: "font-size:13px;color:var(--bad);margin-top:4px" }, h("b", {}, t("lv_warn")), h("div", {}, warn.map(w => h("div", {}, "• " + w)))) : null); };
  const pend = lvGroups(rows.filter(r => r.status === "pending")), done = lvGroups(rows.filter(r => r.status !== "pending"));
  return h("div", { class: "card", id: "sil-req-admin" }, h("div", { class: "row" }, h("h2", {}, t("sr_adminTitle")), h("span", { class: "sp" }), pend.length ? h("span", { class: "pill draft" }, pend.length) : null),
    h("small", { class: "muted" }, t("sr_adminHelp")),
    pend.length ? h("div", { class: "list" }, pend.map(line)) : h("p", { class: "muted" }, t("sr_none")),
    done.length ? h("details", {}, h("summary", { class: "muted" }, t("rv_done") + ` (${done.length})`), h("div", { class: "list" }, done.map(line))) : null);
}
/* ---- owner: review clock-ins/outs outside the schedule + printable explanation letter ---- */
async function reviewCard() {
  const card = h("div", { class: "card", id: "punch-review" }, h("h2", {}, t("rv_title")), h("small", { class: "muted" }, t("rv_help")));
  let rows = []; try { rows = await db.listPunchReview(30); } catch (e) { card.append(h("p", { class: "muted" }, errMsg(e))); return card; }
  const line = p => { const nm = p.employees?.name || "?";
    return h("div", { class: "item", style: "display:block" },
      h("div", { class: "row", style: "align-items:center;flex-wrap:wrap;gap:6px" }, h("b", {}, nm), h("span", {}, t(p.kind === "in" ? "punchIn" : "punchOut") + " " + fmtDT(p.punched_at)),
        h("span", { class: "pill " + (p.status === "approved" ? "paid" : p.status === "rejected" ? "late" : "draft") }, t(p.status === "rejected" ? "rv_st_rejected" : "st_" + p.status)), h("span", { class: "sp" }),
        p.status === "pending" ? h("button", { class: "btn sm primary", onclick: async () => { try { await db.decidePunch(p.id, "approved"); render(); } catch (e) { toast(errMsg(e)); } } }, t("rv_ok")) : null,
        p.status === "pending" ? h("button", { class: "btn sm", onclick: async () => { try { await db.decidePunch(p.id, "rejected"); render(); } catch (e) { toast(errMsg(e)); } } }, t("rv_no")) : null,
        h("button", { class: "btn sm", onclick: () => printLetter(p) }, "🖨 " + (["work", "cover", "relief"].includes(p.mode) || (p.mode === "personal" && p.kind === "in") ? t("lt_conf") : t("lt_ex"))),
        h("button", { class: "btn sm ghost", onclick: () => confirmSheet(t("rv_void") + "?", async () => { try { await db.decidePunch(p.id, "void"); render(); } catch (e) { toast(errMsg(e)); } }, { ask: true }) }, t("rv_void"))),
      h("div", { class: "muted", style: "font-size:13px" }, t("rsnPlan") + " " + (p.plan_shift && !/^(off|sil)$/.test(p.plan_shift) ? SHIFT_LABEL(p.plan_shift) : "—") + " · " + devText(p.plan_shift, p.dev_min)),
      h("div", { style: "margin-top:2px" }, "“" + (p.reason || "—") + "”"),
      p.other?.name ? h("div", { class: "muted", style: "font-size:13px" }, "👤 " + p.other.name + " · " + (p.other_ack_at ? (p.other_ok ? "✓ " + t("mnYes") : "✗ " + t("mnNo")) : t("p13_notAck"))) : null); };
  const pend = rows.filter(p => p.status === "pending"), done = rows.filter(p => p.status !== "pending");
  card.append(pend.length ? h("div", { class: "list" }, pend.map(line)) : h("p", { class: "muted" }, t("rv_none")));
  if (done.length) card.append(h("details", {}, h("summary", { class: "muted" }, t("rv_done") + ` (${done.length})`), h("div", { class: "list" }, done.map(line))));
  return card;
}
function printLetter(p) {
  const e = p.employees || {}, name = e.info?.full_name || e.name || "";
  const plan = p.plan_shift && !/^(off|sil)$/.test(p.plan_shift) ? SHIFT_LABEL(p.plan_shift) : "No shift scheduled";
  const d = new Date(p.punched_at);
  const dev = p.dev_min == null ? "No shift scheduled" : p.dev_min > 0 ? `${p.dev_min} minute(s) late` : `${-p.dev_min} minute(s) early`;
  const row = (a, b) => h("tr", {}, h("th", { style: "text-align:left;width:38%;padding:6px;border:1px solid #999;background:#f3f3f3" }, a), h("td", { style: "padding:6px;border:1px solid #999" }, b));
  const box = h("div", { id: "printOne" }, h("div", { class: "slip", style: "font-family:Arial,sans-serif;color:#000;background:#fff;padding:24px;max-width:720px" },
    h("h2", { style: "text-align:center;margin:0 0 4px" }, ["work", "cover", "relief"].includes(p.mode) || (p.mode === "personal" && p.kind === "in") ? "CONFIRMATION / 확인서" : "EXPLANATION LETTER / 사유서"), h("div", { style: "text-align:center;margin-bottom:16px" }, "Paltong"),
    h("table", { style: "width:100%;border-collapse:collapse;font-size:14px" },
      row("Employee name", name), row("Position", e.position || ""), row("Date", d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric", weekday: "short" })),
      row(p.kind === "in" ? "Clock in" : "Clock out", d.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" })), row("Scheduled shift", plan), row("Difference", dev),
      row("Status", p.status === "approved" ? "Approved (reason accepted)" : p.status === "rejected" ? "Noted (reason not accepted)" : "Waiting for approval") ),
    h("h3", { style: "margin:18px 0 6px" }, "Reason / 사유"), h("div", { style: "border:1px solid #999;min-height:110px;padding:10px;white-space:pre-wrap;font-size:14px" }, p.reason || ""),
    h("p", { style: "font-size:13px;margin:14px 0 0" }, ["work", "cover", "relief"].includes(p.mode)
      ? "I worked outside my scheduled hours for the work reason above" + (p.other?.name ? ` (coworker: ${p.other.name}${p.other_ack_at ? (p.other_ok ? " — confirmed" : " — denied") : " — not yet confirmed"})` : "") + ". I agree that this time is recorded as overtime and paid only if approved by the manager."
      : p.mode === "personal" && p.kind === "in" ? "I came in before my scheduled time for a personal reason (to avoid being late). I confirm this time is not work time and is not paid."
      : p.mode === "cashbook" ? "The Cash Book must be closed before the end of the shift; this time is not overtime."
      : "I confirm that the information above is true and correct. This time is for a personal reason and is not overtime."),
    h("div", { style: "display:flex;gap:40px;margin-top:36px" }, sigLine("Employee signature / Date", sigOf(p.employee_id), fmtD(p.punched_at)), sigLine("Manager signature / Date", null, ""))));
  box.remove(); printOneDoc(box.firstChild);
}
function clockCard() {
  const punches = (EMP.data?.punches || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
  const last = punches[0];
  const inNow = last && last.kind === "in";
  const status = !last ? t("notIn") : inNow ? tf("clockedIn", { t: fmtDT(last.at) }) : tf("clockedOut", { t: fmtDT(last.at) });
  const press = async kind => {
    const btns = document.querySelectorAll("#clock button"); btns.forEach(b => b.disabled = true);
    try {
      const loc = await getLoc();
      const r = await db.punch(EMP.no, EMP.pin, kind, null, loc);
      if (!r.ok && r.err === "away") { toast(t("awayErr")); btns.forEach(b => b.disabled = false); return; }
      if (!r.ok && r.need_reason) { btns.forEach(b => b.disabled = false); askReason(kind, r, loc); return; }
      if (!r.ok) { toast(pinErr(r.err)); return; }
      if (r.dup) { toast(t("clockDup")); return; }
      toast(tf("clockDone", { k: t(kind === "in" ? "punchIn" : "punchOut"), t: fmtT(r.at) }));
      EMP.data = await db.empView(EMP.no, EMP.pin); renderStaffHome();
    } catch (e) { toast(errMsg(e)); btns.forEach(b => b.disabled = false); }
  };
  const recent = punches.slice(0, 10);
  return h("div", { class: "card", id: "clock" }, h("h2", {}, t("clock")), h("p", { class: "muted", style: "margin:0" }, t("clockHelp")),
    h("div", { class: "clockStatus" + (inNow ? " in" : "") }, status),
    (() => { // latest session: the last IN and the OUT after it, big and always visible
      const lastIn = punches.find(p => p.kind === "in"), lastOut = punches.find(p => p.kind === "out" && (!lastIn || new Date(p.at) > new Date(lastIn.at)));
      const cell = (k, p) => h("div", {}, h("small", {}, t(k) + (p ? " · " + `${new Date(p.at).getMonth() + 1}/${new Date(p.at).getDate()}` : "")), h("b", {}, p ? fmtT(p.at) : "—:—"),
        p && p.status && p.status !== "ok" ? h("span", { class: "pill " + (p.status === "approved" ? "paid" : p.status === "rejected" ? "late" : "draft"), style: "margin-left:6px" }, t(p.status === "rejected" ? "rv_st_rejected" : "st_" + p.status)) : null);
      return h("div", { class: "clockToday", id: "clock-today" }, cell("punchIn", lastIn), cell("punchOut", lastOut));
    })(),
    h("details", { class: "rules", style: "margin:0 0 8px" }, h("summary", { class: "muted" }, "ℹ️ " + t("rulesTitle")),
      h("ul", { style: "margin:6px 0 0;padding-left:18px;font-size:13px;display:grid;gap:4px" }, ...t("rules").map(x => h("li", {}, x)),
        (EMP.data?.employee?.position || "") === "waiter" ? h("li", { style: "font-weight:700;color:var(--bad)" }, t("rulesHall")) : null)),
    h("div", { class: "clockBtns" },
      h("button", { class: "btn primary big", type: "button", id: "clock-in", disabled: !!inNow, onclick: () => press("in") }, "▶ " + t("punchIn")),
      h("button", { class: "btn big", type: "button", id: "clock-out", disabled: !last || !inNow, onclick: () => press("out") }, "■ " + t("punchOut"))),
    recent.length ? h("details", { open: true }, h("summary", { class: "muted" }, t("clockRecent")), h("div", { class: "list" }, recent.map(p => h("div", { class: "item" },
      h("div", { class: "t" }, t(p.kind === "in" ? "punchIn" : "punchOut"), p.source === "admin" ? h("span", { class: "pill draft", style: "margin-left:6px" }, t("punchAdmin")) : null,
        p.status && p.status !== "ok" ? h("span", { class: "pill " + (p.status === "approved" ? "paid" : p.status === "rejected" ? "late" : "draft"), style: "margin-left:6px" }, t(p.status === "rejected" ? "rv_st_rejected" : "st_" + p.status)) : null),
      h("div", { class: "s" }, fmtDT(p.at) + (p.reason ? " · " + p.reason : "")))))) : null);
}
/* ---- staff self-calculator: shifts + statutory deductions only, nothing saved ---- */
const SC = { month: null, half: null, days: [], gov: { sss: false, philhealth: false, pagibig: false, share: 0.5 }, fillShift: "8-18" };
// 미리 계산: 비어 있는 날은 스케줄표(계획) 기준으로 채움
const planDay = (date, sh) => !sh ? { date, shift: "", type: "off" } : sh === "off" ? { date, shift: "", type: "off" } : sh === "sil" ? { date, shift: "", type: "sil" } : { date, shift: sh, type: "regular" };
/* ---- staff: expected pay for the current pay period, from the schedule (not final) ---- */
function myEstCard(emp, v) {
  const per = periodForDate(today());
  const done = (v.payrolls || []).find(p => p.period_start === per.start && (p.status === "paid" || p.shared));
  if (done) return null;
  const planBy = Object.fromEntries((v.schedule || []).map(r => [r.day, r.shift]));
  const paidBefore = new Set((v.payrolls || []).flatMap(p => (p.result?.rows || []).filter(r => !r.carry && (DAY_TYPES[r.type]?.worked || r.type === "sil" || +r.amount > 0)).map(r => r.date)));
  const days = [...(per.carry || []).filter(d => !paidBefore.has(d)).map(d => ({ ...planDay(d, planBy[d]), date: d, carry: true })), ...datesBetween(per.start, per.end).map(d => planDay(d, planBy[d]))];
  applyHolidays(days, HOL);
  const worked = paidDays(days).filter(d => DAY_TYPES[d.type]?.worked || d.type === "sil");
  if (!worked.length) return null;
  const st = EMP.data?.settings || {};
  const R = computePayroll(paidDays(days), { scheme: schemeOf(emp), payType: emp.pay_type || "daily", daily: +emp.daily_rate, monthly: +emp.monthly_rate || 0, breakHrs: breakFor(emp, st.break_hours),
    allowancePerDay: +emp.allowance_per_day || 0, gov: { share: 0.5 }, govShare: 0.5, hoursPerDay: +st.hours_per_day || 10, latePenalty: st.late_penalty !== false,
    monthlyBasic: +st.monthly_basic || 25945, otIncluded: st.monthly_ot_incl ?? 1 });
  return h("div", { class: "card", id: "my-est", style: "border:2px dashed var(--gold)" },
    h("div", { class: "row", style: "align-items:center;flex-wrap:wrap" },
      h("div", {}, h("h2", { style: "margin:0" }, t("myEst")), h("div", { class: "muted" }, periodLabel(per.start, per.end) + " · " + tf("myEstDays", { n: worked.length }))),
      h("span", { class: "sp" }), h("div", { class: "money", style: "font-size:26px;font-weight:800" }, "₱" + money(R.gross))),
    h("p", { class: "muted", style: "margin:8px 0 0;font-size:13px" }, t("myEstNote")));
}
function staffCalcCard(emp, v) {
  const planBy = Object.fromEntries((v?.schedule || []).map(r => [r.day, r.shift]));
  const monthly = (emp.pay_type || "daily") === "monthly";
  if (!SC.month) { const p = periodForDate(today()); SC.half = p.half; SC.month = p.start.slice(0, 7); }
  const setPeriod = () => { const [y, m] = SC.month.split("-").map(Number); const p = periodOf(y, m, SC.half); SC.start = p.start; SC.end = p.end;
    const by = Object.fromEntries(SC.days.map(d => [d.date, d])); SC.days = datesBetween(p.start, p.end).map(d => by[d] || planDay(d, planBy[d])); };
  setPeriod();
  const opts = () => ({ scheme: schemeOf(emp), payType: emp.pay_type || "daily", daily: +emp.daily_rate, monthly: +emp.monthly_rate || 0, breakHrs: breakFor(emp, EMP.data?.settings?.break_hours), allowancePerDay: +emp.allowance_per_day || 0, gov: SC.gov, govShare: +SC.gov.share === 1 ? (SC.half === 2 ? 1 : 0) : 0.5, hoursPerDay: +(EMP.data?.settings?.hours_per_day) || 10, latePenalty: EMP.data?.settings?.late_penalty !== false, monthlyBasic: +(EMP.data?.settings?.monthly_basic) || 25945, otIncluded: EMP.data?.settings?.monthly_ot_incl ?? 1 });
  let R = computePayroll(paidDays(SC.days), opts());
  const monthIn = h("input", { type: "month", id: "scMonth", value: SC.month, onchange: e => { SC.month = e.target.value; setPeriod(); draw(); } });
  const halfSel = sel([[1, t("first")], [2, t("second")]], SC.half, { id: "scHalf", onchange: e => { SC.half = +e.target.value; setPeriod(); draw(); } });
  const fillSel = sel(SHIFTS.map(v => [v, SHIFT_LABEL(v)]), SC.fillShift, { onchange: e => SC.fillShift = e.target.value });
  const fillBtn = h("button", { class: "btn sm", type: "button", onclick: () => { for (const d of SC.days) { d.shift = SC.fillShift; d.type = "regular"; } draw(); } }, t("fillAll"));
  const rosterEl = h("div", { class: "roster" }), sumEl = h("p", { class: "muted" }), tbl = h("table"), netEl = h("div", { class: "net", style: "font:700 24px var(--mono);color:var(--good)" });
  const govBox = (k, label) => h("label", { class: "check" }, h("input", { type: "checkbox", id: "sc_" + k, checked: !!SC.gov[k], onchange: e => { SC.gov[k] = e.target.checked; draw(); } }), label);
  const shareSel = sel([[0.5, t("govShare")], [1, t("govFull")]], SC.gov.share, { onchange: e => { SC.gov.share = +e.target.value; draw(); } });
  function draw() {
    R = computePayroll(paidDays(SC.days), opts());
    rosterEl.innerHTML = "";
    for (const d of SC.days) {
      const dow = new Date(d.date + "T00:00:00").getDay(); const wk = dow === 5 || dow === 6;
      const sh = DAY_TYPES[d.type]?.worked ? shiftHours(d.shift, breakFor(emp, EMP.data?.settings?.break_hours)) : null;
      const toggle = () => { if (d.type === "off") { d.shift = d.shift || SC.fillShift; d.type = "regular"; } else { d.shift = ""; d.type = "off"; } draw(); };
      rosterEl.append(h("div", { class: "day" + (d.type === "off" ? " off" : "") + (d.type === "sil" ? " sil" : "") + (/holiday|special|absent/.test(d.type) ? " hol" : "") + (wk ? " wknd" : "") },
        h("div", { class: "d", role: "button", style: "cursor:pointer", onclick: toggle }, t("dow")[dow], h("b", {}, +d.date.slice(8))),
        ...(() => { const c = shiftPicker(d, false, () => draw(), SC.fillShift); return [c[0],
        sel(dayTypesFor(schemeOf(emp), emp.pay_type).map(k => [k, t("type_" + k)]), d.type, { "aria-label": "day type", onchange: e => { d.type = e.target.value; if (!DAY_TYPES[d.type].worked) d.shift = ""; else if (!d.shift) d.shift = SC.fillShift; draw(); } }), c[1]]; })(),
        DAY_TYPES[d.type]?.worked && !monthly && schemeOf(emp) === "paper" && otInput(d, false, calc, +(EMP.data?.settings?.hours_per_day) || 10, breakFor(emp, EMP.data?.settings?.break_hours)),
        sh && sh.worked > 0 && h("div", { class: "hrs" }, hrsLine(sh, schemeOf(emp) === "paper", monthly, +(EMP.data?.settings?.hours_per_day) || 10, breakFor(emp, EMP.data?.settings?.break_hours)))));
    }
    calc();
  }
  function calc() {
    R = computePayroll(paidDays(SC.days), opts());
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
  const tabs = [["pay", t("tab_pay")], ["sched", t("tab_sched")], ["emp", t("tab_emp")], ["ledger", t("tab_ledger")], ["due", t("tab_due")], ["hist", t("tab_hist")], ["m13", t("tab_13")], ["set", t("tab_set")]];
  root.append(
    h("div", { class: "top" }, h("span", { class: "brand" }, t("app")), h("span", { class: "sp" }),
      h("span", { class: "muted", style: "color:inherit;opacity:.8;font-size:13px" }, S.user?.name || ""),
      h("button", { onclick: () => setLang(lang === "ko" ? "en" : "ko") }, lang === "ko" ? "EN" : "한"),
      h("button", { onclick: menu }, "⋯")),
    h("div", { class: "tabs", role: "tablist" }, tabs.map(([k, l]) => h("button", { role: "tab", class: k === "due" ? "due" : "", "aria-selected": S.tab === k, onclick: () => { S.tab = k; render(); } }, l))),
    h("div", { id: "pend-bar" }),
    h("main", { id: "main" }));
  pendingBar();
  ({ pay: renderPay, sched: renderSched, emp: renderEmp, ledger: renderLedger, due: renderDue, hist: renderHist, m13: render13, set: renderSet })[S.tab]();
}
/* ---- owner: web push on this device (approval alerts) ---- */
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const pushIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const b64ToU8 = b => { const p = "=".repeat((4 - b.length % 4) % 4), s = atob((b + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, c => c.charCodeAt(0)); };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
async function pushSub() { if (!pushOK()) return null; try { const r = await navigator.serviceWorker.getRegistration("/"); return r ? await r.pushManager.getSubscription() : null; } catch { return null; } }
async function pushEnable() {
  if (!pushOK()) throw new Error(pushIOS() && !isStandalone() ? t("push_ios") : t("push_unsup"));
  if (await Notification.requestPermission() !== "granted") throw new Error(t("push_denied"));
  const info = await db.pushInfo();
  const reg = await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(info.public_key) });
  const j = sub.toJSON(), label = (pushIOS() ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "PC") + " · " + new Date().toLocaleDateString();
  await db.pushSubscribe(j.endpoint, j.keys.p256dh, j.keys.auth, label);
  await db.pushTest().catch(() => { });
}
async function pushDisable() { const s = await pushSub(); if (s) { await db.pushUnsubscribe(s.endpoint).catch(() => { }); await s.unsubscribe().catch(() => { }); } }
async function pushSheet() {
  const sub = await pushSub(); let info = null; try { info = await db.pushInfo(); } catch { }
  const close = sheet([h("h3", {}, t("push_menu")), h("p", {}, sub ? t("push_state_on") : t("push_state_off"), info ? " · " + tf("push_devices", { n: info.devices }) : ""),
    h("div", { style: "display:grid;gap:8px" },
      sub ? h("button", { class: "btn primary", type: "button", onclick: async () => { try { await db.pushTest(); toast("✓"); } catch (e) { toast(errMsg(e)); } } }, t("push_test"))
        : h("button", { class: "btn primary", type: "button", onclick: async () => { try { await pushEnable(); toast(t("push_done")); close(); render(); } catch (e) { toast(errMsg(e)); } } }, t("push_on")),
      sub ? h("button", { class: "btn", type: "button", onclick: async () => { await pushDisable(); close(); render(); } }, t("push_off")) : null,
      h("button", { class: "btn ghost", type: "button", onclick: () => close() }, t("cancel")))]);
}
/* ---- owner: "waiting for approval" bar under the tabs (every tab) ---- */
async function pendingBar() {
  const bar = document.getElementById("pend-bar"); if (!bar || S.user?.role !== "owner") return;
  if (pushOK() && Notification.permission !== "denied" && !lsGet("pr_push_later") && !(await pushSub()))
    bar.append(h("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;background:#111;color:#fff" },
      h("span", { style: "font-weight:700" }, t("push_ask")), h("span", { class: "sp" }),
      h("button", { class: "btn sm primary", type: "button", onclick: async () => { try { await pushEnable(); toast(t("push_done")); render(); } catch (e) { toast(errMsg(e)); } } }, t("push_on")),
      h("button", { class: "btn sm ghost", type: "button", style: "color:#fff", onclick: ev => { lsSet("pr_push_later", "1"); ev.currentTarget.parentNode.remove(); } }, t("push_later"))));
  let p = null; try { p = await db.pendingCounts(); } catch { return; }
  if (!p || !(+p.leave + +p.punch + +p.cash)) return;
  const go = (tab, id) => { S.tab = tab; render(); setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" }), 400); };
  const chip = (n, k, tab, id) => +n ? h("button", { class: "btn sm", type: "button", style: "background:#fff;color:#111", onclick: () => go(tab, id) }, tf(k, { n })) : null;
  bar.append(h("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;background:var(--gold, #f5b800);color:#111;font-weight:700" },
    h("span", {}, t("pend_title")), chip(p.leave, "pend_leave", "due", "sil-req-admin"), chip(p.punch, "pend_punch", "due", "punch-review"), chip(p.cash, "pend_cash", "ledger", "cash-issues")));
}
function menu() {
  const close = sheet([
    h("h3", {}, S.user?.name || ""),
    h("button", { class: "btn", onclick: () => { close(); changePw(); } }, t("changePw")),
    S.user?.role === "owner" ? h("button", { class: "btn", onclick: () => { close(); pushSheet(); } }, t("push_menu")) : null,
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
  const itemRow = (l, sign, cls) => row(`　· ${l.biz_date ? l.biz_date.slice(5).replace("-", "/") : ""} ${noteOf(l) || t("k_" + l.kind)}`, sign + money(l.amount), cls + " sub");
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
  const p = periodForDate(today()); const half = p.half;
  return { employee_id: "", month: p.start.slice(0, 7), half, start: p.start, end: p.end, id: null, status: "draft", loaded: false,
    pay_type: "daily", daily_rate: +S.settings.min_wage || 718, monthly_rate: +S.settings.kitchen_monthly || 30000, allowance_per_day: 0,
    break_hours: +S.settings.break_hours || 1, days: [], late_minutes: 0, incentive: 0, other_deduction: 0,
    gov: { sss: !!S.settings.sss_on, philhealth: !!S.settings.philhealth_on, pagibig: !!S.settings.pagibig_on, share: +S.settings.gov_share || 0.5 },
    ledger: [], paid_on: null, paid_via: null, pay_via: "CASH", pay_split: 0, restDow: 1, fillShift: "8-18" };
}
function emptyDay(date) { return { date, shift: "", type: "off" }; }
/* 1–15 payroll after a 31-day month: the previous month's 30th (day + night) and 31st come in as carried rows (소급 이월).
   Taken from what's already in this payroll, else the 16–30 payroll's roster, else the Cash Book plan.
   A carried date the 16–30 payroll already paid (older rule / paid leave) is kept as "excluded" so it is never paid twice. */
const carryNorm = d => { if (d.prevPaid) { d.shift = ""; d.type = "off"; } return d; };
/* clock-ins paired per business day, with the manager's decisions:
   late clock-out paid only when approved (every minute) — pending / rejected / hall Cash Book / personal → cut at the scheduled end;
   early clock-in paid from the actual time only when approved as work; late clock-in approved = paid from the scheduled start (no cut),
   pending / rejected late clock-in and early clock-out always cut */
function decidedPunches(rows) {
  const at = r => r.punched_at || r.at;
  const by = pairPunches(rows.map(r => ({ kind: r.kind, at: at(r) })));
  const outSt = new Map(rows.filter(r => r.kind === "out").map(r => [new Date(at(r)).getTime(), r.mode === "personal" || r.mode === "cashbook" ? "rejected" : r.status || "ok"]));
  const inSt = new Map(rows.filter(r => r.kind === "in").map(r => [new Date(at(r)).getTime(), r.mode === "personal" ? "ok" : r.status || "ok"]));
  for (const x of Object.values(by)) {
    const si = x.in ? inSt.get(x.in.getTime()) : null, so = x.out ? outSt.get(x.out.getTime()) : null;
    x.inOk = si === "approved";
    x.minExtra = so === "approved" ? 0 : so === "pending" || so === "rejected" ? Infinity : 60;
    x.pending = si === "pending" || so === "pending";
  }
  return by;
}
/* the paid part of a day's clock-in against the planned shift */
const paidOf = (x, plan) => plan && parseShift(plan) && x.shift ? paidShift(plan, x.shift, x.minExtra, x.inOk) : x.shift;
/* put clock-ins (with decisions) on the payroll days; returns { n filled, inc incomplete } */
function applyPunchRows(P, rows) {
  const by = decidedPunches(rows); let n = 0, inc = 0;
  for (const d of P.days) { const x = by[d.date]; if (!x) continue;
    if (x.shift) { const plan = DAY_TYPES[d.type]?.worked && d.shift && !d.card ? d.shift : (d.plan || ""); d.plan = plan || undefined; d.card = x.shift.replace("-", "–"); d.shift = paidOf(x, plan); if (!DAY_TYPES[d.type]?.worked) d.type = "regular"; n++; if (d.carry) carryNorm(d); } else { inc++; } }
  return { n, inc };
}
async function carryRows(P, emp, saved, plan) {
  if (!P.carry.length) return [];
  const mine = Object.fromEntries((saved || []).filter(d => d.carry).map(d => [d.date, d]));
  let prev = null; try { prev = await db.getPayroll(emp.id, P.carry[0].slice(0, 8) + "16"); } catch { }
  if (prev && prev.status === "paid" && prev.period_end === P.carry[1]) return [];   // old 16–31 period: the 31st was already paid
  const prevBy = Object.fromEntries((prev?.days || []).map(d => [d.date, d]));
  const prevPaid = new Set(((prev?.status === "paid" || prev?.shared_at) ? prev?.result?.rows || [] : []).filter(r => !r.carry && (DAY_TYPES[r.type]?.worked || r.type === "sil" || +r.amount > 0)).map(r => r.date));
  if (!plan && P.carry.some(d => !mine[d] && !prevBy[d])) { plan = {}; try { plan = Object.fromEntries((await db.cashbookShifts(P.carry[0], P.carry[1])).filter(r => String(r.staff_name || "").trim().toLowerCase() === String(emp.name).trim().toLowerCase() && r.shift).map(r => [r.day, r.shift])); } catch { } }
  return P.carry.map(date => carryNorm({ ...(mine[date] || prevBy[date] || planDay(date, (plan || {})[date])), date, carry: true, ...(prevPaid.has(date) ? { prevPaid: true } : {}) }));
}
async function loadPay(P) {
  const emp = S.employees.find(e => e.id === P.employee_id);
  P.pay_type = payTypeOf(emp);
  const [y, m] = P.month.split("-").map(Number); const p = periodOf(y, m, P.half); P.start = p.start; P.end = p.end; P.carry = p.carry || [];
  const dates = datesBetween(P.start, P.end);
  if (emp) {
    const row = await db.getPayroll(P.employee_id, P.start);
    if (row) {
      Object.assign(P, { id: row.id, status: row.status, daily_rate: +row.daily_rate, monthly_rate: +row.monthly_rate || +emp.monthly_rate, allowance_per_day: +row.allowance_per_day,
        break_hours: +row.break_hours, late_minutes: row.late_minutes, incentive: +row.incentive, other_deduction: +row.other_deduction, gov: row.gov, paid_on: row.paid_on, paid_via: row.paid_via, shared_at: row.shared_at || null, ack_at: row.ack_at || null, note: row.note || "", result: row.result || null, pay_via: row.result?.payout?.via || row.paid_via || "CASH", pay_split: +(row.result?.payout?.split || 0) });
      if (row.status !== "paid") P.gov = { share: 0.5, ...(row.gov || {}), fixed: govFixedOf(emp) };   // saved payroll: keep the ticks as saved
      const byDate = Object.fromEntries((row.days || []).map(d => [d.date, d]));
      if (row.status === "paid") { P.end = row.period_end; P.days = (row.days || []).slice(); }   // paid: exactly what was paid (old 16–31 periods too)
      else P.days = [...await carryRows(P, emp, row.days), ...dates.map(d => byDate[d] && !byDate[d].carry ? byDate[d] : emptyDay(d))];
    } else {
      Object.assign(P, { id: null, status: "draft", break_hours: breakFor(emp, S.settings.break_hours), daily_rate: +emp.daily_rate, monthly_rate: +emp.monthly_rate || +S.settings.kitchen_monthly, allowance_per_day: +emp.allowance_per_day || 0,
        late_minutes: 0, incentive: 0, other_deduction: 0, paid_on: null, paid_via: null, shared_at: null, note: "", result: null, pay_via: emp.info?.gcash ? "GCASH" : "CASH", pay_split: 0,
        gov: govFor(emp, { sss: !!S.settings.sss_on, philhealth: !!S.settings.philhealth_on, pagibig: !!S.settings.pagibig_on, share: +S.settings.gov_share || 0.5 }, P.end) });
      // 새 급여: 스케줄표(계획) 기준으로 미리 채움 — 실제 출퇴근은 "앱 출퇴근 불러오기"로 덮어쓰기
      let plan = {}; try { plan = Object.fromEntries((await db.cashbookShifts(P.carry[0] || P.start, P.end)).filter(r => String(r.staff_name || "").trim().toLowerCase() === String(emp.name).trim().toLowerCase() && r.shift).map(r => [r.day, r.shift])); } catch { }
      P.days = [...await carryRows(P, emp, null, plan), ...dates.map(d => planDay(d, plan[d]))];
    }
    // open payroll: app clock-ins (with the manager's approve / reject) go on the schedule automatically
    if (P.status !== "paid" && !P.shared_at) { try { applyPunchRows(P, await db.listPunches(P.employee_id, P.carry[0] || P.start, P.end)); } catch { } }
    if (P.status !== "paid" && !P.shared_at) applyHolidays(P.days, HOL);   // public holidays included from the start
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
    otherDeduction: (+P.other_deduction || 0) + sum("other"), gov: P.gov, govShare: +P.gov.share === 1 ? (+P.half === 2 ? 1 : 0) : 0.5, hoursPerDay: +S.settings.hours_per_day || 10, latePenalty: S.settings.late_penalty !== false, monthlyBasic: +S.settings.monthly_basic || 25945, otIncluded: S.settings.monthly_ot_incl ?? 1 };
  return o;
}
async function renderPay() {
  const main = document.getElementById("main");
  if (!S.pay) S.pay = defaultPay();
  if (!S.pay.loaded) { await loadPay(S.pay); S.pay.loaded = true; }
  const P = S.pay;
  const emp = S.employees.find(e => e.id === P.employee_id);
  const owner = S.user?.role === "owner";
  const locked = P.status === "paid" || !!P.shared_at;   // paid, or finalized & shown to the employee → figures fixed
  // a paid payroll shows the figures it was paid with (stored result), not a fresh recomputation
  const calc = () => locked && P.result && P.result.net != null ? { ...P.result } : computePayroll(paidDays(P.days), payOpts(P));
  const R = calc();
  const monthly = P.pay_type === "monthly";
  const re = async () => { P.loaded = false; render(); };

  // --- header ---
  const empSel = sel([["", "—"], ...S.employees.filter(e => onPayroll(e, P.start) || e.id === P.employee_id).map(e => [e.id, e.name])], P.employee_id, { id: "pEmp", onchange: async e => { P.employee_id = e.target.value; await re(); } });
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
    h("div", { class: "row" }, h("h2", {}, t("tab_pay")), h("span", { class: "sp" }), P.id && h("span", { class: "pill " + (P.status === "paid" ? "paid" : P.shared_at ? "paid" : "draft") }, P.status === "paid" ? t("paid") : P.shared_at ? t("sharedPill") : t("draft")), P.id && (P.shared_at || P.status === "paid") && h("span", { class: "pill " + (P.ack_at ? "paid" : "draft"), title: P.ack_at ? new Date(P.ack_at).toLocaleString() : "" }, P.ack_at ? t("ackPill") : t("ackWait")),
      emp && h("span", { class: "pill " + (emp.position || "") }, t("pos_" + emp.position), " · ", t("pt_" + P.pay_type).split(" (")[0], " · ", t("scheme_" + schemeOf(emp)))),
    h("div", { class: "grid2" }, headFields), note && h("small", { class: "muted" }, note), P.note && h("div", { class: "muted", style: "white-space:pre-line;padding:8px 10px;border-left:3px solid var(--gold);background:var(--bg);border-radius:6px" }, "📝 " + String(P.note).replaceAll("[[ACK]]", "\n\n✍ ")));

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
      const tag = HOL[d.date] && !d.carry ? "🎌 " + (HOL[d.date].kind === "regular" ? t("holReg") : t("holSp")) : d.carry ? (paidDays([d]).length ? t("carryIn") : t("carryInNone")) : carriesOver(d.date, d.shift) ? t("carryOut") : "";
      const lbl = h("div", { class: "d", role: "button", title: t("off"), style: locked ? "" : "cursor:pointer", onclick: toggle }, t("dow")[dow], h("b", {}, (d.carry ? +d.date.slice(5, 7) + "/" : "") + +d.date.slice(8)), tag && h("small", { class: "carryTag" }, tag));
      const sh = DAY_TYPES[d.type]?.worked ? shiftHours(d.shift, P.break_hours) : null;
      const cls = "day" + (d.carry ? " carry" : "") + (!d.carry && carriesOver(d.date, d.shift) ? " carryOut" : "") + (HOL[d.date] ? " hol" : "") + (d.type === "off" ? " off" : "") + (d.type === "sil" ? " sil" : "") + (/holiday|special|absent/.test(d.type) ? " hol" : "") + (wk ? " wknd" : "");
      const shiftCtl = shiftPicker(d, locked, (redraw = true) => { if (redraw || d.carry || +d.date.slice(8) === 30) drawRoster(); else { refreshHrs(d); const o = rosterEl.querySelector(`.otin[data-d="${d.date}"] input`); if (o) o.placeholder = String(paperOt(shiftHours(d.shift, 0), +S.settings.hours_per_day || 10, P.break_hours)); } refresh(); }, P.fillShift);
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
        const rows = (await db.cashbookShifts(P.carry?.[0] || P.start, P.end)).filter(r => String(r.staff_name || "").trim().toLowerCase() === String(emp.name).trim().toLowerCase() && r.shift);
        if (!rows.length) return toast(t("schedNone"));
        const by = Object.fromEntries(rows.map(r => [r.day, r.shift]));
        let n = 0;
        for (const d of P.days) { const sh = by[d.date]; if (!sh) continue; n++;
          if (sh === "off") { d.shift = ""; d.type = "off"; } else if (sh === "sil") { d.shift = ""; d.type = "sil"; } else if (SHIFTS.includes(sh)) { d.shift = sh; if (!DAY_TYPES[d.type]?.worked) d.type = "regular"; }
          if (d.carry) carryNorm(d); }
        drawRoster(); refresh(); toast(tf("schedLoaded", { n }));
      } catch (e) { toast(errMsg(e)); } } }, t("fromSched"));
    const punchBtn = h("button", { class: "btn sm primary", type: "button", id: "fromPunch", disabled: locked || !emp, onclick: async () => {
      try {
        const rows = await db.listPunches(P.employee_id, P.carry?.[0] || P.start, P.end);
        if (!rows.length) return toast(t("punchNone"));
        const { n, inc } = applyPunchRows(P, rows);
        applyHolidays(P.days, HOL); drawRoster(); refresh(); toast(tf("punchLoaded", { n, x: inc ? tf("punchIncomplete", { n: inc }) : "" }));
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
        h("div", { class: "t" }, t(r.kind === "in" ? "punchIn" : "punchOut"), r.source === "admin" ? h("span", { class: "pill draft", style: "margin-left:6px" }, t("punchAdmin")) : null,
          r.status && r.status !== "ok" ? h("span", { class: "pill " + (r.status === "approved" ? "paid" : r.status === "rejected" ? "late" : "draft"), style: "margin-left:6px" }, t(r.status === "rejected" ? "rv_st_rejected" : "st_" + r.status)) : null),
        h("div", { class: "s" }, fmtDT(r.punched_at) + (r.reason ? " · " + r.reason : "")),
        owner && h("button", { class: "btn sm danger m", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deletePunch(r.id); await loadPunchList(); }) }, "✕")));
      if (!rows.length) punchBox.append(h("span", { class: "muted" }, t("punchNone")));
      if (owner) {
        const kind = sel([["in", t("punchIn")], ["out", t("punchOut")]], "in", {}), at = h("input", { type: "datetime-local", value: P.start + "T08:00" });
        punchBox.append(h("div", { class: "row" }, kind, at, h("button", { class: "btn sm", type: "button", onclick: async () => { if (!at.value) return;
          try { await db.addPunch({ employee_id: P.employee_id, kind: kind.value, punched_at: new Date(at.value).toISOString() }); await loadPunchList(); } catch (e) { toast(errMsg(e)); } } }, "+ " + t("punchAdd"))));
      }
    } catch (e) { punchBox.append(h("span", { class: "err" }, errMsg(e))); }
  }
  const roster = h("div", { class: "card" }, h("h2", {}, t("roster")), fillRow, h("small", { class: "muted" }, t("fillHelp")), h("small", { class: "muted" }, t("carryHelp")), rosterEl, sumEl, punchDet);

  // --- adjustments & deductions ---
  const adjFields = [];
  adjFields.push(field(t("late"), numIn("pLate", "late_minutes", 1), t(paper ? "lateHelp" : "lateHelpC") + money(R.perMinute)));
  adjFields.push(field(t("incentive"), numIn("pInc", "incentive", 1)), field(t("other"), numIn("pOth", "other_deduction", 1)));
  const govBox = (k, label) => h("label", { class: "check" }, h("input", { type: "checkbox", id: "g_" + k, checked: !!P.gov[k], disabled: locked, onchange: e => { P.gov[k] = e.target.checked; refresh(); } }), label, +(P.gov.fixed || {})[k] > 0 ? h("small", { class: "muted" }, ` ₱${money(P.gov.fixed[k])}/${t("perMonth")}`) : null);
  const shareSel = sel([[0.5, t("govShare")], [1, t("govFull")]], P.gov.share, { disabled: locked, onchange: e => { P.gov.share = +e.target.value; refresh(); } });
  const ledList = h("div", { class: "list" });
  for (const l of P.ledger) ledList.append(h("div", { class: "item", onclick: () => ledgerForm(l, re) },
    h("div", { class: "t" }, t("k_" + l.kind), l.kind === "shortage" && !(l.verified && l.authorized) && h("span", { class: "pill draft", style: "margin-left:6px" }, t("notDeducted"))),
    h("div", { class: "s" }, l.biz_date, noteOf(l) ? ` · ${noteOf(l)}` : ""), h("div", { class: "m money " + (l.kind === "bonus" ? "pos" : "neg") }, (l.kind === "bonus" ? "+" : "−") + money(l.amount))));
  // payment method stays editable for the owner even after the payroll is finalized or paid (figures don't change)
  async function savePayout() {
    if (!locked || !P.id || !P.result) return refresh();
    try { await db.savePayroll({ id: P.id, result: { ...P.result, payout: payoutOf(P, P.result, emp) }, ...(P.status === "paid" ? { paid_via: P.pay_via } : {}) }); toast(t("saved")); await re(); } catch (e) { toast(errMsg(e)); }
  }
  const payViaSel = sel(PAY_VIAS, P.pay_via || "CASH", { disabled: !owner, onchange: e => { P.pay_via = e.target.value; savePayout(); } });
  const splitIn = h("input", { type: "number", id: "pSplit", value: P.pay_split, step: 100, min: 0, disabled: !owner, oninput: e => { P.pay_split = +e.target.value || 0; if (!locked) refresh(); }, onchange: () => { if (locked) savePayout(); } });
  const ded = h("div", { class: "card" }, h("h2", {}, t("deductions")),
    h("div", { class: "grid2" }, adjFields),
    h("div", { class: "row" }, h("b", {}, t("ledgerAuto")), h("span", { class: "sp" }), emp && h("button", { class: "btn sm", type: "button", onclick: () => ledgerForm({ employee_id: emp.id, kind: "advance", biz_date: P.end, amount: "" }, re) }, "+ " + t("led_add"))),
    P.ledger.length ? ledList : h("span", { class: "muted" }, t("none")),
    h("div", { class: "row" }, h("b", {}, t("payout")), payViaSel, h("span", { class: "muted" }, t("payoutSplit")), splitIn, h("span", { class: "muted", id: "payRest" })), h("small", { class: "muted" }, t("payoutHelp")),
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
    owner && !locked && P.id && h("button", { class: "btn", type: "button", title: t("shareHelp"), onclick: () => save(false, { shared_at: new Date().toISOString() }) }, t("share")),
    owner && P.status !== "paid" && P.shared_at && h("button", { class: "btn ghost", type: "button", onclick: async () => { try { await db.savePayroll({ id: P.id, shared_at: null }); await re(); } catch (e) { toast(errMsg(e)); } } }, t("unshare")),
    owner && P.status !== "paid" && P.id && h("button", { class: "btn", type: "button", onclick: () => markPaid() }, t("markPaid")),
    owner && P.status === "paid" && h("button", { class: "btn", type: "button", onclick: () => unpay() }, t("unpay")),
    owner && P.id && h("button", { class: "btn danger sm", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.detachLedger(P.id); await db.deletePayroll(P.id); toast(t("deleted")); await re(); }) }, t("delete"))));

  main.append(head, roster, ded, result, bar);
  drawRoster(); drawResult();

  function refresh() { Object.assign(R, calc()); drawResult(); sumEl.textContent = summary(); }
  async function save(paid, extra = {}) {
    if (!P.employee_id) return toast(t("pickEmp"));
    const res = P.shared_at && P.result && P.result.net != null ? { ...P.result } : computePayroll(paidDays(P.days), payOpts(P));   // finalized: keep the shared figures
    res.payout = payoutOf(P, res, emp);
    res.ledgerItems = P.ledger.map(l => ({ kind: l.kind, biz_date: l.biz_date, amount: +l.amount, note: l.note || "", note_en: l.note_en || "", verified: l.verified, authorized: l.authorized }));
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
  const days = h("div", { class: "tbl" }, h("table", {}, h("tr", {}, h("th", {}, "Date"), h("th", {}, R.rows.some(r => r.card) ? "Time card" : "Shift"), h("th", {}, "Type"), h("th", { class: "r" }, "Hrs"), h("th", { class: "r" }, "OT"), R.ndHours ? h("th", { class: "r" }, "ND") : null, h("th", { class: "r" }, "₱")),
    R.rows.filter(r => r.type !== "off").map(r => h("tr", {}, h("td", {}, r.date.slice(5)), h("td", {}, r.card || (r.shift ? SHIFT_LABEL(r.shift) : "—")), h("td", {}, t("type_" + r.type)), h("td", { class: "r" }, r.hours || ""), h("td", { class: "r" }, r.ot ? `+${r.ot}h` : ""), R.ndHours ? h("td", { class: "r" }, r.nd || "") : null, h("td", { class: "r" }, money(r.amount))))));
  const rate = P.pay_type === "monthly" ? `₱${money(P.monthly_rate)}/mo` : `₱${money(P.daily_rate)}/day`;
  const close = sheet(h("div", { class: "slip" },
    h("div", { class: "head" }, h("div", {}, h("b", {}, "PALTONG RESTAURANT"), h("div", { class: "muted" }, "603 Remedios St. Malate Manila")), h("div", {}, h("b", {}, t("slip")), h("div", { class: "muted" }, `${P.start} ~ ${P.end}`))),
    h("div", { class: "grid2" }, h("div", {}, h("b", {}, fullName(emp)), h("div", { class: "muted" }, t("pos_" + (emp?.position || "other")))), h("div", {}, rate, h("div", { class: "muted" }, summaryText(R)))),
    h("table", {}, resultRows(R, P)), h("br"), days,
    h("p", { class: "muted" }, `${t("payLine")}: ${payoutText(slipPayout(R.payout || payoutOf(P, R, emp)), emp)}` + (P.status === "paid" ? ` · ${P.paid_on}` : "")), noteParts(P.note).main && h("div", { class: "slipNote" }, noteParts(P.note).main),
    h("div", { class: "sig" + (noteParts(P.note).acks.length ? " one" : "") }, h("div", {}, "Employer / Paltong Restaurant", h("br"), "Signature · Date"), noteParts(P.note).acks.length ? null : h("div", {}, slipSig(emp, P.ack_at), "Employee / " + fullName(emp), h("br"), "Signature · Date" + (P.ack_at && empSig(emp) ? " · " + fmtD(P.ack_at) : ""))),
    ackBlock(noteParts(P.note).acks, fullName(emp), P.ack_at && empSig(emp), P.ack_at),
    h("div", { class: "row noprint", style: "margin-top:14px" }, h("span", { class: "sp" }), h("button", { class: "btn", onclick: () => close() }, t("close")),
      h("button", { class: "btn", onclick: () => printSlip("detail") }, t("printA4")), h("button", { class: "btn primary", onclick: () => printSlip("simple") }, t("printSimple")))));
}
// simple = 58mm receipt printer (print station): summary only, no day table; detail = A4 with the day table
// prints a copy of the open payslip on its own (top-level), so nothing else on the page (sheets, fixed bars,
// a leftover batch print) can blank the page
function printSlip(mode) {
  document.getElementById("batchPrint")?.remove(); document.body.classList.remove("print-batch");
  const src = document.querySelector("#sheetRoot .slip"); if (!src) return;
  document.getElementById("printOne")?.remove();
  const box = h("div", { id: "printOne" }); box.append(src.cloneNode(true)); document.body.append(box);
  document.body.classList.add("print-one"); document.body.classList.toggle("print-simple", mode === "simple");
  const done = () => { box.remove(); document.body.classList.remove("print-one", "print-simple"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
  setTimeout(() => { if (document.body.contains(box)) done(); }, 60000);
}

/* ================= SCHEDULE: everyone × every day — actual clock-ins (app) over the Cash Book plan ================= */
const SCH = { month: null, half: null };
async function renderSched() {
  const main = document.getElementById("main");
  if (!SCH.month) { const p = periodForDate(today()); SCH.half = p.half; SCH.month = p.start.slice(0, 7); }
  const [y, m] = SCH.month.split("-").map(Number); const p = { ...periodOf(y, m, SCH.half) }; if (p.monthEnd) p.end = p.monthEnd;
  const monthIn = h("input", { type: "month", value: SCH.month, onchange: e => { SCH.month = e.target.value; render(); } });
  const halfSel = sel([[1, t("first")], [2, t("second")]], SCH.half, { onchange: e => { SCH.half = +e.target.value; render(); } });
  const card = h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_sched")), h("span", { class: "sp" }), monthIn, halfSel), h("small", { class: "muted" }, t("sched_help")));
  main.append(card);
  try {
    const [punches, plan] = await Promise.all([db.listPunchesAll(p.start, p.end), db.cashbookShifts(p.start, p.end)]);
    const dates = datesBetween(p.start, p.end); const todayS = today();
    const byEmp = {}; for (const q of punches) (byEmp[q.employee_id] = byEmp[q.employee_id] || []).push({ id: q.id, kind: q.kind, at: q.punched_at, source: q.source, status: q.status, mode: q.mode });
    const owner = S.user?.role === "owner";
    const planBy = {}; for (const r of plan) planBy[String(r.staff_name).trim().toLowerCase() + "|" + r.day] = r.shift;
    const ORDER = ["waiter", "kitchen", "rider", "other"];
    const emps = S.employees.filter(e => onPayroll(e, p.start) && e.name !== "test").sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position));
    const tbl = h("table", { class: "sched" },
      h("tr", {}, h("th", {}, t("employee")), ...dates.map(d => { const dt = new Date(d + "T00:00:00"); return h("th", { class: (d === todayS ? "today " : "") + ((dt.getDay() === 5 || dt.getDay() === 6) ? "wk" : "") }, `${+d.slice(8)}`, h("small", {}, t("dow")[dt.getDay()])); })),
      ...emps.flatMap((e, i) => { const by = decidedPunches(byEmp[e.id] || []);
        const grp = i === 0 || emps[i - 1].position !== e.position
          ? [h("tr", { class: "grp" }, h("th", { colspan: dates.length + 1 }, `${t("pos_" + e.position)} · ${emps.filter(x => x.position === e.position).length}`))] : [];
        return [...grp, h("tr", {}, h("td", { class: "nm" }, e.name), ...dates.map(d => {
          const a = by[d]; const pl = planBy[e.name.trim().toLowerCase() + "|" + d];
          const paid = a?.shift ? paidOf(a, pl) : "";
          const act = a ? (a.shift ? paid.replace("-", "–") + (a.pending ? " ⏳" : "") : (a.in ? fmtT(a.in) + "–?" : "?–" + fmtT(a.out))) : "";
          const real = a?.shift && paid !== a.shift ? t("sched_real") + " " + a.shift.replace("-", "–") : "";
          const raw = (byEmp[e.id] || []).filter(q => { const dt = new Date(q.at); const ds = fmtDate(dt); return ds === d || (ds === addDays(d, 1) && dt.getHours() < 12); });
          return h("td", { class: (a && a.incomplete ? "inc " : "") + (!a && (!pl || pl === "off" || pl === "sil") ? "off" : "") + (owner ? " edit" : ""), title: owner ? t("sched_tap") : "", onclick: owner ? () => punchDaySheet(e, d, raw) : null }, h("div", { class: "act" }, act || (pl && pl !== "off" && pl !== "sil" ? "" : t("sched_none"))), real ? h("div", { class: "real" }, real) : null, pl ? h("div", { class: "pl" }, planLabel(pl)) : null);
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
  silAdminCard().then(c => main.append(c));
  const list = h("div", { class: "list" });
  const rateOf = e => e.pay_type === "monthly" ? `₱${money(e.monthly_rate)}/mo` : `₱${money(e.daily_rate)}/day`;
  for (const e of S.employees) list.append(h("div", { class: "item", onclick: () => owner && empForm(e) },
    h("div", { class: "t" }, e.name, " ", h("span", { class: "pill " + (e.position || "") }, t("pos_" + e.position)), !e.active && h("span", { class: "pill", style: "margin-left:6px" }, e.resigned_on ? tf("resignedTag", { d: e.resigned_on }) : "✕")),
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
  const fullIn = h("input", { type: "text", id: "eFull", value: (E.info || {}).full_name || "", placeholder: "ERIKA FERNANDEZ" });
  const resigned = h("input", { type: "date", id: "eResigned", value: E.resigned_on || "", onchange: () => { if (resigned.value) active.checked = false; } });
  const infoIn = infoInputs(E.info, "ei-");
  const fDaily = field(t("daily"), rate), fMonthly = field(t("monthlyRate"), mrate), fAllow = field(t("allowDay"), allow);
  const govIn = Object.fromEntries(GOV_KEYS.map(k => [k, h("input", { type: "number", id: "eGov_" + k, value: +(E.gov_fixed || {})[k] || "", placeholder: "0", step: 1, min: 0 })]));
  function sync() { fDaily.hidden = pt.value !== "daily"; fMonthly.hidden = pt.value !== "monthly"; fAllow.hidden = pos.value !== "rider"; }
  sync();
  const close = sheet(h("form", { onsubmit: async ev => { ev.preventDefault(); try {
      await db.saveEmployee({ ...E, info: { ...(E.info || {}), ...Object.fromEntries(INFO_KEYS.map(k => [k, infoIn[k].value.trim()])), full_name: fullIn.value.trim() }, gov_fixed: Object.fromEntries(GOV_KEYS.map(k => [k, +govIn[k].value || 0]).filter(([, v]) => v > 0)), emp_no: eno.value.trim() || null, name: name.value.trim(), position: pos.value, pay_type: pt.value, scheme: sch.value, daily_rate: +rate.value, monthly_rate: +mrate.value, allowance_per_day: pos.value === "rider" ? +allow.value : 0, status: st.value, hired_on: hired.value || null, birthday: bday.value || null, active: active.checked, resigned_on: resigned.value || null, note: note.value || null, basic_before_app: +before.value || 0, basic_before_year: new Date().getFullYear() });
      S.employees = await db.listEmployees(true); if (S.pay) S.pay.loaded = false; toast(t("saved")); close(); render(); } catch (er) { toast(errMsg(er)); } } },
    h("h3", {}, E.id ? E.name : t("emp_add")),
    h("div", { class: "grid2" }, field(t("empNo"), eno), field(t("emp_name"), name), field(t("emp_full"), fullIn, t("emp_fullHelp")), field(t("emp_pos"), pos), field(t("emp_payType"), pt), field(t("emp_scheme"), sch), fDaily, fMonthly, fAllow, field(t("emp_status"), st), field(t("emp_hired"), hired), field(t("emp_bday"), bday), field(t("emp_note"), note), field(t("emp_before"), before, t("emp_beforeHelp"))),
    h("div", {}, h("b", {}, t("govFixed")), h("div", { class: "grid2" }, field("SSS", govIn.sss), field("PhilHealth", govIn.philhealth), field("Pag-IBIG", govIn.pagibig)), h("small", { class: "muted" }, t("govFixedHelp"))),
    h("details", { id: "e-info" }, h("summary", {}, t("empInfo")), h("div", { class: "grid2" }, ...INFO_KEYS.map(k => field(t("i_" + k), infoIn[k])))),
    h("label", { class: "check" }, active, t("emp_active")),
    field(t("emp_resigned"), resigned, t("emp_resignedHelp")),
    E.id && E.resigned_on ? resign13Box(E) : null,
    E.id && h("div", { class: "row" }, h("span", { class: "muted" }, e.pin_hash ? t("pinSet") : t("pinNotSet")), h("span", { class: "sp" }),
      h("button", { class: "btn sm", type: "button", id: "e-reset-pin", onclick: async () => { try { await db.resetEmpPin(E.id); S.employees = await db.listEmployees(true); toast(t("pinReset")); close(); render(); } catch (er) { toast(errMsg(er)); } } }, t("resetPin"))),
    E.id && h("div", { class: "row", style: "align-items:center" }, sigOf(E.id) ? sigImg(sigOf(E.id), "max-height:44px;background:#fff;border-radius:6px;padding:2px") : null,
      h("span", { class: "muted" }, sigOf(E.id) ? tf("sig_on", { d: fmtD(sigOf(E.id).signed_at) }) : t("sig_off")), h("span", { class: "sp" }),
      sigOf(E.id) ? h("button", { class: "btn sm", type: "button", id: "e-reset-sig", onclick: () => confirmSheet(t("sig_reset") + "?", async () => { try { await db.resetSignature(E.id); S.sigs = await db.listSignatures(); toast(t("sig_resetDone")); close(); render(); } catch (er) { toast(errMsg(er)); } }, { ask: true }) }, t("sig_reset")) : null),
    E.id ? docsBox(E) : null,
    h("div", { class: "row" }, E.id && h("button", { class: "btn danger sm", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deleteEmployee(E.id); S.employees = await db.listEmployees(true); close(); render(); }) }, t("delete")),
      h("span", { class: "sp" }), h("button", { class: "btn", type: "button", onclick: () => close() }, t("cancel")), h("button", { class: "btn primary", type: "submit" }, t("save")))));
}

/* ---- 직원 서류 (pr_docs): COE·계약서 등 PDF/사진 보관, 사장님만 ---- */
const DOC_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"], DOC_MAX = 8 * 1024 * 1024;
const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB";
function docsBox(E) {
  const list = h("div", { class: "list" }, h("div", { class: "muted" }, t("doc_loading")));
  const title = h("input", { type: "text", id: "docTitle", placeholder: t("doc_namePh") });
  const file = h("input", { type: "file", id: "docFile", accept: DOC_MIME.join(","), onchange: () => { const f = file.files[0]; if (f && !title.value.trim()) title.value = f.name.replace(/\.[^.]+$/, ""); } });
  async function load() {
    let docs;
    try { docs = await db.listDocs(E.id); } catch (er) { list.replaceChildren(h("div", { class: "muted" }, /pr_docs|does not exist|schema cache/i.test(er.raw || er.message) ? t("doc_needTbl") : errMsg(er))); return; }
    list.replaceChildren(...(docs.length ? docs.map(d => h("div", { class: "item" },
      h("div", { class: "t" }, (d.mime === "application/pdf" ? "📄 " : "🖼 ") + d.title),
      h("div", { class: "s" }, `${fmtD(d.created_at)} · ${kb(d.size)}${d.file_name ? " · " + d.file_name : ""}`),
      h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => openDoc(d.id) }, t("doc_open")),
        h("button", { class: "btn danger sm", type: "button", onclick: () => confirmSheet(t("doc_delQ"), async () => { try { await db.deleteDoc(d.id); load(); } catch (er) { toast(errMsg(er)); } }) }, t("delete"))))) : [h("div", { class: "muted" }, t("doc_none"))]));
  }
  async function upload() {
    const f = file.files[0]; if (!f) return toast(t("doc_need"));
    if (!DOC_MIME.includes(f.type)) return toast(t("doc_type")); if (f.size > DOC_MAX) return toast(t("doc_big"));
    const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
    try { await db.addDoc({ employee_id: E.id, title: title.value.trim() || f.name, file_name: f.name, mime: f.type, size: f.size, data }); title.value = ""; file.value = ""; toast(t("doc_saved")); load(); }
    catch (er) { toast(errMsg(er)); }
  }
  load();
  return h("details", { id: "e-docs" }, h("summary", {}, t("doc_title")), h("small", { class: "muted" }, t("doc_help")), list,
    h("div", { class: "grid2" }, field(t("doc_name"), title), field(t("doc_file"), file)),
    h("div", { class: "row" }, h("span", { class: "sp" }), h("button", { class: "btn primary sm", type: "button", id: "docUp", onclick: upload }, t("doc_up"))));
}
async function openDoc(id) {
  const w = window.open("", "_blank"); // 팝업 차단 피하려고 클릭 순간에 창부터 열기
  try {
    const d = await db.getDoc(id);
    const bin = atob(d.data.split(",")[1]); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], { type: d.mime }));
    if (w) w.location = url; else location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (er) { if (w) w.close(); toast(errMsg(er)); }
}

/* ---- contract §6: semi-monthly highest-sales-day bonus = top day's sales × 2% ÷ staff who worked that day ---- */
async function topBonusSheet() {
  const p0 = periodForDate(today());
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
          for (const b of on) await db.saveLedger({ employee_id: b.e.id, kind: "bonus", biz_date: cur.top, amount: each, note: `최고매출일 보너스 ${cur.top} 매출 ₱${money(cur.total)} × 2% ÷ ${on.length}명 (계약서 6조)`, note_en: `Highest-sales-day bonus ${cur.top} sales ₱${money(cur.total)} × 2% ÷ ${on.length} staff (contract §6)`, verified: true, authorized: true });
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
      h("div", { class: "t" }, l.employees?.name, " · ", t("k_" + l.kind), " ", h("span", { class: "pill " + (l.payroll_id ? "paid" : "draft") }, l.payroll_id ? t("led_deducted") : t("led_pending")), l.self_req_at ? " " + t("adv_app") : "",
        l.kind === "advance" ? h("button", { class: "btn sm", type: "button", style: "margin-left:6px", onclick: ev => { ev.stopPropagation(); printAdvance(l, S.employees.find(e => e.id === l.employee_id) || { name: l.employees?.name }, sigOf(l.employee_id)); } }, "🖨 " + t("adv_print")) : null),
      h("div", { class: "s" }, l.biz_date, " ", tf("led_applies", { p: periodLabel(p.start, p.end) }), noteOf(l) ? ` · ${noteOf(l)}` : "", l.kind === "shortage" && !(l.verified && l.authorized) ? " · ⚠ " + t("notDeducted") : ""),
      h("div", { class: "m money " + (l.kind === "bonus" ? "pos" : "neg") }, (l.kind === "bonus" ? "+" : "−") + money(l.amount))));
  }
  if (owner) main.append(await cashIssuesCard(), await bdayCard());
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_ledger")), h("span", { class: "sp" }), owner && h("button", { class: "btn primary sm", onclick: () => ledgerForm({ employee_id: S.employees[0]?.id || "", kind: "advance", biz_date: today(), amount: "" }, () => render()) }, "+ " + t("led_add"))),
    h("div", { class: "row" }, empSel, kindSel), h("small", { class: "muted" }, t("bonusHint")),
    owner && h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", id: "topBonus", onclick: topBonusSheet }, "🏆 " + t("topBonus"))),
    rows.length ? list : h("span", { class: "muted" }, t("none"))));
}
// 생일 인센티브: 서버가 생일 당일 자동 판정 (pr_bday_bonus_run) → 여기선 결과·예정 보기
async function bdayCard() {
  let rows = []; try { rows = await db.bdayList(); } catch (e) { return h("div", { class: "card" }, h("p", { class: "muted" }, errMsg(e))); }
  const amt = +S.settings?.bday_bonus || 500;
  const pill = r => r.decided === "paid" ? h("span", { class: "pill paid" }, tf("bd_paid", { a: money(r.amount || amt) }))
    : r.decided === "denied" ? h("span", { class: "pill late" }, t("bd_denied")) : r.decided === "no_record" ? h("span", { class: "pill draft" }, t("bd_norec"))
    : h("span", { class: "pill " + (r.preview === "paid" ? "waiter" : "draft") }, r.preview === "paid" ? t("bd_ok") : t("bd_bad"));
  const noBday = S.employees.filter(e => e.active && !e.resigned_on && !e.birthday && e.name !== "test").map(e => e.name);
  return h("div", { class: "card", id: "bday-card" }, h("h2", {}, t("bd_title")), h("small", { class: "muted" }, tf("bd_help", { a: money(amt) })),
    rows.length ? h("div", { class: "list" }, rows.map(r => h("div", { class: "item" }, h("div", { class: "t" }, r.name, " · ", String(r.bday).slice(5).replace("-", "/"), " ", pill(r)),
      h("div", { class: "s" }, r.reason || "")))) : h("p", { class: "muted" }, t("bd_none")),
    noBday.length ? h("p", { class: "muted", style: "margin:8px 0 0" }, tf("bd_missing", { n: noBday.join(", ") })) : null);
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
  const note = h("input", { type: "text", id: "lNote", value: L.note || "" }); const noteEn = h("input", { type: "text", id: "lNoteEn", value: L.note_en || "" });
  const ver = h("input", { type: "checkbox", id: "lVer", checked: L.verified !== false }); const auth = h("input", { type: "checkbox", id: "lAuth", checked: !!L.authorized });
  const shortBox = h("div", { style: "display:grid;gap:6px", hidden: L.kind !== "shortage" }, h("label", { class: "check" }, ver, t("led_verified")), h("label", { class: "check" }, auth, t("led_auth")));
  const hint = h("small", { class: "muted" }); const upd = () => { const p = periodForDate(date.value || today()); hint.textContent = tf("led_applies", { p: periodLabel(p.start, p.end) }); };
  date.addEventListener("input", upd); upd();
  const close = sheet(h("form", { onsubmit: async ev => { ev.preventDefault(); try {
      await db.saveLedger({ ...L, employee_id: empSel.value, kind: kind.value, biz_date: date.value, amount: +amt.value, note: note.value || null, note_en: noteEn.value || null, verified: kind.value === "shortage" ? ver.checked : true, authorized: auth.checked });
      toast(t("saved")); close(); after(); } catch (er) { toast(errMsg(er)); } } },
    h("h3", {}, t("led_add")),
    h("div", { class: "grid2" }, field(t("employee"), empSel), field(t("led_kind"), kind), field(t("led_date"), date, hint), field(t("led_amount"), amt), field(t("led_noteKo"), note), field(t("led_noteEn"), noteEn, t("led_noteHelp"))), shortBox,
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

/* ---- 지급 예정: every saved-but-unpaid payroll, grouped by period, with cash / GCash / bank totals ---- */
const payParts = r => r.result?.payout?.parts || [{ via: r.paid_via || "CASH", amount: +r.result?.net || 0 }];
function viaTotals(rows) {
  const tot = {}; for (const r of rows) for (const x of payParts(r)) tot[x.via] = (tot[x.via] || 0) + (+x.amount || 0);
  return PAY_VIAS.map(([v]) => v).concat(Object.keys(tot).filter(v => !PAY_VIAS.some(x => x[0] === v))).filter(v => tot[v]).map(v => [v, Math.round(tot[v] * 100) / 100]);
}
const viaChips = rows => h("div", { class: "row", style: "flex-wrap:wrap;gap:6px" }, viaTotals(rows).map(([v, a]) => h("span", { class: "pill" + (v === "CASH" ? " draft" : " waiter") }, `${viaLabel(v)} ₱${money(a)}`)));
const DUE = { month: null, half: null };
/* one employee's payroll for the period, nothing saved: a saved draft is used as is (admin edits), otherwise
   the Cash Book schedule with the app clock-ins on top — same loading as the Payroll tab, plus advances / gov / bonus */
async function autoPay(emp, month, half, punches) {
  const P = { ...defaultPay(), employee_id: emp.id, month, half };
  await loadPay(P);
  if (P.status === "paid") return { emp, P, paid: true };
  if (!P.shared_at) applyHolidays(P.days, HOL);
  // finalized (shared with the employee): use exactly the figures on the payslip, never a fresh recomputation
  const R = P.shared_at && P.result && P.result.net != null ? { ...P.result } : computePayroll(paidDays(P.days), payOpts(P));
  if (!R.payout) R.payout = payoutOf(P, R, emp);
  return { emp, P, R };
}
async function renderDue() {
  const main = document.getElementById("main");
  if (!DUE.month) { const p = periodForDate(today()); DUE.month = p.start.slice(0, 7); DUE.half = p.half; }
  const [y, m] = DUE.month.split("-").map(Number); const per = periodOf(y, m, DUE.half);
  const mIn = h("input", { type: "month", value: DUE.month, onchange: e => { DUE.month = e.target.value; render(); } });
  const hSel = sel([[1, t("first")], [2, t("second")]], DUE.half, { onchange: e => { DUE.half = +e.target.value; render(); } });
  const head = h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_due")), h("span", { class: "sp" }), mIn, hSel), h("p", { class: "muted" }, h("span", { class: "spin" }), t("due_calc")));
  main.append(await silReqCard(), await reviewCard(), await due13Card(), head);
  const emps = S.employees.filter(e => onPayroll(e, per.start) && e.name !== "test");
  let all, punches, older;
  try {
    [punches, older] = await Promise.all([db.listPunchesAll(per.carry?.[0] || per.start, per.end), db.listPayrolls({ status: "draft", to: addDays(per.start, -1) })]);
    const pBy = {}; for (const q of punches) (pBy[q.employee_id] ||= []).push(q);
    all = await Promise.all(emps.map(e => autoPay(e, DUE.month, DUE.half, pBy[e.id] || [])));
  } catch (e) { head.lastChild.replaceWith(h("p", { class: "err" }, errMsg(e))); return; }
  const due = all.filter(x => !x.paid), paid = all.filter(x => x.paid);
  const sumK = k => due.reduce((a, x) => a + (+x.R[k] || 0), 0);
  const asRow = x => ({ employee_id: x.emp.id, period_start: x.P.start, period_end: x.P.end, status: "draft", pay_type: x.P.pay_type, daily_rate: x.P.daily_rate, monthly_rate: x.P.monthly_rate, allowance_per_day: x.P.allowance_per_day, employees: x.emp, result: x.R });
  const rows = due.map(asRow);
  const open = x => { S.pay = { ...defaultPay(), employee_id: x.emp.id, month: DUE.month, half: DUE.half, loaded: false }; S.tab = "pay"; render(); };
  const tile = (l, v) => h("div", { style: "text-align:center" }, h("div", { class: "muted", style: "font-size:12px" }, l), h("div", { class: "money", style: "font:600 15px var(--mono)" }, money(v)));
  head.lastChild.replaceWith(h("div", {},
    h("div", { style: "text-align:center;padding:6px 0 10px" }, h("div", { class: "muted" }, `${periodLabel(per.start, per.end)} · ${t("due_total")} · ${tf("due_ppl", { n: due.length })}`),
      h("div", { class: "money", style: "font:700 32px var(--mono);color:var(--good)" }, "₱" + money(sumK("net")))),
    h("div", { class: "grid2", style: "grid-template-columns:1fr 1fr 1fr;margin-bottom:10px" }, tile(t("due_gross"), sumK("gross")), tile("− " + t("due_ded"), sumK("deductions")), tile("= " + t("due_net"), sumK("net"))),
    viaChips(rows),
    paid.length > 0 && h("small", { class: "muted" }, tf("due_paidX", { n: paid.length, names: paid.map(x => x.emp.name).join(", ") })),
    h("small", { class: "muted", style: "display:block;margin-top:6px" }, t("due_help"))));
  const ORDER = ["waiter", "kitchen", "rider", "other"];
  due.sort((a, b) => ORDER.indexOf(a.emp.position) - ORDER.indexOf(b.emp.position) || String(a.emp.name).localeCompare(String(b.emp.name)));
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h3", {}, t("due_list")), h("span", { class: "sp" }),
      due.length > 0 && h("button", { class: "btn sm", type: "button", onclick: () => batchPrint(rows, per.start, per.end) }, "🖨 " + t("printBatch"))),
    h("div", { class: "tbl" }, h("table", {}, h("tr", {}, h("th", {}, t("employee")), h("th", { class: "r" }, t("due_days")), h("th", { class: "r" }, t("due_net"))),
      due.map(x => h("tr", { style: "cursor:pointer", onclick: () => open(x) },
        h("td", {}, h("b", {}, x.emp.name), " ", h("span", { class: "pill " + (x.P.id ? "draft" : "paid") }, x.P.id ? t("due_saved") : t("due_auto")), x.P.shared_at ? h("span", { class: "pill " + (x.P.ack_at ? "paid" : "draft"), style: "margin-left:4px" }, x.P.ack_at ? t("ackPill") : t("ackWait")) : null,
          h("div", { class: "muted", style: "font-size:12px" }, payoutText(x.R.payout, x.emp))),
        h("td", { class: "r" }, `${x.R.daysWorked ?? 0}d` + (x.R.otHours ? ` +${x.R.otHours}h` : "")),
        h("td", { class: "r" }, money(x.R.net)))),
      h("tr", { class: "sum" }, h("td", {}, t("total")), h("td", {}), h("td", { class: "r" }, money(sumK("net"))))))));
  // unpaid saved payrolls of earlier periods (stored figures)
  if (older.length) {
    const net = r => +r.result?.net || 0;
    main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h3", {}, t("due_prev")), h("span", { class: "sp" }), h("span", { class: "money" }, "₱" + money(older.reduce((a, r) => a + net(r), 0)))),
      h("div", { class: "list" }, older.map(r => h("div", { class: "item", onclick: () => { const s = r.period_start; S.pay = { ...defaultPay(), employee_id: r.employee_id, month: s.slice(0, 7), half: +s.slice(8) === 1 ? 1 : 2, loaded: false }; S.tab = "pay"; render(); } },
        h("div", { class: "t" }, r.employees?.name), h("div", { class: "s" }, periodLabel(r.period_start, r.period_end)), h("div", { class: "m money" }, "₱" + money(net(r))))))));
  }
}

/* ---- fixed monthly gov deductions per employee (amounts actually remitted, from the bookkeeper) ---- */
const GOV_KEYS = ["sss", "philhealth", "pagibig"];
const govFixedOf = emp => Object.fromEntries(GOV_KEYS.map(k => [k, +(emp?.gov_fixed || {})[k] || 0]).filter(([, v]) => v > 0));
// statutory contributions of the current month are NOT deducted from staff who keep working (unticked by default);
// only an employee who resigns by the end of this period has them deducted (whole month, on the final pay).
function govFor(emp, base, end) {
  const fixed = govFixedOf(emp); const leaving = !!emp?.resigned_on && (!end || emp.resigned_on <= end);
  const g = { ...base, fixed };
  for (const k of GOV_KEYS) g[k] = leaving ? (!!fixed[k] || !!base[k]) : false;
  if (leaving) g.share = 1;
  return g;
}
/* ---- payout: how the net is handed over (cash / GCash / bank, optionally split) ---- */
const PAY_VIAS = [["CASH", "Cash"], ["GCASH", "GCash"], ["MAYA", "Maya"], ["METROBANK", "Metrobank"], ["SAVINGBOX", "Saving box"]];
const viaLabel = v => (PAY_VIAS.find(x => x[0] === v) || [v, v])[1];
function payoutOf(P, R, emp) {
  const via = P.pay_via || P.paid_via || "CASH", net = +R.net || 0, split = Math.min(net, Math.max(0, +P.pay_split || 0));
  const parts = via !== "CASH" && split > 0 && split < net ? [{ via, amount: split }, { via: "CASH", amount: Math.round((net - split) * 100) / 100 }] : [{ via, amount: net }];
  return { via, split: via !== "CASH" ? split : 0, parts };
}
// Payslips (what staff see / sign) show Saving box as Cash; the owner screens keep the real method.
const slipVia = v => v === "SAVINGBOX" ? "CASH" : v;
function slipPayout(po) {
  if (!po || !po.parts) return po; const tot = {};
  for (const x of po.parts) { const v = slipVia(x.via); tot[v] = Math.round(((tot[v] || 0) + +x.amount) * 100) / 100; }
  return { ...po, via: slipVia(po.via), parts: Object.entries(tot).map(([via, amount]) => ({ via, amount })) };
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
    h("div", { class: "grid2" }, h("div", {}, h("b", {}, fullName(emp)), h("div", { class: "muted" }, t("pos_" + (emp.position || "other")))), h("div", {}, rate, h("div", { class: "muted" }, R.net != null ? summaryText(R) : ""))),
    R.net != null ? h("table", {}, resultRows(R, P)) : h("p", { class: "muted" }, t("draft")),
    h("p", { class: "muted" }, `${t("payLine")}: ${R.payout ? payoutText(slipPayout(R.payout), emp) : (r.paid_via ? viaLabel(slipVia(r.paid_via)) + " ₱" + money(R.net) : "")}` + (r.status === "paid" ? ` · ${r.paid_on || ""}` : ` · ${t("notPaidYet")}`)),
    noteParts(r.note).main && h("div", { class: "slipNote" }, noteParts(r.note).main),
    h("div", { class: "sig" + (noteParts(r.note).acks.length ? " one" : "") }, h("div", {}, "Employer · Date"), noteParts(r.note).acks.length ? null : h("div", {}, slipSig({ id: r.employee_id }, r.ack_at), "Employee / " + fullName(emp) + " · Date" + (r.ack_at && sigOf(r.employee_id) ? " " + fmtD(r.ack_at) : ""))),
    ackBlock(noteParts(r.note).acks, fullName(emp), r.ack_at && sigOf(r.employee_id), r.ack_at));
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
  for (const e of S.employees.filter(e => e.active || rows.some(r => r.employee_id === e.id) || (e.resigned_on || "").startsWith(String(year)))) {
    const { mine, basicApp, before, total, amount, avg, monthAvg } = calc13(e, year, rows);
    const proj = Math.round((total + avg * Math.max(0, 24 - elapsedHalves - (before ? 0 : 0))) / 12 * 100) / 100;
    const p = paidBy[e.id]; tot += amount; totBasic += total; totAvg += monthAvg;
    const drafts = mine.filter(r => r.status !== "paid").length;
    tbl.append(h("tr", {},
      h("td", {}, e.name, drafts ? h("small", { class: "muted" }, ` · ${drafts} ${t("draft")}`) : null,
        e.resigned_on ? h("div", {}, h("small", { class: "muted" }, tf("resignedTag", { d: e.resigned_on }) + " · " + (p?.paid_on ? tf("accessUntil", { d: addDays(p.paid_on, 7) }) : tf("resignDue", { d: addDays(e.resigned_on, 30) })))) : null),
      h("td", { class: "r" }, mine.length), h("td", { class: "r" }, money(basicApp)), h("td", { class: "r" }, money(before)), h("td", { class: "r" }, money(total)),
      h("td", { class: "r" }, h("b", {}, money(amount))), h("td", { class: "r" }, h("b", {}, money(monthAvg))), h("td", { class: "r muted" }, money(proj)),
      h("td", {}, p ? h("span", { class: "row", style: "gap:6px" }, h("span", { class: "pill paid" }, `${t("c13_paid")} ₱${money(p.amount)}`), h("small", { class: "muted" }, p.paid_on || ""), owner && h("button", { class: "btn sm ghost", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deleteThirteenth(p.id); render(); }) }, t("c13_unpay")))
                    : owner ? h("button", { class: "btn sm", type: "button", onclick: () => pay13(e, year, total, amount, monthAvg) }, t("c13_pay")) : h("span", { class: "pill draft" }, t("c13_unpaid")))));
  }
  tbl.append(h("tr", { class: "sum" }, h("td", {}, t("c13_total_row")), h("td", {}), h("td", {}), h("td", {}), h("td", { class: "r" }, money(totBasic)), h("td", { class: "r" }, money(tot)), h("td", { class: "r" }, money(totAvg)), h("td", {}), h("td", {})));
  main.append(h("div", { class: "card" }, h("div", { class: "row" }, h("h2", {}, t("tab_13")), h("span", { class: "sp" }), h("span", { class: "muted" }, t("y13")), yIn),
    h("small", { class: "muted" }, t("y13help")), h("div", { class: "tbl" }, tbl), h("small", { class: "muted" }, t("c13_projHelp"))));
}
function calc13(e, year, rows) {
  const mine = rows.filter(r => r.employee_id === e.id);
  const basicApp = mine.reduce((a, r) => a + (+r.result?.basicFor13th || 0), 0);
  const before = e.basic_before_year === year ? +e.basic_before_app || 0 : 0;
  const total = basicApp + before, amount = Math.round(total / 12 * 100) / 100;
  const avg = mine.length ? basicApp / mine.length : 0;
  const monthAvg = mine.length ? Math.round(basicApp / mine.length * 2 * 100) / 100 : 0; // 1년 이상 근속자: 한 달치 = 보름 평균 × 2
  return { mine, basicApp, before, total, amount, avg, monthAvg };
}
/* 퇴사 직원: 직원 화면 안 13th month 지급 칸 */
function resign13Box(e) {
  const year = +e.resigned_on.slice(0, 4);
  const box = h("div", { class: "card", style: "margin:0" }, h("b", {}, t("resign13")), h("small", { class: "muted" }, " …"));
  Promise.all([db.listPayrollsYear(year), db.listThirteenth(year).catch(() => [])]).then(([rows, paid]) => {
    const p = paid.find(x => x.employee_id === e.id); const c = calc13(e, year, rows);
    box.innerHTML = "";
    box.append(h("b", {}, `${t("resign13")} · ${year}`), h("small", { class: "muted" }, t("resign13Help")),
      h("div", { class: "row" }, h("span", {}, `${t("c13_total")} ₱${money(c.total)} ÷ 12 = `, h("b", {}, "₱" + money(c.amount))), h("span", { class: "sp" }),
        p ? h("span", { class: "row", style: "gap:6px" }, h("span", { class: "pill paid" }, `${t("c13_paid")} ₱${money(p.amount)}`), h("small", { class: "muted" }, `${p.paid_on || ""} ${p.paid_via || ""}`),
              h("button", { class: "btn sm ghost", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { await db.deleteThirteenth(p.id); render(); }) }, t("c13_unpay")))
          : h("button", { class: "btn sm primary", type: "button", onclick: () => pay13(e, year, c.total, c.amount, c.monthAvg) }, t("c13_pay"))),
      h("small", { class: "muted" }, p?.paid_on ? tf("accessUntil", { d: addDays(p.paid_on, 7) }) : `${tf("resignDue", { d: addDays(e.resigned_on, 30) })} · ${t("accessOpen")}`));
  }).catch(er => box.append(h("div", { class: "err" }, errMsg(er))));
  return box;
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

function holidayCard() {
  const card = h("div", { class: "card", id: "hol-card" });
  const draw = () => { card.innerHTML = "";
    const list = Object.values(HOL).sort((a, b) => a.day < b.day ? -1 : 1).filter(x => x.day >= today().slice(0, 4) + "-01-01");
    const dIn = h("input", { type: "date", id: "holDay" }), kIn = sel([["special", t("holSp")], ["regular", t("holReg")]], "special", { id: "holKind" }), nIn = h("input", { type: "text", id: "holName", placeholder: "Name" });
    card.append(h("h2", {}, "🎌 " + t("hol_title")), h("small", { class: "muted" }, t("hol_help")),
      h("div", { class: "list" }, list.map(x => h("div", { class: "item" }, h("div", { class: "t" }, `${x.day} · ${x.name}`), h("div", { class: "s" }, x.kind === "regular" ? t("holReg") : t("holSp")),
        h("button", { class: "btn sm danger m", type: "button", onclick: () => confirmSheet(t("confirmDel"), async () => { try { await db.deleteHoliday(x.day); delete HOL[x.day]; draw(); } catch (e) { toast(errMsg(e)); } }) }, "✕")))),
      h("div", { class: "row", style: "flex-wrap:wrap;gap:6px" }, dIn, kIn, nIn, h("button", { class: "btn sm", type: "button", onclick: async () => { if (!dIn.value || !nIn.value.trim()) return;
        try { const r = await db.saveHoliday({ day: dIn.value, kind: kIn.value, name: nIn.value.trim() }); HOL[r.day] = r; draw(); toast(t("saved")); } catch (e) { toast(errMsg(e)); } } }, "+ " + t("hol_add"))));
  };
  draw(); return card;
}
function storeGuardCard() {
  const s = S.settings, card = h("div", { class: "card", id: "store-guard" });
  const draw = () => { const s = S.settings; card.innerHTML = "";
    const on = h("input", { type: "checkbox", id: "sgOn", checked: !!s.punch_guard });
    const rad = h("input", { type: "number", id: "sgRad", value: s.store_radius_m ?? 100, min: 1, step: 1, style: "max-width:120px" });
    const save = async patch => { try { S.settings = await db.saveSettings(patch); toast(t("saved")); draw(); } catch (e) { toast(errMsg(e)); } };
    on.onchange = () => save({ punch_guard: on.checked }); rad.onchange = () => save({ store_radius_m: Math.max(1, Math.round(+rad.value) || 1) });
    card.append(h("h2", {}, t("sg_title")), h("small", { class: "muted" }, t("sg_help")),
      h("div", { class: "row" }, h("label", { class: "check" }, on, t("sg_on"))),
      h("div", {}, h("b", {}, t("sg_ips"))),
      (s.store_ips || []).length ? h("div", { class: "list" }, s.store_ips.map(ip => h("div", { class: "item" }, h("div", { class: "t" }, ip),
        h("button", { class: "btn sm danger m", type: "button", onclick: () => save({ store_ips: s.store_ips.filter(x => x !== ip) }) }, "✕")))) : h("p", { class: "muted" }, t("sg_none")),
      h("button", { class: "btn", type: "button", id: "sgIp", onclick: async () => { try { const r = await db.registerStoreIp(); if (!r.ok) return toast(r.err); S.settings = await db.getSettings(); toast(r.ip); draw(); } catch (e) { toast(errMsg(e)); } } }, "📶 " + t("sg_ipAdd")),
      h("div", { style: "margin-top:10px" }, h("b", {}, t("sg_loc")), " ", h("span", { class: "muted" }, s.store_lat != null ? `${(+s.store_lat).toFixed(5)}, ${(+s.store_lng).toFixed(5)}` : t("sg_none"))),
      h("div", { class: "row" }, h("button", { class: "btn", type: "button", id: "sgLoc", onclick: async () => { const l = await getLoc(); if (!l) return toast(t("sg_locErr")); save({ store_lat: l.lat, store_lng: l.lng }); } }, "📍 " + t("sg_locSet")),
        field(t("sg_radius"), rad)));
  };
  draw(); return card;
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
    owner && holidayCard(),
    owner && storeGuardCard(),
    h("div", { class: "card" }, h("h2", {}, t("contract")), h("ul", { style: "margin:0;padding-left:18px;display:grid;gap:8px;font-size:14px" }, t("contractText").map(x => h("li", {}, x)))));
}

/* ---- Add to Home Screen: shown as soon as the link opens (until the app is installed) ---- */
let A2H = null; let a2hShut = false;
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); A2H = e; showA2H(); });
window.addEventListener("appinstalled", () => { A2H = null; document.getElementById("a2h")?.remove(); });
function showA2H() {
  if (isStandalone() || a2hShut) return;
  document.getElementById("a2h")?.remove();
  const ua = navigator.userAgent || "", ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|KAKAOTALK|Viber/i.test(ua);
  // staff phones often open in Korean by default: always show the English line too
  const both = k => lang === "en" ? I18N.en[k] : [I18N.ko[k], I18N.en[k]];
  const key = inApp ? "a2h_inapp" : A2H ? "" : ios ? "a2h_ios" : "a2h_other";
  const msg = key ? both(key) : "";
  const box = h("div", { id: "a2h", class: "a2h", role: "dialog" },
    h("img", { src: "/icon-192.png", alt: "", width: 44, height: 44 }),
    h("div", { class: "a2hTxt" }, h("b", {}, lang === "en" ? I18N.en.a2h_title : `${I18N.ko.a2h_title} · ${I18N.en.a2h_title}`),
      ...(Array.isArray(msg) ? msg : msg ? [msg] : []).map((m, i) => h("div", { class: i ? "muted" : "" }, m))),
    !inApp && A2H ? h("button", { class: "btn primary", type: "button", id: "a2h-add", onclick: async () => { const ev = A2H; A2H = null; box.remove(); try { await ev.prompt(); } catch {} } }, t("a2h_btn")) : null,
    h("button", { class: "btn", type: "button", id: "a2h-later", onclick: () => { a2hShut = true; box.remove(); } }, t("a2h_later")));
  document.body.prepend(box);
}
setTimeout(showA2H, 600);
document.documentElement.lang = lang;
boot().catch(e => { root.innerHTML = ""; root.append(h("div", { class: "login" }, h("div", { class: "card" }, h("div", { class: "err" }, String(e.message || e))))); });
