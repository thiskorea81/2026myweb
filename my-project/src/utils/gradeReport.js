// 성적 안내 페이지(GradeReport.vue)용 계산 모음: 저장된 성적 문자열을 숫자로 풀고, 학생별 분석·안내문을 만든다.
//
// 성적 값 형식 (자료 올리기에서 저장하는 형식):
//   정기고사 "62.8(44.68, 예상 3등급)" / "36(81.56)" / 학기말 "61(66.67, 4등급)" / "77(B)" / "P"
//   모의고사 "34(32.33, 6등급)" / 영어·한국사 "31(7등급)"
//   응시하지 않은 과목은 "인정결", "전출" 같은 글자
import { getOrderedScores } from './gradeUtils.js'
import { fiveGradeOf } from './schoolDocParsers.js'

export const isMockExam = (examName) => /모의고사/.test(examName)
export const isSchoolExam = (examName) => /(중간고사|기말고사|학기말)$/.test(examName)

// 비교·추이는 같은 종류끼리: 모의고사 / 정기고사(중간·기말) / 학기말(수행평가 포함 종합)
export const examKind = (examName) => (isMockExam(examName) ? 'mock' : /학기말$/.test(examName) ? 'final' : isSchoolExam(examName) ? 'term' : null)

// 시험 이름 → 그래프 축 이름 ("1학기중간고사" → "1학기 중간", "9월모의고사" → "9월")
export const shortExamName = (examName) =>
  examName.replace(/모의고사$/, '').replace(/(\d학기)(중간|기말)고사$/, '$1 $2').replace(/(\d학기)학기말$/, '$1 학기말')

/** "62.8(44.68, 예상 3등급)" → { raw: 62.8, pct: 44.68, grade: 3, estimate: true, achievement: null, text } */
export function parseScore(value) {
  const text = String(value ?? '').trim()
  const m = text.match(/^(-?[\d.]+)\s*(?:\((.*)\))?$/)
  if (!m) return { raw: null, pct: null, grade: null, estimate: false, achievement: null, text }
  const inner = m[2] || ''
  const grade = inner.match(/(\d)등급/)
  const pct = inner.match(/^\s*([\d.]+)\s*(?:,|$)/)
  const ach = inner.match(/^\s*([A-EP])\s*$/)
  return {
    raw: Number(m[1]),
    pct: pct ? Number(pct[1]) : null,
    grade: grade ? Number(grade[1]) : null,
    estimate: /예상/.test(inner),
    achievement: ach ? ach[1] : null,
    text,
  }
}

// getOrderedScores 가 요약 항목에 붙이는 이름 + 따로 남는 요약 키
const SUMMARY_LABELS = new Set(['총점', '평균', '전체 등수', '국수영 점수합', '국수영 평균', '국수영 등수'])
const isSummaryLabel = (label) => SUMMARY_LABELS.has(label) || /^평균등급|^전과목등수/.test(label)
// 원래 키에 붙은 괄호 설명을 살려 보여 준다 ("전과목등수(279명)")
const summaryName = (record, label, value) =>
  Object.keys(record.scores).find((k) => record.scores[k] === value && (k === label || k.startsWith(label) || SUMMARY_LABELS.has(label))) || label

/** 한 시험 기록 → 과목별 행 + 요약값 */
export function examRows(record) {
  if (!record) return { subjects: [], summary: {} }
  const ordered = getOrderedScores(record.scores)
  const subjects = []
  const summary = {}
  for (const { label, score: value } of ordered) {
    if (isSummaryLabel(label)) { summary[summaryName(record, label, value)] = value; continue }
    const p = parseScore(value)
    const stats = record.subjectStats?.[label] || null
    // 정기고사에서 등급이 없고 석차백분율만 있으면 5등급 예상 등급을 계산해 보여 준다
    const grade = p.grade ?? (p.pct !== null && isSchoolExam(record.examName) ? fiveGradeOf(p.pct) : null)
    const estimate = p.grade === null ? grade !== null : p.estimate
    const wrong = record.itemAnalysis?.[label] || null
    subjects.push({ label, value, ...p, grade, estimate, stats, wrong })
  }
  return { subjects, summary }
}

/** 등급 경계: 석차와 수강자수로 "한 등급 위까지 몇 등" / "현재 등급 유지 여유 몇 등"을 계산 (5등급 누적 10·34·66·90%) */
const FIVE_CUTS = [10, 34, 66, 90]
export function boundaryNotes(subjects) {
  const notes = []
  for (const s of subjects) {
    const rank = s.stats?.석차
    const takers = s.stats?.수강자수
    if (!rank || !takers || !s.grade || s.grade > 5) continue
    const lastRankOf = (grade) => Math.floor((FIVE_CUTS[grade - 1] / 100) * takers) // 그 등급 안에 드는 마지막 석차
    if (s.grade > 1) {
      const need = rank - lastRankOf(s.grade - 1)
      if (need > 0 && need <= Math.max(3, Math.round(takers * 0.03))) notes.push(`${s.label}: ${s.grade - 1}등급까지 ${need}등 차이 — 조금만 더 올리면 한 등급 위`)
    }
    if (s.grade < 5) {
      const margin = lastRankOf(s.grade) - rank
      if (margin >= 0 && margin <= Math.max(3, Math.round(takers * 0.03))) notes.push(`${s.label}: ${s.grade}등급 경계에 가까움 (여유 ${margin}등) — 유지에 신경 쓰기`)
    }
  }
  return notes
}

