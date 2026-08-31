<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useStudentStore } from '../stores/studentStore'

import SeatSidebar from '../components/SeatSidebar.vue'
import SeatGrid from '../components/SeatGrid.vue'
import SeatPrint from '../components/SeatPrint.vue'
import SeatPhotoPrint from '../components/SeatPhotoPrint.vue' // 💡 추가됨

const studentStore = useStudentStore()

const teacherMode = ref(false)
const toastMessage = ref("")
const printType = ref('seat') // 'seat' 또는 'photo'

const colConfig = ref([5, 5, 6, 6, 5, 5])
const showConfigModal = ref(false)
const tempColCount = ref(6)
const tempRowCounts = ref([])

// 💡 좌석 제약 (금지 짝 / 앞자리 희망) — 이름은 소스코드에 넣지 않고 Firestore에만 저장
const showConstraintModal = ref(false)
const avoidPairs = ref([]) // [[studentIdA, studentIdB], ...]
const requiredPairs = ref([]) // [[studentIdA, studentIdB], ...] — 반드시 붙어 앉아야 하는 짝
const frontPreference = ref([]) // [studentId, ...]
const newPairA = ref('')
const newPairB = ref('')
const newReqA = ref('')
const newReqB = ref('')

const seats = ref([])
const dragInfo = ref(null)
const lastArrangement = ref([]) 
const savedLayouts = ref([])

let originalTitle = ''

// 💡 1. 우리 반(학년/반) 필터링
const myGrade = ref(localStorage.getItem('myGrade') || '1')
const myClass = ref(localStorage.getItem('myClass') || '1')

