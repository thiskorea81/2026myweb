<script setup>
import { ref, computed, onMounted } from 'vue'
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

const students = ref([])
const isLoading = ref(true)
const showUploadArea = ref(false)
const bulkText = ref('')
const isUploading = ref(false)
const isCleaning = ref(false)

const selectedGrade = ref('전체')
const selectedClass = ref('전체')
const searchQuery = ref('')
const selectedIds = ref([])

// 데이터 불러오기
const fetchStudents = async () => {
  isLoading.value = true
  try {
    const snap = await getDocs(collection(db, 'students'))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    // 학번(id) 기준으로 오름차순 정렬
    data.sort((a, b) => String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true }))
    students.value = data
  } catch (error) {
    console.error("데이터 로드 에러:", error)
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchStudents)

// 필터링
const filteredStudents = computed(() => {
  return students.value.filter(s => {
    if (s.isArchived) return false
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

// 전체 선택 토글
const toggleSelectAll = (e) => {
  if (e.target.checked) {
    selectedIds.value = filteredStudents.value.map(s => s.id)
  } else {
    selectedIds.value = []
  }
}

// 선택 일괄 삭제
const deleteSelected = async () => {
  if (selectedIds.value.length === 0) return
  if (!confirm(`선택한 ${selectedIds.value.length}명의 데이터를 삭제하시겠습니까?`)) return

  try {
    for (const id of selectedIds.value) {
      await deleteDoc(doc(db, 'students', id))
    }
    alert(`✅ ${selectedIds.value.length}명의 데이터가 삭제되었습니다.`)
    selectedIds.value = []
    fetchStudents()
  } catch (error) {
    alert('삭제 중 오류가 발생했습니다.')
  }
}

// 쓰레기 데이터 청소 (NaN 등 방어)
const cleanUpMalformedData = async () => {
  if (!confirm('학번 형식이 잘못된(NaN 등) 쓰레기 데이터를 모두 청소하시겠습니까?\n(기존 10501 등 정상 데이터는 삭제되지 않습니다.)')) return
  
  isCleaning.value = true
  try {
    const snap = await getDocs(collection(db, 'students'))
    let deleteCount = 0
    
    for (const d of snap.docs) {
      if (!/^\d{5}$/.test(d.id)) {
        await deleteDoc(doc(db, 'students', d.id))
        deleteCount++
      }
    }
    alert(`🧹 총 ${deleteCount}개의 잘못된 데이터가 깨끗하게 삭제되었습니다!`)
    fetchStudents()
  } catch (error) {
    alert('삭제 중 오류가 발생했습니다.')
  } finally {
    isCleaning.value = false
  }
}

// 개별 삭제
const deleteStudent = async (id) => {
  if (!confirm(`${id} 학생의 데이터를 삭제하시겠습니까?`)) return
  try {
    await deleteDoc(doc(db, 'students', id))
    fetchStudents()
  } catch (error) {
    alert('삭제 실패')
  }
}

// 💡 엑셀 TSV 데이터를 안전하게 파싱하여 병합하는 로직
const handleBulkUpload = async () => {
  if (!bulkText.value.trim()) return alert('데이터를 붙여넣어 주세요.')
  if (!confirm('학생 명단과 연락처를 업데이트하시겠습니까?\n(기존 상담 기록이나 기타 정보는 삭제되지 않고 안전하게 유지됩니다.)')) return

  isUploading.value = true
  let successCount = 0

  try {
    const lines = bulkText.value.trim().split(/\r?\n/)
    
    for (const line of lines) {
      if (!line.trim()) continue
      
      let cols = line.includes('\t') ? line.split('\t') : line.split(/[\s,]+/)
      
      // 학번이 숫자가 아니면 스킵 (헤더 제외)
      if (isNaN(parseInt(cols[0], 10))) continue

      const grade = parseInt(cols[1], 10)
      const cls = parseInt(cols[2], 10)
      const num = parseInt(cols[3], 10)
      
      if (isNaN(grade) || isNaN(cls) || isNaN(num)) continue

      const name = cols[4]?.trim() || ''
      const gender = cols[5]?.trim() || ''
      const birthDate = cols[6]?.trim() || ''
      const note = cols[7]?.trim() || ''
      const phone = cols[8]?.trim() || ''
      const parent1Phone = cols[9]?.trim() || ''
      const parent2Phone = cols[10]?.trim() || ''

      const studentId = `${grade}${String(cls).padStart(2, '0')}${String(num).padStart(2, '0')}`

      // Firestore 업데이트 객체 준비
      const dataToUpdate = {
        studentId,
        grade,
        class: cls,
        number: num,
        name,
        gender,
        updatedAt: new Date().toISOString()
      }
      
      // 빈 값이 아닌 경우에만 업데이트하여 기존 데이터를 보호함
      if (birthDate) dataToUpdate.birthDate = birthDate
      if (note) dataToUpdate.note = note
      if (phone) dataToUpdate.phone = phone
      if (parent1Phone) dataToUpdate.parent1Phone = parent1Phone
      if (parent2Phone) dataToUpdate.parent2Phone = parent2Phone

      await setDoc(doc(db, 'students', studentId), dataToUpdate, { merge: true }) 
      successCount++
    }
    
    alert(`✅ ${successCount}명의 학생 데이터가 성공적으로 업데이트되었습니다!\n(기존 상담 및 비고 정보는 안전하게 유지되었습니다.)`)
    bulkText.value = ''
    showUploadArea.value = false
    fetchStudents()

  } catch (error) {
    console.error("업로드 에러:", error)
    alert('등록 중 오류가 발생했습니다.')
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="max-w-6xl mx-auto p-4 sm:p-6 font-sans">
    
    <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 border-b pb-4">
      <div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">🏫 전교생 통합 관리</h2>
        <p class="text-gray-500 mt-1">교과 수업 및 동아리 편성을 위한 전체 학생 DB입니다.</p>
      </div>
      <div class="flex gap-2">
        <button @click="fetchStudents" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors">🔄 새로고침</button>
        <button @click="showUploadArea = !showUploadArea" class="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-md hover:bg-blue-700 transition-colors">
          {{ showUploadArea ? '닫기' : '📋 엑셀 명단 일괄 등록' }}
        </button>
      </div>
    </div>

    <div class="mb-4 flex justify-end">
      <button 
        @click="cleanUpMalformedData" 
        :disabled="isCleaning"
        class="text-sm px-4 py-2 bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200 transition-colors border border-red-200 flex items-center gap-2"
        title="NaN 등 잘못된 데이터만 쏙 골라내어 삭제합니다."
      >
        <span v-if="isCleaning" class="animate-spin">⏳</span>
        <span v-else>🧹</span>
        오류 데이터 자동 정리
      </button>
    </div>

    <div v-if="selectedIds.length > 0" class="bg-red-50 border border-red-200 p-4 rounded-xl mb-4 flex justify-between items-center shadow-sm sticky top-16 z-20">
      <span class="text-sm font-bold text-red-800 pr-4">현재 <span class="text-xl">{{ selectedIds.length }}</span>명 선택됨</span>
      <div class="flex gap-3 items-center">
        <button @click="selectedIds = []" class="text-xs font-bold text-gray-500 hover:text-gray-700 underline">선택 해제</button>
        <button @click="deleteSelected" class="px-5 py-2 bg-red-600 text-white rounded-lg font-bold shadow-sm hover:bg-red-700 transition-colors">
          🗑️ 선택 일괄 삭제
        </button>
      </div>
    </div>

    <div v-if="showUploadArea" class="bg-blue-50 border border-blue-200 p-6 rounded-2xl mb-8 shadow-inner">
      <h3 class="font-bold text-blue-800 mb-2">📌 엑셀 명단 붙여넣기</h3>
      <p class="text-xs text-blue-600 mb-4">엑셀의 표 영역을 드래그해서 붙여넣어 주세요.<br>데이터가 한 줄로 뭉쳐있어도 스스로 패턴을 파악해 저장합니다.</p>
      
      <textarea 
        v-model="bulkText" 
        class="w-full h-40 p-4 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono text-sm leading-relaxed whitespace-pre bg-white text-gray-900 placeholder-gray-400"
        placeholder="1  1  1  권민혁  남  2010.10.09  특이사항..."
      ></textarea>
      
      <div class="flex justify-end mt-4">
        <button 
          @click="handleBulkUpload" 
          :disabled="isUploading"
          class="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {{ isUploading ? '등록 중...' : '데이터베이스에 저장하기' }}
        </button>
      </div>
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
              <th class="px-4 py-3 text-left">연락처</th>
              <th class="px-4 py-3 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading"><td colspan="8" class="py-12 text-gray-400 font-medium">데이터를 불러오는 중입니다...</td></tr>
            <tr v-else-if="filteredStudents.length === 0"><td colspan="8" class="py-12 text-gray-500 font-medium">조회된 학생이 없습니다.</td></tr>
            <tr v-for="student in filteredStudents" :key="student.id" class="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
              <td class="px-4 py-3"><input type="checkbox" :value="student.id" v-model="selectedIds" class="w-4 h-4 cursor-pointer accent-blue-600"/></td>
              <td class="px-4 py-3 font-bold text-blue-700">{{ student.studentId }}</td>
              
              <td class="px-4 py-3 text-gray-800 font-medium">{{ student.grade }}</td>
              <td class="px-4 py-3 text-gray-800 font-medium">{{ student.class }}</td>
              <td class="px-4 py-3 text-gray-800 font-medium">{{ student.number }}</td>
              <td class="px-4 py-3 font-bold text-gray-800 text-left">{{ student.name }}</td>
              <td class="px-4 py-3 text-left text-gray-600 font-mono">
                <a v-if="student.phone" :href="`tel:${student.phone.replace(/-/g, '')}`" class="hover:text-blue-600 hover:underline">{{ student.phone }}</a>
                <span v-else>-</span>
              </td>
              
              <td class="px-4 py-3 text-right"><button @click="deleteStudent(student.id)" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-2 py-1 rounded">삭제</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>