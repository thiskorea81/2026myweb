<script setup>
import { ref, computed, onMounted } from 'vue'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import * as XLSX from 'xlsx'
import StudentPrintLayout from '../components/StudentPrintLayout.vue'

const students = ref([])
const isLoading = ref(true)

const selectedGrade = ref('전체')
const selectedClass = ref('전체')
const searchQuery = ref('')
const selectedIds = ref([])

const isPreparing = ref(false)
const prepProgress = ref({ current: 0, total: 0 })
const printDataList = ref([])

const fetchStudents = async () => {
  isLoading.value = true
  try {
    const snap = await getDocs(collection(db, 'students'))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    data.sort((a, b) => String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true }))
    students.value = data
  } catch (error) {
    console.error('데이터 로드 에러:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchStudents)

const filteredStudents = computed(() => {
  return students.value.filter(s => {
    const matchGrade = selectedGrade.value === '전체' || String(s.grade) === selectedGrade.value
    const matchClass = selectedClass.value === '전체' || String(s.class) === selectedClass.value
    const q = searchQuery.value.trim()
    const matchSearch = !q ||
      (s.name && s.name.includes(q)) ||
      (s.studentId && String(s.studentId).includes(q)) ||
      (s.phone && s.phone.includes(q))
    return matchGrade && matchClass && matchSearch
  })
})

const toggleSelectAll = (e) => {
  if (e.target.checked) {
    selectedIds.value = filteredStudents.value.map(s => s.id)
  } else {
    selectedIds.value = []
  }
}

const selectedStudents = computed(() => students.value.filter(s => selectedIds.value.includes(s.id)))

// 선택 학생들의 상담/출결/AI노트/교과세특 데이터를 모아 종합 자료 세트를 만든다.
const buildFullDataSet = async () => {
  const dataList = []
  prepProgress.value = { current: 0, total: selectedStudents.value.length }
  for (const student of selectedStudents.value) {
    const [cSnap, aSnap, aiSnap, draftSnap] = await Promise.all([
      getDocs(query(collection(db, 'counselingLogs'), where('studentId', '==', student.id))),
      getDocs(query(collection(db, 'attendanceLogs'), where('studentId', '==', student.id))),
      getDocs(query(collection(db, 'aiNotes'), where('studentId', '==', student.id))),
      getDocs(query(collection(db, 'subjectDrafts'), where('studentId', '==', student.studentId)))
    ])

    const counselingLogs = cSnap.docs.map(d => d.data()).sort((a, b) => new Date(b.date) - new Date(a.date))
    const attendanceLogs = aSnap.docs.map(d => d.data()).sort((a, b) => new Date(b.date) - new Date(a.date))
    const aiNotes = aiSnap.docs.map(d => d.data()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const subjectDrafts = draftSnap.docs.map(d => d.data()).sort((a, b) => String(a.subject).localeCompare(String(b.subject)))

    dataList.push({ student, counselingLogs, attendanceLogs, aiNotes, subjectDrafts })
    prepProgress.value.current++
  }
  return dataList
}

const handleBulkPrint = async () => {
  if (selectedIds.value.length === 0) return
  isPreparing.value = true
  try {
    printDataList.value = await buildFullDataSet()
    setTimeout(() => {
      window.print()
      isPreparing.value = false
    }, 800)
  } catch (error) {
    console.error(error)
    alert('자료를 불러오는 중 오류가 발생했습니다.')
    isPreparing.value = false
  }
}

const handleExcelExport = async () => {
  if (selectedIds.value.length === 0) return
  isPreparing.value = true
  try {
    const dataList = await buildFullDataSet()

    const infoRows = dataList.map(({ student: s }) => ({
      학번: s.studentId, 성명: s.name, 학년: s.grade, 반: s.class, 번호: s.number,
      성별: s.gender || '', 생년월일: s.birthDate || '', 연락처: s.phone || '',
      보호자1: s.parent1Phone || '', 보호자2: s.parent2Phone || '', 주소: s.address || '',
      진로: s.career || '', 희망대학: s.university || '', 취미: s.hobby || '', 특기: s.specialty || '',
      선호교과: s.favoriteSubject || '', 기피교과: s.dislikeSubject || '',
      장점: s.goodPoint || '', 단점: s.badPoint || '', 메모: s.memo || ''
    }))

    const recordRows = dataList.map(({ student: s }) => ({
      학번: s.studentId, 성명: s.name,
      자율활동: s.finalAutonomous || '', 진로활동: s.finalCareer || '', 행동특성및종합의견: s.finalBehavior || ''
    }))

    const gradeRows = []
    dataList.forEach(({ student: s }) => {
      (s.grades || []).forEach(g => {
        Object.entries(g.scores || {}).forEach(([subject, score]) => {
          gradeRows.push({ 학번: s.studentId, 성명: s.name, 시험명: g.examName, 과목: subject, 점수: score })
        })
      })
    })

    const draftRows = []
    dataList.forEach(({ student: s, subjectDrafts }) => {
      subjectDrafts.forEach(d => {
        draftRows.push({ 학번: s.studentId, 성명: s.name, 과목: d.subject, 세특내용: d.content || '' })
      })
    })

    const counselRows = []
    dataList.forEach(({ student: s, counselingLogs }) => {
      counselingLogs.forEach(log => {
        counselRows.push({ 학번: s.studentId, 성명: s.name, 날짜: log.date, 내용: log.content || '' })
      })
    })

    const attendanceRows = []
    dataList.forEach(({ student: s, attendanceLogs }) => {
      attendanceLogs.forEach(log => {
        attendanceRows.push({ 학번: s.studentId, 성명: s.name, 날짜: log.date, 유형: log.type || '', 사유: log.reason || '' })
      })
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoRows), '학생정보')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recordRows), '생기부(자율진로행특)')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(draftRows), '교과세특')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gradeRows), '성적')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(counselRows), '상담기록')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendanceRows), '출결기록')

    const today = new Date().toISOString().substring(0, 10)
    XLSX.writeFile(wb, `진학상담자료_${today}.xlsx`)
  } catch (error) {
    console.error(error)
    alert('엑셀 생성 중 오류가 발생했습니다.')
  } finally {
    isPreparing.value = false
  }
}
</script>

