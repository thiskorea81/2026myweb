<script setup>
import { ref, onMounted, watch } from 'vue'
import { collection, getDocs, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import SubjectRosterPanel from '../components/SubjectRosterPanel.vue'
import SubjectActivityPanel from '../components/SubjectActivityPanel.vue'

const students = ref([])
const subjects = ref([])
const selectedSubject = ref('')
const newSubjectName = ref('')
const isAddingSubject = ref(false)

const selectedStudent = ref(null)
const isEditingRoster = ref(false)

onMounted(async () => {
  const savedSubjects = JSON.parse(localStorage.getItem('mySubjects') || '[]')
  subjects.value = savedSubjects.length > 0 ? savedSubjects : ['정보1', '정보2']
  selectedSubject.value = subjects.value[0] || ''

  try {
    const snap = await getDocs(collection(db, 'students'))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    data.sort((a, b) => String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true }))
    students.value = data
  } catch (error) { console.error("학생 로드 에러:", error) }
})

// 💡 과목 추가 및 자동 매칭 로직
const addSubject = async () => {
  const name = newSubjectName.value.trim()
  if (!name || subjects.value.includes(name)) return
  
  // 1. 과목 리스트에 추가
  subjects.value.push(name)
  localStorage.setItem('mySubjects', JSON.stringify(subjects.value))

  // 2. '진로' 과목 자동 매칭 체크 (예: 진로와직업1, 진로1 등)
  // 과목명 끝에 숫자가 있고 '진로'라는 글자가 포함된 경우
  const match = name.match(/진로.*(\d)/)
  if (match) {
    const targetClass = parseInt(match[1], 10)
    if (confirm(`'${name}' 과목을 ${targetClass}반 학생 전체와 자동으로 매칭하시겠습니까?`)) {
      // 해당 반 학생들의 학번만 추출
      const targetIds = students.value
        .filter(s => s.grade === 1 && s.class === targetClass)
        .map(s => s.studentId)
      
      if (targetIds.length > 0) {
        await setDoc(doc(db, 'subjectRosters', name), { studentIds: targetIds })
        alert(`${targetClass}반 학생 ${targetIds.length}명이 자동으로 등록되었습니다.`)
      }
    }
  }

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

watch(selectedSubject, () => { 
  selectedStudent.value = null
  isEditingRoster.value = false 
})
</script>

<template>
  <div class="max-w-7xl mx-auto p-4 sm:p-6 font-sans">
    
    <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 border-b pb-4">
      <div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-900">📝 교과 수업 기록</h2>
        <p class="text-gray-600 mt-1 font-bold">진로 선생님과 함께 쓰는 스마트 세특 관리 시스템</p>
      </div>
      
      <div class="flex items-center gap-2 bg-white p-2 border border-gray-200 rounded-xl shadow-sm">
        <span class="font-bold text-gray-800 text-sm pl-2">과목:</span>
        <select v-model="selectedSubject" class="p-2 border border-gray-300 rounded-lg outline-none font-bold text-gray-900 bg-white min-w-[120px]">
          <option v-for="sub in subjects" :key="sub" :value="sub">{{ sub }}</option>
        </select>
        
        <div v-if="isAddingSubject" class="flex gap-1 ml-2">
          <input v-model="newSubjectName" @keyup.enter="addSubject" type="text" placeholder="예: 진로와직업1" class="w-32 p-1.5 border border-blue-300 rounded text-sm bg-white outline-none text-gray-900">
          <button @click="addSubject" class="px-3 py-1.5 bg-blue-600 text-white font-bold rounded text-sm hover:bg-blue-700">추가</button>
          <button @click="isAddingSubject = false" class="px-2 py-1.5 bg-gray-200 text-gray-800 font-bold rounded text-sm">취소</button>
        </div>
        <div v-else class="flex gap-1 ml-2">
          <button @click="isAddingSubject = true" class="px-3 py-2 bg-gray-100 font-bold text-gray-800 rounded-lg text-sm hover:bg-gray-200">➕ 과목 추가</button>
          <button v-if="selectedSubject" @click="deleteSubject(selectedSubject)" class="px-3 py-2 text-red-600 font-bold rounded-lg text-sm hover:bg-red-50">🗑️</button>
        </div>
      </div>
    </div>

    <div class="flex flex-col lg:flex-row gap-6">
      <div class="w-full lg:w-1/3">
        <SubjectRosterPanel 
          :students="students"
          :subject="selectedSubject"
          v-model:selectedStudent="selectedStudent"
          v-model:isEditingRoster="isEditingRoster"
        />
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