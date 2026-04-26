<script setup>
import { ref, computed, onMounted } from 'vue'
import { useClubStore } from '../stores/clubStore'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

const clubStore = useClubStore()
const rawData = ref('')
const uploadStatus = ref('')
const isUploading = ref(false)

const inputMode = ref('db') 

const globalStudentsMap = ref({})
const filterGrade = ref('전체')
const filterClass = ref('전체')
const selectedDbIds = ref([])

onMounted(async () => {
  try {
    const snap = await getDocs(collection(db, 'students'))
    const map = {}
    snap.forEach(doc => { map[doc.id] = doc.data() })
    globalStudentsMap.value = map
  } catch (error) {
    console.error("전교생 데이터 로드 실패:", error)
  }
})

const filteredGlobalStudents = computed(() => {
  return Object.values(globalStudentsMap.value).filter(s => {
    const matchGrade = filterGrade.value === '전체' || String(s.grade) === filterGrade.value
    const matchClass = filterClass.value === '전체' || String(s.class) === filterClass.value
    return matchGrade && matchClass
  }).sort((a, b) => String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true }))
})

const toggleSelectAll = (e) => {
  if (e.target.checked) {
    selectedDbIds.value = filteredGlobalStudents.value.map(s => s.studentId)
  } else {
    selectedDbIds.value = []
  }
}

const handleDbUpload = async () => {
  if (selectedDbIds.value.length === 0) {
    uploadStatus.value = '등록할 학생을 먼저 선택해주세요.'
    return
  }
  isUploading.value = true
  uploadStatus.value = '선택한 학생들을 동아리에 등록 중...'

  try {
    const studentDataList = selectedDbIds.value.map(id => {
      const g = globalStudentsMap.value[id]
      return {
        studentId: g.studentId,
        name: g.name,
        gender: g.gender || '',
        grade: g.grade,
        class: g.class,
        number: g.number,
        clubRole: '부원', 
        createdAt: new Date().toISOString()
      }
    })

    await clubStore.bulkUpload(studentDataList)
    uploadStatus.value = `성공! 총 ${studentDataList.length}명이 동아리에 등록되었습니다.`
    selectedDbIds.value = [] 
  } catch (error) {
    console.error(error)
    uploadStatus.value = '등록 중 오류가 발생했습니다.'
  } finally {
    isUploading.value = false
  }
}

