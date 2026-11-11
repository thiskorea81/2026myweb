// 💡 1학년 급식순서 (2026.8.31.~2027.2.5.) - 급식실 반별 이동 순서 계산
// 원본: "1학년 급식순서(2026.8.31.-2027.2.5.).txt"
// ⚠️ Cloud Functions(functions/mealOrder.js)는 CommonJS라 이 파일을 직접 import할 수 없음.
//    순서표나 휴업일이 바뀌면 반드시 functions/mealOrder.js도 함께 수정할 것.

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

// 시험 기간 - 급식 시작시간이 평상시(12:30)와 다른 날 (원본 파일 [시험 기간 - 급식 시작시간 변경] 참고)
const SPECIAL_START_DAYS = {
  '2026-09-02': { time: '12:00', note: '모의고사일' },
  '2026-10-20': { time: '12:00', note: '모의고사일' },
  '2026-10-13': { time: '12:10', note: '중간고사 기간' },
  '2026-10-14': { time: '12:10', note: '중간고사 기간' },
  '2026-10-15': { time: '12:10', note: '중간고사 기간' },
  '2026-12-07': { time: '12:10', note: '기말고사 기간' },
  '2026-12-08': { time: '12:10', note: '기말고사 기간' },
  '2026-12-09': { time: '12:10', note: '기말고사 기간' },
  '2026-12-10': { time: '12:10', note: '기말고사 기간' },
}

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

  // 그 주 안에 있는 시험일들을 (문구, 기준시각)별로 묶어서 안내 (한 주에 모의고사/중간고사가 섞일 일은 없지만 방어적으로 처리)
  const specialDatesInWeek = Object.keys(SPECIAL_START_DAYS).filter(d => d >= week.start && d <= week.end)
  let specialNote = ''
  if (specialDatesInWeek.length > 0) {
    const groups = new Map()
    specialDatesInWeek.forEach(d => {
      const { time: baseTime, note } = SPECIAL_START_DAYS[d]
      const key = `${note}|${baseTime}`
      if (!groups.has(key)) groups.set(key, { note, baseTime, dates: [] })
      groups.get(key).dates.push(d)
    })
    specialNote = [...groups.values()].map(g => {
      const dateLabel = g.dates.map(formatKoreanDate).join(', ')
      const adjustedTime = addMinutes(g.baseTime, (orderNum - 1) * 2)
      return ` (단, ${dateLabel}은 ${g.note}이라 ${adjustedTime} 출발)`
    }).join('')
  }

  return { orderNum, time, specialNote }
}

// 월요일 조회용: "이번 주" 급식 순서 안내문
export function getThisWeekMealNote(mondayDateStr, classNum) {
  const info = getWeekOrderInfo(mondayDateStr, classNum)
  if (!info) return null
  return `🍱 [이번 주 급식 순서] 우리 반은 ${info.orderNum}번째로 이동, 12:30 기준 ${info.time} 출발입니다.${info.specialNote}`
}

// 금요일 종례용: "다음 주" 급식 순서 예고문
export function getNextWeekMealNote(fridayDateStr, classNum) {
  const nextMonday = addDays(fridayDateStr, 3)
  const info = getWeekOrderInfo(nextMonday, classNum)
  if (!info) return null
  return `🍱 [다음 주 급식 순서 예고] 우리 반은 ${info.orderNum}번째로 이동, 12:30 기준 ${info.time} 출발 예정입니다.${info.specialNote}`
}

// 급식(등교) 자체가 없는 날 - 첫 화면 급식 안내용 (sch-meal 저장소의 mealOrder.js와 같은 목록)
const NO_MEAL_DATES = new Set([
  '2026-09-24', '2026-09-25', // 추석 연휴
  '2026-10-05', // 개천절 대체공휴일
  '2026-10-09', // 한글날
  '2026-10-16', // 중간고사 마지막날
  '2026-11-18', '2026-11-19', // 대학수학능력시험 전날/당일
  '2026-12-11', // 기말고사 마지막날
  '2026-12-25', // 성탄절
  '2026-12-30', // 겨울방학식
  '2026-12-31', '2027-01-01', // 겨울방학 기간(원본 표에는 순서가 남아있으나 실제로는 등교하지 않음)
  '2027-02-03', // 졸업식
  '2027-02-05', // 종업식
])

// 특정 날짜 하루, 1~9반 전체의 이동 순서/출발 시각표 (급식이 없는 날이면 null)
// rows는 출발 순서(orderNum) 오름차순
export function getDayMealSchedule(dateStr) {
  if (NO_MEAL_DATES.has(dateStr)) return null
  const week = findWeek(dateStr)
  if (!week) return null

  const special = SPECIAL_START_DAYS[dateStr] || null
  const baseStart = special ? special.time : '12:30'
  const rows = []
  for (let classNum = 1; classNum <= 9; classNum++) {
    const orderNum = ((classNum - week.startClass + 9) % 9) + 1
    rows.push({ classNum, orderNum, time: addMinutes(baseStart, (orderNum - 1) * 2) })
  }
  rows.sort((a, b) => a.orderNum - b.orderNum)
  const note = special ? `📌 ${special.note} - ${special.time} 기준으로 전체 출발 시각이 당겨졌습니다.` : null
  return { rows, note }
}
