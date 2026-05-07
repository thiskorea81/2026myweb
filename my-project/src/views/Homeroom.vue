<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useStudentStore } from '../stores/studentStore'
import { useAiNoteStore } from '../stores/aiNoteStore'
import { storeToRefs } from 'pinia'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService' 
import { recordSchema, getRecordPrompt, getGeneralAiNotePrompt } from '../services/aiPrompts' 

// 💡 하위 컴포넌트 임포트 (활동 등록 컴포넌트 포함)
import StudentBulkUpload from '../components/StudentBulkUpload.vue'
import GradeBulkUpload from '../components/GradeBulkUpload.vue'
import PhotoBulkUpload from '../components/PhotoBulkUpload.vue'
import ActivityBulkUpload from '../components/ActivityBulkUpload.vue'
import StudentListTable from '../components/StudentListTable.vue'
import StudentDetailModal from '../components/StudentDetailModal.vue'
import StudentPrintLayout from '../components/StudentPrintLayout.vue' 

const studentStore = useStudentStore()
const aiNoteStore = useAiNoteStore()
const { students } = storeToRefs(studentStore)

// 💡 학급 선택 상태 (로컬 스토리지 보존)
const myGrade = ref(localStorage.getItem('myGrade') || '1')
const myClass = ref(localStorage.getItem('myClass') || '1')

watch([myGrade, myClass], ([newGrade, newClass]) => {
  localStorage.setItem('myGrade', newGrade)
  localStorage.setItem('myClass', newClass)
  selectedIds.value = [] // 반이 바뀌면 선택 해제
})

// 💡 우리 반 학생만 필터링
const filteredStudents = computed(() => {
  return students.value.filter(s => 
    String(s.grade) === String(myGrade.value) && 
    String(s.class) === String(myClass.value)
  )
})

onMounted(() => { studentStore.fetchStudents() })

const selectedIds = ref([])
const isAiAnalyzing = ref(false)
const aiProgress = ref({ current: 0, total: 0, type: '' })

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

// AI 노트 일괄 생성 로직
const handleBulkAiNote = async () => {
  if (selectedIds.value.length === 0 || !confirm('선택한 학생들의 AI 노트를 일괄 생성하시겠습니까?')) return
  isAiAnalyzing.value = true
  aiProgress.value = { current: 0, total: selectedIds.value.length, type: 'AI 노트(종합 분석) 생성' }

  try {
    for (const id of selectedIds.value) {
      const student = students.value.find(s => s.id === id)
      if (!student) continue

      // 상담기록 및 출결기록 수집
      const cSnap = await getDocs(query(collection(db, 'counselingLogs'), where('studentId', '==', id)))
      const counselText = cSnap.docs.map(d => d.data().content).join(', ') || '없음'
      
      const aSnap = await getDocs(query(collection(db, 'attendanceLogs'), where('studentId', '==', id)))
      const attendText = aSnap.docs.map(d => d.data().status).join(', ') || '없음'

      const obsRecords = `자율(${student.obsAutonomous || '없음'}), 진로(${student.obsCareer || '없음'}), 행동(${student.obsBehavior || '없음'})`
      const allRecordsText = `상담기록: ${counselText}\n출결현황: ${attendText}\n행동관찰: ${obsRecords}`

      const prompt = getGeneralAiNotePrompt(student, allRecordsText)
      const aiResponse = await aiService.askText(prompt)
      
      const content = `🤖 [전체 종합 분석]\n${aiResponse}`
      await aiNoteStore.addNote(student.id, content)

      aiProgress.value.current++
      await new Promise(r => setTimeout(r, 2000)) // Rate limit 방지
    }
    alert('AI 노트 일괄 생성이 완료되었습니다.')
  } catch (error) { 
    console.error(error)
    alert('오류 발생: ' + error.message) 
  } finally { 
    isAiAnalyzing.value = false
    selectedIds.value = [] 
  }
}

// 일괄 인쇄 로직
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
      
      const sortedAiNotes = aiSnap.docs.map(d=>d.data()).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
      
      dataList.push({ 
        student, 
        counselingLogs: cSnap.docs.map(d=>d.data()), 
        attendanceLogs: aSnap.docs.map(d=>d.data()), 
        aiNotes: sortedAiNotes.slice(0, 1) // 일괄 인쇄 시 AI 노트는 가장 마지막(최신) 1개만 포함
      })
    }
    printDataList.value = dataList
    setTimeout(() => { 
      window.print(); 
      isPrinting.value = false;
    }, 800)
  } catch (error) { 
    alert("인쇄 데이터를 불러오는 중 오류가 발생했습니다."); 
    isPrinting.value = false 
  }
}

// 💡 업로드 영역 토글 상태 (활동 등록 추가)
const showUploadArea = ref(false)
const showGradeUploadArea = ref(false)
const showPhotoUploadArea = ref(false)
const showActivityUploadArea = ref(false)

const isModalOpen = ref(false)
const selectedStudent = ref(null)

