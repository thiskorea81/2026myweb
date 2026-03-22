<script setup>
defineProps({
  show: Boolean,
  history: Array
})
const emit = defineEmits(['close', 'restore'])
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
    <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
      <div class="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h3 class="text-xl font-black text-gray-800">🕒 업데이트 기록 (버전 복구)</h3>
        <button @click="emit('close')" class="text-3xl font-bold text-gray-400 hover:text-red-500 leading-none">&times;</button>
      </div>
      <div class="p-6 overflow-y-auto flex-1 bg-gray-100 flex flex-col gap-4">
        <div v-for="hist in [...history].reverse()" :key="hist.id" class="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
            <span class="text-sm font-bold" :class="hist.type.includes('AI') || hist.type.includes('병합') ? 'text-blue-600' : (hist.type.includes('복구') ? 'text-amber-600' : 'text-teal-600')">
              {{ hist.type }} <span class="text-gray-400 font-medium text-xs ml-2">{{ new Date(hist.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) }}</span>
            </span>
            <button @click="emit('restore', hist)" class="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-bold hover:bg-black transition-colors shrink-0">
              이 버전으로 덮어쓰기
            </button>
          </div>
          <p class="text-[15px] text-gray-800 whitespace-pre-wrap font-medium leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">{{ hist.content }}</p>
        </div>
        <div v-if="history.length === 0" class="text-center text-gray-400 font-bold py-10">저장된 업데이트 기록이 없습니다.</div>
      </div>
    </div>
  </div>
</template>