import { defineStore } from 'pinia'
import { ref } from 'vue'
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore'
import { db } from '../firebase'

export const useCounselingStore = defineStore('counseling', () => {
  const logs = ref([])
  const counselingCollection = collection(db, 'counselingLogs')

  // 특정 학생의 상담 기록만 불러오기
  const fetchLogs = (studentId) => {
    // Firebase 인덱스 오류를 피하기 위해 학번으로만 쿼리하고 정렬은 클라이언트에서 수행합니다.
    const q = query(counselingCollection, where('studentId', '==', studentId))
    
    onSnapshot(q, (snapshot) => {
      const fetchedLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      // 날짜 최신순으로 정렬
      logs.value = fetchedLogs.sort((a, b) => new Date(b.date) - new Date(a.date))
    })
  }

  // 상담 기록 추가
  const addLog = async (studentId, date, content) => {
    if (!content.trim() || !date) return
    await addDoc(counselingCollection, {
      studentId: studentId,
      date: date, // 'YYYY-MM-DD' 형식
      content: content,
      createdAt: new Date()
    })
  }

  // 상담 기록 삭제
  const deleteLog = async (id) => {
    await deleteDoc(doc(db, 'counselingLogs', id))
  }

  return { logs, fetchLogs, addLog, deleteLog }
})