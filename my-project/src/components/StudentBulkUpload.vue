<script setup>
import { ref } from 'vue'
import { collection, writeBatch, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useStudentStore } from '../stores/studentStore' // 업로드 후 목록 갱신을 위해 추가

const studentStore = useStudentStore()
const rawData = ref('')
const uploadStatus = ref('')
const isUploading = ref(false)

const handleBulkUpload = async () => {
  if (!rawData.value.trim()) {
    uploadStatus.value = '데이터를 먼저 붙여넣어 주세요.'
    return
  }

  isUploading.value = true
  uploadStatus.value = '데이터를 분석하고 업로드하는 중...'

  try {
    const lines = rawData.value.split('\n').filter(line => line.trim() !== '')
    const dataLines = lines.slice(1)
    
    const batch = writeBatch(db)
    const studentsRef = collection(db, 'students')
    
    let successCount = 0

    dataLines.forEach((line) => {
      const cols = line.split('\t')
      
      const studentId = cols[0]?.trim() || ''
      
      // 학번이 비어있는 줄은 무시 (가장 중요)
      if (!studentId) return

      const studentData = {
        studentId: studentId,
        name: cols[1]?.trim() || '',
        gender: cols[2]?.trim() || '',
        birthDate: cols[3]?.trim() || '',
        phone: cols[4]?.trim() || '',
        parent1Phone: cols[5]?.trim() || '',
        parent2Phone: cols[6]?.trim() || '',
        address: cols[7]?.trim() || '',
        career: cols[8]?.trim() || '',
        university: cols[9]?.trim() || '',
        hobby: cols[10]?.trim() || '',
        specialty: cols[11]?.trim() || '',
        goodPoint: cols[12]?.trim() || '',
        badPoint: cols[13]?.trim() || '',
        favoriteSubject: cols[14]?.trim() || '',
        dislikeSubject: cols[15]?.trim() || '',
        family: cols[16]?.trim() || '',
        memo: cols[17]?.trim() || '',
        createdAt: new Date()
      }

      // 💡 핵심 변경: 무작위 ID 대신 '학번(studentId)'을 문서의 고유 ID로 지정
      // merge: true 옵션을 주어 이미 있는 학번이면 기존 정보를 유지한 채 수정된 내용만 덮어씁니다.
      const newDocRef = doc(studentsRef, String(studentId))
      batch.set(newDocRef, studentData, { merge: true })
      
      successCount++
    })

    await batch.commit()
    
    // 업로드 성공 후 화면의 학생 목록을 즉시 최신화 (오름차순 정렬 포함)
    await studentStore.fetchStudents()

    uploadStatus.value = `성공! 총 ${successCount}명의 학생 데이터가 업로드/업데이트되었습니다.`
    rawData.value = '' 
    
  } catch (error) {
    console.error('업로드 에러:', error)
    uploadStatus.value = '업로드 중 오류가 발생했습니다. 콘솔 창을 확인해주세요.'
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="bg-white p-6 rounded-lg shadow-md mb-6 border border-gray-200">
    <h3 class="text-lg font-bold mb-4 text-gray-800">📊 학생 데이터 일괄 등록 (TSV/Excel)</h3>
    <p class="text-sm text-gray-600 mb-4">
      엑셀이나 스프레드시트에서 <span class="font-bold text-blue-600">학번부터 마지막 질문까지의 표 전체</span>를 복사해서 아래 빈칸에 붙여넣으세요.
    </p>
    
    <textarea 
      v-model="rawData" 
      class="w-full h-40 p-3 border rounded text-sm mb-4 focus:ring-2 focus:ring-blue-400 focus:outline-none" 
      placeholder="여기에 엑셀 데이터를 붙여넣기 하세요..."
      :disabled="isUploading"
    ></textarea>
    
    <div class="flex items-center gap-4">
      <button 
        @click="handleBulkUpload" 
        :disabled="isUploading"
        class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded transition-colors disabled:bg-gray-400"
      >
        {{ isUploading ? '업로드 중...' : '데이터 일괄 업로드' }}
      </button>
      <span v-if="uploadStatus" class="text-sm font-medium" :class="uploadStatus.includes('성공') ? 'text-green-600' : 'text-red-500'">
        {{ uploadStatus }}
      </span>
    </div>
  </div>
</template>