<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useStudentStore } from '../stores/studentStore'

import SeatSidebar from '../components/SeatSidebar.vue'
import SeatGrid from '../components/SeatGrid.vue'
import SeatPrint from '../components/SeatPrint.vue'

const studentStore = useStudentStore()

const teacherMode = ref(false)
const toastMessage = ref("")

// 💡 1. 동적 자리 설정을 위한 변수들
const colConfig = ref([5, 5, 6, 6, 5, 5]) 
const showConfigModal = ref(false)
const tempColCount = ref(6)
const tempRowCounts = ref([])

const seats = ref([])
const dragInfo = ref(null)
const lastArrangement = ref([]) 
const savedLayouts = ref([])

let originalTitle = ''

// 💡 [핵심] 우리 반 학생만 필터링하는 computed 속성
// localStorage에 저장된 학년/반 정보를 사용합니다 (기본값 1학년 1반)
const myGrade = ref(localStorage.getItem('myGrade') || '1')
const myClass = ref(localStorage.getItem('myClass') || '1')

const myRoomStudents = computed(() => {
  return studentStore.students.filter(s => 
    String(s.grade) === String(myGrade.value) && 
    String(s.class) === String(myClass.value)
  )
})

const showToast = (msg) => {
  toastMessage.value = msg
  setTimeout(() => { toastMessage.value = "" }, 2000)
}

const structure = (list) => {
  let result = []
  let current = 0
  colConfig.value.forEach(size => {
    const slice = list.slice(current, current + size)
    while (slice.length < size) slice.push(null)
    result.push(slice)
    current += size
  })
  return result
}

// 💡 2. 초기 정렬 시 '전체 학생'이 아닌 '우리 반 학생'만 사용
const getInitialFlatList = () => {
  const sorted = [...myRoomStudents.value].sort((a, b) => String(a.studentId).localeCompare(String(b.studentId)))
  const maxRows = Math.max(...colConfig.value)
  let tempSeats = Array.from({ length: colConfig.value.length }, () => [])
  let studentIdx = 0

  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < colConfig.value.length; c++) {
      if (r < colConfig.value[c]) {
        tempSeats[c].push(sorted[studentIdx] || null)
        studentIdx++
      }
    }
  }
  return tempSeats.flat()
}

const loadSeats = async () => {
  // 💡 반별로 자리 배치를 따로 저장하도록 경로 변경 (settings/seatArrangement_1_1 형식)
  const docId = `seatArrangement_${myGrade.value}_${myClass.value}`
  const arrangementRef = doc(db, 'settings', docId)
  const snap = await getDoc(arrangementRef)

  if (snap.exists()) {
    const data = snap.data()
    lastArrangement.value = data.last_arrangement || []
    savedLayouts.value = data.saved_layouts || [] 
    
    if (data.col_config) {
      colConfig.value = data.col_config
    }

    if (data.current_seats && data.current_seats.length > 0) {
      // 💡 여기서도 우리 반 학생 풀에서만 찾습니다.
      const loadedStudents = data.current_seats.map(studentId => 
        studentId ? myRoomStudents.value.find(s => s.studentId === studentId) || null : null
      )
      seats.value = structure(loadedStudents)
      return
    }
  }
  seats.value = structure(getInitialFlatList())
}

const saveToFirebase = async (mode = 'current') => {
  const flatList = seats.value.flat().map(s => s ? s.studentId : null)
  const docId = `seatArrangement_${myGrade.value}_${myClass.value}`
  const arrangementRef = doc(db, 'settings', docId)
  
  let updateData = { 
    current_seats: flatList,
    col_config: colConfig.value 
  }

  if (mode === 'shuffle') {
    updateData.last_arrangement = flatList
    lastArrangement.value = flatList
  } else if (mode === 'history') {
    const name = prompt("저장할 자리 배치의 이름을 입력하세요 (예: 1학기 중간고사)")
    if (!name) return 
    
    const newLayout = { 
      id: Date.now(), 
      name: name, 
      date: new Date().toLocaleDateString(), 
      seats: flatList,
      colConfig: colConfig.value 
    }
    const updatedLayouts = [...savedLayouts.value, newLayout]
    updateData.saved_layouts = updatedLayouts
    updateData.last_arrangement = flatList
    
    savedLayouts.value = updatedLayouts
    lastArrangement.value = flatList
  }

  try {
    await setDoc(arrangementRef, updateData, { merge: true })
    if (mode === 'history') showToast(`'${updateData.saved_layouts.slice(-1)[0].name}' 배치가 저장되었습니다.`)
    if (mode === 'shuffle') showToast("자리가 랜덤으로 배치되었습니다.")
  } catch (error) {
    console.error("저장 실패:", error)
  }
}