/** 과목별 등급 변화 (같은 종류 시험끼리). kind: 'mock' | 'term' | 'final' → { exams, subjects: [{ label, points: [{ exam, grade, raw }] }] } */
export function gradeTrends(student, kind) {
  const records = (student.grades || []).filter((g) => examKind(g.examName) === kind)
  const bySubject = new Map()
  records.forEach((record) => {
    examRows(record).subjects.forEach((s) => {
      if (!bySubject.has(s.label)) bySubject.set(s.label, [])
      bySubject.get(s.label).push({ exam: shortExamName(record.examName), grade: s.grade, raw: s.raw })
    })
  })
  const exams = records.map((r) => shortExamName(r.examName))
  return {
    exams,
    subjects: [...bySubject.entries()].map(([label, pts]) => ({
      label,
      points: exams.map((exam) => pts.find((p) => p.exam === exam) || { exam, grade: null, raw: null }),
    })),
  }
}

/** 직전 같은 종류 시험과 비교한 과목별 등급 변화 문구 */
export function changeFromPrevious(student, examName) {
  const kind = examKind(examName)
  const list = (student.grades || []).filter((g) => examKind(g.examName) === kind)
  const idx = list.findIndex((g) => g.examName === examName)
  if (idx <= 0) return { previous: null, changes: [] }
  const prev = examRows(list[idx - 1]).subjects
  const changes = examRows(list[idx]).subjects.flatMap((s) => {
    const p = prev.find((x) => x.label === s.label || (x.label === '사회' && s.label === '사회탐구') || (x.label === '과학' && s.label === '과학탐구'))
    if (!p?.grade || !s.grade) return []
    const d = p.grade - s.grade
    return [{ label: s.label, from: p.grade, to: s.grade, delta: d }]
  })
  return { previous: list[idx - 1].examName, changes }
}

const fmt = (n, d = 1) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(d)).toString() : '—')

/** 학생·학부모에게 보낼 개별 안내문 (선생님이 고쳐 쓸 수 있는 초안) */
export function buildMessage(student, record) {
  const { subjects, summary } = examRows(record)
  const mock = isMockExam(record.examName)
  const lines = [`[${record.examName.replace(/(\d학기)/, '$1 ').replace(/(\d+월)모의고사/, '$1 전국연합학력평가')} 성적 안내]`, `${student.grade}학년 ${student.class}반 ${student.number}번 ${student.name}`, '']
  subjects.forEach((s) => {
    if (s.raw === null) { lines.push(`- ${s.label}: ${s.text}`); return }
    const parts = [`${fmt(s.raw)}점`]
    if (s.stats?.석차) parts.push(`석차 ${s.stats.석차}${s.stats.동석차수 > 1 ? `(${s.stats.동석차수})` : ''}/${s.stats.수강자수}명`)
    if (s.pct !== null) parts.push(mock ? `백분위 ${fmt(s.pct, 2)}` : `백분율 ${fmt(s.pct, 2)}%`)
    if (s.grade) parts.push(`${s.estimate ? '예상 ' : ''}${s.grade}등급`)
    if (s.achievement) parts.push(`성취도 ${s.achievement}`)
    if (s.stats?.과목평균 != null) parts.push(`과목평균 ${fmt(s.stats.과목평균)}점`)
    if (s.wrong?.오답?.length) parts.push(`오답 ${s.wrong.오답.length}/${s.wrong.문항수}문항`)
    lines.push(`- ${s.label}: ${parts.join(' / ')}`)
  })
  const sumParts = Object.entries(summary).map(([k, v]) => `${k} ${v}`)
  if (sumParts.length) lines.push('', sumParts.join(' · '))

  const { previous, changes } = changeFromPrevious(student, record.examName)
  const moved = changes.filter((c) => c.delta !== 0)
  if (previous && moved.length) {
    lines.push('', `[${shortExamName(previous)} 대비 등급 변화]`)
    moved.forEach((c) => lines.push(`- ${c.label}: ${c.from}등급 → ${c.to}등급 (${c.delta > 0 ? `${c.delta}등급 상승` : `${-c.delta}등급 하락`})`))
  }
  const notes = boundaryNotes(subjects)
  if (notes.length) lines.push('', '[등급 경계 참고]', ...notes.map((n) => `- ${n}`))
  if (subjects.some((s) => s.estimate)) lines.push('', '※ 예상 등급은 석차백분율로 계산한 값이며 확정 성적과 다를 수 있습니다.')
  return lines.join('\n')
}
