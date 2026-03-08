<script setup>
import { ref, onMounted } from 'vue'
import { useStudentStore } from '../stores/studentStore'
import { useAiNoteStore } from '../stores/aiNoteStore'
import { storeToRefs } from 'pinia'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { GoogleGenAI } from '@google/genai'

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

const showUploadArea = ref(false)
const showGradeUploadArea = ref(false)
const showPhotoUploadArea = ref(false)
const selectedIds = ref([])

const handleBulkDelete = async () => {
  if (!confirm('선택한 학생을 삭제하시겠습니까?')) return
  await studentStore.bulkDelete(selectedIds.value)
  selectedIds.value = [] 
}

const handleBulkArchive = async () => {
  if (!confirm('선택한 학생을 보관 처리하시겠습니까?')) return
  await studentStore.bulkArchive(selectedIds.value)
  selectedIds.value = []
}

const isModalOpen = ref(false)
const selectedStudent = ref(null)

const openModal = (student) => {
  selectedStudent.value = student
  isModalOpen.value = true
}

const closeModal = () => {
  isModalOpen.value = false
  selectedStudent.value = null
}

const isPrinting = ref(false)
const printDataList = ref([])

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
      
      const aiNotes = aiSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      dataList.push({ student, counselingLogs: cSnap.docs.map(d=>d.data()), attendanceLogs: aSnap.docs.map(d=>d.data()), aiNotes })
    }
    
    printDataList.value = dataList
    setTimeout(() => { window.print(); isPrinting.value = false }, 500)
  } catch (error) { alert("인쇄 오류 발생"); isPrinting.value = false }
}

const isAiAnalyzing = ref(false)
const aiProgress = ref({ current: 0, total: 0, type: '' })

const handleBulkAiAnalysis = async () => {
  if (selectedIds.value.length === 0 || !confirm('AI 종합 분석을 실행하시겠습니까? (1명당 3초 소요)')) return
  isAiAnalyzing.value = true
  aiProgress.value = { current: 0, total: selectedIds.value.length, type: 'AI 노트 생성' }

  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY })
    for (const id of selectedIds.value) {
      const student = students.value.find(s => s.id === id)
      if (!student) continue

      const cSnap = await getDocs(query(collection(db, 'counselingLogs'), where('studentId', '==', id)))
      const prompt = `당신은 담임 교사 비서입니다. 다음 학생을 분석해 지도방안을 3문장으로 써주세요. 이름:${student.name}, 장단점:${student.goodPoint}/${student.badPoint}, 상담:${cSnap.docs.map(d=>d.data().content).join(', ')}`

      const response = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt })
      await aiNoteStore.addNote(id, `✨ [AI 일괄 종합 분석]\n${response.text}`)
      
      aiProgress.value.current++
      await new Promise(r => setTimeout(r, 3000))
    }
    alert('AI 노트 일괄 분석이 완료되었습니다.')
  } catch (error) { alert('오류 발생') } finally { isAiAnalyzing.value = false; selectedIds.value = [] }
}

// 💡 일괄 생성 시에도 분량 조절 프롬프트 완벽 적용
const handleBulkRecordAi = async () => {
  if (selectedIds.value.length === 0 || !confirm('선택한 학생들의 생기부 초안을 일괄 생성하시겠습니까?\n(1명당 3초가 소요되며, 기존 버전이 있어도 새 버전으로 추가됩니다.)')) return
  isAiAnalyzing.value = true
  aiProgress.value = { current: 0, total: selectedIds.value.length, type: '생기부 초안 생성' }

  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY })
    for (const id of selectedIds.value) {
      const student = students.value.find(s => s.id === id)
      if (!student) continue

      const cSnap = await getDocs(query(collection(db, 'counselingLogs'), where('studentId', '==', id)))
      
      const prompt = `당신은 담임 교사 비서입니다. 순수 JSON으로 생기부를 작성하세요.
이름:${student.name}, 진로:${student.career}, 상담:${cSnap.docs.map(d=>d.data().content).join(', ')}
자율메모:${student.obsAutonomous || ''} 진로메모:${student.obsCareer || ''} 행동메모:${student.obsBehavior || ''}
형식: {"autonomous": "...", "career": "...", "behavior": "..."}
[엄격한 분량 규칙] 자율활동(최대 1500바이트), 진로활동(최대 2100바이트), 행동특성 및 종합의견(최대 1500바이트)을 절대 넘지 마세요. 책 제목 앞 어포스트로피 금지. 메모가 풍부하면 제한에 가깝게 길게, 부실하면 억지로 쓰지 말고 제한의 2/3 이내로 작성하세요.`

      const response = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt })
      const parsedDraft = JSON.parse(response.text.replace(/```json/gi, '').replace(/```/g, '').trim())

      let history = []
      if (student.recordAiDraftHistory) try { history = JSON.parse(student.recordAiDraftHistory) } catch(e){}
      
      history.push({ version: Date.now(), type: '새 초안(일괄)', prompt: '일괄 자동 종합 생성', data: parsedDraft, createdAt: new Date().toISOString() })
      await studentStore.updateStudent(id, { recordAiDraftHistory: JSON.stringify(history) })

      aiProgress.value.current++
      await new Promise(r => setTimeout(r, 3000))
    }
    alert('생기부 초안 일괄 생성이 완료되었습니다. 각 학생의 생기부 탭에서 확인하세요!')
  } catch (error) { alert('오류 발생') } finally { isAiAnalyzing.value = false; selectedIds.value = [] }
}

