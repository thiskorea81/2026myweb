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
    const lines = rawData.value.split('\n').filter(line => line.trim() !== '')
    if (lines.length < 2) throw new Error("데이터가 부족합니다.")

    const headers = lines[0].split(/[,\t]/).map(h => h.trim().replace(/"/g, ''))
    
    const idIdx = headers.findIndex(h => h === '학번')
    const dateIdx = headers.findIndex(h => h === '날짜' || h === '활동일자')
    const titleIdx = headers.findIndex(h => h === '활동명' || h === '주제')
    const contentIdx = headers.findIndex(h => h === '내용' || h === '활동내용' || h === '느낀점')

    if (idIdx === -1 || titleIdx === -1 || contentIdx === -1) {
      uploadStatus.value = "첫 줄에 '학번', '활동명', '내용' 열이 반드시 포함되어야 합니다!"
      isUploading.value = false
      return
    }

    const dataLines = lines.slice(1)
    const activityDataList = []

    dataLines.forEach(line => {
      // 정규식으로 큰따옴표 안의 쉼표 무시하고 분리
      const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split('\t')
      if (cols.length < 3) return

      const cleanCol = (idx) => (cols[idx] || '').replace(/^"|"$/g, '').trim()

      const studentId = cleanCol(idIdx)
      const date = dateIdx > -1 ? cleanCol(dateIdx) : ''
      const title = cleanCol(titleIdx)
      const content = cleanCol(contentIdx)

      if (studentId && title && content) {
        activityDataList.push({ studentId, date, title, content })
      }
    })

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