import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'

export const useWorkStore = defineStore('work', () => {
  const logs = ref([])
  const workCollection = collection(db, 'workLogs')

  // 1. 업무 일지 불러오기 (최신순)
  const fetchLogs = () => {
    const q = query(workCollection, orderBy('createdAt', 'desc'))
    onSnapshot(q, (snapshot) => {
      logs.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
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
  }

  // 3. 업무 일지 수정
  const updateLog = async (id, content, tags) => {
    await updateDoc(doc(db, 'workLogs', id), {
      content: content,
      tags: tags,
      updatedAt: new Date().toISOString()
    })
  }

  // 4. 업무 일지 삭제
  const deleteLog = async (id) => {
    await deleteDoc(doc(db, 'workLogs', id))
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

  return { logs, fetchLogs, addLog, updateLog, deleteLog, allUniqueTags }
})