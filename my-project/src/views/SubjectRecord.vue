<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { collection, getDocs, getDoc, setDoc, addDoc, deleteDoc, doc, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// 💡 상태 관리
const students = ref([])
const subjects = ref([])
const selectedSubject = ref('')
const newSubjectName = ref('')
const isAddingSubject = ref(false)

const filterGrade = ref('전체')
const filterClass = ref('전체')
const selectedStudent = ref(null)

const records = ref([])
const recordDate = ref(new Date().toISOString().substring(0, 10))
const recordContent = ref('')
const isLoadingRecords = ref(false)
const isSaving = ref(false)

// 💡 수강생 명단 관련 상태
const enrolledIds = ref([]) // 현재 과목에 등록된 학번 배열
const isEditingRoster = ref(false) // 명단 편집 모드 여부

// 1. 초기 데이터 로드
onMounted(async () => {
  const savedSubjects = JSON.parse(localStorage.getItem('mySubjects') || '[]')
  if (savedSubjects.length === 0) {
    subjects.value = ['정보1', '정보2']
    localStorage.setItem('mySubjects', JSON.stringify(subjects.value))
  } else {
    subjects.value = savedSubjects
  }
  selectedSubject.value = subjects.value[0] || ''

  try {
    const snap = await getDocs(collection(db, 'students'))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    data.sort((a, b) => String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true }))
    students.value = data
  } catch (error) {
    console.error("학생 명단 로드 에러:", error)
  }
})

// 2. 과목 관리
const addSubject = () => {
  const name = newSubjectName.value.trim()
  if (!name) return
  if (subjects.value.includes(name)) return alert('이미 존재하는 과목입니다.')
  
  subjects.value.push(name)
  localStorage.setItem('mySubjects', JSON.stringify(subjects.value))
  selectedSubject.value = name
  newSubjectName.value = ''
  isAddingSubject.value = false
}

const deleteSubject = (subjectToRemove) => {
  if (!confirm(`'${subjectToRemove}' 과목을 목록에서 삭제하시겠습니까?\n(작성된 학생들의 기록은 DB에 남아있습니다)`)) return
  subjects.value = subjects.value.filter(s => s !== subjectToRemove)
  localStorage.setItem('mySubjects', JSON.stringify(subjects.value))
  if (selectedSubject.value === subjectToRemove) selectedSubject.value = subjects.value[0] || ''
}

// 💡 3. 수강 명단 불러오기 및 저장
const fetchRoster = async () => {
  if (!selectedSubject.value) return
  try {
    const snap = await getDoc(doc(db, 'subjectRosters', selectedSubject.value))
    if (snap.exists()) {
      enrolledIds.value = snap.data().studentIds || []
    } else {
      enrolledIds.value = []
    }
  } catch (error) {
    console.error("명단 로드 에러:", error)
  }
}

const saveRoster = async () => {
  try {
    await setDoc(doc(db, 'subjectRosters', selectedSubject.value), {
      studentIds: enrolledIds.value
    })
    isEditingRoster.value = false
    alert('수강생 명단이 저장되었습니다.')
  } catch (error) {
    alert('명단 저장 중 오류가 발생했습니다.')
  }
}

// 💡 4. 필터링 로직
const filteredAllStudents = computed(() => {
  return students.value.filter(s => {
    const matchGrade = filterGrade.value === '전체' || String(s.grade) === filterGrade.value
    const matchClass = filterClass.value === '전체' || String(s.class) === filterClass.value
    return matchGrade && matchClass
  })
})

const enrolledStudents = computed(() => {
  return students.value.filter(s => enrolledIds.value.includes(s.studentId))
})

const filteredEnrolledStudents = computed(() => {
  return enrolledStudents.value.filter(s => {
    const matchGrade = filterGrade.value === '전체' || String(s.grade) === filterGrade.value
    const matchClass = filterClass.value === '전체' || String(s.class) === filterClass.value
    return matchGrade && matchClass
  })
})