const myRoomStudents = computed(() => {
  return studentStore.students.filter(s =>
    !s.isArchived &&
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

// 💡 2. 데이터 로드 (우리 반 전용 경로 + 구버전 데이터 마이그레이션)
const loadSeats = async () => {
  const docId = `seatArrangement_${myGrade.value}_${myClass.value}`
  const arrangementRef = doc(db, 'settings', docId)
  let snap = await getDoc(arrangementRef)

  if (!snap.exists()) {
    const legacySnap = await getDoc(doc(db, 'settings', 'seatArrangement'))
    if (legacySnap.exists()) snap = legacySnap
  }

  if (snap && snap.exists()) {
    const data = snap.data()
    lastArrangement.value = data.last_arrangement || []
    savedLayouts.value = data.saved_layouts || [] 
    
    if (data.col_config) colConfig.value = data.col_config

    avoidPairs.value = data.avoid_pairs || []
    requiredPairs.value = data.required_pairs || []
    frontPreference.value = data.front_preference || []

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

const persistConstraints = async () => {
  const docId = `seatArrangement_${myGrade.value}_${myClass.value}`
  await setDoc(doc(db, 'settings', docId), {
    avoid_pairs: avoidPairs.value,
    required_pairs: requiredPairs.value,
    front_preference: frontPreference.value
  }, { merge: true })
}

const studentName = (studentId) => myRoomStudents.value.find(s => s.studentId === studentId)?.name || '(삭제된 학생)'

const addAvoidPair = () => {
  if (!newPairA.value || !newPairB.value || newPairA.value === newPairB.value) return
  const exists = avoidPairs.value.some(([a, b]) =>
    (a === newPairA.value && b === newPairB.value) || (a === newPairB.value && b === newPairA.value)
  )
  if (!exists) avoidPairs.value.push([newPairA.value, newPairB.value])
  newPairA.value = ''
  newPairB.value = ''
  persistConstraints()
}

const removeAvoidPair = (idx) => {
  avoidPairs.value.splice(idx, 1)
  persistConstraints()
}

const addRequiredPair = () => {
  if (!newReqA.value || !newReqB.value || newReqA.value === newReqB.value) return
  const exists = requiredPairs.value.some(([a, b]) =>
    (a === newReqA.value && b === newReqB.value) || (a === newReqB.value && b === newReqA.value)
  )
  if (!exists) requiredPairs.value.push([newReqA.value, newReqB.value])
  newReqA.value = ''
  newReqB.value = ''
  persistConstraints()
}

const removeRequiredPair = (idx) => {
  requiredPairs.value.splice(idx, 1)
  persistConstraints()
}

const toggleFrontPreference = (studentId) => {
  const idx = frontPreference.value.indexOf(studentId)
  if (idx === -1) frontPreference.value.push(studentId)
  else frontPreference.value.splice(idx, 1)
  persistConstraints()
}

const pairKey = (a, b) => [a, b].sort().join('|')

// 같은 분단의 앞/뒤(같은 열, 인접 행) + 같은 줄의 좌/우(인접 분단, 같은 행) 모두 검사
const violatesAvoidPairs = (structured) => {
  if (avoidPairs.value.length === 0) return false
  const avoidSet = new Set(avoidPairs.value.map(([a, b]) => pairKey(a, b)))
  for (let c = 0; c < structured.length; c++) {
    for (let r = 0; r < structured[c].length; r++) {
      const student = structured[c][r]
      if (!student) continue
      const neighbors = [
        structured[c][r - 1],
        structured[c][r + 1],
        c > 0 ? structured[c - 1][r] : null,
        c < structured.length - 1 ? structured[c + 1][r] : null,
      ]
      for (const n of neighbors) {
        if (n && avoidSet.has(pairKey(student.studentId, n.studentId))) return true
      }
    }
  }
  return false
}

// 좌석 그리드에서 물리적으로 인접한(앞뒤/좌우) 좌석 쌍 목록
const buildAdjacencyEdges = () => {
  const numCols = colConfig.value.length
  const edges = []
  for (let c = 0; c < numCols; c++) {
    for (let r = 0; r < colConfig.value[c]; r++) {
      if (r + 1 < colConfig.value[c]) edges.push([`${c}-${r}`, `${c}-${r + 1}`])
      if (c + 1 < numCols && r < colConfig.value[c + 1]) edges.push([`${c}-${r}`, `${c + 1}-${r}`])
    }
  }
  return edges
}

const isPairAdjacent = (structured, idA, idB) => {
  for (let c = 0; c < structured.length; c++) {
    for (let r = 0; r < structured[c].length; r++) {
      const student = structured[c][r]
      if (!student || student.studentId !== idA) continue
      const neighbors = [
        structured[c][r - 1],
        structured[c][r + 1],
        c > 0 ? structured[c - 1][r] : null,
        c < structured.length - 1 ? structured[c + 1][r] : null,
      ]
      if (neighbors.some(n => n && n.studentId === idB)) return true
    }
  }
  return false
}

const violatesRequiredPairs = (structured) => requiredPairs.value.some(([a, b]) => !isPairAdjacent(structured, a, b))

const saveToFirebase = async (mode = 'current') => {
  const flatList = seats.value.flat().map(s => s ? s.studentId : null)
  const docId = `seatArrangement_${myGrade.value}_${myClass.value}`
  const arrangementRef = doc(db, 'settings', docId)
  
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
  if (layout.colConfig) colConfig.value = layout.colConfig
  
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
  await setDoc(doc(db, 'settings', docId), { saved_layouts: updatedLayouts }, { merge: true })
  savedLayouts.value = updatedLayouts
  showToast("목록에서 삭제되었습니다.")
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

const shuffleArray = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 1) 함께 앉아야 하는 짝을 인접 좌석에 먼저 배치 → 2) 앞자리 희망자를 남은 좌석 중 앞줄부터 배치 → 3) 나머지는 무작위 배치
const buildShuffledArrangement = (currentStudents) => {
  const numCols = colConfig.value.length
  const byId = new Map(currentStudents.map(s => [s.studentId, s]))

  // 앞줄부터(행 우선) 좌석 순서를 만들고, 같은 줄 안에서는 분단 순서를 무작위로 섞는다
  const colOrder = shuffleArray([...Array(numCols).keys()])
  const maxRows = Math.max(...colConfig.value)
  const frontSlots = []
  for (let r = 0; r < maxRows; r++) {
    for (const c of colOrder) {
      if (r < colConfig.value[c]) frontSlots.push(`${c}-${r}`)
    }
  }
  const seatRank = {}
  frontSlots.forEach((key, i) => { seatRank[key] = i })

  const assignment = {}
  const usedSeats = new Set()
  const usedStudentIds = new Set()

  // 1) 함께 앉아야 하는 짝 배치 (인접한 빈 좌석 쌍 사용, 앞자리 희망이 섞인 짝은 더 앞쪽 좌석 우선)
  let edges = shuffleArray(buildAdjacencyEdges())
  const validRequiredPairs = shuffleArray(
    requiredPairs.value.filter(([a, b]) => byId.has(a) && byId.has(b) && a !== b)
  )
  for (const [idA, idB] of validRequiredPairs) {
    if (usedStudentIds.has(idA) || usedStudentIds.has(idB)) continue
    const wantsFront = frontPreference.value.includes(idA) || frontPreference.value.includes(idB)
    const orderedEdges = wantsFront
      ? [...edges].sort((e1, e2) => Math.max(seatRank[e1[0]], seatRank[e1[1]]) - Math.max(seatRank[e2[0]], seatRank[e2[1]]))
      : edges
    const edge = orderedEdges.find(([s1, s2]) => !usedSeats.has(s1) && !usedSeats.has(s2))
    if (!edge) continue // 배치 가능한 인접 빈 좌석이 없으면 아래 단계에서 개별 배치됨
    const [seatA, seatB] = Math.random() < 0.5 ? edge : [edge[1], edge[0]]
    assignment[seatA] = byId.get(idA)
    assignment[seatB] = byId.get(idB)
    usedSeats.add(seatA); usedSeats.add(seatB)
    usedStudentIds.add(idA); usedStudentIds.add(idB)
    edges = edges.filter(([s1, s2]) => !usedSeats.has(s1) && !usedSeats.has(s2))
  }

  // 2) 앞자리 희망 학생을 남은 좌석 중 앞줄부터 배치
  const remainingFrontSlots = frontSlots.filter(key => !usedSeats.has(key))
  const frontCandidates = shuffleArray(
    currentStudents.filter(s => frontPreference.value.includes(s.studentId) && !usedStudentIds.has(s.studentId))
  )
  frontCandidates.forEach((student, i) => {
    if (i < remainingFrontSlots.length) {
      const seatKey = remainingFrontSlots[i]
      assignment[seatKey] = student
      usedSeats.add(seatKey)
      usedStudentIds.add(student.studentId)
    }
  })

  // 3) 나머지 학생을 남은 좌석에 무작위 배치
  const remainingSeats = shuffleArray(frontSlots.filter(key => !usedSeats.has(key)))
  const remainingStudents = shuffleArray(currentStudents.filter(s => !usedStudentIds.has(s.studentId)))
  remainingSeats.forEach((seatKey, i) => {
    if (remainingStudents[i]) assignment[seatKey] = remainingStudents[i]
  })

  const result = Array.from({ length: numCols }, () => [])
  for (let c = 0; c < numCols; c++) {
    for (let r = 0; r < colConfig.value[c]; r++) {
      result[c].push(assignment[`${c}-${r}`] ?? null)
    }
  }
  return result
}

const shuffleSeats = async () => {
  const currentStudents = seats.value.flat().filter(s => s !== null)
  let structured
  let attempts = 0
  const maxAttempts = 200

  do {
    structured = buildShuffledArrangement(currentStudents)
    attempts++
  } while (
    attempts < maxAttempts &&
    (checkOverlap(structured.flat(), lastArrangement.value) || violatesAvoidPairs(structured) || violatesRequiredPairs(structured))
  )

  seats.value = structured
  await saveToFirebase('shuffle')

  if (violatesAvoidPairs(structured) || violatesRequiredPairs(structured)) {
    showToast('⚠️ 일부 좌석 제약(금지 짝 또는 함께 앉기)을 만족하지 못했어요. 다시 섞어보세요.')
  }
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

// 💡 3. 인쇄 트리거 (타입 지정)
const handlePrint = (type) => { 
  printType.value = type
  setTimeout(() => window.print(), 100)
}

const teacherViewSeats = computed(() => {
  if (!seats.value.length) return []
  const maxRows = Math.max(...colConfig.value)
  return [...seats.value].reverse().map((col) => {
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

    <div v-if="showConstraintModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
        <h3 class="text-xl font-bold text-gray-800 mb-2">🚫 좌석 제약 설정</h3>
        <p class="text-sm text-gray-500 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-200">
          여기서 입력한 내용은 이 학급의 Firestore 데이터에만 저장되고 소스코드에는 남지 않습니다.
        </p>

        <div class="mb-8">
          <label class="block text-sm font-bold text-gray-700 mb-3">함께 앉으면 안 되는 학생 (앞뒤·좌우 인접 모두 금지)</label>
          <div class="flex gap-2 mb-3">
            <select v-model="newPairA" class="flex-1 p-2 border border-gray-300 rounded-lg">
              <option value="">학생 선택</option>
              <option v-for="s in myRoomStudents" :key="s.studentId" :value="s.studentId">{{ s.name }}</option>
            </select>
            <select v-model="newPairB" class="flex-1 p-2 border border-gray-300 rounded-lg">
              <option value="">학생 선택</option>
              <option v-for="s in myRoomStudents" :key="s.studentId" :value="s.studentId">{{ s.name }}</option>
            </select>
            <button @click="addAvoidPair" class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors">추가</button>
          </div>
          <div class="flex flex-col gap-2">
            <div v-for="(pair, idx) in avoidPairs" :key="idx" class="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <span class="font-bold text-red-700">{{ studentName(pair[0]) }} ↔ {{ studentName(pair[1]) }}</span>
              <button @click="removeAvoidPair(idx)" class="text-red-500 hover:text-red-700 font-bold px-2">✕</button>
            </div>
            <p v-if="avoidPairs.length === 0" class="text-sm text-gray-400">등록된 제약이 없습니다.</p>
          </div>
        </div>

        <div class="mb-8">
          <label class="block text-sm font-bold text-gray-700 mb-3">함께 앉아야 하는 학생 (인접 좌석에 우선 배치)</label>
          <div class="flex gap-2 mb-3">
            <select v-model="newReqA" class="flex-1 p-2 border border-gray-300 rounded-lg">
              <option value="">학생 선택</option>
              <option v-for="s in myRoomStudents" :key="s.studentId" :value="s.studentId">{{ s.name }}</option>
            </select>
            <select v-model="newReqB" class="flex-1 p-2 border border-gray-300 rounded-lg">
              <option value="">학생 선택</option>
              <option v-for="s in myRoomStudents" :key="s.studentId" :value="s.studentId">{{ s.name }}</option>
            </select>
            <button @click="addRequiredPair" class="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors">추가</button>
          </div>
          <div class="flex flex-col gap-2">
            <div v-for="(pair, idx) in requiredPairs" :key="idx" class="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              <span class="font-bold text-emerald-700">{{ studentName(pair[0]) }} ↔ {{ studentName(pair[1]) }}</span>
              <button @click="removeRequiredPair(idx)" class="text-emerald-500 hover:text-emerald-700 font-bold px-2">✕</button>
            </div>
            <p v-if="requiredPairs.length === 0" class="text-sm text-gray-400">등록된 짝이 없습니다.</p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-bold text-gray-700 mb-3">앞자리 희망 학생 (섞기 시 앞줄부터 우선 배치, 인원이 많으면 2·3번째 줄까지 확장)</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="s in myRoomStudents"
              :key="s.studentId"
              @click="toggleFrontPreference(s.studentId)"
              type="button"
              class="px-3 py-1.5 rounded-full text-sm font-bold border transition-colors"
              :class="frontPreference.includes(s.studentId) ? 'bg-amber-400 border-amber-500 text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'"
            >
              {{ s.name }}
            </button>
          </div>
        </div>

        <div class="flex justify-end mt-8">
          <button @click="showConstraintModal = false" class="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors">닫기</button>
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
          </div>
        </div>
        <div class="button-group flex gap-2 flex-wrap items-center">
          <button @click="teacherMode = !teacherMode" class="px-4 py-2 rounded-lg font-bold text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">
            {{ teacherMode ? '📋 명렬표 닫기' : '📋 명렬표 보기' }}
          </button>
          <button @click="saveToFirebase('history')" class="px-4 py-2 rounded-lg font-bold text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm">
            💾 배치 저장
          </button>
          <button @click="showConstraintModal = true" class="px-4 py-2 rounded-lg font-bold text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm">
            🚫 좌석 제약
          </button>
          <button @click="shuffleSeats" class="px-4 py-2 rounded-lg font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 shadow-md">
            🎲 중복 피해 섞기
          </button>
          
          <div class="flex bg-gray-800 rounded-lg p-1 ml-2 shadow-md gap-1">
            <button @click="handlePrint('seat')" class="px-3 py-1.5 rounded text-sm font-bold text-white hover:bg-gray-700 transition-colors">🖨️ 일반 자리표</button>
            <div class="w-px bg-gray-600 my-1 mx-0.5"></div>
            <button @click="handlePrint('photo')" class="px-3 py-1.5 rounded text-sm font-bold text-amber-300 hover:bg-gray-700 transition-colors">📸 사진 명렬표</button>
          </div>
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

    <div class="print-area hidden print:block w-full">
      <SeatPrint 
        v-if="printType === 'seat'"
        :seats="seats"
        :teacherViewSeats="teacherViewSeats"
        :students="myRoomStudents"
        :myGrade="myGrade"
        :myClass="myClass"
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
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
@media print { .no-print { display: none !important; } }
</style>