// 나이스·KICE에서 내려받은 원본 자료를 그대로 읽어 학생/성적 데이터로 바꾸는 파서 모음 (화면·DB 접근 없음)
//
//  · 명렬표            나이스 기본학적관리 > 명렬표 출력(모두 선택) xlsx
//  · 사진 파일명        나이스 사진일괄입력 규칙 "성명(번호).jpg" (예전 방식 "학번.jpg"도 허용)
//  · 정기시험 일람표     나이스 학급담임 > 정기시험조회 > 학급별 일람표 xlsx
//  · 학기말 개인별 일람표 나이스 학급담임 > 성적조회 > 학기말성적조회 xlsx
//  · 모의고사 성적통지표  KICE 시험업무지원 포털 성적통지표(학생용) PDF — 글자 좌표(pdf.js)를 받아 읽는다
//
// 결과 성적 값은 기존 기록과 같은 형식을 쓴다:
//   정기시험 "원점수", 학기말 "원점수(N등급)", 모의고사 "원점수(전국백분위, N등급)" / 영어·한국사 "원점수(N등급)"

const cell = (v) => String(v ?? '').trim()
const num = (v) => {
  const s = cell(v).replace(/,/g, '')
  return s !== '' && !isNaN(Number(s)) ? Number(s) : null
}
export const studentIdOf = (grade, cls, number) => `${grade}${String(cls).padStart(2, '0')}${String(number).padStart(2, '0')}`

// 교과목명 → 성적표에 쓰는 과목명 ("공통국어2(4)" → 국어, "통합사회1(4)" → 사회, "진로와 직업(2)" → 진로)
const SUBJECT_ALIASES = { 공통국어: '국어', 공통수학: '수학', 공통영어: '영어', 통합사회: '사회', 통합과학: '과학', '진로와 직업': '진로', 진로와직업: '진로' }
export function subjectLabel(courseName) {
  const base = cell(courseName).split(':').pop().replace(/\(\d+\)$/, '').trim()
  const noNum = base.replace(/\s*\d+$/, '').trim()
  return SUBJECT_ALIASES[noNum] || noNum
}

// ───────────────────────── xlsx 종류 판별 ─────────────────────────

/** rows: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) */
export function detectSheetType(rows) {
  const head = rows.slice(0, 6).map((r) => r.map(cell).join(' ')).join(' ')
  if (head.includes('정기시험 학급별 일람표')) return 'exam'
  if (head.includes('학기말 개인별 일람표')) return 'semester'
  const first = (rows[0] || []).map(cell)
  if (['학년', '반', '번호', '성명'].every((h) => first.includes(h))) return 'roster'
  return null
}

// ───────────────────────── 명렬표 ─────────────────────────

/** → [{ studentId, grade, class, number, name, gender, birthDate, zipCode, address, neisNo, note }] (주민등록번호는 읽지 않는다) */
export function parseRoster(rows) {
  const header = rows[0].map((h) => cell(h).replace(/\s+/g, ''))
  const col = (name) => header.findIndex((h) => h.startsWith(name))
  const c = { grade: col('학년'), cls: col('반'), number: col('번호'), name: col('성명'), neisNo: col('학생개인번호'), gender: col('성별'), birth: col('생년월일'), zip: col('우편번호'), address: col('주소'), note: col('비고'), prev: col('이전학적정보') }
  return rows.slice(1).flatMap((r) => {
    const grade = num(r[c.grade])
    const cls = num(r[c.cls])
    const number = num(r[c.number])
    const name = cell(r[c.name])
    if (!grade || !cls || !number || !name) return []
    const note = [cell(r[c.note]), c.prev >= 0 ? cell(r[c.prev]) : ''].filter(Boolean).join(' / ')
    return [{
      studentId: studentIdOf(grade, cls, number),
      grade, class: cls, number, name,
      gender: cell(r[c.gender]).replace(/성$/, ''), // 남성 → 남 (기존 데이터 표기)
      birthDate: cell(r[c.birth]),
      zipCode: c.zip >= 0 ? cell(r[c.zip]) : '',
      address: cell(r[c.address]),
      neisNo: c.neisNo >= 0 ? cell(r[c.neisNo]) : '',
      note,
    }]
  })
}

