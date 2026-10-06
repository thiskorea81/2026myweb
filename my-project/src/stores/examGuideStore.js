// src/stores/examGuideStore.js
// 정기고사 학급 안내 자료(슬라이드 + 낭독 원고) 관리
// 시험마다 새 안내 자료를 만들고, 시험이 끝나면 지우는 방식으로 운영한다.

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'

export const useExamGuideStore = defineStore('examGuide', () => {
  const guides = ref([])
  const isLoading = ref(false)
  const guideCollection = collection(db, 'examGuides')

  // 최신 자료가 위로 오도록 생성일 역순 정렬
  const fetchGuides = async () => {
    isLoading.value = true
    try {
      const snapshot = await getDocs(query(guideCollection, orderBy('createdAt', 'desc')))
      guides.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (error) {
      console.error('시험 안내 자료 불러오기 실패:', error)
    } finally {
      isLoading.value = false
    }
  }

  // { title, examDate, slides } 형태로 저장. 새 문서 ID를 반환한다.
  const addGuide = async (guide) => {
    try {
      const now = new Date().toISOString()
      const docRef = await addDoc(guideCollection, { ...guide, createdAt: now, updatedAt: now })
      await fetchGuides()
      return docRef.id
    } catch (error) {
      console.error('시험 안내 자료 추가 실패:', error)
      throw error
    }
  }

  const updateGuide = async (id, data) => {
    try {
      await updateDoc(doc(db, 'examGuides', id), { ...data, updatedAt: new Date().toISOString() })
      await fetchGuides()
    } catch (error) {
      console.error('시험 안내 자료 수정 실패:', error)
      throw error
    }
  }

  const deleteGuide = async (id) => {
    try {
      await deleteDoc(doc(db, 'examGuides', id))
      await fetchGuides()
    } catch (error) {
      console.error('시험 안내 자료 삭제 실패:', error)
      throw error
    }
  }

  return { guides, isLoading, fetchGuides, addGuide, updateGuide, deleteGuide }
})
