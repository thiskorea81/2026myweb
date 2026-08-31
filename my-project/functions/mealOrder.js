// 💡 1학년 급식순서 (2026.8.31.~2027.2.5.) - 급식실 반별 이동 순서 계산
// 원본: "1학년 급식순서(2026.8.31.-2027.2.5.).txt"
// ⚠️ 프론트엔드(src/utils/mealOrder.js)는 ESM이라 Cloud Functions(CommonJS)에서 직접 import할 수 없어 내용을 그대로 복제해 둠.
//    순서표나 휴업일이 바뀌면 반드시 src/utils/mealOrder.js도 함께 수정할 것.

// 주차별 [시작일, 종료일, 그 주 1번째로 이동하는 반]
const WEEKS = [
  { start: '2026-08-31', end: '2026-09-04', startClass: 5 },
  { start: '2026-09-07', end: '2026-09-11', startClass: 6 },
  { start: '2026-09-14', end: '2026-09-18', startClass: 7 },
  { start: '2026-09-21', end: '2026-09-25', startClass: 8 },
  { start: '2026-09-28', end: '2026-10-02', startClass: 9 },
  { start: '2026-10-05', end: '2026-10-09', startClass: 1 },
  { start: '2026-10-12', end: '2026-10-16', startClass: 2 },
  { start: '2026-10-19', end: '2026-10-23', startClass: 3 },
  { start: '2026-10-26', end: '2026-10-30', startClass: 4 },
  { start: '2026-11-02', end: '2026-11-06', startClass: 5 },
  { start: '2026-11-09', end: '2026-11-13', startClass: 6 },
  { start: '2026-11-16', end: '2026-11-20', startClass: 7 },
  { start: '2026-11-23', end: '2026-11-27', startClass: 8 },
  { start: '2026-11-30', end: '2026-12-04', startClass: 9 },
  { start: '2026-12-07', end: '2026-12-11', startClass: 1 },
  { start: '2026-12-14', end: '2026-12-18', startClass: 2 },
  { start: '2026-12-21', end: '2026-12-25', startClass: 3 },
  { start: '2026-12-28', end: '2027-01-01', startClass: 4 },
  { start: '2027-02-01', end: '2027-02-05', startClass: 5 },
]

// 모의고사일 (12:10 출발 기준으로 당겨짐)
const MOCK_EXAM_DATES = new Set(['2026-09-02', '2026-10-20'])

function findWeek(dateStr) {
  return WEEKS.find(w => dateStr >= w.start && dateStr <= w.end) || null
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatKoreanDate(dateStr) {
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}.${Number(d)}.`
}

// classNum(1~9)이 해당 주에 급식실에 몇 번째로 이동하는지 + 기본 출발 시각 계산
function getWeekOrderInfo(referenceDateStr, classNum) {
  const week = findWeek(referenceDateStr)
  if (!week) return null

  const orderNum = ((classNum - week.startClass + 9) % 9) + 1
  const time = addMinutes('12:30', (orderNum - 1) * 2)

  const mockDatesInWeek = [...MOCK_EXAM_DATES].filter(d => d >= week.start && d <= week.end)
  const mockNote = mockDatesInWeek.length > 0
    ? ` (단, ${mockDatesInWeek.map(formatKoreanDate).join(', ')}은 모의고사일이라 ${addMinutes('12:10', (orderNum - 1) * 2)} 출발)`
    : ''

  return { orderNum, time, mockNote }
}

// 월요일 조회용: "이번 주" 급식 순서 안내문
function getThisWeekMealNote(mondayDateStr, classNum) {
  const info = getWeekOrderInfo(mondayDateStr, classNum)
  if (!info) return null
  return `🍱 [이번 주 급식 순서] 우리 반은 ${info.orderNum}번째로 이동, 12:30 기준 ${info.time} 출발입니다.${info.mockNote}`
}

// 금요일 종례용: "다음 주" 급식 순서 예고문
function getNextWeekMealNote(fridayDateStr, classNum) {
  const nextMonday = addDays(fridayDateStr, 3)
  const info = getWeekOrderInfo(nextMonday, classNum)
  if (!info) return null
  return `🍱 [다음 주 급식 순서 예고] 우리 반은 ${info.orderNum}번째로 이동, 12:30 기준 ${info.time} 출발 예정입니다.${info.mockNote}`
}

module.exports = { getThisWeekMealNote, getNextWeekMealNote }