// ───────────────────────── 사진 파일명 ─────────────────────────

/** "홍길동(12).jpg" → { name, number } / "10512.jpg" → { studentId } / 그 외 null */
export function parsePhotoFileName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  const named = base.match(/^(.+?)\s*\(\s*(\d+)\s*\)$/)
  if (named) return { name: named[1].trim(), number: Number(named[2]) }
  if (/^\d{5}$/.test(base)) return { studentId: base }
  return null
}

// ───────────────────────── 정기시험 학급별 일람표 ─────────────────────────

/**
 * → { grade, class, semester, exam, examName, subjects[], students: [{ studentId, number, name, scores }], averages }
 * scores: { 국어: '62.8', ..., 합계, 평균 } (응시하지 않은 과목은 표의 글자 그대로: 결시 등)
 */
export function parseExamSheet(rows) {
  const text = rows.slice(0, 6).map((r) => r.map(cell).join(' ')).join('\n')
  const meta = text.match(/(\d)학기[\s\S]*?(\d)학년\s+(\d+)반/)
  const examMatch = text.match(/고사\s*:\s*([^\n]*?)\s*담임/)
  if (!meta || !examMatch) throw new Error('정기시험 일람표의 학기/학년/반/고사 정보를 찾지 못했습니다')
  const [, semester, grade, cls] = meta
  const exam = examMatch[1].includes('기말') ? '기말고사' : examMatch[1].includes('중간') ? '중간고사' : examMatch[1].replace(/^\d학기\s*/, '').replace(/\s+/g, '')

  const hIdx = rows.findIndex((r) => cell(r[0]) === '번호')
  const header = rows[hIdx].map(cell)
  const totalIdx = header.findIndex((h) => h.replace(/\s/g, '') === '합계')
  const avgIdx = header.findIndex((h) => h.replace(/\s/g, '') === '평균')
  const subjectCols = header.map((h, i) => ({ i, h })).filter(({ i, h }) => i >= 3 && h && (totalIdx < 0 || i < totalIdx))
  const subjects = subjectCols.map(({ h }) => subjectLabel(h))

  const students = []
  const averages = {}
  for (const r of rows.slice(hIdx + 1)) {
    const label = cell(r[0]).replace(/\s/g, '')
    if (label === '평균' || label === '학과평균') {
      averages[label === '평균' ? '학급' : '학과'] = Object.fromEntries(subjectCols.map(({ i }, k) => [subjects[k], num(r[i])]).filter(([, v]) => v !== null))
      continue
    }
    const number = num(r[0])
    const name = cell(r[2])
    if (!number || !name) continue
    const scores = {}
    subjectCols.forEach(({ i }, k) => { if (cell(r[i])) scores[subjects[k]] = cell(r[i]) })
    if (totalIdx >= 0 && cell(r[totalIdx])) scores['합계'] = cell(r[totalIdx])
    if (avgIdx >= 0 && cell(r[avgIdx])) scores['평균'] = cell(r[avgIdx])
    students.push({ studentId: studentIdOf(grade, cls, number), number, name, scores })
  }
  return { grade: Number(grade), class: Number(cls), semester: Number(semester), exam, examName: `${semester}학기${exam}`, subjects, students, averages }
}

// ───────────────────────── 학기말 개인별 일람표 ─────────────────────────

const maxOf = (v) => num(cell(v).split('/')[0])

