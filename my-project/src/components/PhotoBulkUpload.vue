<script setup>
import { ref } from 'vue'
import { useStudentStore } from '../stores/studentStore'

const studentStore = useStudentStore()
const uploadStatus = ref('')
const isUploading = ref(false)
const fileInput = ref(null)

// 💡 사진 자동 압축 로직 (데이터베이스 과부하 방지)
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        // 가로 150px 고정 (증명사진 비율로 자동 리사이징)
        const targetWidth = 150
        const targetHeight = (img.height / img.width) * targetWidth
        canvas.width = targetWidth
        canvas.height = targetHeight
        
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
        
        // 퀄리티 0.7로 압축하여 데이터베이스 용량 대폭 절약
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

const handlePhotoUpload = async (event) => {
  const files = event.target.files
  if (!files || files.length === 0) return

  isUploading.value = true
  uploadStatus.value = '사진을 압축하고 학번과 매칭하는 중...'
  
  let successCount = 0
  let failCount = 0

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      // 파일명에서 확장자 제거하여 학번만 추출 (예: "10501.jpg" -> "10501")
      const studentId = file.name.replace(/\.[^/.]+$/, "")

      // 해당 학번의 학생이 존재하는지 검사
      const studentExists = studentStore.students.some(s => s.studentId === studentId)
      
      if (studentExists) {
        // 사진 용량 압축
        const base64Image = await compressImage(file)
        
        // 해당 학생 데이터에 photoUrl 필드 추가/덮어쓰기
        await studentStore.updateStudent(studentId, { photoUrl: base64Image })
        successCount++
      } else {
        failCount++
      }
    }
    
    uploadStatus.value = `완료! 성공: ${successCount}명 | 실패(학번 불일치): ${failCount}명`
    if (fileInput.value) fileInput.value.value = '' 
    
  } catch (error) {
    console.error('사진 업로드 에러:', error)
    uploadStatus.value = '업로드 중 오류가 발생했습니다.'
  } finally {
    isUploading.value = false
    await studentStore.fetchStudents() // 목록 새로고침
  }
}
</script>

<template>
  <div class="bg-pink-50 p-6 rounded-lg shadow-md mb-6 border border-pink-200">
    <h3 class="text-lg font-bold mb-2 text-pink-900">📸 학생 사진 일괄 등록</h3>
    <p class="text-sm text-pink-700 mb-4 leading-relaxed">
      파일명이 <span class="font-bold text-red-600">'학번.jpg'</span> (예: 10501.jpg)인 사진들을 모두 선택해서 올려주세요.<br>
      시스템이 파일명을 인식하여 해당 학생의 프로필 사진으로 자동으로 꽂아줍니다. (다중 선택 가능)
    </p>
    
    <div class="flex items-center gap-4">
      <label class="bg-pink-600 hover:bg-pink-700 text-white font-medium py-2 px-6 rounded transition-colors shadow-sm cursor-pointer" :class="{ 'opacity-50 cursor-not-allowed': isUploading }">
        {{ isUploading ? '사진 처리 중...' : '폴더에서 사진 선택하기' }}
        <input 
          type="file" 
          ref="fileInput"
          accept="image/*" 
          multiple 
          @change="handlePhotoUpload" 
          class="hidden"
          :disabled="isUploading"
        >
      </label>
      <span v-if="uploadStatus" class="text-sm font-bold" :class="uploadStatus.includes('성공') ? 'text-green-600' : 'text-red-500'">
        {{ uploadStatus }}
      </span>
    </div>
  </div>
</template>