<script setup>
import { ref, onMounted } from 'vue'
import { useStudentStore } from '../stores/studentStore'
import { useAiNoteStore } from '../stores/aiNoteStore'
import { storeToRefs } from 'pinia'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService' // 💡 공통 서비스 임포트
import { z } from "zod" // 💡 스키마 검증용

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

// 💡 생기부 초안 구조 정의 (스키마)
const recordSchema = z.object({
  autonomous: z.string().describe("자율활동 특기사항 (1500바이트 이내)"),
  career: z.string().describe("진로활동 특기사항 (2100바이트 이내)"),
  behavior: z.string().describe("행동특성 및 종합의견 (1500바이트 이내)")
});

const showUploadArea = ref(false)
const showGradeUploadArea = ref(false)
const showPhotoUploadArea = ref(false)
const selectedIds = ref([])
const isAiAnalyzing = ref(false)
const aiProgress = ref({ current: 0, total: 0, type: '' })

// 기존 함수들은 동일하게 유지하되, AI 로직만 교체합니다.

const handleBulkAiAnalysis = async () => {
  if (selectedIds.value.length === 0 || !confirm('AI 종합 분석을 실행하시겠습니까? (1명당 3초 소요)')) return
  isAiAnalyzing.value = true
  aiProgress.value = { current: 0, total: selectedIds.value.length, type: 'AI 노트 생성' }

  try {
    for (const id of selectedIds.value) {
      const student = students.value.find(s => s.id === id)
      if (!student) continue

      const cSnap = await getDocs(query(collection(db, 'counselingLogs'), where('studentId', '==', id)))
      const prompt = `담임 교사 비서로서 다음 학생을 분석해 지도방안을 3문장으로 써주세요. 
      이름:${student.name}, 장단점:${student.goodPoint}/${student.badPoint}, 상담:${cSnap.docs.map(d=>d.data().content).join(', ')}`

      // 💡 공통 서비스(askText) 사용
      const aiResponse = await aiService.askText(prompt)
      await aiNoteStore.addNote(id, `✨ [AI 일괄 종합 분석]\n${aiResponse}`)
      
      aiProgress.value.current++
      await new Promise(r => setTimeout(r, 3000))
    }
    alert('AI 노트 일괄 분석이 완료되었습니다.')
  } catch (error) { alert('오류 발생') } finally { isAiAnalyzing.value = false; selectedIds.value = [] }
}

const handleBulkRecordAi = async () => {
  if (selectedIds.value.length === 0 || !confirm('생기부 초안을 일괄 생성하시겠습니까?')) return
  isAiAnalyzing.value = true
  aiProgress.value = { current: 0, total: selectedIds.value.length, type: '생기부 초안 생성' }

  try {
    for (const id of selectedIds.value) {
      const student = students.value.find(s => s.id === id)
      if (!student) continue

      const cSnap = await getDocs(query(collection(db, 'counselingLogs'), where('studentId', '==', id)))
      
      const prompt = `학생 ${student.name}의 생기부를 작성해줘. 
      진로:${student.career}, 상담:${cSnap.docs.map(d=>d.data().content).join(', ')}
      메모:${student.obsAutonomous || ''} / ${student.obsCareer || ''} / ${student.obsBehavior || ''}
      [규칙] 1500바이트 이하. 책 제목 앞 어포스트로피 금지.`

      // 💡 구조화된 출력(askStructured) 사용
      const result = await aiService.askStructured(prompt, recordSchema)

      let history = []
      if (student.recordAiDraftHistory) try { history = JSON.parse(student.recordAiDraftHistory) } catch(e){}
      
      history.push({ version: Date.now(), type: '새 초안(일괄)', prompt: '일괄 자동 종합 생성', data: result, createdAt: new Date().toISOString() })
      await studentStore.updateStudent(id, { recordAiDraftHistory: JSON.stringify(history) })

      aiProgress.value.current++
      await new Promise(r => setTimeout(r, 3000))
    }
    alert('생기부 초안 일괄 생성이 완료되었습니다.')
  } catch (error) { alert('오류 발생: ' + error.message) } finally { isAiAnalyzing.value = false; selectedIds.value = [] }
}