/**
 * → { semester, students: [{ studentId, grade, class, number, name, subjects: { 국어: { raw, avg, achievement, rankGrade, takers, items[] }, 체육: { achievement, items }, 진로: { pass } } }] }
 * 쪽이 바뀌면 같은 학생·같은 과목이 이어서 나오므로 학생/과목 단위로 이어 붙인다.
 */
export function parseSemesterSheet(rows) {
  const byId = new Map()
  let semester = null
  let student = null
  let section = 'general'
  let colIdx = {}
  let subject = null

  for (const r of rows) {
    const c0 = cell(r[0])
    const head = c0.match(/(\d)학기\s+\S+\s+(\d)학년.*?(\d+)반\s+(\d+)번\s+(\S+)/)
    if (head) {
      semester = Number(head[1])
      const id = studentIdOf(head[2], head[3], head[4])
      if (!byId.has(id)) byId.set(id, { studentId: id, grade: Number(head[2]), class: Number(head[3]), number: Number(head[4]), name: head[5], subjects: {} })
      if (student?.studentId !== id) { subject = null; section = 'general' }
      student = byId.get(id)
      continue
    }
    if (!student) continue
    if (c0.startsWith('<')) {
      section = c0.includes('체육') ? 'arts' : c0.includes('교양') ? 'liberal' : 'general'
      subject = null
      continue
    }
    if (c0 === '과목명') {
      colIdx = Object.fromEntries(r.map((h, i) => [cell(h).replace(/\s/g, ''), i]).filter(([h]) => h))
      continue
    }

    if (c0 && /\(\d+\)$/.test(c0)) {
      const label = subjectLabel(c0)
      subject = student.subjects[label] ||= { course: c0, items: [] }
    }
    if (!subject) continue

    if (section === 'liberal') {
      const pass = cell(r[colIdx['이수여부']])
      if (pass) subject.pass = pass
      continue
    }
    const kind = cell(r[colIdx['구분']])
    if (kind === '정기시험' || kind === '수행평가') {
      subject.items.push({ kind, name: cell(r[colIdx['고사/영역명']]), score: num(r[colIdx['점수']]), max: maxOf(r[colIdx['만점/반영비율%']]) })
    }
    const rawAvg = cell(r[colIdx['원점수/과목평균']]).match(/^([\d.]+)\/([\d.]+)$/)
    if (rawAvg) [subject.raw, subject.avg] = [Number(rawAvg[1]), Number(rawAvg[2])]
    const ach = cell(r[colIdx['성취도']])
    if (/^[A-EP]$/.test(ach)) subject.achievement = ach
    const rank = num(r[colIdx['석차등급']])
    if (rank && rank >= 1 && rank <= 9) subject.rankGrade = rank
    const takers = num(r[colIdx['수강자수']])
    if (takers) subject.takers = takers
  }
  return { semester, students: [...byId.values()] }
}

/** 학기말 일람표 한 학생 → { 학기말: scores, 수행평가: scores } (기존 '1학기학기말' / '1학기수행평가' 기록과 같은 형식) */
export function semesterRecords(s) {
  const final = {}
  const perf = {}
  for (const [label, sub] of Object.entries(s.subjects)) {
    const perfItems = sub.items.filter((i) => i.kind === '수행평가' && i.score !== null)
    if (sub.pass) final[label] = sub.pass === '이수' ? 'P' : sub.pass
    else if (sub.raw !== undefined) final[label] = sub.rankGrade ? `${sub.raw}(${sub.rankGrade}등급)` : `${sub.raw}(${sub.achievement || '-'})`
    else if (sub.achievement) final[label] = `${perfItems.reduce((a, i) => a + i.score, 0)}(${sub.achievement})` // 체육·예술: 수행 합계(성취도)
    if (perfItems.length) {
      const sum = perfItems.reduce((a, i) => a + i.score, 0)
      const max = perfItems.reduce((a, i) => a + (i.max || 0), 0)
      perf[label] = `${+sum.toFixed(2)}/${+max.toFixed(2)}`
    }
  }
  return { final, perf }
}

