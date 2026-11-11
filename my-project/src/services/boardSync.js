// 업무일지(#조회 / #종례 / #조종례) → 조종례 게시판 즉시 반영
//
// 업무일지를 저장·수정·삭제하면 workStore가 syncBoardsNow()를 호출해, 현재 회차와 다음 회차의 학생용·담임용
// 게시판 문서를 모든 반에 대해 다시 만든다. 게시판 화면은 그 문서를 onSnapshot으로 구독하므로 열려 있는 화면에도 바로 뜬다.
// 규칙(게시 기간, 반 분류, 조립)은 functions/boardShared.mjs 한 곳에 있고, Cloud Functions의 정시 생성도 같은 함수를 쓴다.
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from './aiService'
import { announcementSchema } from './aiPrompts'
import { useStudentStore } from '../stores/studentStore'
import { getThisWeekMealNote, getNextWeekMealNote } from '../utils/mealOrder'
import { BOARD_TAGS, syncBoards } from '../../functions/boardShared.mjs'

export { BOARD_TAGS, getCurrentSlot } from '../../functions/boardShared.mjs'

export const touchesBoard = (tags) => Array.isArray(tags) && tags.some((t) => BOARD_TAGS.includes(t))

async function runOnce(force) {
  const studentStore = useStudentStore()
  if (studentStore.students.length === 0) await studentStore.fetchStudents()

  const snap = await getDocs(query(collection(db, 'workLogs'), where('tags', 'array-contains-any', BOARD_TAGS)))
  const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

  return syncBoards({
    logs,
    students: studentStore.students,
    readDoc: async (col, id) => {
      const s = await getDoc(doc(db, col, id))
      return s.exists() ? s.data() : null
    },
    writeDoc: (col, id, data) => setDoc(doc(db, col, id), data, { merge: true }),
    summarize: (prompt) => aiService.askStructured(prompt, announcementSchema),
    mealNotes: { thisWeek: getThisWeekMealNote, nextWeek: getNextWeekMealNote },
    force,
    source: force ? '다시 생성 (선생님 요청)' : '업무일지 반영',
  })
}

// 동시에 여러 번 불려도(연속 저장 등) 한 번에 하나만 돌고, 도는 중에 들어온 요청은 끝난 뒤 한 번 더 반영한다
let running = null
let pending = false
let pendingForce = false

export function syncBoardsNow({ force = false } = {}) {
  if (running) {
    pending = true
    pendingForce = pendingForce || force
    return running
  }
  running = (async () => {
    let result = await runOnce(force)
    while (pending) {
      const f = pendingForce
      pending = false
      pendingForce = false
      result = await runOnce(f)
    }
    return result
  })().finally(() => { running = null })
  return running
}