const openModal = (student) => { selectedStudent.value = student; isModalOpen.value = true }
const closeModal = () => { isModalOpen.value = false; selectedStudent.value = null }
</script>

<template>
  <div class="w-full relative text-gray-900">
    
    <div v-if="isAiAnalyzing" class="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center text-white p-4">
      <div class="animate-spin w-16 h-16 border-4 border-white border-t-blue-500 rounded-full mb-6"></div>
      <h3 class="text-2xl font-bold mb-2">🤖 AI {{ aiProgress.type }} 진행 중...</h3>
      <p class="text-lg text-blue-200 font-bold">{{ aiProgress.current }} / {{ aiProgress.total }} 명 완료</p>
    </div>

    <div class="print:hidden">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-black text-gray-800 tracking-tight">👥 학급 학생 관리</h2>
          <div class="flex items-center gap-2 mt-1">
            <div class="flex bg-indigo-50 border border-indigo-200 rounded-lg p-1">
              <select v-model="myGrade" class="bg-transparent text-sm font-bold text-indigo-900 outline-none px-2 py-1">
                <option value="1">1학년</option>
                <option value="2">2학년</option>
                <option value="3">3학년</option>
              </select>
              <select v-model="myClass" class="bg-transparent text-sm font-bold text-indigo-900 outline-none px-2 py-1 border-l border-indigo-200">
                <option v-for="c in 15" :key="c" :value="String(c)">{{ c }}반</option>
              </select>
            </div>
          </div>
        </div>

        <div class="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          <button 
            @click="showPhotoUploadArea = !showPhotoUploadArea" 
            class="text-xs md:text-sm px-3 py-2 bg-gray-300 text-gray-900 border border-gray-400 rounded-lg font-bold whitespace-nowrap hover:bg-gray-400 transition-colors"
          >
            📸 사진 등록
          </button>
          <button 
            @click="showGradeUploadArea = !showGradeUploadArea" 
            class="text-xs md:text-sm px-3 py-2 bg-gray-300 text-gray-900 border border-gray-400 rounded-lg font-bold whitespace-nowrap hover:bg-gray-400 transition-colors"
          >
            💯 성적 등록
          </button>
          
          <button 
            @click="showActivityUploadArea = !showActivityUploadArea" 
            class="text-xs md:text-sm px-3 py-2 bg-teal-100 text-teal-900 border border-teal-300 rounded-lg font-bold whitespace-nowrap hover:bg-teal-200 transition-colors"
          >
            🎯 활동 등록
          </button>

          <button 
            @click="showUploadArea = !showUploadArea" 
            class="text-xs md:text-sm px-4 py-2 bg-gray-300 text-gray-900 border border-gray-400 rounded-lg font-bold whitespace-nowrap hover:bg-gray-400 transition-colors"
          >
            🙋‍♂️ 학생 등록
          </button>
        </div>
      </div>

      <div v-if="selectedIds.length > 0" class="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6 flex gap-3 items-center shadow-sm sticky top-0 z-20 flex-wrap">
        <span class="text-sm font-bold text-blue-800 pr-4 border-r border-blue-200 whitespace-nowrap">{{ selectedIds.length }}명 선택</span>
        <button @click="handleBulkPrint" :disabled="isPrinting" class="text-xs md:text-sm px-4 py-2 bg-gray-800 text-white rounded-lg font-bold hover:bg-black transition-colors whitespace-nowrap">
          🖨️ {{ isPrinting ? '준비 중...' : '일괄 인쇄' }}
        </button>
        <button @click="handleBulkRecordAi" class="text-xs md:text-sm px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-lg font-bold shadow-sm active:scale-95 whitespace-nowrap">
          📝 생기부 초안 생성
        </button>
        <button @click="handleBulkAiNote" class="text-xs md:text-sm px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg font-bold shadow-sm active:scale-95 whitespace-nowrap">
          🤖 AI 노트 일괄 생성
        </button>
        <div class="flex-1"></div>
        <button @click="selectedIds = []" class="text-xs font-bold text-gray-500 hover:underline whitespace-nowrap">선택 해제</button>
      </div>

      <PhotoBulkUpload v-if="showPhotoUploadArea" />
      <GradeBulkUpload v-if="showGradeUploadArea" />
      <StudentBulkUpload v-if="showUploadArea" />
      <ActivityBulkUpload v-if="showActivityUploadArea" @close="showActivityUploadArea = false" />
      
      <StudentListTable :students="filteredStudents" v-model="selectedIds" @open-modal="openModal" />
      
      <div v-if="filteredStudents.length === 0" class="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 mt-4">
        <p class="text-gray-500 font-bold">{{ myGrade }}학년 {{ myClass }}반에 등록된 학생이 없습니다.</p>
      </div>
    </div>

    <StudentDetailModal 
      v-if="isModalOpen" 
      :student="selectedStudent" 
      :allStudents="filteredStudents"
      @close="closeModal" 
      @update-student="(s) => selectedStudent = s"
    />
    
    <StudentPrintLayout :printDataList="printDataList" />
  </div>
</template>