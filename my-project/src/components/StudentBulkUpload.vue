<script setup>
import { ref } from 'vue'
import { collection, writeBatch, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useStudentStore } from '../stores/studentStore'

const studentStore = useStudentStore()
const rawData = ref('')
const uploadStatus = ref('')
const isUploading = ref(false)

// 💡 닫기 기능 추가 (선택 사항이지만 통일감을 위해 추가)
const emit = defineEmits(['close'])

const handleBulkUpload = async () => {
  if (!rawData.value.trim()) {
    uploadStatus.value = '데이터를 먼저 붙여넣어 주세요.'
    return
  }

  isUploading.value = true
  uploadStatus.value = '데이터를 분석하고 업로드하는 중...'

  try {
    const lines = rawData.value.split('\n').filter(line => line.trim() !== '')
    
    const batch = writeBatch(db)
    const studentsRef = collection(db, 'students')
    
    let successCount = 0

    lines.forEach((line) => {
      // 엑셀에서 복사하면 기본적으로 탭(\t)으로 열이 분리됩니다.
      const cols = line.split('\t')
      
      const studentId = cols[0]?.trim() || ''
      
      // 💡 학번이 비어있거나, 복사한 텍스트가 헤더(제목 줄 '학번')인 경우 건너뛰기
      if (!studentId || studentId === '학번' || isNaN(parseInt(studentId))) return

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

      // 학번을 고유 문서 ID로 사용하여, 이미 있는 학번이면 업데이트(merge) 되도록 처리
      const newDocRef = doc(studentsRef, String(studentId))
      batch.set(newDocRef, studentData, { merge: true })
      
      successCount++
    })

    await batch.commit()
    
    // 업로드 성공 후 화면의 학생 목록을 즉시 최신화
    await studentStore.fetchStudents()

    uploadStatus.value = `✅ 성공! 총 ${successCount}명의 학생 데이터가 업로드/업데이트되었습니다.`
    rawData.value = '' 
    
    // 2초 뒤에 성공 메시지 초기화
    setTimeout(() => { uploadStatus.value = '' }, 3000)

  } catch (error) {
    console.error('업로드 에러:', error)
    uploadStatus.value = '❌ 업로드 중 오류가 발생했습니다. 데이터를 확인해주세요.'
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="mb-6 bg-gray-50 border border-gray-200 rounded-2xl p-6 shadow-sm relative">
    <button @click="$emit('close')" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
    
    <div class="flex flex-col gap-4">
      <div>
        <h3 class="text-lg font-black text-gray-900 mb-2">🙋‍♂️ 학생 데이터 일괄 등록 (엑셀 붙여넣기)</h3>
        <p class="text-sm text-gray-600 font-medium leading-relaxed mb-2">
          엑셀이나 스프레드시트에서 아래 <span class="font-bold text-gray-900 bg-gray-200 px-1 rounded">18개 항목 순서대로</span> 작성한 표 전체를 
          드래그하여 복사(Ctrl+C)한 후, 빈칸에 붙여넣기(Ctrl+V) 하세요.<br>
          <span class="text-blue-600 font-bold">※ 이미 존재하는 학번은 새로운 내용으로 자동 덮어쓰기(업데이트) 됩니다.</span>
        </p>
        
        <div class="bg-white p-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 overflow-x-auto custom-scrollbar">
          <div class="flex gap-4 border-b pb-2 mb-2 text-gray-400 whitespace-nowrap">
            <span class="w-12">1.학번</span>
            <span class="w-16">2.이름</span>
            <span class="w-10">3.성별</span>
            <span class="w-20">4.생년월일</span>
            <span class="w-24">5.학생연락처</span>
            <span class="w-24">6.부 연락처</span>
            <span class="w-24">7.모 연락처</span>
            <span class="w-40">8.주소</span>
            <span class="w-20">9.희망진로</span>
            <span class="w-24">10.희망대학</span>
            <span class="w-16">11.취미</span>
            <span class="w-16">12.특기</span>
            <span class="w-20">13.장점</span>
            <span class="w-20">14.단점</span>
            <span class="w-20">15.호감과목</span>
            <span class="w-20">16.비호감과목</span>
            <span class="w-20">17.가족관계</span>
            <span class="w-32">18.메모</span>
          </div>
          <div class="flex gap-4 text-gray-700 whitespace-nowrap">
            <span class="w-12 text-blue-600">10101</span>
            <span class="w-16 text-gray-900">홍길동</span>
            <span class="w-10">남</span>
            <span class="w-20">20080101</span>
            <span class="w-24">010-1234-5678</span>
            <span class="w-24">010-1111-2222</span>
            <span class="w-24">010-3333-4444</span>
            <span class="w-40">서울시 강남구...</span>
            <span class="w-20">경영학자</span>
            <span class="w-24">한국대학교</span>
            <span class="w-16">독서</span>
            <span class="w-16">피아노</span>
            <span class="w-20">성실함</span>
            <span class="w-20">성격 급함</span>
            <span class="w-20">수학</span>
            <span class="w-20">체육</span>
            <span class="w-20">부,모,여동생</span>
            <span class="w-32">시력 안좋아 앞자리...</span>
          </div>
        </div>
      </div>

      <textarea 
        v-model="rawData" 
        class="w-full h-40 p-4 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-gray-800 resize-none font-mono text-sm bg-white text-gray-900 placeholder-gray-400"
        placeholder="여기에 엑셀 데이터를 붙여넣기(Ctrl+V) 하세요..."
        :disabled="isUploading"
      ></textarea>

      <div class="flex items-center justify-between">
        <span class="text-sm font-bold" :class="uploadStatus.includes('성공') ? 'text-blue-600' : 'text-red-500'">
          {{ uploadStatus }}
        </span>
        
        <button 
          @click="handleBulkUpload" 
          :disabled="isUploading || !rawData.trim()"
          class="px-6 py-3 bg-gray-800 text-white font-black rounded-xl hover:bg-black transition-colors shadow-md disabled:opacity-50 flex items-center gap-2"
        >
          <span v-if="isUploading" class="animate-spin">🔄</span>
          {{ isUploading ? '업로드 중...' : '💾 학생 데이터 일괄 등록' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { height: 8px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
</style>