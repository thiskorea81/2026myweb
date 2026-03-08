<script setup>
import { ref, onMounted } from 'vue'
import { useCounselingStore } from '../stores/counselingStore'
import { storeToRefs } from 'pinia'

const props = defineProps({
  student: { type: Object, required: true }
})

const counselingStore = useCounselingStore()
const { logs: counselingLogs } = storeToRefs(counselingStore)

const newCounselDate = ref(new Date().toISOString().split('T')[0])
const newCounselContent = ref('')

onMounted(() => {
  counselingStore.fetchLogs(props.student.id)
})

const saveCounselLog = async () => {
  if (!newCounselContent.value.trim()) return alert('내용을 입력하세요.')
  await counselingStore.addLog(props.student.id, newCounselDate.value, newCounselContent.value)
  newCounselContent.value = ''
}

const deleteCounselLog = async (logId) => {
  if (confirm('이 상담 기록을 삭제하시겠습니까?')) await counselingStore.deleteLog(logId)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-6 shrink-0">
      <h4 class="font-bold text-blue-800 mb-3">📝 새 상담 기록 작성</h4>
      <div class="flex flex-col gap-3">
        <input type="date" v-model="newCounselDate" class="border border-gray-300 p-2 rounded text-sm w-40 focus:ring-2 focus:ring-blue-500 outline-none">
        <textarea v-model="newCounselContent" class="w-full border border-gray-300 p-3 rounded text-sm h-24 resize-none focus:ring-2 focus:ring-blue-500 outline-none" placeholder="상담 내용 기록..."></textarea>
        <div class="flex justify-end">
          <button @click="saveCounselLog" class="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">상담 기록 저장</button>
        </div>
      </div>
    </div>

    <div class="flex-1 space-y-4">
      <h4 class="font-bold text-gray-700 border-b pb-2">📋 지난 상담 내역</h4>
      <div v-if="counselingLogs.length === 0" class="text-center text-gray-500 py-10 text-sm">아직 기록된 상담 내역이 없습니다.</div>
      <div v-for="log in counselingLogs" :key="log.id" class="bg-white border border-gray-200 p-4 rounded-lg shadow-sm relative group">
        <div class="font-bold text-gray-500 mb-2 flex justify-between items-center text-sm">
          <span>🗓️ {{ log.date }}</span>
          <button @click="deleteCounselLog(log.id)" class="text-red-500 hover:text-red-700 text-xs font-bold opacity-0 group-hover:opacity-100 bg-red-50 px-2 py-1 rounded">삭제</button>
        </div>
        <p class="text-gray-800 text-sm whitespace-pre-line leading-relaxed">{{ log.content }}</p>
      </div>
    </div>
  </div>
</template>