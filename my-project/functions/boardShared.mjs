// 조종례 게시판(학생용 boardSummaries / 담임용 teacherBoardSummaries) 생성 규칙의 단일 원본.
//
//  · 프론트엔드(src/services/boardSync.js)는 그대로 import 하고, Cloud Functions(functions/index.js, CommonJS)는
//    dynamic import 로 불러온다. 예전처럼 화면/타이머/함수에 같은 로직을 복제해 두지 않기 위해 functions 폴더에 둔다
//    (배포 시 functions 폴더만 올라가므로 이 파일이 여기 있어야 한다).
//  · Firestore / Gemini / DOM 에 직접 접근하지 않는다. 읽기·쓰기·요약은 호출하는 쪽이 함수로 넘겨준다.
//  · 날짜 계산은 실행 환경의 시간대와 상관없이 항상 한국 시간(KST) 기준으로 한다.

export const BOARD_TAGS = ['#조종례', '#조회', '#종례']
const PINNED_TAGS = ['#고정', '#중요']
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const MAX_DUE_DAYS = 90 // 본문 속 날짜가 작성일로부터 이보다 멀면 마감일로 보지 않는다 (숫자 오인식 방지)

// ───────────────────────── 날짜 도우미 (YYYY-MM-DD 문자열, KST) ─────────────────────────

