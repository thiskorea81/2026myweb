// 나이스·KICE 원본 파일 → 학생 문서 변경분(patch) 만들기. 화면(SchoolDocUpload.vue)과 DB 쓰기는 이 밖에서 한다.
//
// 한 세션 안에서 여러 파일을 읽으면 같은 학생의 성적 기록은 앞 파일 결과 위에 이어서 합쳐진다.
// 각 파일은 job 하나가 되고, job.rows(미리보기) / job.warnings / job.patches(Map: 학생 문서 ID → 바꿀 필드)를 갖는다.
import {
  detectSheetType, parseRoster, parsePhotoFileName, parseExamSheet, parseSemesterSheet, semesterRecords,
  parseKiceReport, mergeScores, parseReportCardSheet, reportCardScores,
} from './schoolDocParsers.js'

const nowIso = () => new Date().toISOString()
// Firestore는 맵의 키 순서를 보존하지 않으므로 키를 정렬해서 비교한다
const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x))
const describe = (oldScores = {}, newScores) =>
  Object.keys({ ...oldScores, ...newScores }).filter((k) => oldScores[k] !== newScores[k]).map((k) => `${k}: ${oldScores[k] ?? '없음'} → ${newScores[k] ?? '삭제'}`)

export function createImportSession(students) {
  const findStudent = (id) => students.find((s) => s.id === id || String(s.studentId) === id)
  const working = new Map()
  const workingOf = (id) => {
    if (!working.has(id)) {
      const s = findStudent(id)
      working.set(id, s ? { docId: s.id, name: s.name, grades: (s.grades || []).map((g) => ({ ...g })) } : null)
    }
    return working.get(id)
  }
  const newJob = (kind, file) => ({ kind, title: file, file, rows: [], warnings: [], patches: new Map(), error: '' })

  /** 학생 한 명의 시험 기록 하나를 합쳐 넣는다 */
  function applyRecord(job, id, name, examName, scores, { mergeOpts, itemAnalysis, extra } = {}) {
    const w = workingOf(id)
    if (!w) { job.warnings.push(`${id} ${name}: DB에 없는 학번이라 건너뜀 (명렬표를 먼저 올려 주세요)`); return }
    if (w.name !== name) { job.warnings.push(`${id}: 이름이 다름 (파일 "${name}" / DB "${w.name}") — 건너뜀`); return }
    const idx = w.grades.findIndex((g) => g.examName === examName)
    const old = idx > -1 ? w.grades[idx] : null
    const merged = mergeScores(old?.scores, scores, mergeOpts)
    const changes = describe(old?.scores, merged)
    let ia = old?.itemAnalysis
    if (itemAnalysis && Object.keys(itemAnalysis).length) {
      ia = { ...(old?.itemAnalysis || {}) }
      for (const [k, v] of Object.entries(itemAnalysis)) {
        if (JSON.stringify(ia[k]?.오답) !== JSON.stringify(v.오답)) changes.push(`${k} 오답 문항 ${ia[k] ? '갱신' : '추가'} (${v.오답.length}/${v.문항수})`)
        ia[k] = { ...(ia[k] || {}), ...v }
      }
    }
    const extraChanged = extra && Object.entries(extra).some(([k, v]) => stable(old?.[k]) !== stable(v))
    if (old && changes.length === 0 && !extraChanged) { job.rows.push({ id, name, status: '같음', changes }); return }
    if (old && changes.length === 0) changes.push(`세부 자료 추가 (${Object.keys(extra).join(', ')})`)
    const record = { ...(old || { id: Date.now() + Math.random(), examName, createdAt: nowIso() }), scores: merged, ...(ia ? { itemAnalysis: ia } : {}), ...(extra || {}), ...(old ? { updatedAt: nowIso() } : {}) }
    if (idx > -1) w.grades[idx] = record
    else w.grades.push(record)
    job.patches.set(w.docId, { ...(job.patches.get(w.docId) || {}), grades: w.grades })
    job.rows.push({ id, name, status: old ? '변경' : '신규', changes })
  }

  /** xlsx 시트 행들 (명렬표 / 정기시험 일람표 / 학기말 개인별 일람표 / 성적통지표) */
  function addSheet(fileName, rows, { updateAddress = true } = {}) {
    const job = newJob(detectSheetType(rows), fileName)
    try {
      if (job.kind === 'roster') {
        const list = parseRoster(rows)
        job.title = `명렬표 ${list.length}명`
        for (const r of list) {
          const existing = findStudent(r.studentId)
          const data = { studentId: r.studentId, grade: r.grade, class: r.class, number: r.number, name: r.name, gender: r.gender, birthDate: r.birthDate }
          if (r.neisNo) data.neisNo = r.neisNo
          if (r.zipCode) data.zipCode = r.zipCode
          if (updateAddress || !existing?.address) data.address = r.address
          const changes = Object.entries(data).filter(([k, v]) => String(existing?.[k] ?? '') !== String(v)).map(([k, v]) => `${k}: ${existing?.[k] ?? '없음'} → ${v}`)
          if (r.note) changes.push(`비고: ${r.note}`)
          if (existing && changes.length === 0) { job.rows.push({ id: r.studentId, name: r.name, status: '같음', changes }); continue }
          job.patches.set(existing?.id ?? r.studentId, existing ? data : { ...data, createdAt: new Date() })
          job.rows.push({ id: r.studentId, name: r.name, status: existing ? '변경' : '신규', changes })
        }
        // 같은 반인데 명렬표에 없는 학생 (전출 등)
        const classKeys = new Set(list.map((r) => `${r.grade}_${r.class}`))
        const listed = new Set(list.map((r) => r.studentId))
        students
          .filter((s) => classKeys.has(`${s.grade}_${s.class}`) && !s.isArchived && !listed.has(String(s.studentId ?? s.id)))
          .forEach((s) => job.warnings.push(`${s.studentId} ${s.name}: 명렬표에 없음 (전출이면 학생 목록에서 보관 처리하세요)`))
      } else if (job.kind === 'exam') {
        const r = parseExamSheet(rows)
        job.title = `정기시험 일람표 · ${r.examName} (${r.grade}학년 ${r.class}반, ${r.students.length}명)`
        const extra = Object.keys(r.averages).length ? { averages: r.averages } : undefined
        r.students.forEach((s) => applyRecord(job, s.studentId, s.name, r.examName, s.scores, { extra }))
      } else if (job.kind === 'semester') {
        const r = parseSemesterSheet(rows)
        job.title = `학기말 개인별 일람표 · ${r.semester}학기 (${r.students.length}명)`
        r.students.forEach((s) => {
          const { final, perf } = semesterRecords(s)
          if (Object.keys(final).length) applyRecord(job, s.studentId, s.name, `${r.semester}학기학기말`, final)
          if (Object.keys(perf).length) applyRecord(job, s.studentId, s.name, `${r.semester}학기수행평가`, perf)
        })
      } else if (job.kind === 'reportCard') {
        const r = parseReportCardSheet(rows)
        job.title = `성적통지표 · ${r.examName} (${r.students.length}명)`
        r.students.forEach((s) => {
          const scores = reportCardScores(s, r.exam)
          if (Object.keys(scores).length) {
            // 과목별 석차·수강자수·과목평균도 기록에 남겨 둔다 (석차백분율 근거)
            const subjectStats = Object.fromEntries(Object.entries(s.subjects).filter(([, v]) => v.rank).map(([k, v]) => [k, { 석차: v.rank, 동석차수: v.ties, 수강자수: v.takers, 과목평균: v.avg }]))
            applyRecord(job, s.studentId, s.name, r.examName, scores, { extra: Object.keys(subjectStats).length ? { subjectStats } : undefined })
          }
          // 통지표 출력일 기준 나이스 출결 누계
          const st = findStudent(s.studentId)
          if (s.attendance && st && st.name === s.name) {
            const neisAttendance = { ...s.attendance, asOf: r.asOf, source: `${r.examName} 성적통지표` }
            const { asOf: _a, source: _s, ...oldCore } = st.neisAttendance || {}
            const { asOf: _b, source: _t, ...newCore } = neisAttendance
            const changed = stable(oldCore) !== stable(newCore)
            if (changed || !st.neisAttendance) {
              job.patches.set(st.id, { ...(job.patches.get(st.id) || {}), neisAttendance })
              const row = job.rows.find((x) => x.id === s.studentId)
              const note = `출결 누계 ${st.neisAttendance ? '갱신' : '추가'} (수업일수 ${s.attendance.수업일수})`
              if (row) { row.changes.push(note); if (row.status === '같음') row.status = '변경' }
              else job.rows.push({ id: s.studentId, name: s.name, status: '변경', changes: [note] })
            }
          }
        })
      } else {
        throw new Error('명렬표 / 정기시험 일람표 / 학기말 개인별 일람표 / 성적통지표가 아닙니다')
      }
    } catch (e) {
      job.error = e.message
    }
    return job
  }

  /** KICE 성적통지표 PDF (pages: 페이지별 글자 조각) */
  function addKiceReport(fileName, pages) {
    const job = newJob('kice', fileName)
    try {
      const r = parseKiceReport(pages)
      if (!r.examName || r.students.length === 0) throw new Error('성적통지표(학생용) 쪽을 찾지 못했습니다')
      job.title = `모의고사 성적통지표 · ${r.examName} (${r.students.length}명)`
      r.students.forEach((s) => applyRecord(job, s.studentId, s.name, r.examName, s.scores, {
        mergeOpts: { dropKeys: ['평균등급(예상)'], replaceEstimates: true },
        itemAnalysis: s.itemAnalysis,
      }))
    } catch (e) {
      job.error = e.message
    }
    return job
  }

  /**
   * 사진들 → 학생 매칭. photos: [{ fileName, load: () => Promise<dataUrl> }]
   * "성명(번호).jpg"는 지정한 학년·반에서 번호로 찾고 이름을 확인, "학번.jpg"는 학번으로 찾는다.
   */
  async function addPhotos(photos, grade, cls) {
    const job = newJob('photo', `${photos.length}장`)
    job.title = `학생 사진 ${photos.length}장 → ${grade}학년 ${cls}반`
    const classStudents = students.filter((s) => String(s.grade) === String(grade) && String(s.class) === String(cls) && !s.isArchived)
    for (const { fileName, load } of photos) {
      const parsed = parsePhotoFileName(fileName)
      let student = null
      if (parsed?.studentId) student = findStudent(parsed.studentId)
      else if (parsed) {
        student = classStudents.find((s) => Number(s.number) === parsed.number)
        if (student && student.name !== parsed.name) {
          job.warnings.push(`${fileName}: ${parsed.number}번 학생 이름(${student.name})과 파일 이름이 달라 건너뜀`)
          continue
        }
      }
      if (!student) { job.warnings.push(`${fileName}: 맞는 학생을 찾지 못함 (파일명은 성명(번호).jpg)`); continue }
      try {
        job.patches.set(student.id, { photoUrl: await load() })
        job.rows.push({ id: String(student.studentId), name: student.name, status: student.photoUrl ? '변경' : '신규', changes: [`사진 ${student.photoUrl ? '교체' : '등록'} (${fileName})`] })
      } catch {
        job.warnings.push(`${fileName}: 이미지를 읽지 못함`)
      }
    }
    return job
  }

  return { addSheet, addKiceReport, addPhotos }
}

/** 여러 job의 변경분을 학생별로 합친다 (grades 는 마지막 작업본이 전체를 담고 있음) */
export function collectPatches(jobs) {
  const merged = new Map()
  jobs.forEach((j) => j.patches.forEach((data, id) => merged.set(id, { ...(merged.get(id) || {}), ...data })))
  return [...merged.entries()].map(([id, data]) => ({ id, data }))
}