const exportRecordsCSV = () => {
  if (students.value.length === 0) return alert('학생 데이터가 없습니다.')
  
  let csvContent = '\uFEFF'
  csvContent += '학번,이름,자율활동(최종),진로활동(최종),행동특성및종합의견(최종)\n'
  
  const sorted = [...students.value].sort((a,b)=>String(a.studentId).localeCompare(String(b.studentId), undefined, {numeric:true}))

  sorted.forEach(s => {
    const id = s.studentId || ''
    const name = s.name || ''
    const auto = (s.finalAutonomous || '').replace(/"/g, '""') 
    const career = (s.finalCareer || '').replace(/"/g, '""')
    const behav = (s.finalBehavior || '').replace(/"/g, '""')
    csvContent += `"${id}","${name}","${auto}","${career}","${behav}"\n`
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "학급_최종_생기부_기록.csv"
  link.click()
}
</script>

<template>
  <div class="w-full relative">
    
    <div v-if="isAiAnalyzing" class="fixed inset-0 bg-black bg-opacity-60 z-[60] flex flex-col items-center justify-center text-white">
      <div class="animate-spin w-16 h-16 border-4 border-white border-t-blue-500 rounded-full mb-6"></div>
      <h3 class="text-2xl font-bold mb-2">🤖 {{ aiProgress.type }} 진행 중...</h3>
      <p class="text-lg text-blue-200 font-bold">진행률: {{ aiProgress.current }} / {{ aiProgress.total }} 명 완료</p>
      <p class="mt-4 text-sm text-gray-300">창을 닫거나 새로고침하지 마세요.</p>
    </div>

    <div class="no-print">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-gray-800">👥 학급 학생 관리</h2>
        
        <div class="flex gap-2">
          <button @click="exportRecordsCSV" class="text-sm px-4 py-2 bg-green-100 text-green-800 font-bold rounded hover:bg-green-200 transition-colors shadow-sm">
            ⬇️ 전체 생기부 CSV 다운로드
          </button>
          <button @click="showPhotoUploadArea = !showPhotoUploadArea" class="text-sm px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium">📸 사진 등록</button>
          <button @click="showGradeUploadArea = !showGradeUploadArea" class="text-sm px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium">💯 성적 등록</button>
          <button @click="showUploadArea = !showUploadArea" class="text-sm px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium">학생 등록</button>
        </div>
      </div>

      <div v-if="selectedIds.length > 0" class="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-6 flex gap-2 flex-wrap items-center shadow-sm">
        <span class="text-sm font-bold text-blue-800 mr-2 border-r border-blue-300 pr-4">{{ selectedIds.length }}명 선택됨</span>
        
        <button @click="handleBulkPrint" :disabled="isPrinting" class="text-sm px-3 py-1.5 bg-gray-800 text-white rounded font-bold hover:bg-gray-900 transition-colors flex items-center gap-1">🖨️ 일괄 인쇄</button>
        <button @click="handleBulkAiAnalysis" class="text-sm px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded font-bold hover:from-blue-600 hover:to-indigo-600 transition-colors">🤖 AI 노트 일괄</button>
        <button @click="handleBulkRecordAi" class="text-sm px-3 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded font-bold hover:from-teal-600 hover:to-emerald-600 transition-colors">📝 생기부 AI 초안 일괄</button>
        
        <div class="flex-1"></div>
        <button @click="handleBulkArchive" class="text-sm px-3 py-1.5 bg-yellow-500 text-white rounded font-medium hover:bg-yellow-600 transition-colors">보관</button>
        <button @click="handleBulkDelete" class="text-sm px-3 py-1.5 bg-red-600 text-white rounded font-medium hover:bg-red-700 transition-colors">삭제</button>
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