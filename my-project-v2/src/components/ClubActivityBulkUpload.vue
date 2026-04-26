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
  uploadStatus.value = '활동 기록을 분석하는 중...'

  try {
    // 💡 1. 엑셀 스마트 파서 적용 (따옴표, 탭, 줄바꿈 완벽 처리)
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
        currentRow.push(currentCell.trim())
        currentCell = ''
      } else if (char === '\n' && !insideQuotes) {
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

    if (rows.length < 2) throw new Error("데이터가 부족합니다. (제목 줄과 데이터가 모두 필요합니다)")

    // 💡 2. 유연한 헤더 매핑
    const headers = rows[0]
    const idIdx = headers.findIndex(h => h.includes('학번'))
    const dateIdx = headers.findIndex(h => h.includes('날짜') || h.includes('일자'))
    const titleIdx = headers.findIndex(h => h.includes('활동명') || h.includes('주제'))
    const contentIdx = headers.findIndex(h => h.includes('내용') || h.includes('느낀점') || h.includes('활동내용'))

    if (idIdx === -1 || titleIdx === -1 || contentIdx === -1) {
      uploadStatus.value = "첫 줄에 '학번', '활동명', '내용' 열이 반드시 포함되어야 합니다!"
      isUploading.value = false
      return
    }

    const activityDataList = []

    // 💡 3. 데이터 추출 및 조립
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i]
      
      const studentId = cols[idIdx] || ''
      const date = dateIdx > -1 ? cols[dateIdx] : ''
      const title = cols[titleIdx] || ''
      const content = cols[contentIdx] || ''

      if (studentId && title && content) {
        activityDataList.push({ studentId, date, title, content })
      }
    }

    if (activityDataList.length === 0) {
      uploadStatus.value = "등록할 유효한 데이터가 없습니다. 양식을 확인해주세요."
      isUploading.value = false
      return
    }

    const successCount = await clubStore.bulkUploadActivities(activityDataList)
    
    uploadStatus.value = `성공! 총 ${successCount}건의 활동 기록이 학생들에게 등록되었습니다.`
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
  <div class="bg-indigo-50 p-6 rounded-lg shadow-md mb-6 border border-indigo-200">
    <h3 class="text-lg font-bold mb-2 text-indigo-900">📝 동아리 활동 일괄 등록</h3>
    <p class="text-sm text-indigo-700 mb-4 leading-relaxed">
      설문지로 제출받은 학생들의 활동 내용을 복사해서 붙여넣어 주세요.<br>
      <span class="font-bold text-red-600">'학번', '활동명', '내용'</span> 열 제목이 반드시 포함되어야 합니다.
    </p>
    
    <div class="bg-white p-3 rounded border border-indigo-100 mb-4 text-xs font-mono text-gray-600">
      <p class="font-bold mb-1">📝 입력 예시 (엑셀에서 복사 후 붙여넣기):</p>
      학번, 날짜, 활동명, 내용<br>
      10501, 2026-04-15, AI 스터디 1회차, "파이썬 기초 문법을 배우고 계산기 프로그램을 직접 구현해봄."<br>
      10502, 2026-04-15, AI 스터디 1회차, "조원들과 함께 오류를 찾고 해결하는 과정에서 협업의 중요성을 느낌."
    </div>

    <textarea 
      v-model="rawData" 
      class="w-full h-32 p-3 border border-indigo-200 rounded text-sm mb-4 focus:ring-2 focus:ring-indigo-400 focus:outline-none" 
      placeholder="여기에 엑셀 데이터를 붙여넣으세요."
      :disabled="isUploading"
    ></textarea>
    
    <div class="flex items-center gap-4">
      <button 
        @click="handleUpload" 
        :disabled="isUploading"
        class="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded transition-colors disabled:bg-gray-400 shadow-sm"
      >
        {{ isUploading ? '등록 중...' : '활동 기록 일괄 등록' }}
      </button>
      <span v-if="uploadStatus" class="text-sm font-bold" :class="uploadStatus.includes('성공') ? 'text-green-600' : 'text-red-500'">
        {{ uploadStatus }}
      </span>
    </div>
  </div>
</template>