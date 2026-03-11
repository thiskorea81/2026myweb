<script setup>
import { ref, onMounted } from 'vue'
import { useStudentStore } from '../stores/studentStore'
import { useAiNoteStore } from '../stores/aiNoteStore'
import { storeToRefs } from 'pinia'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService' 
import { recordSchema, getRecordPrompt } from '../services/aiPrompts' 

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

// 💡 인쇄 관련 상태 변수
const isPrinting = ref(false)
const printDataList = ref([])

// 생기부 초안 일괄 생성 로직
const handleBulkRecordAi = async () => {
  if (selectedIds.value.length === 0 || !confirm('선택한 학생들의 생기부 초안을 일괄 생성하시겠습니까?')) return
  isAiAnalyzing.value = true
  aiProgress.value = { current: 0, total: selectedIds.value.length, type: '생기부 초안 생성' }

  try {
    for (const id of selectedIds.value) {
      const student = students.value.find(s => s.id === id)
      if (!student) continue

      const cSnap = await getDocs(query(collection(db, 'counselingLogs'), where('studentId', '==', id)))
      const counselText = cSnap.docs.map(d => d.data().content).join(', ')
      
      const obsRecords = {
        autonomous: student.obsAutonomous,
        career: student.obsCareer,
        behavior: student.obsBehavior
      }
      const prompt = getRecordPrompt(student, counselText, obsRecords)

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
      await new Promise(r => setTimeout(r, 2000))
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

// 💡 일괄 인쇄 로직 (복구됨)
const handleBulkPrint = async () => {
  if (selectedIds.value.length === 0) return
  isPrinting.value = true
  
  try {
    const dataList = []
    for (const id of selectedIds.value) {
      const student = students.value.find(s => s.id === id)
      if (!student) continue
      
      const cSnap = await getDocs(query(collection(db, 'counselingLogs'), where('studentId', '==', id)))
      const aSnap = await getDocs(query(collection(db, 'attendanceLogs'), where('studentId', '==', id)))
      const aiSnap = await getDocs(query(collection(db, 'aiNotes'), where('studentId', '==', id)))
      
      dataList.push({ 
        student, 
        counselingLogs: cSnap.docs.map(d=>d.data()), 
        attendanceLogs: aSnap.docs.map(d=>d.data()), 
        aiNotes: aiSnap.docs.map(d=>d.data()) 
      })
    }
    
    // 데이터를 인쇄 컴포넌트로 넘김
    printDataList.value = dataList
    
    // 렌더링될 시간을 잠시 준 후 인쇄 창 띄우기
    setTimeout(() => { 
      window.print(); 
      isPrinting.value = false;
    }, 800)
    
  } catch (error) { 
    alert("인쇄 데이터를 불러오는 중 오류가 발생했습니다."); 
    isPrinting.value = false 
  }
}

// 기타 관리 기능
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
    
    <div v-if="isAiAnalyzing" class="fixed inset-0 bg-black/60 z- flex flex-col items-center justify-center text-white p-4">
      <div class="animate-spin w-16 h-16 border-4 border-white border-t-blue-500 rounded-full mb-6"></div>
      <h3 class="text-2xl font-bold mb-2">🤖 AI {{ aiProgress.type }} 진행 중...</h3>
      <p class="text-lg text-blue-200 font-bold">{{ aiProgress.current }} / {{ aiProgress.total }} 명 완료</p>
    </div>

    <div class="print:hidden">
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
        
        <button @click="handleBulkPrint" :disabled="isPrinting" class="text-sm px-4 py-2 bg-gray-800 text-white rounded-lg font-bold shadow-sm hover:bg-black transition-colors">
          🖨️ {{ isPrinting ? '인쇄 준비 중...' : '일괄 인쇄' }}
        </button>
        
        <button @click="handleBulkRecordAi" class="text-sm px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-lg font-bold shadow-sm transition-transform active:scale-95">
          📝 AI 생기부 초안 일괄 생성
        </button>
        
        <div class="flex-1"></div>
        <button @click="selectedIds = []" class="text-xs font-bold text-gray-500 hover:underline">선택 해제</button>
      </div>

      <PhotoBulkUpload v-if="showPhotoUploadArea" />
      <GradeBulkUpload v-if="showGradeUploadArea" />
      <StudentBulkUpload v-if="showUploadArea" />
      <StudentListTable :students="students" v-model="selectedIds" @open-modal="openModal" />
    </div>

    <StudentDetailModal v-if="isModalOpen" :student="selectedStudent" @close="closeModal" />
    
    <StudentPrintLayout :printDataList="printDataList" />
    
  </div>
</template>