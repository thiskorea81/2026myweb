// src/stores/scheduleStore.js
// 창체(자율/진로) 일정 관리

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'

export const useScheduleStore = defineStore('schedule', () => {
  const scheduleItems = ref([])
  const scheduleCollection = collection(db, 'creativeActivitySchedule')

  // 일정 목록 실시간 구독 (날짜순 정렬)
  const fetchSchedule = () => {
    const q = query(scheduleCollection, orderBy('date', 'asc'))
    onSnapshot(q, (snapshot) => {
      scheduleItems.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    })
  }

  // 일정 추가 (type: '자율' | '진로')
  const addScheduleItem = async ({ date, type, content }) => {
    await addDoc(scheduleCollection, {
      date,
      type,
      content,
      createdAt: new Date().toISOString()
    })
  }

  const deleteScheduleItem = async (id) => {
    await deleteDoc(doc(db, 'creativeActivitySchedule', id))
  }

  return { scheduleItems, fetchSchedule, addScheduleItem, deleteScheduleItem }
})
