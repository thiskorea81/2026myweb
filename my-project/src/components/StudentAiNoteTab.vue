<script setup>
import { onMounted, computed } from 'vue'
import { useAiNoteStore } from '../stores/aiNoteStore'
import { storeToRefs } from 'pinia'

const props = defineProps({
  student: { type: Object, required: true },
  modelValue: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue'])

const aiNoteStore = useAiNoteStore()
const { notes } = storeToRefs(aiNoteStore)

onMounted(() => {
  aiNoteStore.fetchNotes(props.student.id)
})

const deleteNote = async (id) => {
  if (confirm('이 AI 노트를 삭제하시겠습니까?')) {
    await aiNoteStore.deleteNote(id)
  }
}

const formatDate = (isoString) => {
  const date = new Date(isoString)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const selectedIds = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between mb-4 border-b pb-2">
      <h4 class="font-bold text-indigo-800 text-lg">🤖 AI 분석 노트</h4>
      <p class="text-xs text-gray-500">AI 비서가 남긴 분석 및 조언 기록입니다.</p>
    </div>

    <div v-if="notes.length === 0" class="flex-1 flex items-center justify-center text-gray-400 text-sm py-20">
      저장된 AI 노트가 없습니다.
    </div>
    
    <div class="space-y-4">
      <div v-for="note in notes" :key="note.id" class="bg-indigo-50 border border-indigo-100 p-5 rounded-xl shadow-sm relative group">
        <div class="flex justify-between items-center mb-3">
          <div class="flex items-center gap-3">
            <input type="checkbox" v-model="selectedIds" :value="note.id" class="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer" title="인쇄에 포함" />
            <span class="text-xs font-bold text-indigo-400">🗓️ {{ formatDate(note.createdAt) }}</span>
          </div>
          <button @click="deleteNote(note.id)" class="text-xs bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 px-3 py-1.5 rounded font-bold transition-colors opacity-0 group-hover:opacity-100">
            기록 삭제
          </button>
        </div>
        <p class="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">{{ note.content }}</p>
      </div>
    </div>
  </div>
</template>