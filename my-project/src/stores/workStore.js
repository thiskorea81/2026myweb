import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import { syncBoardsNow, touchesBoard } from '../services/boardSync'

export const useWorkStore = defineStore('work', () => {
  const logs = ref([])
  const workCollection = collection(db, 'workLogs')
  // 조종례 게시판 반영 상태 (업무일지 화면에 표시)
  const boardSyncStatus = ref('') // '' | 'syncing' | 'done' | 'error'
  let unsubscribe = null

  // 1. 업무 일지 불러오기 (최신순) - 여러 화면에서 불러도 구독은 하나만 유지
  const fetchLogs = () => {
    if (unsubscribe) return
    const q = query(workCollection, orderBy('createdAt', 'desc'))
    unsubscribe = onSnapshot(q, (snapshot) => {
      logs.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    }, (error) => {
      console.error('업무 일지 구독 실패:', error)
      unsubscribe = null
    })
  }

  // #조회/#종례/#조종례 일지가 바뀌면 조종례 게시판을 즉시 다시 만든다
  const syncBoardsIfNeeded = (...tagLists) => {
    if (!tagLists.some(touchesBoard)) return
    boardSyncStatus.value = 'syncing'
    syncBoardsNow()
      .then(() => { boardSyncStatus.value = 'done' })
      .catch((error) => {
        console.error('조종례 게시판 반영 실패:', error)
        boardSyncStatus.value = 'error'
      })
  }

  // 2. 새 업무 일지 추가
  const addLog = async (content, tags) => {
    if (content.trim() === '') return
    await addDoc(workCollection, {
      content: content,
      tags: tags, // 배열 형태로 저장 ['#행사', '#결재']
      createdAt: new Date().toISOString()
    })
    syncBoardsIfNeeded(tags)
  }

  // 3. 업무 일지 수정
  const updateLog = async (id, content, tags) => {
    const before = logs.value.find(l => l.id === id)
    await updateDoc(doc(db, 'workLogs', id), {
      content: content,
      tags: tags,
      updatedAt: new Date().toISOString()
    })
    syncBoardsIfNeeded(before?.tags, tags)
  }

  // 4. 업무 일지 삭제
  const deleteLog = async (id) => {
    const before = logs.value.find(l => l.id === id)
    await deleteDoc(doc(db, 'workLogs', id))
    syncBoardsIfNeeded(before?.tags)
  }

  // 5. 필터링을 위해 '지금까지 사용된 모든 고유 태그' 추출
  const allUniqueTags = computed(() => {
    const tagSet = new Set()
    logs.value.forEach(log => {
      if (log.tags && Array.isArray(log.tags)) {
        log.tags.forEach(tag => tagSet.add(tag))
      }
    })
    return Array.from(tagSet).sort()
  })

  return { logs, fetchLogs, addLog, updateLog, deleteLog, allUniqueTags, boardSyncStatus }
})
