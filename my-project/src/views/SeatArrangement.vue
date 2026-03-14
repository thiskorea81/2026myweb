<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useStudentStore } from '../stores/studentStore'

// 💡 분리된 컴포넌트 임포트
import SeatConfigModal from '../components/SeatConfigModal.vue'
import SeatHeader from '../components/SeatHeader.vue'
import SeatSidebar from '../components/SeatSidebar.vue'
import SeatGrid from '../components/SeatGrid.vue'
import SeatPrint from '../components/SeatPrint.vue'
import SeatPhotoPrint from '../components/SeatPhotoPrint.vue'

const studentStore = useStudentStore()

const teacherMode = ref(false)
const toastMessage = ref("")
const printType = ref('seat') // 'seat' 또는 'photo'

const colConfig = ref([5, 5, 6, 6, 5, 5]) 
const showConfigModal = ref(false)
const seats = ref([])
const dragInfo = ref(null)
const lastArrangement = ref([]) 
const savedLayouts = ref([])

let originalTitle = ''

const myGrade = ref(localStorage.getItem('myGrade') || '1')
const myClass = ref(localStorage.getItem('myClass') || '1')

const myRoomStudents = computed(() => {
  return studentStore.students.filter(s => 
    String(s.grade) === String(myGrade.value) && String(s.class) === String(myClass.value)
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
  const docId = `seatArrangement_${myGrade.value}_${myClass.value}`
  let snap = await getDoc(doc(db, 'settings', docId))

  if (!snap.exists()) {
    const legacySnap = await getDoc(doc(db, 'settings', 'seatArrangement'))
    if (legacySnap.exists()) snap = legacySnap
  }

  if (snap && snap.exists()) {
    const data = snap.data()
    lastArrangement.value = data.last_arrangement || []
    savedLayouts.value = data.saved_layouts || [] 
    if (data.col_config) colConfig.value = data.col_config
    if (data.current_seats && data.current_seats.length > 0) {
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
  let updateData = { current_seats: flatList, col_config: colConfig.value }

  if (mode === 'shuffle') {
    updateData.last_arrangement = flatList
    lastArrangement.value = flatList
  } else if (mode === 'history') {
    const name = prompt("저장할 자리 배치의 이름을 입력하세요 (예: 1학기 중간고사)")
    if (!name) return 
    const newLayout = { id: Date.now(), name, date: new Date().toLocaleDateString(), seats: flatList, colConfig: colConfig.value }
    updateData.saved_layouts = [...savedLayouts.value, newLayout]
    updateData.last_arrangement = flatList
    savedLayouts.value = updateData.saved_layouts
    lastArrangement.value = flatList
  }

  await setDoc(doc(db, 'settings', docId), updateData, { merge: true })
  if (mode === 'history') showToast(`'${updateData.saved_layouts.slice(-1)[0].name}' 배치가 저장되었습니다.`)
  if (mode === 'shuffle') showToast("자리가 랜덤으로 배치되었습니다.")
}

const applyConfig = async (newConfig) => {
  colConfig.value = newConfig
  showConfigModal.value = false
  const currentStudents = seats.value.flat().filter(s => s !== null)
  const totalSeats = colConfig.value.reduce((a, b) => a + b, 0)
  const flatList = []
  for (let i = 0; i < totalSeats; i++) flatList.push(currentStudents[i] || null)
  seats.value = structure(flatList)
  await saveToFirebase('config') 
  showToast('자리 형태가 변경되었습니다.')
}

const loadLayout = async (layout) => {
  if (!confirm(`'${layout.name}' 배치를 불러오시겠습니까?`)) return
  if (layout.colConfig) colConfig.value = layout.colConfig
  const loadedStudents = layout.seats.map(studentId => studentId ? myRoomStudents.value.find(s => s.studentId === studentId) || null : null)
  seats.value = structure(loadedStudents)
  await saveToFirebase('current')
  showToast("배치를 불러왔습니다.")
}

const deleteLayout = async (id) => {
  if (!confirm("이 배치 기록을 목록에서 삭제하시겠습니까?")) return
  const updatedLayouts = savedLayouts.value.filter(l => l.id !== id)
  await setDoc(doc(db, 'settings', `seatArrangement_${myGrade.value}_${myClass.value}`), { saved_layouts: updatedLayouts }, { merge: true })
  savedLayouts.value = updatedLayouts
  showToast("목록에서 삭제되었습니다.")
}

const clearLayout = async () => {
  if (!confirm("모든 배치를 초기화하고 기본 번호 순서대로 정렬하시겠습니까?")) return
  seats.value = structure(getInitialFlatList())
  await saveToFirebase('current')
}

const shuffleSeats = () => {
  let shuffled = []
  let attempts = 0
  const currentStudents = seats.value.flat().filter(s => s !== null)
  const totalSeats = colConfig.value.reduce((sum, val) => sum + val, 0)
  const checkOverlap = (newList) => lastArrangement.value.length && newList.some((s, i) => s && s.studentId === lastArrangement.value[i])

  do {
    shuffled = [...currentStudents].sort(() => Math.random() - 0.5)
    attempts++
  } while (checkOverlap(shuffled) && attempts < 100)

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

// 💡 인쇄 트리거 로직
const triggerPrint = (type) => {
  printType.value = type
  setTimeout(() => window.print(), 100)
}

const teacherViewSeats = computed(() => {
  if (!seats.value.length) return []
  const maxRows = Math.max(...colConfig.value)
  return [...seats.value].reverse().map(col => {
    const reversedCol = [...col].reverse()
    while (reversedCol.length < maxRows) reversedCol.unshift(null)
    return reversedCol
  })
})

onMounted(async () => {
  originalTitle = document.title
  document.title = '자리배치'
  if (studentStore.students.length === 0) await studentStore.fetchStudents()
  else await loadSeats()
})

onUnmounted(() => { if (originalTitle) document.title = originalTitle })

watch([() => studentStore.students, myGrade, myClass], async () => {
  if (studentStore.students.length > 0) await loadSeats()
}, { immediate: true })
</script>

<template>
  <div class="seat-wrapper w-full relative">
    <transition name="fade">
      <div v-if="toastMessage" class="toast fixed top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-2.5 rounded-full font-bold shadow-xl z-50 flex items-center gap-2">
        <span>✅</span> {{ toastMessage }}
      </div>
    </transition>

    <SeatConfigModal 
      :show="showConfigModal" 
      :initialConfig="colConfig" 
      @close="showConfigModal = false" 
      @apply="applyConfig" 
    />

    <div class="no-print">
      <SeatHeader 
        :colConfigLength="colConfig.length"
        :myGrade="myGrade"
        :myClass="myClass"
        :myRoomStudentsLength="myRoomStudents.length"
        :totalSeats="colConfig.reduce((a, b) => a + b, 0)"
        :teacherMode="teacherMode"
        @open-config="showConfigModal = true"
        @toggle-teacher-mode="teacherMode = !teacherMode"
        @save-history="saveToFirebase('history')"
        @shuffle="shuffleSeats"
        @print-seat="triggerPrint('seat')"
        @print-photo="triggerPrint('photo')"
      />

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

    <div class="print-area hidden print:block">
      <SeatPrint 
        v-if="printType === 'seat'"
        :seats="seats"
        :teacherViewSeats="teacherViewSeats"
        :students="myRoomStudents"
      />
      <SeatPhotoPrint 
        v-if="printType === 'photo'"
        :teacherViewSeats="teacherViewSeats"
        :myGrade="myGrade"
        :myClass="myClass"
      />
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: all 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translate(-50%, -20px); }

@media print {
  .no-print { display: none !important; }
}
</style>