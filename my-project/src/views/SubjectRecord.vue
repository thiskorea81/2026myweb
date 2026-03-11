<script setup>
import { ref, onMounted, watch } from 'vue'
import { collection, getDocs, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { db } from '../firebase'
import SubjectRosterPanel from '../components/SubjectRosterPanel.vue'
import SubjectActivityPanel from '../components/SubjectActivityPanel.vue'

// 전역 상태
const students = ref([])
const subjects = ref([])
const selectedSubject = ref('')
const newSubjectName = ref('')
const isAddingSubject = ref(false)

// 자식 컴포넌트 간 공유 상태
const selectedStudent = ref(null)
const isEditingRoster = ref(false)

// 💡 1. 초기 데이터 로드 (DB에서 과목 리스트와 학생 명단 가져오기)
onMounted(async () => {
  try {
    // 1-1. DB에서 과목 리스트 불러오기 (settings/subjects 문서)
    const docRef = doc(db, 'settings', 'subjects')
    const snap = await getDoc(docRef)
    
    if (snap.exists()) {
      subjects.value = snap.data().list || []
    } else {
      // 문서가 아예 없으면 기본값 생성
      const defaultList = ['정보1', '정보2']
      await setDoc(docRef, { list: defaultList })
      subjects.value = defaultList
    }
    selectedSubject.value = subjects.value[0] || ''

    // 1-2. 전체 학생 명단 로드
    const sSnap = await getDocs(collection(db, 'students'))
    const data = sSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    data.sort((a, b) => String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true }))
    students.value = data
  } catch (error) {
    console.error("초기 로드 에러:", error)
  }
})

// 💡 2. 과목 추가 로직 (DB에 저장)
const addSubject = async () => {
  const name = newSubjectName.value.trim()
  if (!name || subjects.value.includes(name)) return
  
  try {
    const docRef = doc(db, 'settings', 'subjects')
    // DB의 배열에 새 과목명 추가
    await updateDoc(docRef, {
      list: arrayUnion(name)
    })
    
    subjects.value.push(name)

    // 진로 과목 자동 매칭 로직 (기존 유지)
    const match = name.match(/진로.*(\d+)/)
    if (match) {
      const targetClass = parseInt(match[1], 10)
      if (confirm(`'${name}' 과목을 ${targetClass}반 학생 전체와 자동으로 매칭하시겠습니까?`)) {
        const targetIds = students.value
          .filter(s => s.grade === 1 && s.class === targetClass)
          .map(s => s.studentId)
        
        if (targetIds.length > 0) {
          await setDoc(doc(db, 'subjectRosters', name), { studentIds: targetIds })
        }
      }
    }

    selectedSubject.value = name
    newSubjectName.value = ''
    isAddingSubject.value = false
  } catch (e) {
    alert('과목을 저장하는 중 오류가 발생했습니다.')
  }
}

// 💡 3. 과목 삭제 로직 (DB에서 삭제)
const deleteSubject = async (subjectToRemove) => {
  if (!confirm(`'${subjectToRemove}' 과목을 삭제하시겠습니까?\n(기존 수업 기록 데이터는 DB에 보존됩니다)`)) return
  
  try {
    const docRef = doc(db, 'settings', 'subjects')
    // DB의 배열에서 해당 과목명 제거
    await updateDoc(docRef, {
      list: arrayRemove(subjectToRemove)
    })
    
    subjects.value = subjects.value.filter(s => s !== subjectToRemove)
    if (selectedSubject.value === subjectToRemove) selectedSubject.value = subjects.value[0] || ''
  } catch (e) {
    alert('과목 삭제 중 오류가 발생했습니다.')
  }
}

watch(selectedSubject, () => { 
  selectedStudent.value = null
  isEditingRoster.value = false 
})
</script>

<template>
  <div class="max-w-7xl mx-auto p-4 sm:p-6 font-sans text-gray-900">
    
    <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 border-b pb-4">
      <div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">📝 교과 수업 기록</h2>
        <p class="text-gray-600 mt-1 font-bold">서버 동기화가 활성화된 스마트 세특 관리 시스템</p>
      </div>
      
      <div class="flex items-center gap-2 bg-white p-2 border border-gray-200 rounded-xl shadow-sm">
        <span class="font-bold text-gray-800 text-sm pl-2">과목:</span>
        <select v-model="selectedSubject" class="p-2 border border-gray-300 rounded-lg outline-none font-bold text-gray-900 bg-white min-w-[120px]">
          <option v-for="sub in subjects" :key="sub" :value="sub">{{ sub }}</option>
        </select>
        
        <div v-if="isAddingSubject" class="flex gap-1 ml-2">
          <input v-model="newSubjectName" @keyup.enter="addSubject" type="text" placeholder="예: 진로1" class="w-32 p-1.5 border border-blue-300 rounded text-sm bg-white outline-none text-gray-900 font-bold">
          <button @click="addSubject" class="px-3 py-1.5 bg-blue-600 text-white font-bold rounded text-sm">추가</button>
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