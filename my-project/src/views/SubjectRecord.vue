<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { collection, getDocs, getDoc, setDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import SubjectActivityPanel from '../components/SubjectActivityPanel.vue'

const students = ref([])
const subjects = ref([])
const selectedSubject = ref('')
const newSubjectName = ref('')
const isAddingSubject = ref(false)

const filterGrade = ref('전체')
const filterClass = ref('전체')
const selectedStudent = ref(null)

const enrolledIds = ref([])
const isEditingRoster = ref(false)

const bulkStudentIds = ref('')

onMounted(async () => {
  const savedSubjects = JSON.parse(localStorage.getItem('mySubjects') || '[]')
  if (savedSubjects.length === 0) {
    subjects.value = ['정보1', '정보2']
    localStorage.setItem('mySubjects', JSON.stringify(subjects.value))
  } else subjects.value = savedSubjects
  
  selectedSubject.value = subjects.value[0] || ''

  try {
    const snap = await getDocs(collection(db, 'students'))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    data.sort((a, b) => String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true }))
    students.value = data
  } catch (error) { console.error("학생 로드 에러:", error) }
})

const addSubject = () => {
  const name = newSubjectName.value.trim()
  if (!name || subjects.value.includes(name)) return
  subjects.value.push(name)
  localStorage.setItem('mySubjects', JSON.stringify(subjects.value))
  selectedSubject.value = name
  newSubjectName.value = ''
  isAddingSubject.value = false
}

const deleteSubject = (subjectToRemove) => {
  if (!confirm(`'${subjectToRemove}' 과목을 삭제하시겠습니까?`)) return
  subjects.value = subjects.value.filter(s => s !== subjectToRemove)
  localStorage.setItem('mySubjects', JSON.stringify(subjects.value))
  if (selectedSubject.value === subjectToRemove) selectedSubject.value = subjects.value[0] || ''
}

const fetchRoster = async () => {
  if (!selectedSubject.value) return
  try {
    const snap = await getDoc(doc(db, 'subjectRosters', selectedSubject.value))
    if (snap.exists()) enrolledIds.value = snap.data().studentIds || []
    else enrolledIds.value = []
  } catch (error) { console.error("명단 로드 에러:", error) }
}

// 💡 저장 시 알림창을 끌 수 있도록 개선 (개별 제외 시 조용히 저장하기 위함)
const saveRoster = async (silent = false) => {
  try {
    await setDoc(doc(db, 'subjectRosters', selectedSubject.value), { studentIds: enrolledIds.value })
    isEditingRoster.value = false
    if (!silent) alert('저장되었습니다.')
  } catch (error) { 
    if (!silent) alert('오류가 발생했습니다.') 
  }
}

// 💡 1. 명단에서 즉시 제외하는 기능 추가
const removeStudentFromRoster = async (student) => {
  if (!confirm(`${student.name} 학생을 수강 명단에서 제외하시겠습니까?`)) return
  
  // 배열에서 해당 학생 학번 쏙 빼기
  enrolledIds.value = enrolledIds.value.filter(id => id !== student.studentId)
  
  // 만약 지금 선택해서 보고 있던 학생이면 선택 해제
  if (selectedStudent.value?.studentId === student.studentId) {
    selectedStudent.value = null
  }
  
  // 조용히 데이터베이스에 갱신 저장
  await saveRoster(true)
}

const addStudentsByIds = () => {
  if (!bulkStudentIds.value.trim()) return alert('추가할 학번을 입력해주세요.')
  const idsToAdd = bulkStudentIds.value.split(/[\s,]+/).map(id => id.trim()).filter(id => id !== '')
  
  let addedCount = 0
  let notFoundIds = []

  idsToAdd.forEach(id => {
    const exists = students.value.some(s => s.studentId === id)
    if (exists) {
      if (!enrolledIds.value.includes(id)) {
        enrolledIds.value.push(id)
        addedCount++
      }
    } else notFoundIds.push(id)
  })

  bulkStudentIds.value = '' 
  if (notFoundIds.length > 0) alert(`✅ ${addedCount}명 추가 완료.\n⚠️ 다음 학번은 DB에서 찾을 수 없어 제외되었습니다: ${notFoundIds.join(', ')}`)
  else alert(`✅ ${addedCount}명의 학생이 추가되었습니다!`)
}

const filteredAllStudents = computed(() => students.value.filter(s => (filterGrade.value === '전체' || String(s.grade) === filterGrade.value) && (filterClass.value === '전체' || String(s.class) === filterClass.value)))
const enrolledStudents = computed(() => students.value.filter(s => enrolledIds.value.includes(s.studentId)))
const filteredEnrolledStudents = computed(() => enrolledStudents.value.filter(s => (filterGrade.value === '전체' || String(s.grade) === filterGrade.value) && (filterClass.value === '전체' || String(s.class) === filterClass.value)))

const toggleSelectAllFiltered = (e) => {
  const filteredIds = filteredAllStudents.value.map(s => s.studentId)
  if (e.target.checked) enrolledIds.value = [...new Set([...enrolledIds.value, ...filteredIds])]
  else enrolledIds.value = enrolledIds.value.filter(id => !filteredIds.includes(id))
}

watch(selectedSubject, () => { selectedStudent.value = null; isEditingRoster.value = false; fetchRoster() })

