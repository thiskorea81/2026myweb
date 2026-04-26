<script setup>
import { ref } from 'vue'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../firebase'
import { useStudentStore } from '../stores/studentStore'

const studentStore = useStudentStore()
const uploadStatus = ref('')
const isUploading = ref(false)
const progress = ref({ current: 0, total: 0 })
const fileInput = ref(null)

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE_MB = 5

const compressImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const targetWidth = 300
        const targetHeight = (img.height / img.width) * targetWidth
        canvas.width = targetWidth
        canvas.height = targetHeight
        canvas.getContext('2d').drawImage(img, 0, 0, targetWidth, targetHeight)
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8)
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

const handlePhotoUpload = async (event) => {
  const files = Array.from(event.target.files || [])
  if (!files.length) return

  isUploading.value = true
  progress.value = { current: 0, total: files.length }
  uploadStatus.value = '사진 업로드 준비 중...'

  let successCount = 0
  const skipped = []
  const errors = []

  for (const file of files) {
    progress.value.current++
    uploadStatus.value = `처리 중... (${progress.value.current}/${progress.value.total})`

    if (!ALLOWED_TYPES.includes(file.type)) {
      errors.push(`${file.name}: 허용되지 않는 파일 형식`)
      continue
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      errors.push(`${file.name}: 파일 크기 초과 (최대 ${MAX_FILE_SIZE_MB}MB)`)
      continue
    }

    const studentId = file.name.replace(/\.[^/.]+$/, '')
    const studentExists = studentStore.students.some((s) => s.studentId === studentId)

    if (!studentExists) {
      skipped.push(studentId)
      continue
    }

    try {
      const compressed = await compressImage(file)
      const photoRef = storageRef(storage, `student-photos/${studentId}.jpg`)
      await uploadBytes(photoRef, compressed, { contentType: 'image/jpeg' })
      const downloadURL = await getDownloadURL(photoRef)
      await studentStore.updateStudent(studentId, { photoUrl: downloadURL })
      successCount++
    } catch (err) {
      errors.push(`${file.name}: 업로드 실패`)
    }
  }

  if (fileInput.value) fileInput.value.value = ''
  await studentStore.fetchStudents()
  isUploading.value = false

  const parts = [`완료! 성공: ${successCount}명`]
  if (skipped.length) parts.push(`학번 불일치: ${skipped.length}명`)
  if (errors.length) parts.push(`오류: ${errors.length}건`)
  uploadStatus.value = parts.join(' | ')
}
</script>

<template>
  <div class="bg-pink-50 p-6 rounded-lg shadow-md mb-6 border border-pink-200">
    <h3 class="text-lg font-bold mb-2 text-pink-900">📸 학생 사진 일괄 등록</h3>
    <p class="text-sm text-pink-700 mb-4 leading-relaxed">
      파일명이 <span class="font-bold text-red-600">'학번.jpg'</span> (예: 10501.jpg)인 사진들을 모두 선택해서 올려주세요.<br>
      jpg·png·webp 허용 / 파일당 최대 5MB / Firebase Storage에 저장됩니다.
    </p>

    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-4">
        <label
          class="bg-pink-600 hover:bg-pink-700 text-white font-medium py-2 px-6 rounded transition-colors shadow-sm cursor-pointer"
          :class="{ 'opacity-50 cursor-not-allowed': isUploading }"
        >
          {{ isUploading ? `사진 처리 중... (${progress.current}/${progress.total})` : '폴더에서 사진 선택하기' }}
          <input
            type="file"
            ref="fileInput"
            accept="image/jpeg,image/png,image/webp"
            multiple
            @change="handlePhotoUpload"
            class="hidden"
            :disabled="isUploading"
          />
        </label>
        <span
          v-if="uploadStatus && !isUploading"
          class="text-sm font-bold"
          :class="uploadStatus.startsWith('완료') ? 'text-green-600' : 'text-red-500'"
        >
          {{ uploadStatus }}
        </span>
      </div>

      <div v-if="isUploading" class="w-full bg-pink-200 rounded-full h-2">
        <div
          class="bg-pink-600 h-2 rounded-full transition-all duration-300"
          :style="{ width: `${(progress.current / progress.total) * 100}%` }"
        ></div>
      </div>
    </div>
  </div>
</template>