<template>
  <div class="max-w-6xl mx-auto p-4 sm:p-6 font-sans print:hidden">

    <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 border-b pb-4">
      <div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">📥 진학상담 자료 다운로드</h2>
        <p class="text-gray-500 mt-1">학년/반 구분 없이 학생을 선택하여 기본정보·성적·생기부·교과세특·상담/출결·AI노트를 한 번에 인쇄(PDF) 또는 엑셀로 내려받습니다.</p>
      </div>
      <button @click="fetchStudents" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors shrink-0">🔄 새로고침</button>
    </div>

    <div v-if="isPreparing" class="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center text-white p-4">
      <div class="animate-spin w-16 h-16 border-4 border-white border-t-blue-500 rounded-full mb-6"></div>
      <h3 class="text-xl font-bold mb-2">자료를 모으는 중입니다...</h3>
      <p v-if="prepProgress.total" class="text-lg text-blue-200 font-bold">{{ prepProgress.current }} / {{ prepProgress.total }} 명 완료</p>
    </div>

    <div v-if="selectedIds.length > 0" class="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-4 flex flex-wrap gap-3 items-center shadow-sm sticky top-16 z-20">
      <span class="text-sm font-bold text-blue-800 pr-4 border-r border-blue-200 whitespace-nowrap">{{ selectedIds.length }}명 선택됨</span>
      <button @click="handleBulkPrint" :disabled="isPreparing" class="text-xs md:text-sm px-4 py-2 bg-gray-800 text-white rounded-lg font-bold hover:bg-black transition-colors whitespace-nowrap disabled:opacity-50">
        🖨️ 종합자료 인쇄/PDF
      </button>
      <button @click="handleExcelExport" :disabled="isPreparing" class="text-xs md:text-sm px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors whitespace-nowrap disabled:opacity-50">
        📊 엑셀 전체 다운로드
      </button>
      <div class="flex-1"></div>
      <button @click="selectedIds = []" class="text-xs font-bold text-gray-500 hover:underline whitespace-nowrap">선택 해제</button>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div class="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center">
        <span class="font-bold text-gray-700">필터:</span>
        <select v-model="selectedGrade" class="p-2 border border-gray-300 rounded-lg bg-white text-gray-800 outline-none font-bold text-sm">
          <option value="전체">학년 전체</option>
          <option value="1">1학년</option>
          <option value="2">2학년</option>
          <option value="3">3학년</option>
        </select>
        <select v-model="selectedClass" class="p-2 border border-gray-300 rounded-lg bg-white text-gray-800 outline-none font-bold text-sm">
          <option value="전체">반 전체</option>
          <option v-for="c in 15" :key="c" :value="String(c)">{{ c }}반</option>
        </select>

        <div class="flex-1 min-w-[200px] flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 shadow-sm">
          <span class="pl-3 text-gray-400">🔍</span>
          <input v-model="searchQuery" type="text" placeholder="이름, 학번, 연락처 검색..." class="w-full p-2 outline-none text-sm font-bold text-gray-800">
        </div>

        <div class="w-full sm:w-auto text-right">
          <span class="text-sm font-bold text-gray-500">조회된 학생: <span class="text-blue-600">{{ filteredStudents.length }}</span>명</span>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm text-center whitespace-nowrap">
          <thead class="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 w-10">
                <input type="checkbox" @change="toggleSelectAll" :checked="selectedIds.length === filteredStudents.length && filteredStudents.length > 0" class="w-4 h-4 cursor-pointer accent-blue-600"/>
              </th>
              <th class="px-4 py-3">학번</th>
              <th class="px-4 py-3">학년</th>
              <th class="px-4 py-3">반</th>
              <th class="px-4 py-3">번호</th>
              <th class="px-4 py-3 text-left">성명</th>
              <th class="px-4 py-3 text-left">진로</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading"><td colspan="7" class="py-12 text-gray-400 font-medium">데이터를 불러오는 중입니다...</td></tr>
            <tr v-else-if="filteredStudents.length === 0"><td colspan="7" class="py-12 text-gray-500 font-medium">조회된 학생이 없습니다.</td></tr>
            <tr v-for="student in filteredStudents" :key="student.id" class="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
              <td class="px-4 py-3"><input type="checkbox" :value="student.id" v-model="selectedIds" class="w-4 h-4 cursor-pointer accent-blue-600"/></td>
              <td class="px-4 py-3 font-bold text-blue-700">{{ student.studentId }}</td>
              <td class="px-4 py-3 text-gray-800 font-medium">{{ student.grade }}</td>
              <td class="px-4 py-3 text-gray-800 font-medium">{{ student.class }}</td>
              <td class="px-4 py-3 text-gray-800 font-medium">{{ student.number }}</td>
              <td class="px-4 py-3 font-bold text-gray-800 text-left">{{ student.name }}</td>
              <td class="px-4 py-3 text-left text-gray-600">{{ student.career || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <StudentPrintLayout :printDataList="printDataList" />
</template>