const loadLayout = async (layout) => {
  if (!confirm(`'${layout.name}' 배치를 불러오시겠습니까?`)) return
  
  if (layout.colConfig) {
    colConfig.value = layout.colConfig
  }
  
  const loadedStudents = layout.seats.map(studentId => 
    studentId ? myRoomStudents.value.find(s => s.studentId === studentId) || null : null
  )
  seats.value = structure(loadedStudents)
  await saveToFirebase('current')
  showToast("배치를 불러왔습니다.")
}

const deleteLayout = async (id) => {
  if (!confirm("이 배치 기록을 목록에서 삭제하시겠습니까?")) return
  const updatedLayouts = savedLayouts.value.filter(l => l.id !== id)
  const docId = `seatArrangement_${myGrade.value}_${myClass.value}`
  try {
    await setDoc(doc(db, 'settings', docId), { saved_layouts: updatedLayouts }, { merge: true })
    savedLayouts.value = updatedLayouts
    showToast("목록에서 삭제되었습니다.")
  } catch (error) {
    console.error(error)
  }
}

const clearLayout = async () => {
  if (!confirm("모든 배치를 초기화하고 기본 번호 순서대로 정렬하시겠습니까?")) return
  seats.value = structure(getInitialFlatList())
  await saveToFirebase('current')
}

const checkOverlap = (newList, lastList) => {
  if (!lastList || lastList.length === 0) return false
  for (let i = 0; i < newList.length; i++) {
    if (newList[i] && newList[i].studentId === lastList[i]) return true
  }
  return false
}

const shuffleSeats = () => {
  let shuffled = []
  let attempts = 0
  const maxAttempts = 100
  const currentStudents = seats.value.flat().filter(s => s !== null)
  const totalSeats = colConfig.value.reduce((sum, val) => sum + val, 0)

  do {
    shuffled = [...currentStudents]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    attempts++
  } while (checkOverlap(shuffled, lastArrangement.value) && attempts < maxAttempts)

  while (shuffled.length < totalSeats) shuffled.push(null)
  seats.value = structure(shuffled)
  saveToFirebase('shuffle')
}

const handleDragStart = (col, row) => { dragInfo.value = { col, row } }

const handleDrop = async (targetCol, targetRow) => {
  if (!dragInfo.value) return
  const { col: sCol, row: sRow } = dragInfo.value
  const temp = seats.value[targetCol][targetRow]
  seats.value[targetCol][targetRow] = seats.value[sCol][sRow]
  seats.value[sCol][sRow] = temp
  dragInfo.value = null
  
  await saveToFirebase('current')
}

const handlePrint = () => { window.print() }

const teacherViewSeats = computed(() => {
  if (!seats.value.length) return []
  const maxRows = Math.max(...colConfig.value)
  return [...seats.value].reverse().map((col, index) => {
    const reversedCol = [...col].reverse()
    while (reversedCol.length < maxRows) { reversedCol.unshift(null) }
    return reversedCol
  })
})

const openConfigModal = () => {
  tempColCount.value = colConfig.value.length
  tempRowCounts.value = [...colConfig.value]
  showConfigModal.value = true
}

const adjustRowCounts = () => {
  const count = Math.max(1, Math.min(10, tempColCount.value || 1))
  if (tempRowCounts.value.length < count) {
    while (tempRowCounts.value.length < count) tempRowCounts.value.push(6)
  } else if (tempRowCounts.value.length > count) {
    tempRowCounts.value = tempRowCounts.value.slice(0, count)
  }
}

const applyConfig = async () => {
  colConfig.value = [...tempRowCounts.value]
  showConfigModal.value = false

  const currentStudents = seats.value.flat().filter(s => s !== null)
  const totalSeats = colConfig.value.reduce((a, b) => a + b, 0)
  const flatList = []

  for (let i = 0; i < totalSeats; i++) {
    flatList.push(currentStudents[i] || null)
  }

  seats.value = structure(flatList)
  await saveToFirebase('config') 
  showToast('자리 형태가 변경되었습니다.')
}

onMounted(async () => {
  originalTitle = document.title
  document.title = '자리배치'

  if (studentStore.students.length === 0) {
    await studentStore.fetchStudents()
  } else {
    await loadSeats()
  }
})

onUnmounted(() => {
  if (originalTitle) document.title = originalTitle
})

