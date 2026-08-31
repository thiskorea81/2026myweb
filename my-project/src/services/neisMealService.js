// 💡 NEIS(교육정보 개방포털) 급식식단정보 API 연동
// https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN17320190722180924242823

const NEIS_BASE_URL = 'https://open.neis.go.kr/hub/mealServiceDietInfo'
const ATPT_OFCDC_SC_CODE = 'M10' // 충청북도교육청
const SD_SCHUL_CODE = '8000047' // 학교 코드
const LUNCH_MEAL_CODE = '2' // 1:조식, 2:중식, 3:석식

// 한 달치 중식(점심) 메뉴를 조회해 날짜별(YYYYMMDD)로 정리
export async function fetchMonthlyLunchMenu(yearMonth) {
  const apiKey = import.meta.env.VITE_NEIS_API_KEY
  if (!apiKey) {
    console.error('🚨 [에러] .env 파일의 VITE_NEIS_API_KEY를 확인하세요.')
    return {}
  }

  const params = new URLSearchParams({
    KEY: apiKey,
    Type: 'json',
    ATPT_OFCDC_SC_CODE,
    SD_SCHUL_CODE,
    MMEAL_SC_CODE: LUNCH_MEAL_CODE,
    MLSV_YMD: yearMonth, // 'YYYYMM'
  })

  try {
    const response = await fetch(`${NEIS_BASE_URL}?${params.toString()}`)
    const data = await response.json()
    const rows = data?.mealServiceDietInfo?.[1]?.row
    if (!rows) return {}

    const byDate = {}
    rows.forEach(row => {
      byDate[row.MLSV_YMD] = {
        menu: (row.DDISH_NM || '').replace(/<br\s*\/?>/g, '\n').trim(),
        calorie: row.CAL_INFO || '',
      }
    })
    return byDate
  } catch (error) {
    console.error('NEIS 급식 정보 조회 실패:', error)
    return {}
  }
}

// 특정 날짜(YYYY-MM-DD) 하루의 중식 메뉴 조회
export async function fetchLunchMenuForDate(dateStr) {
  const yearMonth = dateStr.replaceAll('-', '').slice(0, 6)
  const dayKey = dateStr.replaceAll('-', '')
  const monthly = await fetchMonthlyLunchMenu(yearMonth)
  return monthly[dayKey] || null
}