// 전체 선택 토글 (필터링된 목록 기준)
const toggleSelectAllFiltered = (e) => {
  const filteredIds = filteredAllStudents.value.map(s => s.studentId)
  if (e.target.checked) {
    // 기존 명단에 필터링된 학생들 추가 (중복 제거)
    enrolledIds.value = [...new Set([...enrolledIds.value, ...filteredIds])]
  } else {
    // 기존 명단에서 필터링된 학생들 제거
    enrolledIds.value = enrolledIds.value.filter(id => !filteredIds.includes(id))
  }
}

// 5. 과목이 바뀌면 명단과 기록 새로고침
watch(selectedSubject, () => {
  selectedStudent.value = null
  records.value = []
  isEditingRoster.value = false
  fetchRoster()
})

watch([selectedStudent, selectedSubject], async () => {
  if (!selectedStudent.value || !selectedSubject.value) return
  isLoadingRecords.value = true
  try {
    const q = query(
      collection(db, 'subjectRecords'),
      where('studentId', '==', selectedStudent.value.studentId),
      where('subject', '==', selectedSubject.value)
    )
    const snap = await getDocs(q)
    let data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    data.sort((a, b) => new Date(b.date) - new Date(a.date))
    records.value = data
  } catch (error) {
    console.error("기록 로드 에러:", error)
  } finally {
    isLoadingRecords.value = false
  }
})

const selectStudent = (student) => {
  if (isEditingRoster.value) return // 편집 모드일 땐 선택 불가
  selectedStudent.value = student
}

// 6. 기록 저장 및 삭제
const saveRecord = async () => {
  if (!recordContent.value.trim() || !recordDate.value) return alert('날짜와 내용을 모두 입력해주세요.')
  isSaving.value = true

  try {
    const newRecord = {
      studentId: selectedStudent.value.studentId,
      studentName: selectedStudent.value.name,
      subject: selectedSubject.value,
      date: recordDate.value,
      content: recordContent.value,
      createdAt: new Date().toISOString()
    }
    await addDoc(collection(db, 'subjectRecords'), newRecord)
    
    recordContent.value = ''
    // 트리거용 재선택
    const temp = selectedStudent.value
    selectedStudent.value = null
    setTimeout(() => { selectedStudent.value = temp }, 50)
  } catch (error) {
    alert('저장 중 오류가 발생했습니다.')
  } finally {
    isSaving.value = false
  }
}

const deleteRecord = async (recordId) => {
  if (!confirm('이 기록을 삭제하시겠습니까?')) return
  try {
    await deleteDoc(doc(db, 'subjectRecords', recordId))
    const temp = selectedStudent.value
    selectedStudent.value = null
    setTimeout(() => { selectedStudent.value = temp }, 50)
  } catch (error) {
    alert('삭제 실패')
  }
}
</script>

