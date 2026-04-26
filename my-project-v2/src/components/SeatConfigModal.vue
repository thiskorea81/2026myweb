<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  show: Boolean,
  initialConfig: Array
})
const emit = defineEmits(['close', 'apply'])

const tempColCount = ref(6)
const tempRowCounts = ref([])

// 모달이 열릴 때 부모의 설정을 가져옵니다.
watch(() => props.show, (newVal) => {
  if (newVal) {
    tempColCount.value = props.initialConfig.length
    tempRowCounts.value = [...props.initialConfig]
  }
})

const adjustRowCounts = () => {
  const count = Math.max(1, Math.min(10, tempColCount.value || 1))
  if (tempRowCounts.value.length < count) {
    while (tempRowCounts.value.length < count) tempRowCounts.value.push(6)
  } else if (tempRowCounts.value.length > count) {
    tempRowCounts.value = tempRowCounts.value.slice(0, count)
  }
}

const handleApply = () => {
  emit('apply', [...tempRowCounts.value])
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
      <h3 class="text-xl font-bold text-gray-800 mb-2">⚙️ 자리 형태(열/행) 설정</h3>
      <p class="text-sm text-gray-500 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-200">
        우리 반의 분단(열) 개수를 설정하고, 각 분단별로 책상이 몇 줄(행)씩 들어갈지 설정하세요.
      </p>

      <div class="mb-6">
        <label class="block text-sm font-bold text-indigo-700 mb-2">총 분단(세로 열) 개수</label>
        <input type="number" min="1" max="10" v-model.number="tempColCount" @input="adjustRowCounts" class="w-full p-3 border border-indigo-200 bg-indigo-50 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-lg font-bold">
      </div>

      <label class="block text-sm font-bold text-gray-700 mb-3">각 분단별 자리(행) 개수</label>
      <div class="grid grid-cols-3 gap-3 mb-8 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
        <div v-for="(count, index) in tempRowCounts" :key="index" class="bg-gray-50 p-3 rounded-lg border border-gray-200 text-center">
          <label class="block text-xs font-bold text-gray-500 mb-1">{{ index + 1 }}분단 ({{ index + 1 }}열)</label>
          <input type="number" min="1" max="15" v-model.number="tempRowCounts[index]" class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-center font-bold">
        </div>
      </div>

      <div class="flex justify-end gap-3">
        <button @click="$emit('close')" class="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors">취소</button>
        <button @click="handleApply" class="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-md">적용하기</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
</style>