// 💡 엑셀 스마트 파싱 및 유연한 헤더 매핑 로직 적용
const handleExcelUpload = async () => {
  if (!rawData.value.trim()) {
    uploadStatus.value = '데이터를 먼저 붙여넣어 주세요.'
    return
  }

  isUploading.value = true
  uploadStatus.value = '데이터를 분석하는 중...'

  try {
    // 💡 1. 엑셀 데이터 완벽 파싱 (따옴표 안의 줄바꿈 문자까지 정확히 처리)
    const rows = []
    let currentRow = []
    let currentCell = ''
    let insideQuotes = false

    for (let i = 0; i < rawData.value.length; i++) {
      const char = rawData.value[i]
      const nextChar = rawData.value[i + 1]

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentCell += '"'
          i++ // 이스케이프된 따옴표 건너뛰기
        } else {
          insideQuotes = !insideQuotes
        }
      } else if (char === '\t' && !insideQuotes) {
        // 엑셀은 탭(\t)으로 열을 구분합니다.
        currentRow.push(currentCell.trim())
        currentCell = ''
      } else if (char === '\n' && !insideQuotes) {
        // 따옴표 바깥의 줄바꿈은 새로운 행을 의미합니다.
        currentRow.push(currentCell.trim())
        if (currentRow.some(c => c !== '')) rows.push(currentRow)
        currentRow = []
        currentCell = ''
      } else if (char !== '\r' || insideQuotes) {
        currentCell += char
      }
    }
    // 마지막 행 밀어넣기
    if (currentRow.some(c => c !== '')) {
      currentRow.push(currentCell.trim())
      rows.push(currentRow)
    }

    if (rows.length < 2) throw new Error("헤더와 데이터가 모두 필요합니다.")

    // 💡 2. 유연한 헤더 이름 매핑
    const headers = rows[0]
    const studentDataList = []

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i]
      const studentObj = {}

      headers.forEach((header, idx) => {
        const val = cols[idx] || ''
        // 키워드가 포함되어 있으면 알아서 매핑합니다.
        if (header.includes('학번')) studentObj.studentId = val
        else if (header.includes('이름') || header.includes('성명')) studentObj.name = val
        else if (header.includes('성별')) studentObj.gender = val
        else if (header.includes('연락처') || header.includes('휴대전화')) studentObj.phone = val
        else if (header.includes('진로') || header.includes('학과')) studentObj.career = val
        else if (header.includes('역할')) studentObj.clubRole = val
        else if (header.includes('동기')) studentObj.motivation = val
        else if (header.includes('특기') || header.includes('장점')) studentObj.specialty = val
      })

      // 학번과 이름이 있는 정상적인 데이터만 통과
      if (studentObj.studentId && studentObj.name) {
        const globalData = globalStudentsMap.value[studentObj.studentId]
        if (globalData) {
          studentObj.grade = globalData.grade
          studentObj.class = globalData.class
          studentObj.number = globalData.number
          studentObj.gender = studentObj.gender || globalData.gender
        }
        studentObj.createdAt = new Date().toISOString()
        studentDataList.push(studentObj)
      }
    }

    await clubStore.bulkUpload(studentDataList)
    uploadStatus.value = `성공! 총 ${studentDataList.length}명의 학생이 등록/업데이트 되었습니다.`
    rawData.value = ''
  } catch (error) {
    console.error(error)
    uploadStatus.value = '오류가 발생했습니다. 양식을 다시 확인해주세요.'
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="bg-orange-50 p-6 rounded-2xl shadow-md mb-8 border border-orange-200">
    <div class="flex justify-between items-center mb-4 border-b border-orange-200 pb-4">
      <h3 class="text-xl font-black text-orange-900 tracking-tight">👥 동아리 부원 일괄 등록</h3>
      
      <div class="flex bg-orange-100/50 p-1 rounded-lg">
        <button 
          @click="inputMode = 'db'; uploadStatus = ''" 
          class="px-4 py-1.5 text-sm font-bold rounded-md transition-colors"
          :class="inputMode === 'db' ? 'bg-orange-600 text-white shadow' : 'text-orange-800 hover:bg-orange-200'"
        >전교생 명단에서 선택</button>
        <button 
          @click="inputMode = 'excel'; uploadStatus = ''" 
          class="px-4 py-1.5 text-sm font-bold rounded-md transition-colors"
          :class="inputMode === 'excel' ? 'bg-orange-600 text-white shadow' : 'text-orange-800 hover:bg-orange-200'"
        >엑셀 데이터 붙여넣기</button>
      </div>
    </div>
    
    <div v-if="inputMode === 'db'">
      <p class="text-sm text-orange-800 mb-4 font-bold">🏫 전교생 데이터베이스에서 학생을 검색하여 바로 동아리에 등록합니다.</p>
      
      <div class="flex gap-2 mb-3 items-center">
        <select v-model="filterGrade" class="px-3 py-1.5 border border-orange-300 rounded text-sm outline-none bg-white font-bold text-gray-900">
          <option value="전체">학년 전체</option>
          <option value="1">1학년</option>
          <option value="2">2학년</option>
          <option value="3">3학년</option>
        </select>
        <select v-model="filterClass" class="px-3 py-1.5 border border-orange-300 rounded text-sm outline-none bg-white font-bold text-gray-900">
          <option value="전체">반 전체</option>
          <option v-for="c in 15" :key="c" :value="String(c)">{{ c }}반</option>
        </select>
        <span class="text-xs font-bold text-orange-700 ml-2">조회됨: {{ filteredGlobalStudents.length }}명</span>
      </div>

      <div class="bg-white border border-orange-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto custom-scrollbar mb-4">
        <table class="w-full text-sm text-center">
          <thead class="bg-orange-100 sticky top-0 z-10 text-orange-900 font-bold">
            <tr>
              <th class="p-2 w-10"><input type="checkbox" @change="toggleSelectAll" :checked="selectedDbIds.length === filteredGlobalStudents.length && filteredGlobalStudents.length > 0" class="accent-orange-600 cursor-pointer"></th>
              <th class="p-2">학번</th>
              <th class="p-2">이름</th>
              <th class="p-2">성별</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="Object.keys(globalStudentsMap).length === 0">
              <td colspan="4" class="p-8 text-gray-600 font-medium">전체 학생 데이터가 없습니다. 먼저 [전체 학생] 메뉴에서 데이터를 등록해주세요.</td>
            </tr>
            <tr v-for="s in filteredGlobalStudents" :key="s.studentId" class="border-b border-orange-50 hover:bg-orange-50/50">
              <td class="p-2"><input type="checkbox" :value="s.studentId" v-model="selectedDbIds" class="accent-orange-600 cursor-pointer"></td>
              <td class="p-2 font-bold text-orange-800">{{ s.studentId }}</td>
              <td class="p-2 font-bold text-gray-900">{{ s.name }}</td>
              <td class="p-2 text-gray-700 font-medium">{{ s.gender || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center gap-4">
        <button @click="handleDbUpload" :disabled="isUploading || selectedDbIds.length === 0" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 px-6 rounded-lg transition-colors disabled:bg-gray-400 shadow-sm flex items-center gap-2">
          ➕ 선택한 {{ selectedDbIds.length }}명 동아리에 등록
        </button>
        <span v-if="uploadStatus" class="text-sm font-bold" :class="uploadStatus.includes('성공') ? 'text-green-600' : 'text-red-500'">{{ uploadStatus }}</span>
      </div>
    </div>

    <div v-else>
      <p class="text-sm text-orange-800 mb-4 leading-relaxed font-bold">
        설문지로 받은 동아리 데이터를 붙여넣어 주세요. (학번, 이름 필수)<br>
        <span class="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">✨ 팁: 학번과 이름만 넣어도 전교생 DB에서 나머지 정보(학년,반,성별 등)를 자동으로 채워옵니다! 줄바꿈이 있는 글도 완벽하게 지원합니다.</span>
      </p>
      
      <div class="bg-white p-3 rounded border border-orange-200 mb-4 text-xs font-mono text-gray-800 overflow-x-auto whitespace-nowrap">
        <p class="font-bold mb-1 text-orange-900">📝 복사/붙여넣기 예시 (첫 줄 필수):</p>
        학번, 이름, 성별, 휴대전화, 희망진로,학과, 역할, 지원동기, 특기<br>
        10501, 김민찬, 남, 010-1234-5678, 컴퓨터공학과, 부장, "영상 제작이 좋아서<br>
        이번에는 여러 가지 만들어 보고 싶습니다", 편집
      </div>

      <textarea 
        v-model="rawData" 
        class="w-full h-32 p-3 border border-orange-300 rounded-lg text-sm mb-4 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white text-gray-900 placeholder-gray-500 font-medium" 
        placeholder="엑셀에서 복사한 데이터를 붙여넣으세요..."
        :disabled="isUploading"
      ></textarea>
      
      <div class="flex items-center gap-4">
        <button @click="handleExcelUpload" :disabled="isUploading" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 px-6 rounded-lg transition-colors disabled:bg-gray-400 shadow-sm flex items-center gap-2">
          {{ isUploading ? '등록 중...' : '엑셀 데이터로 일괄 등록' }}
        </button>
        <span v-if="uploadStatus" class="text-sm font-bold" :class="uploadStatus.includes('성공') ? 'text-green-600' : 'text-red-500'">{{ uploadStatus }}</span>
      </div>
    </div>

  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #fdba74; border-radius: 4px; }
</style>