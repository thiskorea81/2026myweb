<script setup>
import { ref } from 'vue'
import { collection, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'

const props = defineProps({
  subject: { type: String, required: true },
  students: { type: Array, required: true }
})

const emit = defineEmits(['close', 'uploaded'])

const rawData = ref('')
const isUploading = ref(false)
const uploadStatus = ref('')

// 💡 엑셀(탭) 붙여넣기와 CSV(쉼표) 붙여넣기를 자동 감지하는 스마트 파서 (따옴표 안 구분자는 무시)
const parseTable = (text) => {
  const delimiter = text.split('\n')[0].includes('\t') ? '\t' : ','
  const rows = []
  let currentRow = []
  let currentCell = ''
  let insideQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"'
        i++
      } else {
        insideQuotes = !insideQuotes
      }
    } else if (char === delimiter && !insideQuotes) {
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
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim())
    if (currentRow.some(c => c !== '')) rows.push(currentRow)
  }
  return rows
}

const handleUpload = async () => {
  if (!rawData.value.trim()) return (uploadStatus.value = '데이터를 먼저 붙여넣어 주세요.')
  if (!props.subject) return (uploadStatus.value = '과목을 먼저 선택해주세요.')

  isUploading.value = true
  uploadStatus.value = '활동 기록을 분석하는 중...'

  try {
    const rows = parseTable(rawData.value.trim())
    if (rows.length < 2) throw new Error('데이터가 부족합니다.')

    const headers = rows[0]
    const idIdx = headers.findIndex(h => h.includes('학번'))
    const dateIdx = headers.findIndex(h => h.includes('날짜') || h.includes('일자'))
    const contentIdx = headers.findIndex(h => h.includes('내용') || h.includes('활동'))

    if (idIdx === -1 || contentIdx === -1) {
      uploadStatus.value = "첫 줄에 '학번'과 '내용(또는 활동내용)' 열이 반드시 포함되어야 합니다!"
      isUploading.value = false
      return
    }

    const batch = writeBatch(db)
    let successCount = 0
    let failCount = 0

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i]
      const studentId = cols[idIdx]?.trim()
      const content = cols[contentIdx]?.trim()
      const date = dateIdx > -1 ? cols[dateIdx]?.trim() : ''

      if (!studentId || !content) continue
      if (studentId === '학번') continue // 헤더가 중간에 또 붙여넣기 된 경우 방지

      const student = props.students.find(s => String(s.studentId) === String(studentId))
      if (!student) {
        failCount++
        continue
      }

      const recordRef = doc(collection(db, 'subjectRecords'))
      batch.set(recordRef, {
        studentId: student.studentId,
        studentName: student.name,
        subject: props.subject,
        date: date || new Date().toISOString().split('T')[0],
        content,
        createdAt: new Date().toISOString()
      })
      successCount++
    }

    if (successCount === 0) {
      uploadStatus.value = '등록할 유효한 데이터가 없습니다. 학번이 학생 명단과 일치하는지 확인해주세요.'
      isUploading.value = false
      return
    }

    await batch.commit()
    uploadStatus.value = `✅ 성공! ${successCount}건 등록 완료${failCount > 0 ? ` (학번 불일치 ${failCount}건 제외)` : ''}`
    rawData.value = ''
    emit('uploaded')
  } catch (error) {
    console.error(error)
    uploadStatus.value = '오류가 발생했습니다. 데이터 형식을 확인해주세요.'
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="mb-6 bg-blue-50 border border-blue-200 rounded-2xl p-6 shadow-sm relative">
    <button @click="$emit('close')" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>

    <div class="flex flex-col gap-4">
      <div>
        <h3 class="text-lg font-black text-blue-900 mb-2">📥 「{{ subject }}」 활동 기록 CSV 일괄 등록</h3>
        <p class="text-sm text-blue-700 font-medium leading-relaxed mb-2">
          CSV 파일을 텍스트 편집기나 엑셀에서 열어 전체를 복사(Ctrl+C)한 후 아래에 붙여넣기(Ctrl+V) 하세요.
          첫 줄에 <span class="font-bold text-blue-900 bg-blue-100 px-1 rounded">학번</span>과
          <span class="font-bold text-blue-900 bg-blue-100 px-1 rounded">내용</span> 열이 반드시 포함되어야 합니다.
          <span class="font-bold text-blue-900 bg-blue-100 px-1 rounded">날짜</span> 열은 선택사항이며, 비워두면 오늘 날짜로 등록됩니다.
        </p>

        <div class="bg-white p-3 rounded-xl border border-blue-100 text-xs font-mono text-gray-600 overflow-x-auto">
          <p class="font-bold mb-1 text-gray-500">📝 입력 예시:</p>
          학번,날짜,내용<br>
          30301,2026-08-07,"머신러닝 개념을 배우고 간단한 분류 모델을 직접 구현해봄."<br>
          30302,2026-08-07,"데이터 전처리 과정에서 결측치 처리 방법을 익히고 조원들과 토론함."
        </div>
      </div>

      <textarea
        v-model="rawData"
        class="w-full h-40 p-4 border border-blue-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm bg-white text-gray-900 placeholder-gray-400"
        placeholder="여기에 CSV 또는 엑셀 데이터를 붙여넣기(Ctrl+V) 하세요..."
        :disabled="isUploading"
      ></textarea>

      <div class="flex items-center justify-between">
        <span v-if="uploadStatus" class="text-sm font-bold" :class="uploadStatus.includes('성공') ? 'text-green-600' : 'text-red-500'">
          {{ uploadStatus }}
        </span>
        <div class="flex-1"></div>
        <button
          @click="handleUpload"
          :disabled="isUploading || !rawData.trim()"
          class="px-6 py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50 flex items-center gap-2"
        >
          <span v-if="isUploading" class="animate-spin">🔄</span>
          {{ isUploading ? '등록 중...' : '💾 활동 기록 일괄 등록' }}
        </button>
      </div>
    </div>
  </div>
</template>
