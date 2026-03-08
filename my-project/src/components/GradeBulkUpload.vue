<script setup>
import { ref } from 'vue'
import { useStudentStore } from '../stores/studentStore'

const studentStore = useStudentStore()
const rawData = ref('')
const uploadStatus = ref('')
const isUploading = ref(false)

const handleGradeUpload = async () => {
  if (!rawData.value.trim()) {
    uploadStatus.value = '데이터를 먼저 붙여넣어 주세요.'
    return
  }

  isUploading.value = true
  uploadStatus.value = '성적 데이터를 분석하는 중...'

  try {
    const lines = rawData.value.split('\n').filter(line => line.trim() !== '')
    if (lines.length < 2) throw new Error("데이터가 부족합니다.")

    // CSV(콤마) 또는 TSV(탭)을 모두 인식하여 헤더 분리
    const headers = lines[0].split(/[,\t]/).map(h => h.trim())
    
    const idIdx = headers.findIndex(h => h === '학번')
    const examIdx = headers.findIndex(h => h === '시험명')

    if (idIdx === -1 || examIdx === -1) {
      uploadStatus.value = "첫 줄에 '학번'과 '시험명' 열이 반드시 포함되어야 합니다!"
      isUploading.value = false
      return
    }

    const dataLines = lines.slice(1)
    const gradeDataList = []

    dataLines.forEach(line => {
      const cols = line.split(/[,\t]/).map(c => c.trim())
      if (cols.length < 2) return

      const studentId = cols[idIdx]
      const examName = cols[examIdx]
      if (!studentId || !examName) return

      // 학번과 시험명을 제외한 나머지 항목들은 과목/점수로 동적 처리
      const scores = {}
      headers.forEach((header, idx) => {
        if (idx !== idIdx && idx !== examIdx && cols[idx]) {
          scores[header] = cols[idx]
        }
      })

      gradeDataList.push({ studentId, examName, scores })
    })

    const successCount = await studentStore.bulkUploadGrades(gradeDataList)
    
    uploadStatus.value = `성공! 총 ${successCount}건의 성적 데이터가 업데이트되었습니다.`
    rawData.value = ''

  } catch (error) {
    console.error(error)
    uploadStatus.value = '업로드 중 오류가 발생했습니다. 데이터 형식을 확인해주세요.'
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="bg-indigo-50 p-6 rounded-lg shadow-md mb-6 border border-indigo-200">
    <h3 class="text-lg font-bold mb-2 text-indigo-900">💯 성적 일괄 등록 (자유 양식)</h3>
    <p class="text-sm text-indigo-700 mb-4 leading-relaxed">
      첫 줄에 반드시 <span class="font-bold text-red-600">'학번'</span>과 <span class="font-bold text-red-600">'시험명'</span>을 포함해주세요.<br>
      나머지 열 제목(석차, 국어, 수학 등)은 자유롭게 적으시면 그대로 성적표에 등록됩니다. (CSV 또는 엑셀 복사/붙여넣기 지원)
    </p>
    
    <div class="bg-white p-3 rounded border border-indigo-100 mb-4 text-xs font-mono text-gray-600">
      <p class="font-bold mb-1">📝 입력 예시:</p>
      학번, 시험명, 석차<br>
      10501, 신입생 첫성적, 15<br>
      10502, 신입생 첫성적, 3<br>
      <br>
      학번, 시험명, 국어, 수학, 영어<br>
      10501, 진단평가, 90, 85, 100
    </div>

    <textarea 
      v-model="rawData" 
      class="w-full h-32 p-3 border border-indigo-200 rounded text-sm mb-4 focus:ring-2 focus:ring-indigo-400 focus:outline-none" 
      placeholder="학번, 시험명, 과목1, 과목2... 형태로 붙여넣기 하세요"
      :disabled="isUploading"
    ></textarea>
    
    <div class="flex items-center gap-4">
      <button 
        @click="handleGradeUpload" 
        :disabled="isUploading"
        class="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded transition-colors disabled:bg-gray-400 shadow-sm"
      >
        {{ isUploading ? '성적 업로드 중...' : '성적 일괄 등록' }}
      </button>
      <span v-if="uploadStatus" class="text-sm font-bold" :class="uploadStatus.includes('성공') ? 'text-green-600' : 'text-red-500'">
        {{ uploadStatus }}
      </span>
    </div>
  </div>
</template>