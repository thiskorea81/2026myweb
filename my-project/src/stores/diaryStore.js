import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'

export const useDiaryStore = defineStore('diary', () => {
  const diaries = ref([])
  const diariesCollection = collection(db, 'diaries')

  // 1. 다이어리 데이터 실시간 불러오기
  const fetchDiaries = () => {
    const q = query(diariesCollection, orderBy('createdAt', 'asc'))
    onSnapshot(q, (snapshot) => {
      diaries.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    })
  }

  // 2. 새로운 일정 추가하기
  const addDiary = async (dateStr, text) => {
    if (text.trim() === '') return
    await addDoc(diariesCollection, {
      date: dateStr, // '2026-03-05' 형태로 저장
      text: text,
      createdAt: new Date()
    })
  }

  // 3. 일정 삭제하기
  const deleteDiary = async (id) => {
    await deleteDoc(doc(db, 'diaries', id))
  }

  // Todo 위젯에서 사용할 '오늘 날짜의 일정'만 필터링
  const todayDiaries = computed(() => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return diaries.value.filter(d => d.date === todayStr)
  })

  return { diaries, fetchDiaries, addDiary, deleteDiary, todayDiaries }
})