// 💡 3. 학생 데이터 로드 혹은 학년/반 변경 시 다시 렌더링
watch([() => studentStore.students, myGrade, myClass], async () => {
  if (studentStore.students.length > 0) {
    await loadSeats()
  }
}, { immediate: true })

</script>

<template>
  <div class="seat-wrapper w-full relative">
    <transition name="fade">
      <div v-if="toastMessage" class="toast fixed top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-2.5 rounded-full font-bold shadow-xl z-50 flex items-center gap-2">
        <span>✅</span> {{ toastMessage }}
      </div>
    </transition>

    <div v-if="showConfigModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <h3 class="text-xl font-bold text-gray-800 mb-2">⚙️ 자리 형태(열/행) 설정</h3>
        <p class="text-sm text-gray-500 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-200">
          우리 반의 분단(열) 개수를 설정하고, 각 분단별로 책상이 몇 줄(행)씩 들어갈지 설정하세요.
        </p>

        <div class="mb-6">
          <label class="block text-sm font-bold text-indigo-700 mb-2">총 분단(세로 열) 개수</label>
          <input type="number" min="1" max="10" v-model.number="tempColCount" @input="adjustRowCounts" class="w-full p-3 border border-indigo-200 bg-indigo-50 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-lg font-bold">
        </div>

        <label class="block text-sm font-bold text-gray-700 mb-3">각 분단별 자리(행) 개수</label>
        <div class="grid grid-cols-3 gap-3 mb-8 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
          <div v-for="(count, index) in tempRowCounts" :key="index" class="bg-gray-50 p-3 rounded-lg border border-gray-200 text-center">
            <label class="block text-xs font-bold text-gray-500 mb-1">{{ index + 1 }}분단 ({{ index + 1 }}열)</label>
            <input type="number" min="1" max="15" v-model.number="tempRowCounts[index]" class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-center font-bold">
          </div>
        </div>

        <div class="flex justify-end gap-3">
          <button @click="showConfigModal = false" class="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors">취소</button>
          <button @click="applyConfig" class="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md">적용하기</button>
        </div>
      </div>
    </div>

    <div class="no-print">
      <header class="flex justify-between items-start mb-8 gap-4 flex-wrap">
        <div class="title-group">
          <h1 class="text-2xl font-bold text-gray-800 m-0 flex items-center gap-3">
            🪑 자리 배치
            <button @click="openConfigModal" class="text-sm font-bold bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-colors">
              ⚙️ 형태 설정 (현재 {{ colConfig.length }}열)
            </button>
          </h1>
          <div class="info-badge mt-2 text-sm text-gray-500 flex gap-2 font-bold">
            <span class="text-blue-600">{{ myGrade }}학년 {{ myClass }}반</span>
            <span>|</span>
            <span>👥 우리 반: {{ myRoomStudents.length }}명</span>
            <span>|</span>
            <span>🪑 총 좌석: {{ colConfig.reduce((a, b) => a + b, 0) }}석</span>
          </div>
        </div>
        <div class="button-group flex gap-3 flex-wrap">
          <button @click="teacherMode = !teacherMode" class="px-4 py-2 rounded-lg font-bold text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50" :class="{ '!bg-yellow-50 !border-yellow-400 !text-yellow-800': teacherMode }">
            {{ teacherMode ? '📋 명렬표 닫기' : '📋 명렬표 보기' }}
          </button>
          
          <button @click="saveToFirebase('history')" class="px-4 py-2 rounded-lg font-bold text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm">
            💾 현재 배치를 새 목록으로 저장
          </button>
          
          <button @click="handlePrint" class="px-4 py-2 rounded-lg font-bold text-sm bg-gray-800 text-white hover:bg-gray-900">🖨️ 인쇄하기</button>
          <button @click="shuffleSeats" class="px-4 py-2 rounded-lg font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 shadow-md">🎲 중복 피해 섞기</button>
        </div>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
        <SeatSidebar 
          :savedLayouts="savedLayouts" 
          :teacherMode="teacherMode" 
          :students="myRoomStudents"
          @clear="clearLayout"
          @load="loadLayout"
          @delete="deleteLayout"
        />

        <SeatGrid 
          :seats="seats"
          @dragstart="handleDragStart"
          @drop="handleDrop"
        />
      </div>
    </div>

    <SeatPrint 
      :seats="seats"
      :teacherViewSeats="teacherViewSeats"
      :students="myRoomStudents"
    />
  </div>
</template>

<style scoped>
/* 기존 스타일 동일 */
.fade-enter-active, .fade-leave-active { transition: all 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translate(-50%, -20px); }

.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }

@media print {
  .no-print { display: none !important; }
}
</style>