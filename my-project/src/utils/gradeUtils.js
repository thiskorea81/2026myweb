// 💡 지정된 순서와 풀네임 매핑 규칙
export const orderedSubjects = [
  { match: ['국', '국어'], label: '국어' },
  { match: ['수', '수학'], label: '수학' },
  { match: ['영', '영어'], label: '영어' },
  { match: ['한', '한국사'], label: '한국사' },
  { match: ['통사', '통합사회'], label: '통합사회' },
  { match: ['통과', '통합과학'], label: '통합과학' },
  { match: ['정보'], label: '정보' },
  { match: ['사탐', '사회탐구'], label: '사회탐구' },
  { match: ['과탐', '과학탐구'], label: '과학탐구' }
]

// 💡 총점, 평균 등 맨 뒤에 배치할 항목들
export const summaryItems = [
  { match: ['국수영 점수합', '국수영 합', '국수영합'], label: '국수영 점수합' },
  { match: ['국수영 평균'], label: '국수영 평균' },
  { match: ['국수영 등수'], label: '국수영 등수' },
  { match: ['전체 점수합', '전체 합', '전체합', '총점'], label: '총점' },
  { match: ['평균', '전체 평균'], label: '평균' },
  { match: ['전체 등수', '등수'], label: '전체 등수' }
]

// 💡 성적 데이터를 정해진 순서와 풀네임으로 재배열하는 함수
export const getOrderedScores = (scores) => {
  if (!scores) return []
  
  const result = []
  const usedKeys = new Set()

  // 1. 우리가 지정한 과목 순서대로 먼저 찾아서 배열에 넣습니다.
  orderedSubjects.forEach(orderItem => {
    for (const alias of orderItem.match) {
      if (scores[alias] !== undefined) {
        result.push({ label: orderItem.label, score: scores[alias] })
        usedKeys.add(alias)
        break // 매칭되는 것을 찾으면 다음 순서로 넘어감
      }
    }
  })

  // 2. 지정된 목록에 없는 예외 과목(예: 제2외국어, 직업탐구 등)이 있다면 그 다음에 붙여줍니다.
  const summaryMatches = new Set(summaryItems.flatMap(item => item.match))
  Object.keys(scores).forEach(key => {
    if (!usedKeys.has(key) && !summaryMatches.has(key)) {
      result.push({ label: key, score: scores[key] })
      usedKeys.add(key)
    }
  })

  // 3. 총점, 평균 등 요약 항목을 맨 뒤에 붙여줍니다.
  summaryItems.forEach(orderItem => {
    for (const alias of orderItem.match) {
      if (scores[alias] !== undefined) {
        result.push({ label: orderItem.label, score: scores[alias] })
        usedKeys.add(alias)
        break
      }
    }
  })

  // 4. 혹시라도 매칭되지 않은 요약 항목 비슷한 것이 남아있다면 가장 마지막에 추가합니다.
  Object.keys(scores).forEach(key => {
    if (!usedKeys.has(key)) {
      result.push({ label: key, score: scores[key] })
    }
  })

  return result
}