// ... 기타 나머지 기능들은 기존과 동일 ...
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

const openModal = (student) => { selectedStudent.value = student; isModalOpen.value = true }
const closeModal = () => { isModalOpen.value = false; selectedStudent.value = null }
const isModalOpen = ref(false)
const selectedStudent = ref(null)
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
      dataList.push({ student, counselingLogs: cSnap.docs.map(d=>d.data()), attendanceLogs: aSnap.docs.map(d=>d.data()), aiNotes: aiSnap.docs.map(d=>d.data()) })
    }
    printDataList.value = dataList
    setTimeout(() => { window.print(); isPrinting.value = false }, 500)
  } catch (error) { alert("인쇄 오류"); isPrinting.value = false }
}

const exportRecordsCSV = () => {
  if (students.value.length === 0) return alert('학생 데이터가 없습니다.')
  let csvContent = '\uFEFF' + '학번,이름,자율활동(최종),진로활동(최종),행동특성및종합의견(최종)\n'
  const sorted = [...students.value].sort((a,b)=>String(a.studentId).localeCompare(String(b.studentId), undefined, {numeric:true}))
  sorted.forEach(s => {
    csvContent += `"${s.studentId||''}","${s.name||''}","${(s.finalAutonomous||'').replace(/"/g,'""')}","${(s.finalCareer||'').replace(/"/g,'""')}","${(s.finalBehavior||'').replace(/"/g,'""')}"\n`
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
    </div>
    <div class="no-print">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-gray-800">👥 학급 학생 관리</h2>
        <div class="flex gap-2">
          <button @click="exportRecordsCSV" class="text-sm px-4 py-2 bg-green-100 text-green-800 font-bold rounded hover:bg-green-200 shadow-sm">⬇️ 전체 생기부 CSV 다운로드</button>
          <button @click="showPhotoUploadArea = !showPhotoUploadArea" class="text-sm px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium">📸 사진 등록</button>
          <button @click="showGradeUploadArea = !showGradeUploadArea" class="text-sm px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium">💯 성적 등록</button>
          <button @click="showUploadArea = !showUploadArea" class="text-sm px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium">학생 등록</button>
        </div>
      </div>
      <div v-if="selectedIds.length > 0" class="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-6 flex gap-2 flex-wrap items-center shadow-sm">
        <span class="text-sm font-bold text-blue-800 mr-2 border-r border-blue-300 pr-4">{{ selectedIds.length }}명 선택됨</span>
        <button @click="handleBulkPrint" :disabled="isPrinting" class="text-sm px-3 py-1.5 bg-gray-800 text-white rounded font-bold hover:bg-gray-900 transition-colors">🖨️ 일괄 인쇄</button>
        <button @click="handleBulkAiAnalysis" class="text-sm px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded font-bold hover:from-blue-600 hover:to-indigo-600">🤖 AI 노트 일괄</button>
        <button @click="handleBulkRecordAi" class="text-sm px-3 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded font-bold hover:from-teal-600 hover:to-emerald-600">📝 생기부 AI 초안 일괄</button>
        <div class="flex-1"></div>
        <button @click="handleBulkArchive" class="text-sm px-3 py-1.5 bg-yellow-500 text-white rounded font-medium hover:bg-yellow-600">보관</button>
        <button @click="handleBulkDelete" class="text-sm px-3 py-1.5 bg-red-600 text-white rounded font-medium hover:bg-red-700">삭제</button>
      </div>
      <StudentBulkUpload v-if="showUploadArea" />
      <GradeBulkUpload v-if="showGradeUploadArea" />
      <PhotoBulkUpload v-if="showPhotoUploadArea" />
      <StudentListTable :students="students" v-model="selectedIds" @open-modal="openModal" />
    </div>
    <StudentDetailModal v-if="isModalOpen" :student="selectedStudent" @close="closeModal" />
    <StudentPrintLayout :printDataList="printDataList" />
  </div>
</template>