const selectStudent = (student) => { if (!isEditingRoster.value) selectedStudent.value = student }
</script>

<template>
  <div class="max-w-7xl mx-auto p-4 sm:p-6 font-sans">
    
    <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 border-b pb-4">
      <div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-900">📝 교과 수업 기록</h2>
        <p class="text-gray-600 mt-1 font-bold">과목별 학생들의 수업 태도와 세특을 기록합니다.</p>
      </div>
      
      <div class="flex items-center gap-2 bg-white p-2 border border-gray-200 rounded-xl shadow-sm">
        <span class="font-bold text-gray-800 text-sm pl-2">과목:</span>
        <select v-model="selectedSubject" class="p-2 border border-gray-300 rounded-lg outline-none font-bold text-gray-900 bg-white min-w-[120px]">
          <option v-for="sub in subjects" :key="sub" :value="sub">{{ sub }}</option>
        </select>
        
        <div v-if="isAddingSubject" class="flex gap-1 ml-2">
          <input v-model="newSubjectName" @keyup.enter="addSubject" type="text" placeholder="새 과목명" class="w-24 p-1.5 border border-blue-300 rounded text-sm bg-white outline-none text-gray-900">
          <button @click="addSubject" class="px-3 py-1.5 bg-blue-600 text-white font-bold rounded text-sm">추가</button>
          <button @click="isAddingSubject = false" class="px-2 py-1.5 bg-gray-200 text-gray-800 font-bold rounded text-sm">취소</button>
        </div>
        <div v-else class="flex gap-1 ml-2">
          <button @click="isAddingSubject = true" class="px-3 py-2 bg-gray-100 font-bold text-gray-800 rounded-lg text-sm">➕ 과목 추가</button>
          <button v-if="selectedSubject" @click="deleteSubject(selectedSubject)" class="px-3 py-2 text-red-600 font-bold rounded-lg text-sm">🗑️</button>
        </div>
      </div>
    </div>

    <div class="flex flex-col lg:flex-row gap-6">
      
      <div class="w-full lg:w-1/3 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col h-[75vh] overflow-hidden">
        <div class="p-4 border-b border-gray-200 bg-gray-50 flex flex-col gap-3 shrink-0">
          <div class="flex justify-between items-center">
            <h3 class="font-black text-gray-900 text-lg">{{ isEditingRoster ? '✏️ 수강생 선택' : '📚 수강생 명단' }}</h3>
            <button v-if="!isEditingRoster && selectedSubject" @click="isEditingRoster = true" class="px-3 py-1.5 bg-blue-100 text-blue-800 font-bold rounded-lg text-xs hover:bg-blue-200 transition-colors">➕ 명단 편집</button>
            <div v-if="isEditingRoster" class="flex gap-2">
              <button @click="isEditingRoster = false; fetchRoster()" class="px-3 py-1.5 bg-gray-200 text-gray-800 font-bold rounded-lg text-xs">취소</button>
              <button @click="saveRoster()" class="px-3 py-1.5 bg-blue-600 text-white font-bold rounded-lg text-xs shadow-sm">💾 명단 확정</button>
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
            <div v-if="!selectedSubject" class="text-center py-10 text-gray-500 font-medium text-sm">과목을 선택해주세요.</div>
            <div v-else-if="filteredEnrolledStudents.length === 0" class="text-center py-10 text-gray-500 font-medium text-sm">등록된 수강생이 없습니다.<br>[명단 편집]을 눌러 학생을 추가해주세요.</div>
            
            <div 
              v-for="student in filteredEnrolledStudents" 
              :key="student.id" 
              @click="selectStudent(student)" 
              class="w-full text-left p-3 mb-1 rounded-xl transition-colors flex justify-between items-center border group cursor-pointer" 
              :class="selectedStudent?.id === student.id ? 'bg-blue-50 border-blue-300 shadow-sm' : 'border-transparent hover:bg-gray-100'"
            >
              <div>
                <span class="font-bold text-sm mr-2" :class="selectedStudent?.id === student.id ? 'text-blue-800' : 'text-gray-800'">{{ student.grade }}학년 {{ student.class }}반 {{ student.number }}번</span>
                <span class="font-black" :class="selectedStudent?.id === student.id ? 'text-blue-900' : 'text-gray-900'">{{ student.name }}</span>
              </div>
              
              <button 
                @click.stop="removeStudentFromRoster(student)" 
                class="text-xs px-2 py-1 bg-red-100 text-red-600 font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200"
                title="명단에서 이 학생을 제외합니다"
              >
                제외
              </button>
            </div>
          </template>

          <template v-else>
            <div class="mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-200">
              <p class="text-xs font-bold text-indigo-800 mb-2">📌 엑셀 학번 일괄 추가 (띄어쓰기, 쉼표, 줄바꿈 허용)</p>
              <div class="flex gap-2">
                <textarea v-model="bulkStudentIds" rows="2" class="flex-1 p-2 border border-indigo-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white text-gray-900" placeholder="예: 10501, 10502 10503"></textarea>
                <button @click="addStudentsByIds" class="px-3 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 whitespace-nowrap shadow-sm">추가</button>
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

      <div class="w-full lg:w-2/3">
        <SubjectActivityPanel 
          :student="selectedStudent" 
          :subject="selectedSubject" 
          :isEditingRoster="isEditingRoster" 
        />
      </div>

    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
</style>