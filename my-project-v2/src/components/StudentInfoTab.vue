<script setup>
import { ref, watch } from 'vue'
import { useStudentStore } from '../stores/studentStore'

const props = defineProps({
  student: { type: Object, required: true }
})
const emit = defineEmits(['close'])
const studentStore = useStudentStore()

const isEditMode = ref(false)
const isSaving = ref(false)
const editForm = ref({})

watch(() => props.student, (newVal) => {
  if (newVal) editForm.value = { ...newVal }
}, { immediate: true })

const saveStudentInfo = async () => {
  isSaving.value = true
  try {
    await studentStore.updateStudent(props.student.id, editForm.value)
    isEditMode.value = false
  } catch (error) {
    console.error("수정 실패:", error)
  } finally {
    isSaving.value = false
  }
}

const cancelEdit = () => {
  editForm.value = { ...props.student }
  isEditMode.value = false
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-end gap-2 mb-4">
      <button v-if="!isEditMode" @click="isEditMode = true" class="px-4 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-bold hover:bg-blue-200 transition-colors">✏️ 정보 수정</button>
      <template v-else>
        <button @click="cancelEdit" class="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300 transition-colors">취소</button>
        <button @click="saveStudentInfo" :disabled="isSaving" class="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors disabled:bg-blue-300">
          {{ isSaving ? '저장 중...' : '💾 저장' }}
        </button>
      </template>
    </div>

    <div class="space-y-6">
      
      <div class="grid grid-cols-1 lg:grid-cols-[130px_1fr] gap-6">
        
        <div class="w-[130px] h-[173px] bg-gray-100 border border-gray-300 rounded-xl overflow-hidden shadow-sm flex items-center justify-center shrink-0 mx-auto lg:mx-0">
          <img v-if="student.photoUrl" :src="student.photoUrl" alt="학생 사진" class="w-full h-full object-cover">
          <div v-else class="text-gray-400 text-xs font-bold text-center">사진 없음</div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-gray-50 p-4 rounded-lg border border-gray-100 h-full">
            <h4 class="font-bold text-gray-700 border-b pb-2 mb-3">📞 연락처 및 주소</h4>
            <div class="space-y-2 text-sm">
              <p class="flex items-center"><span class="text-gray-500 w-24">본인 연락처:</span> 
                <input v-if="isEditMode" v-model="editForm.phone" class="border border-gray-300 p-1.5 rounded w-full focus:ring-2 focus:ring-blue-400 outline-none">
                <span v-else class="font-medium">{{ student.phone || '-' }}</span>
              </p>
              <p class="flex items-center"><span class="text-gray-500 w-24">보호자1:</span> 
                <input v-if="isEditMode" v-model="editForm.parent1Phone" class="border border-gray-300 p-1.5 rounded w-full focus:ring-2 focus:ring-blue-400 outline-none">
                <span v-else class="font-medium">{{ student.parent1Phone || '-' }}</span>
              </p>
              <p class="flex items-center"><span class="text-gray-500 w-24">보호자2:</span> 
                <input v-if="isEditMode" v-model="editForm.parent2Phone" class="border border-gray-300 p-1.5 rounded w-full focus:ring-2 focus:ring-blue-400 outline-none">
                <span v-else>{{ student.parent2Phone || '-' }}</span>
              </p>
              <p class="flex items-start"><span class="text-gray-500 w-24 mt-1.5">주소:</span> 
                <textarea v-if="isEditMode" v-model="editForm.address" class="border border-gray-300 p-1.5 rounded w-full h-12 resize-none focus:ring-2 focus:ring-blue-400 outline-none"></textarea>
                <span v-else class="w-[calc(100%-6rem)]">{{ student.address || '-' }}</span>
              </p>
            </div>
          </div>

          <div class="bg-gray-50 p-4 rounded-lg border border-gray-100 h-full">
            <h4 class="font-bold text-gray-700 border-b pb-2 mb-3">🎯 진로 및 흥미</h4>
            <div class="space-y-2 text-sm">
              <p class="flex items-center"><span class="text-gray-500 w-24">희망 진로:</span> 
                <input v-if="isEditMode" v-model="editForm.career" class="border border-gray-300 p-1.5 rounded w-full focus:ring-2 focus:ring-blue-400 outline-none">
                <span v-else class="font-bold text-blue-600">{{ student.career || '-' }}</span>
              </p>
              <p class="flex items-start"><span class="text-gray-500 w-24 mt-1.5">희망 대학:</span> 
                <textarea v-if="isEditMode" v-model="editForm.university" class="border border-gray-300 p-1.5 rounded w-full h-12 resize-none focus:ring-2 focus:ring-blue-400 outline-none"></textarea>
                <span v-else class="w-[calc(100%-6rem)]">{{ student.university || '-' }}</span>
              </p>
              <p class="flex items-center"><span class="text-gray-500 w-24">취미:</span> 
                <input v-if="isEditMode" v-model="editForm.hobby" class="border border-gray-300 p-1.5 rounded w-full focus:ring-2 focus:ring-blue-400 outline-none">
                <span v-else>{{ student.hobby || '-' }}</span>
              </p>
              <p class="flex items-center"><span class="text-gray-500 w-24">특기:</span> 
                <input v-if="isEditMode" v-model="editForm.specialty" class="border border-gray-300 p-1.5 rounded w-full focus:ring-2 focus:ring-blue-400 outline-none">
                <span v-else>{{ student.specialty || '-' }}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isEditMode" class="bg-purple-50 p-4 rounded-lg border border-purple-100 space-y-4 text-sm mt-6">
        <h4 class="font-bold text-purple-800 border-b border-purple-200 pb-2">✏️ 세부 내용 (학교 생활 및 기타)</h4>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="block text-xs text-blue-600 font-bold mb-1">좋아하는 과목</label><input v-model="editForm.favoriteSubject" class="border border-blue-200 p-2 rounded w-full focus:ring-2 focus:ring-blue-400 outline-none"></div>
          <div><label class="block text-xs text-red-500 font-bold mb-1">싫어하는 과목</label><input v-model="editForm.dislikeSubject" class="border border-red-200 p-2 rounded w-full focus:ring-2 focus:ring-red-400 outline-none"></div>
          <div><label class="block text-xs text-green-600 font-bold mb-1">칭찬할 점</label><input v-model="editForm.goodPoint" class="border border-green-200 p-2 rounded w-full focus:ring-2 focus:ring-green-400 outline-none"></div>
          <div><label class="block text-xs text-orange-500 font-bold mb-1">부족한 점</label><input v-model="editForm.badPoint" class="border border-orange-200 p-2 rounded w-full focus:ring-2 focus:ring-orange-400 outline-none"></div>
        </div>
        <div><label class="block text-xs text-gray-500 font-bold mb-1">가족 소개</label><textarea v-model="editForm.family" class="border border-gray-300 p-2 rounded w-full h-16 resize-none focus:ring-2 focus:ring-blue-400 outline-none"></textarea></div>
        <div><label class="block text-xs text-gray-500 font-bold mb-1">선생님께 하고 싶은 말 (비고)</label><textarea v-model="editForm.memo" class="border border-gray-300 p-2 rounded w-full h-24 resize-none focus:ring-2 focus:ring-blue-400 outline-none"></textarea></div>
      </div>

      <template v-else>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm mt-6">
          <div class="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <h4 class="font-bold text-blue-800 border-b border-blue-200 pb-2 mb-3">💡 나의 장단점</h4>
            <p class="mb-1"><span class="text-blue-600 font-bold w-24 inline-block">칭찬할 점:</span> {{ student.goodPoint || '-' }}</p>
            <p><span class="text-red-500 font-bold w-24 inline-block">부족한 점:</span> {{ student.badPoint || '-' }}</p>
          </div>
          <div class="bg-green-50 p-4 rounded-lg border border-green-100">
            <h4 class="font-bold text-green-800 border-b border-green-200 pb-2 mb-3">📚 교과목 선호도</h4>
            <p class="mb-1"><span class="text-green-600 font-bold w-24 inline-block">좋아하는 과목:</span> {{ student.favoriteSubject || '-' }}</p>
            <p><span class="text-gray-500 font-bold w-24 inline-block">싫어하는 과목:</span> {{ student.dislikeSubject || '-' }}</p>
          </div>
        </div>
        <div class="bg-yellow-50 p-4 rounded-lg border border-yellow-100 text-sm">
          <h4 class="font-bold text-yellow-800 mb-2">👨‍👩‍👧‍👦 우리 가족 소개</h4>
          <p class="text-gray-700 whitespace-pre-line">{{ student.family || '-' }}</p>
        </div>
        <div class="bg-purple-50 p-4 rounded-lg border border-purple-100 text-sm">
          <h4 class="font-bold text-purple-800 mb-2">💬 선생님께 하고 싶은 말</h4>
          <p class="text-gray-700 whitespace-pre-line leading-relaxed">{{ student.memo || '-' }}</p>
        </div>
      </template>
    </div>
  </div>
</template>