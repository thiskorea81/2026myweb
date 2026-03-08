<script setup>
import { ref, watch } from 'vue'
import { useClubStore } from '../stores/clubStore'

const props = defineProps({
  student: { type: Object, required: true }
})
const emit = defineEmits(['close'])
const clubStore = useClubStore()

const isEditMode = ref(false)
const editForm = ref({})

watch(() => props.student, (newVal) => {
  if (newVal) editForm.value = { ...newVal }
}, { immediate: true })

const saveStudentInfo = async () => {
  try {
    await clubStore.updateStudent(props.student.id, editForm.value)
    isEditMode.value = false
  } catch (error) {
    console.error("수정 실패:", error)
  }
}

const cancelEdit = () => {
  editForm.value = { ...props.student }
  isEditMode.value = false
}

// 특정 활동 기록 삭제 기능
const deleteActivity = async (activityId) => {
  if (!confirm('이 활동 기록을 삭제하시겠습니까?')) return
  const newActivities = (props.student.clubActivities || []).filter(a => a.id !== activityId)
  await clubStore.updateStudent(props.student.id, { clubActivities: newActivities })
  props.student.clubActivities = newActivities
}
</script>

<template>
  <div class="flex flex-col h-full gap-6">
    <div>
      <div class="flex justify-between items-center mb-3">
        <h4 class="font-bold text-orange-800 border-b-2 border-orange-200 pb-1">👤 기본 정보 및 동기</h4>
        <div class="flex gap-2">
          <button v-if="!isEditMode" @click="isEditMode = true" class="px-3 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold hover:bg-orange-200">✏️ 정보 수정</button>
          <template v-else>
            <button @click="cancelEdit" class="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs font-bold hover:bg-gray-300">취소</button>
            <button @click="saveStudentInfo" class="px-3 py-1 bg-orange-600 text-white rounded text-xs font-bold hover:bg-orange-700">💾 저장</button>
          </template>
        </div>
      </div>

      <div v-if="isEditMode" class="grid grid-cols-2 gap-4 bg-orange-50 p-4 rounded-lg border border-orange-100 text-sm">
        <div><label class="block text-xs font-bold mb-1">역할</label><input v-model="editForm.clubRole" class="w-full p-1.5 border rounded"></div>
        <div><label class="block text-xs font-bold mb-1">연락처</label><input v-model="editForm.phone" class="w-full p-1.5 border rounded"></div>
        <div><label class="block text-xs font-bold mb-1">희망 진로</label><input v-model="editForm.career" class="w-full p-1.5 border rounded"></div>
        <div><label class="block text-xs font-bold mb-1">특기</label><input v-model="editForm.specialty" class="w-full p-1.5 border rounded"></div>
        <div class="col-span-2"><label class="block text-xs font-bold mb-1">지원 동기</label><textarea v-model="editForm.motivation" class="w-full p-1.5 border rounded h-16 resize-none"></textarea></div>
      </div>
      <div v-else class="grid grid-cols-2 gap-4 bg-orange-50 p-4 rounded-lg border border-orange-100 text-sm">
        <p><span class="text-gray-500 font-bold w-20 inline-block">역할:</span> {{ student.clubRole || '-' }}</p>
        <p><span class="text-gray-500 font-bold w-20 inline-block">연락처:</span> {{ student.phone || '-' }}</p>
        <p><span class="text-gray-500 font-bold w-20 inline-block">희망 진로:</span> <span class="font-bold text-orange-700">{{ student.career || '-' }}</span></p>
        <p><span class="text-gray-500 font-bold w-20 inline-block">특기:</span> <span class="font-bold text-blue-600">{{ student.specialty || '-' }}</span></p>
        <p class="col-span-2"><span class="text-gray-500 font-bold block mb-1">지원 동기:</span> <span class="bg-white px-3 py-2 rounded block border border-orange-100">{{ student.motivation || '-' }}</span></p>
      </div>
    </div>

    <div class="flex-1 flex flex-col">
      <h4 class="font-bold text-indigo-800 border-b-2 border-indigo-200 pb-1 mb-3">📝 활동 내역 모아보기</h4>
      <div v-if="!student.clubActivities || student.clubActivities.length === 0" class="flex-1 flex justify-center items-center text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        등록된 활동 기록이 없습니다. (설문지로 일괄 등록해보세요)
      </div>
      <div v-else class="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
        <div v-for="act in [...student.clubActivities].reverse()" :key="act.id" class="bg-white border border-gray-200 p-4 rounded-lg shadow-sm relative group">
          <button @click="deleteActivity(act.id)" class="absolute top-3 right-3 text-xs bg-red-50 text-red-500 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">삭제</button>
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold">{{ act.date }}</span>
            <span class="font-bold text-gray-800">{{ act.title }}</span>
          </div>
          <p class="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{{ act.content }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
</style>