// NEIS(교육정보 개방포털) 급식식단정보 + 학사일정 조회 (github.com/thiskorea81/sch-meal 의 neisService.js 를 옮겨 옴)
// 급식: https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN17320190722180924242823
// 학사일정: https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN17020190531110010107403
//
// NEIS 키는 요청 빈도 제한만 있는 공개 데이터 조회용 키라(결제/개인정보 권한 없음) 클라이언트 상수로 둔다.
const NEIS_API_KEY = 'dc75c4d2c843487aa2696b8d519ebda8'
const ATPT_OFCDC_SC_CODE = 'M10' // 충청북도교육청
const SD_SCHUL_CODE = '8000047' // 상당고등학교
const LUNCH_MEAL_CODE = '2' // 1:조식, 2:중식, 3:석식

const MEAL_URL = 'https://open.neis.go.kr/hub/mealServiceDietInfo'
const SCHEDULE_URL = 'https://open.neis.go.kr/hub/SchoolSchedule'

// 학교급식 식품알레르기 유발물질 표시 19개 항목 (교육부/식약처 표준 코드)
const ALLERGY_NAMES = {
  1: '난류', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두', 6: '밀',
  7: '고등어', 8: '게', 9: '새우', 10: '돼지고기', 11: '복숭아',
  12: '토마토', 13: '아황산류', 14: '호두', 15: '닭고기', 16: '쇠고기',
  17: '오징어', 18: '조개류', 19: '잣',
}

// "고기짬뽕국+면사리 (5.6.9)" → { name: '고기짬뽕국+면사리', allergy: '대두, 밀, 새우' }
function parseDishLine(line) {
  const match = line.match(/^(.*?)\s*\((\d+(?:\.\d+)*)\)\s*$/)
  if (!match) return { name: line.trim(), allergy: '' }
  const [, name, codes] = match
  return { name: name.trim(), allergy: codes.split('.').map(code => ALLERGY_NAMES[Number(code)] || code).join(', ') }
}

const parseMenuText = (raw) => (raw || '')
  .replace(/<br\s*\/?>/g, '\n')
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .map(parseDishLine)

// 같은 달을 여러 위젯이 동시에 물어도 네트워크 요청은 한 번만 (실패한 요청은 캐시하지 않음)
const cache = new Map()
const cached = (key, loader) => {
  if (!cache.has(key)) cache.set(key, loader().catch((e) => { cache.delete(key); throw e }))
  return cache.get(key)
}

async function fetchNeis(url, params, rootKey) {
  const query = new URLSearchParams({ KEY: NEIS_API_KEY, Type: 'json', pSize: '200', ATPT_OFCDC_SC_CODE, SD_SCHUL_CODE, ...params })
  const response = await fetch(`${url}?${query}`)
  const data = await response.json()
  return data?.[rootKey]?.[1]?.row || []
}

// 한 달치 점심 메뉴 { 'YYYYMMDD': { dishes: [{name, allergy}], calorie } }
export function fetchMonthlyLunchMenu(yearMonth) {
  return cached(`meal-${yearMonth}`, async () => {
    const rows = await fetchNeis(MEAL_URL, { MMEAL_SC_CODE: LUNCH_MEAL_CODE, MLSV_YMD: yearMonth }, 'mealServiceDietInfo')
    return Object.fromEntries(rows.map(row => [row.MLSV_YMD, { dishes: parseMenuText(row.DDISH_NM), calorie: row.CAL_INFO || '' }]))
  })
}

export async function fetchLunchMenuForDate(dateStr) {
  const ymd = dateStr.replaceAll('-', '')
  try {
    return (await fetchMonthlyLunchMenu(ymd.slice(0, 6)))[ymd] || null
  } catch (error) {
    console.error('NEIS 급식 정보 조회 실패:', error)
    return null
  }
}

// 고등학교는 1~3학년만 사용
function gradesForEvent(row) {
  const grades = []
  if (row.ONE_GRADE_EVENT_YN === 'Y') grades.push('1학년')
  if (row.TW_GRADE_EVENT_YN === 'Y') grades.push('2학년')
  if (row.THREE_GRADE_EVENT_YN === 'Y') grades.push('3학년')
  return grades.length === 3 ? ['전체'] : grades
}

// 한 달치 학사일정 { 'YYYY-MM-DD': [{ name, grades, holiday }] } (토요휴업일은 제외)
export function fetchMonthlySchoolEvents(yearMonth) {
  return cached(`event-${yearMonth}`, async () => {
    const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(4, 6)), 0).getDate()
    const rows = await fetchNeis(SCHEDULE_URL, { AA_FROM_YMD: `${yearMonth}01`, AA_TO_YMD: `${yearMonth}${lastDay}` }, 'SchoolSchedule')
    const byDate = {}
    rows
      .filter(row => row.EVENT_NM && row.EVENT_NM !== '토요휴업일')
      .forEach(row => {
        const date = `${row.AA_YMD.slice(0, 4)}-${row.AA_YMD.slice(4, 6)}-${row.AA_YMD.slice(6, 8)}`
        ;(byDate[date] ||= []).push({ name: row.EVENT_NM, grades: gradesForEvent(row), holiday: row.SBTR_DD_SC_NM === '휴업일' })
      })
    return byDate
  })
}

export async function fetchSchoolEventsForDate(dateStr) {
  try {
    return (await fetchMonthlySchoolEvents(dateStr.replaceAll('-', '').slice(0, 6)))[dateStr] || []
  } catch (error) {
    console.error('NEIS 학사일정 조회 실패:', error)
    return []
  }
}