<template>
  <div class="max-w-7xl mx-auto p-4 sm:p-6 font-sans">
    
    <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 border-b pb-4">
      <div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">📝 교과 수업 기록</h2>
        <p class="text-gray-600 mt-1 font-bold">과목별 학생들의 수업 태도와 활동(세특)을 기록합니다.</p>
      </div>
      
      <div class="flex items-center gap-2 bg-white p-2 border border-gray-200 rounded-xl shadow-sm">
        <span class="font-bold text-gray-800 text-sm pl-2">과목:</span>
        <select v-model="selectedSubject" class="p-2 border border-gray-300 rounded-lg outline-none font-bold text-gray-900 bg-white min-w-[120px]">
          <option disabled value="">과목을 선택하세요</option>
          <option v-for="sub in subjects" :key="sub" :value="sub">{{ sub }}</option>
        </select>
        
        <div v-if="isAddingSubject" class="flex gap-1 ml-2">
          <input v-model="newSubjectName" @keyup.enter="addSubject" type="text" placeholder="새 과목명" class="w-24 p-1.5 border border-blue-300 rounded text-sm bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-500">
          <button @click="addSubject" class="px-3 py-1.5 bg-blue-600 text-white font-bold rounded text-sm hover:bg-blue-700">추가</button>
          <button @click="isAddingSubject = false" class="px-2 py-1.5 bg-gray-200 text-gray-800 font-bold rounded text-sm hover:bg-gray-300">취소</button>
        </div>
        <div v-else class="flex gap-1 ml-2">
          <button @click="isAddingSubject = true" class="px-3 py-2 bg-gray-100 text-gray-800 font-bold rounded-lg text-sm hover:bg-gray-200 transition-colors">➕ 과목 추가</button>
          <button v-if="selectedSubject" @click="deleteSubject(selectedSubject)" class="px-3 py-2 text-red-600 hover:bg-red-50 font-bold rounded-lg text-sm transition-colors" title="현재 과목 삭제">🗑️</button>
        </div>
      </div>
    </div>

    <div class="flex flex-col lg:flex-row gap-6">
      
      <div class="w-full lg:w-1/3 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col h-[75vh] overflow-hidden">
        
        <div class="p-4 border-b border-gray-200 bg-gray-50 flex flex-col gap-3 shrink-0">
          <div class="flex justify-between items-center">
            <h3 class="font-black text-gray-900 text-lg">
              {{ isEditingRoster ? '✏️ 수강생 선택' : '📚 수강생 명단' }}
            </h3>
            <button v-if="!isEditingRoster && selectedSubject" @click="isEditingRoster = true" class="px-3 py-1.5 bg-blue-100 text-blue-800 font-bold rounded-lg text-xs hover:bg-blue-200 transition-colors">
              ➕ 명단 편집
            </button>
            <div v-if="isEditingRoster" class="flex gap-2">
              <button @click="isEditingRoster = false; fetchRoster()" class="px-3 py-1.5 bg-gray-200 text-gray-800 font-bold rounded-lg text-xs hover:bg-gray-300">취소</button>
              <button @click="saveRoster" class="px-3 py-1.5 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-700 shadow-sm">💾 저장</button>
            </div>
          </div>

          <div class="flex gap-2">
            <select v-model="filterGrade" class="w-1/2 p-2 border border-gray-300 rounded-lg outline-none font-bold text-gray-900 bg-white text-sm">
              <option value="전체">학년 전체</option>
              <option value="1">1학년</option>
              <option value="2">2학년</option>
              <option value="3">3학년</option>
            </select>
            <select v-model="filterClass" class="w-1/2 p-2 border border-gray-300 rounded-lg outline-none font-bold text-gray-900 bg-white text-sm">
              <option value="전체">반 전체</option>
              <option v-for="c in 15" :key="c" :value="String(c)">{{ c }}반</option>
            </select>
          </div>
        </div>

        <div class="overflow-y-auto flex-1 p-2 custom-scrollbar bg-white">
          
          <template v-if="!isEditingRoster">
            <div v-if="!selectedSubject" class="text-center py-10 text-gray-500 font-medium text-sm">과목을 먼저 선택해주세요.</div>
            <div v-else-if="enrolledStudents.length === 0" class="text-center py-10 text-gray-500 font-medium text-sm">
              등록된 수강생이 없습니다.<br>[명단 편집]을 눌러 학생을 추가해주세요.
            </div>
            <button 
              v-for="student in filteredEnrolledStudents" 
              :key="student.id" 
              @click="selectStudent(student)"
              class="w-full text-left p-3 mb-1 rounded-xl transition-colors flex justify-between items-center border"
              :class="selectedStudent?.id === student.id ? 'bg-blue-50 border-blue-300 shadow-sm' : 'border-transparent hover:bg-gray-100'"
            >
              <span class="font-bold text-sm" :class="selectedStudent?.id === student.id ? 'text-blue-800' : 'text-gray-800'">
                {{ student.grade }}학년 {{ student.class }}반 {{ student.number }}번
              </span>
              <span class="font-black" :class="selectedStudent?.id === student.id ? 'text-blue-900' : 'text-gray-900'">
                {{ student.name }}
              </span>
            </button>
          </template>

          <template v-else>
            <div class="mb-2 p-2 bg-blue-50 rounded-lg flex items-center gap-2 border border-blue-100">
              <input type="checkbox" @change="toggleSelectAllFiltered" class="w-4 h-4 accent-blue-600 cursor-pointer">
              <span class="text-sm font-bold text-blue-900">조회된 학생 전체 선택</span>
            </div>
            <label 
              v-for="student in filteredAllStudents" 
              :key="'edit'+student.id" 
              class="w-full flex items-center p-3 mb-1 rounded-xl transition-colors hover:bg-gray-50 border border-transparent cursor-pointer"
            >
              <input type="checkbox" :value="student.studentId" v-model="enrolledIds" class="w-4 h-4 accent-blue-600 mr-3">
              <span class="font-bold text-sm text-gray-800 flex-1">
                {{ student.grade }}학년 {{ student.class }}반 {{ student.number }}번
              </span>
              <span class="font-black text-gray-900">{{ student.name }}</span>
            </label>
          </template>

        </div>
      </div>

      <div class="w-full lg:w-2/3 flex flex-col h-[75vh]">
        <div v-if="!selectedStudent || isEditingRoster" class="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl shadow-sm border border-gray-200 border-dashed text-gray-400 p-6">
          <span class="text-5xl mb-4">👈</span>
          <p class="text-lg font-bold text-gray-700">왼쪽 수강생 명단에서 학생을 선택해주세요.</p>
          <p class="text-sm text-gray-500 mt-1">선택한 학생의 <b>[{{ selectedSubject || '과목' }}]</b> 활동 기록을 작성할 수 있습니다.</p>
        </div>

        <div v-else class="flex-1 flex flex-col gap-4">
          
          <div class="bg-blue-50 rounded-2xl shadow-sm border border-blue-200 p-5 shrink-0">
            <h3 class="text-xl font-black text-blue-900 mb-4 border-b border-blue-200 pb-2">
              🎓 {{ selectedStudent.name }} <span class="text-sm text-blue-700 font-bold ml-2">({{ selectedSubject }} 기록)</span>
            </h3>
            
            <div class="flex flex-col gap-3">
              <input v-model="recordDate" type="date" class="w-40 p-2 border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-900 bg-white shadow-sm">
              <textarea 
                v-model="recordContent" 
                class="w-full h-28 p-3 border border-blue-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-900 bg-white font-medium placeholder-gray-500 shadow-sm"
                placeholder="수업 중 관찰한 학생의 특징, 참여도, 세특 사항을 구체적으로 적어주세요."
              ></textarea>
              <div class="flex justify-end">
                <button @click="saveRecord" :disabled="isSaving" class="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50 active:scale-95">
                  {{ isSaving ? '저장 중...' : '💾 기록 저장' }}
                </button>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 flex-1 p-5 overflow-y-auto custom-scrollbar">
            <h4 class="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>📋 누적 기록</span>
              <span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">{{ records.length }}건</span>
            </h4>
            
            <div v-if="isLoadingRecords" class="text-center py-10 text-gray-500">
              <div class="animate-spin w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full mx-auto mb-2"></div>
              기록을 불러오는 중...
            </div>
            
            <div v-else-if="records.length === 0" class="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300 font-medium">
              작성된 수업 기록이 없습니다.
            </div>
            
            <div v-else class="space-y-3">
              <div v-for="rec in records" :key="rec.id" class="bg-gray-50 border border-gray-200 p-4 rounded-xl relative group">
                <button @click="deleteRecord(rec.id)" class="absolute top-3 right-3 text-xs px-2 py-1 bg-red-100 text-red-600 font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity">삭제</button>
                <div class="font-bold text-blue-900 text-sm mb-2 flex items-center gap-2">
                  <span>🗓️ {{ rec.date }}</span>
                </div>
                <p class="text-gray-900 whitespace-pre-wrap leading-relaxed text-sm font-medium">{{ rec.content }}</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
</style>