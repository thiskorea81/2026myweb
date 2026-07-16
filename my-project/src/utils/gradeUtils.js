// 💡 우리 학교 교과 편제에 맞춘 지정 순서와 풀네임 매핑 규칙
// 국어, 수학, 영어, 한국사, 사회, 과학, 정보/인공지능기초, 중국어/일본어/한문, 진로/과학탐구실험, 체육/음악/미술
export const orderedSubjects = [
  { match: ['국', '국어'], label: '국어' },
  { match: ['수', '수학'], label: '수학' },
  { match: ['영', '영어'], label: '영어' },
  { match: ['한', '한국사'], label: '한국사' },
  { match: ['사', '사회', '통사', '통합사회'], label: '사회' },
  { match: ['과', '과학', '통과', '통합과학'], label: '과학' },
  { match: ['정보'], label: '정보' },
  { match: ['인공지능기초', '인공지능'], label: '인공지능기초' },
  { match: ['중국어'], label: '중국어' },
  { match: ['일본어'], label: '일본어' },
  { match: ['한문'], label: '한문' },
  { match: ['진로', '진로와 직업'], label: '진로' },
  { match: ['과학탐구실험'], label: '과학탐구실험' },
  { match: ['체육'], label: '체육' },
  { match: ['음악'], label: '음악' },
  { match: ['미술'], label: '미술' },
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
