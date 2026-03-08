import { defineStore } from 'pinia'
import { ref } from 'vue'
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, where } from 'firebase/firestore'
import { db } from '../firebase'

export const useAttendanceStore = defineStore('attendance', () => {
  const logs = ref([])
  const attendanceCollection = collection(db, 'attendanceLogs')

  // 특정 학생의 출결 기록 불러오기
  const fetchLogs = (studentId) => {
    const q = query(attendanceCollection, where('studentId', '==', studentId))
    
    onSnapshot(q, (snapshot) => {
      const fetchedLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      // 날짜 최신순 정렬
      logs.value = fetchedLogs.sort((a, b) => new Date(b.date) - new Date(a.date))
    })
  }

  // 출결 기록 추가
  const addLog = async (logData) => {
    await addDoc(attendanceCollection, {
      ...logData,
      createdAt: new Date()
    })
  }

  // 출결 기록 삭제
  const deleteLog = async (id) => {
    await deleteDoc(doc(db, 'attendanceLogs', id))
  }

  return { logs, fetchLogs, addLog, deleteLog }
})