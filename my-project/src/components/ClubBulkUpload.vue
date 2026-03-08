<script setup>
import { ref } from 'vue'
import { useClubStore } from '../stores/clubStore'

const clubStore = useClubStore()
const rawData = ref('')
const uploadStatus = ref('')
const isUploading = ref(false)

const handleUpload = async () => {
  if (!rawData.value.trim()) {
    uploadStatus.value = '데이터를 먼저 붙여넣어 주세요.'
    return
  }

  isUploading.value = true
  uploadStatus.value = '데이터를 분석하는 중...'

  try {
    const lines = rawData.value.split('\n').filter(line => line.trim() !== '')
    if (lines.length < 2) throw new Error("헤더와 데이터가 모두 필요합니다.")

    // CSV 또는 탭 분리 인식
    const headers = lines[0].split(/[,\t]/).map(h => h.trim().replace(/"/g, ''))
    const requiredHeaders = ['학번', '이름']
    
    const missingHeaders = requiredHeaders.filter(rh => !headers.includes(rh))
    if (missingHeaders.length > 0) {
      uploadStatus.value = `필수 항목 누락: ${missingHeaders.join(', ')}`
      isUploading.value = false
      return
    }

    const dataLines = lines.slice(1)
    const studentDataList = []

    dataLines.forEach(line => {
      // 정규식을 이용해 CSV의 따옴표 안의 콤마 무시 등 처리
      const cols = line.split(/[,\t]/).map(c => c.trim().replace(/^"|"$/g, ''))
      if (cols.length < 2) return

      const studentObj = {}
      headers.forEach((header, idx) => {
        const val = cols[idx] || ''
        
        // 동아리 전용 필드 매핑
        if (header === '학번') studentObj.studentId = val
        else if (header === '이름') studentObj.name = val
        else if (header === '성별') studentObj.gender = val
        else if (header === '연락처') studentObj.phone = val
        else if (header === '희망진로') studentObj.career = val
        else if (header === '역할') studentObj.clubRole = val
        else if (header === '지원동기') studentObj.motivation = val
        else if (header === '특기') studentObj.specialty = val
      })

      if (studentObj.studentId && studentObj.name) {
        studentObj.createdAt = new Date().toISOString()
        studentDataList.push(studentObj)
      }
    })

    await clubStore.bulkUpload(studentDataList)
    
    uploadStatus.value = `성공! 총 ${studentDataList.length}명의 동아리 학생이 등록/업데이트 되었습니다.`
    rawData.value = ''

  } catch (error) {
    console.error(error)
    uploadStatus.value = '오류가 발생했습니다. 엑셀 양식을 다시 확인해주세요.'
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="bg-orange-50 p-6 rounded-lg shadow-md mb-6 border border-orange-200">
    <h3 class="text-lg font-bold mb-2 text-orange-900">👥 동아리 부원 일괄 등록</h3>
    <p class="text-sm text-orange-700 mb-4 leading-relaxed">
      설문지로 받은 동아리 부원 데이터를 복사해서 아래 칸에 붙여넣어 주세요. (학번, 이름 필수)<br>
      기존 학번과 동일하면 덮어쓰기(업데이트) 됩니다.
    </p>
    
    <div class="bg-white p-3 rounded border border-orange-100 mb-4 text-xs font-mono text-gray-600 overflow-x-auto whitespace-nowrap">
      <p class="font-bold mb-1">📝 복사/붙여넣기 예시 (첫 줄 필수):</p>
      학번, 이름, 성별, 연락처, 희망진로, 역할, 지원동기, 특기<br>
      10501, 김동아, 남, 010-1111-2222, 영상 감독, 기장, 영상 제작이 좋아서, 프리미어 편집<br>
      10502, 이리듬, 여, 010-3333-4444, 작곡가, 부원, 음악 분석을 위해, 피아노 연주
    </div>

    <textarea 
      v-model="rawData" 
      class="w-full h-32 p-3 border border-orange-200 rounded text-sm mb-4 focus:ring-2 focus:ring-orange-400 focus:outline-none" 
      placeholder="여기에 엑셀 데이터를 붙여넣으세요."
      :disabled="isUploading"
    ></textarea>
    
    <div class="flex items-center gap-4">
      <button 
        @click="handleUpload" 
        :disabled="isUploading"
        class="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-6 rounded transition-colors disabled:bg-gray-400 shadow-sm"
      >
        {{ isUploading ? '등록 중...' : '동아리 부원 일괄 등록' }}
      </button>
      <span v-if="uploadStatus" class="text-sm font-bold" :class="uploadStatus.includes('성공') ? 'text-green-600' : 'text-red-500'">
        {{ uploadStatus }}
      </span>
    </div>
  </div>
</template>