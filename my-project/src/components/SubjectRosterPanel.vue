<script setup>
import { ref, computed, watch } from 'vue'
import { getDoc, setDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'

const props = defineProps({
  students: { type: Array, required: true },
  subject: { type: String, required: true },
  selectedStudent: { type: Object, default: null },
  isEditingRoster: { type: Boolean, required: true }
})

const emit = defineEmits(['update:selectedStudent', 'update:isEditingRoster'])

const filterGrade = ref('전체')
const filterClass = ref('전체')
const enrolledIds = ref([])
const bulkStudentIds = ref('')

// 명단 로드
const fetchRoster = async () => {
  if (!props.subject) return
  try {
    const snap = await getDoc(doc(db, 'subjectRosters', props.subject))
    if (snap.exists()) enrolledIds.value = snap.data().studentIds || []
    else enrolledIds.value = []
  } catch (error) { console.error("명단 로드 에러:", error) }
}

// 과목이 바뀔 때마다 명단 새로 불러오기
watch(() => props.subject, fetchRoster, { immediate: true })

// 명단 저장
const saveRoster = async (silent = false) => {
  try {
    await setDoc(doc(db, 'subjectRosters', props.subject), { studentIds: enrolledIds.value })
    emit('update:isEditingRoster', false)
    if (!silent) alert('수강생 명단이 저장되었습니다.')
  } catch (error) { 
    if (!silent) alert('오류가 발생했습니다.') 
  }
}

// 학생 개별 제외
const removeStudentFromRoster = async (student) => {
  if (!confirm(`${student.name} 학생을 수강 명단에서 제외하시겠습니까?`)) return
  enrolledIds.value = enrolledIds.value.filter(id => id !== student.studentId)
  if (props.selectedStudent?.studentId === student.studentId) emit('update:selectedStudent', null)
  await saveRoster(true)
}

// 학번 일괄 추가
const addStudentsByIds = () => {
  if (!bulkStudentIds.value.trim()) return alert('추가할 학번을 입력해주세요.')
  const idsToAdd = bulkStudentIds.value.split(/[\s,]+/).map(id => id.trim()).filter(id => id !== '')
  let addedCount = 0
  let notFoundIds = []

  idsToAdd.forEach(id => {
    const exists = props.students.some(s => s.studentId === id)
    if (exists) {
      if (!enrolledIds.value.includes(id)) { enrolledIds.value.push(id); addedCount++ }
    } else notFoundIds.push(id)
  })

  bulkStudentIds.value = '' 
  if (notFoundIds.length > 0) alert(`✅ ${addedCount}명 추가 완료.\n⚠️ 다음 학번은 찾을 수 없어 제외되었습니다: ${notFoundIds.join(', ')}`)
  else alert(`✅ ${addedCount}명의 학생이 추가되었습니다!`)
}

// 필터링 계산
const filteredAllStudents = computed(() => props.students.filter(s => (filterGrade.value === '전체' || String(s.grade) === filterGrade.value) && (filterClass.value === '전체' || String(s.class) === filterClass.value)))
const enrolledStudents = computed(() => props.students.filter(s => enrolledIds.value.includes(s.studentId)))
const filteredEnrolledStudents = computed(() => enrolledStudents.value.filter(s => (filterGrade.value === '전체' || String(s.grade) === filterGrade.value) && (filterClass.value === '전체' || String(s.class) === filterClass.value)))

// 체크박스 전체 선택 토글
const toggleSelectAllFiltered = (e) => {
  const filteredIds = filteredAllStudents.value.map(s => s.studentId)
  if (e.target.checked) enrolledIds.value = [...new Set([...enrolledIds.value, ...filteredIds])]
  else enrolledIds.value = enrolledIds.value.filter(id => !filteredIds.includes(id))
}

const selectStudent = (student) => { 
  if (!props.isEditingRoster) emit('update:selectedStudent', student)
}

const cancelEdit = () => {
  emit('update:isEditingRoster', false)
  fetchRoster()
}
</script>

<template>
  <div class="w-full bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col h-[75vh] overflow-hidden">
    
    <div class="p-4 border-b border-gray-200 bg-gray-50 flex flex-col gap-3 shrink-0">
      <div class="flex justify-between items-center">
        <h3 class="font-black text-gray-900 text-lg">{{ isEditingRoster ? '✏️ 수강생 선택' : '📚 수강생 명단' }}</h3>
        <button v-if="!isEditingRoster && subject" @click="emit('update:isEditingRoster', true)" class="px-3 py-1.5 bg-blue-100 text-blue-800 font-bold rounded-lg text-xs hover:bg-blue-200 transition-colors">➕ 명단 편집</button>
        <div v-if="isEditingRoster" class="flex gap-2">
          <button @click="cancelEdit" class="px-3 py-1.5 bg-gray-200 text-gray-800 font-bold rounded-lg text-xs">취소</button>
          <button @click="saveRoster(false)" class="px-3 py-1.5 bg-blue-600 text-white font-bold rounded-lg text-xs shadow-sm">💾 명단 확정</button>
        </div>
      </div>

      <div v-if="!isEditingRoster" class="flex gap-2">
        <select v-model="filterGrade" class="w-1/2 p-2 border border-gray-300 rounded-lg outline-none font-bold text-gray-900 bg-white text-sm">
          <option value="전체">학년 전체</option><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option>
        </select>
        <select v-model="filterClass" class="w-1/2 p-2 border border-gray-300 rounded-lg outline-none font-bold text-gray-900 bg-white text-sm">
          <option value="전체">반 전체</option><option v-for="c in 15" :key="c" :value="String(c)">{{ c }}반</option>
        </select>
      </div>
    </div>

    <div class="overflow-y-auto flex-1 p-2 custom-scrollbar bg-white">
      <template v-if="!isEditingRoster">
        <div v-if="!subject" class="text-center py-10 text-gray-500 font-medium text-sm">과목을 선택해주세요.</div>
        <div v-else-if="filteredEnrolledStudents.length === 0" class="text-center py-10 text-gray-500 font-medium text-sm">등록된 수강생이 없습니다.<br>[명단 편집]을 눌러 학생을 추가해주세요.</div>
        
        <div v-for="student in filteredEnrolledStudents" :key="student.id" @click="selectStudent(student)" class="w-full text-left p-3 mb-1 rounded-xl transition-colors flex justify-between items-center border group cursor-pointer" :class="selectedStudent?.id === student.id ? 'bg-blue-50 border-blue-300 shadow-sm' : 'border-transparent hover:bg-gray-100'">
          <div>
            <span class="font-bold text-sm mr-2" :class="selectedStudent?.id === student.id ? 'text-blue-800' : 'text-gray-800'">{{ student.grade }}학년 {{ student.class }}반 {{ student.number }}번</span>
            <span class="font-black" :class="selectedStudent?.id === student.id ? 'text-blue-900' : 'text-gray-900'">{{ student.name }}</span>
          </div>
          <button @click.stop="removeStudentFromRoster(student)" class="text-xs px-2 py-1 bg-red-100 text-red-600 font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200" title="제외">제외</button>
        </div>
      </template>

      <template v-else>
        <div class="mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-200">
          <p class="text-xs font-bold text-indigo-800 mb-2">📌 엑셀 학번 일괄 추가 (띄어쓰기, 쉼표 등 허용)</p>
          <div class="flex gap-2">
            <textarea v-model="bulkStudentIds" rows="2" class="flex-1 p-2 border border-indigo-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white text-gray-900" placeholder="예: 10501, 10502"></textarea>
            <button @click="addStudentsByIds" class="px-3 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 shadow-sm">추가</button>
          </div>
        </div>

        <div class="flex gap-2 mb-2">
          <select v-model="filterGrade" class="w-1/2 p-2 border border-gray-300 rounded-lg outline-none font-bold text-gray-900 bg-white text-sm">
            <option value="전체">학년 전체</option><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option>
          </select>
          <select v-model="filterClass" class="w-1/2 p-2 border border-gray-300 rounded-lg outline-none font-bold text-gray-900 bg-white text-sm">
            <option value="전체">반 전체</option><option v-for="c in 15" :key="c" :value="String(c)">{{ c }}반</option>
          </select>
        </div>
        
        <div class="mb-2 p-2 bg-blue-50 rounded-lg flex items-center gap-2 border border-blue-100">
          <input type="checkbox" @change="toggleSelectAllFiltered" class="w-4 h-4 accent-blue-600 cursor-pointer"><span class="text-sm font-bold text-blue-900">조회된 학생 전체 선택</span>
        </div>
        
        <label v-for="student in filteredAllStudents" :key="'edit'+student.id" class="w-full flex items-center p-3 mb-1 rounded-xl transition-colors hover:bg-gray-50 border border-transparent cursor-pointer">
          <input type="checkbox" :value="student.studentId" v-model="enrolledIds" class="w-4 h-4 accent-blue-600 mr-3">
          <span class="font-bold text-sm text-gray-800 flex-1">{{ student.grade }}학년 {{ student.class }}반 {{ student.number }}번</span>
          <span class="font-black text-gray-900">{{ student.name }}</span>
        </label>
      </template>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
</style>