function kstParts(date) {
  const k = new Date(date.getTime() + KST_OFFSET_MS)
  return { ymd: k.toISOString().slice(0, 10), dow: k.getUTCDay(), hhmm: k.getUTCHours() * 100 + k.getUTCMinutes() }
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const dowOf = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay()
const isWeekend = (ymd) => [0, 6].includes(dowOf(ymd))

function shiftWeekday(ymd, step) {
  let d = addDays(ymd, step)
  while (isWeekend(d)) d = addDays(d, step)
  return d
}

// 종례 시각: 수요일 14:00, 나머지 15:00
const afternoonTimeOf = (dow) => (dow === 3 ? 1400 : 1500)

// ───────────────────────── 회차(slot) ─────────────────────────

function makeSlot(date, morning) {
  const dow = dowOf(date)
  const epochKey = morning ? '0800' : String(afternoonTimeOf(dow))
  return { date, morning, dow, epochKey, key: `${date}_${epochKey}` }
}

/**
 * 지금 화면에 띄울 조종례 회차.
 * 평일 0시~종례 전: 그날 아침 조회 / 종례 시각 이후: 그날 종례 / 주말: 금요일 종례(다음 주 급식 순서 예고 포함)
 */
export function getCurrentSlot(now = new Date()) {
  const { ymd, dow, hhmm } = kstParts(now)
  if (isWeekend(ymd)) return makeSlot(shiftWeekday(ymd, -1), false)
  return makeSlot(ymd, hhmm < afternoonTimeOf(dow))
}

/** 다음 회차 (아침 → 그날 종례, 종례 → 다음 평일 아침). 저녁에 미리 써 둔 "내일 조회" 메모가 바로 반영되도록 함께 만든다. */
export function getNextSlot(slot) {
  return slot.morning ? makeSlot(slot.date, false) : makeSlot(shiftWeekday(slot.date, 1), true)
}

// ───────────────────────── 업무일지 → 게시 기간 ─────────────────────────

/**
 * 본문에 적힌 날짜(11월 13일, 12월 7일~11일, 11/13, 12.29) 중 작성일 이후로 가장 늦은 날짜.
 * 연도가 없으므로 작성일 기준으로 가까운 해를 고르고, 지난 날짜나 너무 먼 날짜는 무시한다.
 */
export function extractDueDate(content, createdYmd) {
  const text = String(content || '').replace(/https?:\/\/\S+/g, ' ')
  const pattern = /(\d{1,2})\s*월\s*(\d{1,2})\s*일|[~∼〜]\s*(\d{1,2})\s*일|(?<![\d.:/])(\d{1,2})[./](\d{1,2})(?![\d.:/])(?!\s*(?:월|점|등급|%|배|시간|분|초|교시|명|회|개))/g
  const createdYear = Number(createdYmd.slice(0, 4))
  const limit = addDays(createdYmd, MAX_DUE_DAYS)
  let lastMonth = null
  let latest = null

  for (const m of text.matchAll(pattern)) {
    let month
    let day
    if (m[1]) [month, day] = [Number(m[1]), Number(m[2])]
    else if (m[3]) [month, day] = [lastMonth, Number(m[3])] // "12월 7일~11일"의 끝 날짜
    else [month, day] = [Number(m[4]), Number(m[5])]
    if (!month || month < 1 || month > 12 || day < 1 || day > 31) continue
    lastMonth = month

    let ymd = `${createdYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (ymd < addDays(createdYmd, -30)) ymd = `${createdYear + 1}${ymd.slice(4)}` // 12월에 쓴 "1월 5일"
    if (ymd < createdYmd || ymd > limit) continue
    if (!latest || ymd > latest) latest = ymd
  }
  return latest
}

/**
 * 업무일지 한 건이 게시판에 머무는 마지막 날짜 (null = #고정/#중요 라서 계속 게시).
 *  · 본문에 날짜가 있으면 그 날짜까지
 *  · 날짜가 없으면 하루만: 평일 종례 전에 쓴 메모는 그날까지, 종례 후/주말에 쓴 메모는 다음 평일까지
 */
export function getLogExpiry(log) {
  const tags = log.tags || []
  if (PINNED_TAGS.some((t) => tags.includes(t))) return null
  const created = kstParts(new Date(log.createdAt))
  const writtenAfterDay = isWeekend(created.ymd) || created.hhmm >= afternoonTimeOf(created.dow)
  const base = writtenAfterDay ? shiftWeekday(created.ymd, 1) : created.ymd
  const due = extractDueDate(log.content, created.ymd)
  return due && due > base ? due : base
}

/** 이 회차에 게시할 업무일지인가 (조회: #조회/#조종례, 종례: #종례/#조종례) */
export function isLogForSlot(log, slot) {
  const tags = log.tags || []
  const wanted = slot.morning ? ['#조종례', '#조회'] : ['#조종례', '#종례']
  if (!wanted.some((t) => tags.includes(t)) || !log.createdAt) return false
  const expiry = getLogExpiry(log)
  return expiry === null || slot.date <= expiry
}

/** 게시용 본문: 해시태그 제거 */
const cleanContent = (content) => String(content || '').replace(/(^|\s)#[^\s#]+/g, '$1').replace(/[ \t]+\n/g, '\n').trim()

// ───────────────────────── AI 요약 프롬프트 ─────────────────────────

const JSON_RULE = `\n[⚠️ 필수 응답 형식]\n- 반드시 { "announcement": "...", "closing": "..." } 형태의 단일 JSON 객체로 응답하세요. 대괄호([]) 금지.`

/** 🌅 학생용 조종례 요약 프롬프트 (src/services/aiPrompts.js 가 그대로 다시 내보낸다) */
export const getBoardPrompt = (isMorningMode, logTexts) => `
      학급 담임 교사로서 ${isMorningMode ? '아침 조회' : '오후 종례'} 공지를 작성합니다.
      학생들이 화면을 보고 3초 만에 이해할 수 있도록 아주 간결하고 직관적으로 요약하세요.

      [출력 규칙 - 절대 엄수]
      1. 반드시 단일 JSON 객체 { "announcement": "...", "closing": "..." }로만 응답하세요.
      2. 응답을 대괄호 [ ] 로 감싸거나 리스트(Array) 구조로 만들지 마세요.
      3. announcement 필드 안에 모든 공지 내용을 번호를 매겨 하나의 문자열로 작성하세요.

      [작성 조건]
      1. 핵심 행동(Action) 위주로 짧은 문장(명사형 종결 등)으로 작성하세요.
      2. '[고정]' 태그가 있는 항목은 최상단에 배치하고 알맞은 이모지를 추가하세요.
      3. 'announcement' 필드 하나에 모든 공지사항을 번호(1. 2. 3.)를 매겨서 작성하고, 각 항목 사이에는 실제 줄바꿈(Enter)을 적용하여 구분하세요. ('\\n' 이라는 문자를 텍스트로 그대로 출력하지 마세요.)
      4. 날짜·마감일·장소가 있으면 빠뜨리지 말고, 메모에 없는 내용(요일 포함)은 지어내지 마세요.
      5. closing 은 번호 없이 한 문장으로 쓰세요.

      [메모 내용]
      ${logTexts}
    `

/** 👨‍🏫 담임용 조종례 요약 프롬프트 */
export const getTeacherBoardPrompt = (isMorningMode, logTexts) => `
      당신은 담임 선생님을 돕는 유능한 AI 비서입니다.
      제공된 메모들을 바탕으로, 담임 선생님이 ${isMorningMode ? '아침 조회' : '오후 종례'} 시간에 학급 상황을 한눈에 파악하고 학생들에게 정확히 전달할 수 있도록 내용을 깔끔하게 정리해 주세요.

      [출력 규칙 - 절대 엄수]
      1. 반드시 단일 JSON 객체 { "announcement": "...", "closing": "..." }로만 응답하세요.
      2. 응답을 대괄호 [ ] 로 감싸거나 리스트(Array) 구조로 만들지 마세요.
      3. 담임 선생님이 읽고 바로 학생들에게 안내하거나 지도할 수 있도록, 정중하고 전문적인 문체(~습니다, ~바랍니다)로 요약하세요.
      4. 항목별로 번호(1. 2. 3.)를 매기고, 각 항목 사이에는 실제 줄바꿈(Enter)을 적용하여 가독성을 극대화하세요. ('\\n' 이라는 문자를 텍스트로 그대로 출력하지 마세요.)
      5. 링크가 있으면 링크를 무조건 넣어주세요.
      6. 날짜·마감일은 메모에 적힌 그대로 쓰고, 메모에 없는 내용(요일 포함)은 지어내지 마세요.
      7. closing 은 번호 없이 한 문장으로 쓰세요.

      [메모 내용]
      ${logTexts}
    `

// ───────────────────────── 게시판 생성 ─────────────────────────

const VARIANTS = [
  {
    collection: 'boardSummaries',
    commonPrefix: 'COMMON_',
    prompt: getBoardPrompt,
    keepHistory: true,
    noCommon: () => '전달할 전체 공지사항이 없습니다.',
    closing: (slot) => (slot.morning ? '오늘 하루도 화이팅! ☀️' : '안전하게 하교하세요! 👋'),
  },
  {
    collection: 'teacherBoardSummaries',
    commonPrefix: 'COMMON_TEACHER_',
    prompt: getTeacherBoardPrompt,
    keepHistory: false,
    noCommon: () => '선생님, 오늘 전달할 전체 공지사항이 없습니다.',
    closing: () => '오늘 하루도 수고 많으셨습니다! 😊',
  },
]

// 내용이 바뀌었는지 판단하기 위한 가벼운 문자열 해시 (보안 용도 아님)
function hashOf(value) {
  const text = JSON.stringify(value)
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function getMealNote(slot, grade, cls, mealNotes) {
  if (String(grade) !== '1' || !mealNotes) return null
  if (slot.morning && slot.dow === 1) return mealNotes.thisWeek(slot.date, Number(cls))
  if (!slot.morning && slot.dow === 5) return mealNotes.nextWeek(slot.date, Number(cls))
  return null
}

/** 학생 이름이 들어간 메모는 그 학생 반에만, 이름이 없는 메모는 전체 공지로 */
function classLogsFor(logs, allStudents, grade, cls) {
  const targets = allStudents.filter((s) => String(s.grade) === String(grade) && String(s.class) === String(cls) && s.name?.length >= 2)
  const counts = {}
  targets.forEach((s) => { counts[s.name] = (counts[s.name] || 0) + 1 })
  return logs.flatMap((log) => {
    const mentioned = targets.filter((s) => log.content.includes(s.name))
    if (mentioned.length === 0) return []
    let content = cleanContent(log.content)
    new Set(mentioned.filter((s) => counts[s.name] > 1).map((s) => s.name)).forEach((name) => {
      content = content.replace(new RegExp(`${name}(?!\\(동명이인\\))`, 'g'), `${name}(동명이인)`)
    })
    return [content]
  })
}

/**
 * 현재 회차와 다음 회차의 조종례 게시판을 모든 반에 대해 다시 만든다.
 * 결과가 지난번과 같으면(sourceHash 동일) 쓰지 않으므로, 담임이 직접 수정한 내용은 업무일지가 바뀔 때까지 유지된다.
 *
 * @param {object} p
 * @param {Array}  p.logs       #조회/#종례/#조종례 태그가 붙은 업무일지 [{ id, content, tags, createdAt }]
 * @param {Array}  p.students   [{ name, grade, class }]
 * @param {(collection, id) => Promise<object|null>} p.readDoc
 * @param {(collection, id, data) => Promise<void>}  p.writeDoc  (merge 저장)
 * @param {(prompt) => Promise<{announcement, closing}>} p.summarize  Gemini 요약 (실패하면 throw)
 * @param {{thisWeek, nextWeek}} [p.mealNotes]  1학년 급식 순서 안내문 함수
 * @param {boolean} [p.force]  AI 요약과 게시판을 무조건 새로 만든다 (직접 수정한 내용도 덮어씀)
 * @param {string}  [p.source] 기록(history)에 남길 생성 주체
 */
export async function syncBoards({ now = new Date(), logs, students, readDoc, writeDoc, summarize, mealNotes, force = false, source = '자동 생성' }) {
  const current = getCurrentSlot(now)
  const slots = [current, getNextSlot(current)]
  const classes = [...new Set(students.filter((s) => s.grade && s.class).map((s) => `${s.grade}_${s.class}`))]
  const mentionsStudent = (log) => students.some((s) => s.name?.length >= 2 && log.content.includes(s.name))
  const stamp = new Date().toISOString()
  let written = 0

  for (const slot of slots) {
    const active = logs
      .filter((l) => typeof l.content === 'string' && isLogForSlot(l, slot))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const common = active.filter((l) => !mentionsStudent(l))

    for (const v of VARIANTS) {
      // 1) 전체 공지 요약 (메모가 바뀌었을 때만 AI 호출)
      let commonText = { announcement: v.noCommon(slot), closing: v.closing(slot) }
      if (common.length > 0) {
        const logTexts = common.map((l) => `- ${(l.tags || []).includes('#고정') ? '[고정] ' : ''}${cleanContent(l.content)}`).join('\n')
        const commonHash = hashOf([slot.morning, logTexts])
        const commonId = `${v.commonPrefix}${slot.key}`
        const cached = await readDoc(v.collection, commonId)
        if (!force && cached?.sourceHash === commonHash && cached.announcement) {
          commonText = { announcement: cached.announcement, closing: cached.closing || v.closing(slot) }
        } else {
          try {
            const r = await summarize(v.prompt(slot.morning, logTexts) + JSON_RULE)
            if (!r?.announcement) throw new Error('요약 결과에 announcement 가 없습니다')
            commonText = { announcement: r.announcement, closing: r.closing || v.closing(slot) }
            await writeDoc(v.collection, commonId, { ...commonText, sourceHash: commonHash, updatedAt: stamp })
          } catch (e) {
            // AI가 실패해도 공지는 나가야 하므로 메모 원문을 번호만 붙여 싣는다 (캐시하지 않아 다음 동기화 때 다시 요약을 시도)
            console.error('[boardSync] 전체 공지 AI 요약 실패, 원문으로 대체:', e)
            commonText = { announcement: common.map((l, i) => `${i + 1}. ${cleanContent(l.content)}`).join('\n'), closing: v.closing(slot) }
          }
        }
      }

      // 2) 반별 게시판 조립
      for (const classKey of classes) {
        const [grade, cls] = classKey.split('_')
        const mine = classLogsFor(active, students, grade, cls)
        const mealNote = getMealNote(slot, grade, cls, mealNotes)

        let content = mealNote ? `${mealNote}\n\n` : ''
        if (mine.length > 0) content += `🏫 [우리 반 알림]\n${mine.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n`
        if (common.length > 0) content += `📢 [전체 공지]\n${commonText.announcement}\n\n`
        else if (mine.length === 0) content += `📢 [전체 공지]\n전달할 공지사항이 없습니다.\n\n`
        content = `${content}${commonText.closing}`.trim()

        const sourceHash = hashOf(content)
        const id = `${classKey}_${slot.key}`
        const existing = await readDoc(v.collection, id)
        if (!force && existing?.sourceHash === sourceHash) continue

        const data = { content, sourceHash, updatedAt: stamp }
        if (v.keepHistory) {
          const history = existing?.history || []
          data.history = [...history, { id: Date.now(), content, type: `🤖 ${source}`, timestamp: stamp }].slice(-30)
        }
        await writeDoc(v.collection, id, data)
        written++
      }
    }
  }
  return { slots: slots.map((s) => s.key), written }
}