// ───────────────────────── KICE 성적통지표 PDF ─────────────────────────

/** pdf.js 글자 조각들 → 같은 줄(y)끼리 묶고, 글자 사이가 벌어진 곳에서 끊어 낱말(token)로 만든다 */
function lineTokens(items) {
  const lines = new Map()
  items.forEach((it) => {
    if (!it.str.trim()) return
    const y = Math.round(it.y)
    const key = [...lines.keys()].find((k) => Math.abs(k - y) <= 1) ?? y
    if (!lines.has(key)) lines.set(key, [])
    lines.get(key).push(it)
  })
  return [...lines.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, its]) => {
      its.sort((a, b) => a.x - b.x)
      const tokens = []
      its.forEach((it) => {
        const last = tokens[tokens.length - 1]
        if (last && it.x - last.end < 3.2) { last.s += it.str; last.end = it.x + (it.w || 4) }
        else tokens.push({ s: it.str, x: it.x, end: it.x + (it.w || 4) })
      })
      return { y, tokens, text: tokens.map((t) => t.s).join(' ') }
    })
}

// 줄 맨 왼쪽(x < maxX)의 글자들을 이어 붙인 표 머리글 ("국 어"처럼 글자 간격이 벌어진 경우 포함)
const labelOf = (line, maxX) => line.tokens.filter((tk) => tk.x < maxX).map((tk) => tk.s).join('').replace(/\s/g, '')

const SCORE_ROWS = [
  ['국어', '국어'], ['수학', '수학'], ['영어', '영어'], ['한국사', '한국사'], ['사회', '사회탐구'], ['과학', '과학탐구'],
]
// 채점결과 줄 순서 (탐구 줄은 앞 25문항이 사회, 뒤 25문항이 과학)
const MARK_ORDER = ['국어', '수학', '영어', '한국사', '탐구']

/**
 * pages: [[{ str, x, y, w }]] (페이지별 글자 조각, pdf.js getTextContent 의 transform[4]/[5]/width)
 * → { examName, students: [{ studentId, grade, class, number, name, scores, itemAnalysis }] }
 */
export function parseKiceReport(pages) {
  let examName = null
  const students = []

  for (const items of pages) {
    const lines = lineTokens(items)
    const all = lines.map((l) => l.text.replace(/\s/g, '')).join('\n')
    if (!all.includes('성적통지표(학생용)')) continue // 뒷면(용어 설명) 쪽은 건너뜀

    const title = all.match(/(\d{4})학년도(\d{1,2})월고(\d)전국연합학력평가/)
    if (title) examName = `${Number(title[2])}월모의고사`

    // 학교명 줄 바로 아래: 학교 / 학년 / 반 / 번호 / 성명 / 실시일
    const idLine = lines.find((l) => /고등학교/.test(l.text) && /\d{4}\.\s*\d+\.\s*\d+/.test(l.text.replace(/\s/g, '')))
    const t = idLine?.tokens.map((x) => x.s.trim()).filter(Boolean) || []
    const school = t.findIndex((x) => x.endsWith('고등학교'))
    const [grade, cls, number, name] = [num(t[school + 1]), num(t[school + 2]), num(t[school + 3]), t[school + 4]]
    if (!grade || !cls || !number || !name) continue

    // 영역별 성적 줄: 열의 x 위치로 값을 고른다 (배점 ~140, 득점 ~176, 표준점수 ~253, 학교석차 ~330, 백분위 ~368, 등급 ~406)
    const scores = {}
    const raws = {}
    for (const [rowLabel, key] of SCORE_ROWS) {
      const line = lines.find((l) => labelOf(l, 120) === rowLabel && l.tokens.some((tk) => tk.x > 160 && tk.x < 195))
      if (!line) continue
      const at = (lo, hi) => line.tokens.find((tk) => tk.x >= lo && tk.x < hi)?.s.trim()
      const raw = at(160, 195)
      if (!raw || num(raw) === null) continue
      const pct = at(350, 395)
      const gradeTok = line.tokens.find((tk) => tk.x >= 398 && tk.x < 425 && /^\d$/.test(tk.s.trim()))?.s.trim()
      if (!gradeTok) continue
      raws[key] = raw
      scores[key] = pct && num(pct) !== null ? `${raw}(${pct}, ${gradeTok}등급)` : `${raw}(${gradeTok}등급)`
    }

    // 문항별 채점결과(O/X) → 오답 번호
    const markLines = lines.filter((l) => labelOf(l, 88) === '채점결과')
    const itemAnalysis = {}
    markLines.forEach((l, i) => {
      const area = MARK_ORDER[i]
      if (!area) return
      const marks = l.tokens.slice(1).flatMap((tk) => tk.s.replace(/\s/g, '').split('')).filter((m) => m === 'O' || m === 'X')
      const toInfo = (list, key) => {
        if (!list.length || raws[key] === undefined) return
        itemAnalysis[key] = { 문항수: list.length, 오답: list.flatMap((m, k) => (m === 'O' ? [] : [k + 1])), 점수: num(raws[key]) }
      }
      if (area === '탐구') { toInfo(marks.slice(0, 25), '사회탐구'); toInfo(marks.slice(25), '과학탐구') }
      else toInfo(marks, area)
    })

    students.push({ studentId: studentIdOf(grade, cls, number), grade, class: cls, number, name, scores, itemAnalysis })
  }
  return { examName, students }
}

