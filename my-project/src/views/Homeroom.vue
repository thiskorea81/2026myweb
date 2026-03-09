<script setup>
import { ref, onMounted } from 'vue'
import { useStudentStore } from '../stores/studentStore'
import { useAiNoteStore } from '../stores/aiNoteStore'
import { storeToRefs } from 'pinia'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService' 
import { recordSchema, getRecordPrompt } from '../services/aiPrompts' // 💡 공통 프롬프트 임포트

import StudentBulkUpload from '../components/StudentBulkUpload.vue'
import GradeBulkUpload from '../components/GradeBulkUpload.vue'
import PhotoBulkUpload from '../components/PhotoBulkUpload.vue'
import StudentListTable from '../components/StudentListTable.vue'
import StudentDetailModal from '../components/StudentDetailModal.vue'
import StudentPrintLayout from '../components/StudentPrintLayout.vue' 

const studentStore = useStudentStore()
const aiNoteStore = useAiNoteStore()
const { students } = storeToRefs(studentStore)

onMounted(() => { studentStore.fetchStudents() })

const selectedIds = ref([])
const isAiAnalyzing = ref(false)
const aiProgress = ref({ current: 0, total: 0, type: '' })

// 생기부 초안 일괄 생성 로직
const handleBulkRecordAi = async () => {
  if (selectedIds.value.length === 0 || !confirm('선택한 학생들의 생기부 초안을 일괄 생성하시겠습니까?')) return
  isAiAnalyzing.value = true
  aiProgress.value = { current: 0, total: selectedIds.value.length, type: '생기부 초안 생성' }

  try {
    for (const id of selectedIds.value) {
      const student = students.value.find(s => s.id === id)
      if (!student) continue

      // 1. 상담 데이터 수집
      const cSnap = await getDocs(query(collection(db, 'counselingLogs'), where('studentId', '==', id)))
      const counselText = cSnap.docs.map(d => d.data().content).join(', ')
      
      // 2. 공통 프롬프트 생성 (aiPrompts 서비스 이용)
      const obsRecords = {
        autonomous: student.obsAutonomous,
        career: student.obsCareer,
        behavior: student.obsBehavior
      }
      const prompt = getRecordPrompt(student, counselText, obsRecords)

      // 3. AI 호출 및 결과 저장
      const result = await aiService.askStructured(prompt, recordSchema)

      let history = []
      if (student.recordAiDraftHistory) {
        try { history = JSON.parse(student.recordAiDraftHistory) } catch(e) { history = [] }
      }
      
      history.push({ 
        version: Date.now(), 
        type: '새 초안(일괄)', 
        prompt: '일괄 자동 종합 생성', 
        data: result, 
        createdAt: new Date().toISOString() 
      })
      
      await studentStore.updateStudent(id, { recordAiDraftHistory: JSON.stringify(history) })

      aiProgress.value.current++
      await new Promise(r => setTimeout(r, 2000)) // 과도한 호출 방지
    }
    alert('일괄 생성이 완료되었습니다.')
  } catch (error) { 
    console.error(error)
    alert('오류 발생: ' + error.message) 
  } finally { 
    isAiAnalyzing.value = false
    selectedIds.value = [] 
  }
}

// ... 기타 관리 기능 (삭제, 보관, 인쇄 등) 기존 유지 ...
const showUploadArea = ref(false)
const showGradeUploadArea = ref(false)
const showPhotoUploadArea = ref(false)
const isModalOpen = ref(false)
const selectedStudent = ref(null)

const openModal = (student) => { selectedStudent.value = student; isModalOpen.value = true }
const closeModal = () => { isModalOpen.value = false; selectedStudent.value = null }
</script>

<template>
  <div class="w-full relative">
    <div v-if="isAiAnalyzing" class="fixed inset-0 bg-black/60 z-[60] flex flex-col items-center justify-center text-white p-4">
      <div class="animate-spin w-16 h-16 border-4 border-white border-t-blue-500 rounded-full mb-6"></div>
      <h3 class="text-2xl font-bold mb-2">🤖 AI {{ aiProgress.type }} 진행 중...</h3>
      <p class="text-lg text-blue-200 font-bold">{{ aiProgress.current }} / {{ aiProgress.total }} 명 완료</p>
    </div>

    <div class="no-print">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-black text-gray-800 tracking-tight">👥 학급 학생 관리</h2>
        <div class="flex gap-2">
          <button @click="showPhotoUploadArea = !showPhotoUploadArea" class="text-sm px-3 py-2 bg-gray-200 rounded-lg font-medium">📸 사진 등록</button>
          <button @click="showGradeUploadArea = !showGradeUploadArea" class="text-sm px-3 py-2 bg-gray-200 rounded-lg font-medium">💯 성적 등록</button>
          <button @click="showUploadArea = !showUploadArea" class="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-sm">학생 등록</button>
        </div>
      </div>

      <div v-if="selectedIds.length > 0" class="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 flex gap-3 items-center shadow-sm sticky top-0 z-20">
        <span class="text-sm font-bold text-blue-800 pr-4 border-r border-blue-200">{{ selectedIds.length }}명 선택</span>
        <button @click="handleBulkRecordAi" class="text-sm px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-lg font-bold shadow-sm transition-transform active:scale-95">📝 AI 생기부 초안 일괄 생성</button>
        <div class="flex-1"></div>
        <button @click="selectedIds = []" class="text-xs font-bold text-gray-500 hover:underline">선택 해제</button>
      </div>

      <PhotoBulkUpload v-if="showPhotoUploadArea" />
      <GradeBulkUpload v-if="showGradeUploadArea" />
      <StudentBulkUpload v-if="showUploadArea" />
      <StudentListTable :students="students" v-model="selectedIds" @open-modal="openModal" />
    </div>

    <StudentDetailModal v-if="isModalOpen" :student="selectedStudent" @close="closeModal" />
    <StudentPrintLayout :printDataList="[]" />
  </div>
</template>