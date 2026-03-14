<script setup>
import { ref } from 'vue'
import { useStudentStore } from '../stores/studentStore'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

const studentStore = useStudentStore()
const isProcessing = ref(false)
const pastedData = ref('')

const emit = defineEmits(['close'])

const handlePasteUpload = async () => {
  if (!pastedData.value.trim()) return alert('엑셀 데이터를 붙여넣어 주세요.')
  
  isProcessing.value = true
  
  // 줄바꿈으로 행 분리
  const rows = pastedData.value.trim().split('\n')
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < rows.length; i++) {
    const rowStr = rows[i].trim()
    if (!rowStr) continue

    // 엑셀 복붙은 탭(\t)으로 열이 구분됩니다. (CSV 쉼표 분리도 호환되도록 처리)
    let cols = rowStr.split('\t')
    if (cols.length < 5) cols = rowStr.split(',') // 탭이 없으면 쉼표로 시도

    if (cols.length < 5) continue // 데이터가 부족한 줄은 건너뜀

    const studentId = cols[0]?.trim()
    const name = cols[1]?.trim()
    const role = cols[2]?.trim()
    const activity = cols[3]?.trim()
    const recordType = cols[4]?.trim()
    const note = cols[5]?.trim() || ''

    // 헤더 줄(학번, 이름 등)이 포함되어 있으면 무시
    if (studentId === '학번' || isNaN(parseInt(studentId))) continue
    if (!studentId || !recordType) continue

    // 학번으로 학생 매칭
    const student = studentStore.students.find(s => String(s.studentId) === String(studentId))
    if (!student) {
      failCount++
      continue
    }

    // 💡 1. 텍스트 합성: [역할] 활동내용 (비고)
    let textToAppend = `[${role}] ${activity}`
    if (note) textToAppend += ` (${note})`

    // 💡 2. 생기부 영역 타겟팅
    let targetField = ''
    if (recordType.includes('자율')) targetField = 'obsAutonomous'
    else if (recordType.includes('진로')) targetField = 'obsCareer'
    else if (recordType.includes('행동') || recordType.includes('행특') || recordType.includes('종합')) targetField = 'obsBehavior'
    
    if (!targetField) {
      failCount++
      continue
    }

    // 💡 3. 기존 기록 아래에 줄바꿈으로 추가
    const currentText = student[targetField] || ''
    const newText = currentText ? `${currentText}\n${textToAppend}` : textToAppend

    try {
      // DB 및 Pinia Store 업데이트
      await updateDoc(doc(db, 'students', student.id), {
        [targetField]: newText
      })
      studentStore.updateStudent(student.id, { [targetField]: newText })
      successCount++
    } catch (error) {
      console.error(error)
      failCount++
    }
  }

  alert(`✅ 활동 등록 완료!\n- 성공: ${successCount}건\n- 실패/누락: ${failCount}건`)
  isProcessing.value = false
  pastedData.value = ''
  emit('close')
}
</script>

<template>
  <div class="mb-6 bg-teal-50 border border-teal-200 rounded-2xl p-6 shadow-sm relative">
    <button @click="$emit('close')" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
    
    <div class="flex flex-col gap-4">
      <div>
        <h3 class="text-lg font-black text-teal-900 mb-2">🎯 활동 및 역할 일괄 등록 (엑셀 붙여넣기)</h3>
        <p class="text-sm text-teal-700 font-medium leading-relaxed mb-2">
          엑셀에서 아래 순서대로 작성한 데이터를 <span class="font-bold text-teal-900 bg-teal-100 px-1 rounded">드래그하여 복사(Ctrl+C)</span>한 후, 
          아래 빈칸에 <span class="font-bold text-teal-900 bg-teal-100 px-1 rounded">붙여넣기(Ctrl+V)</span> 해주세요. 지정된 생기부 영역에 자동으로 누적됩니다.
        </p>
        
        <div class="bg-white p-3 rounded-xl border border-teal-100 text-xs font-bold text-gray-600 overflow-x-auto">
          <div class="flex gap-4 border-b pb-2 mb-2 text-gray-400">
            <span class="w-12">학번</span>
            <span class="w-16">이름</span>
            <span class="w-24">역할</span>
            <span class="w-40">활동내용</span>
            <span class="w-32">생기부영역</span>
            <span class="flex-1">비고(선택)</span>
          </div>
          <div class="flex gap-4 text-gray-700">
            <span class="w-12">10101</span>
            <span class="w-16">홍길동</span>
            <span class="w-24 text-teal-600">반장</span>
            <span class="w-40">학급 회의 주도</span>
            <span class="w-32 text-blue-600">자율활동</span>
            <span class="flex-1 text-gray-500">리더십이 돋보임</span>
          </div>
          <div class="flex gap-4 mt-1 text-gray-700">
            <span class="w-12">10102</span>
            <span class="w-16">김철수</span>
            <span class="w-24 text-teal-600">1인 1역</span>
            <span class="w-40">칠판 지우개 담당</span>
            <span class="w-32 text-indigo-600">행동특성종합의견</span>
            <span class="flex-1 text-gray-500">책임감 강함</span>
          </div>
        </div>
      </div>

      <textarea 
        v-model="pastedData" 
        class="w-full h-40 p-4 border border-teal-300 rounded-xl outline-none focus:ring-2 focus:ring-teal-500 resize-none font-mono text-sm bg-white text-gray-900 placeholder-gray-400"
        placeholder="여기에 엑셀 데이터를 붙여넣기(Ctrl+V) 하세요..."
        :disabled="isProcessing"
      ></textarea>

      <div class="flex justify-end">
        <button 
          @click="handlePasteUpload" 
          :disabled="isProcessing || !pastedData.trim()"
          class="px-6 py-3 bg-teal-600 text-white font-black rounded-xl hover:bg-teal-700 transition-colors shadow-md disabled:opacity-50 flex items-center gap-2"
        >
          <span v-if="isProcessing" class="animate-spin">🔄</span>
          {{ isProcessing ? '기록 중...' : '💾 학생별 활동 기록하기' }}
        </button>
      </div>
    </div>
  </div>
</template>