// ───────────────────────── 기존 기록과 합치기 ─────────────────────────

const leadNum = (v) => num(cell(v).match(/^-?[\d.]+/)?.[0])

const detailOf = (v) => cell(v).replace(/^-?[\d.]+/, '') // 원점수 뒤의 괄호 부분

/**
 * 새 성적 값으로 기존 scores를 갱신한다.
 *  · 원점수가 같으면(14 ≒ 14.0, 정수로 넣어 둔 36 ≒ 36.3) 기존 값의 괄호 정보(석차백분율·예상 등급 등)를 유지한다.
 *    단 새 값에도 괄호 정보가 있고 내용이 다르면 새 값(공식 자료)으로 바꾼다.
 *  · replaceEstimates: 기존 값이 '예상' 등급이면 새 값으로 교체 (공식 성적이 나왔을 때)
 *  · 새 자료에 없는 기존 항목(전과목등수 등)은 그대로 둔다. dropKeys 에 있는 항목은 지운다.
 */
export function mergeScores(oldScores = {}, newScores, { dropKeys = [], replaceEstimates = false } = {}) {
  const merged = { ...oldScores }
  dropKeys.forEach((k) => delete merged[k])
  for (const [k, v] of Object.entries(newScores)) {
    const old = merged[k]
    const [a, b] = [leadNum(old), leadNum(v)]
    const sameRaw = a !== null && b !== null && (Math.abs(a - b) < 0.05 || (Number.isInteger(a) && Math.round(b) === a))
    if (sameRaw) {
      const [oldDetail, newDetail] = [detailOf(old), detailOf(v)]
      if (oldDetail === newDetail) continue // 표기만 다름 (14 vs 14.0)
      const oldIsEstimate = oldDetail.includes('예상')
      if (!newDetail && !(oldIsEstimate && replaceEstimates)) continue // 새 자료엔 원점수뿐 → 기존 상세 정보 유지
      const gradeOf = (d) => d.match(/(\d)등급/)?.[1]
      const sameGrade = gradeOf(oldDetail) === gradeOf(newDetail)
      if (newDetail && oldDetail && !oldIsEstimate && sameGrade && oldDetail.length > newDetail.length) continue // 기존이 더 자세함 (석차백분율 포함)
    }
    merged[k] = v
  }
  return merged
}
