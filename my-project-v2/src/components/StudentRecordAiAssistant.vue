<script setup>
import { ref, watch, computed } from 'vue'
import { useStudentStore } from '../stores/studentStore'
import { aiService } from '../services/aiService' 
import { recordSchema, getRecordPrompt, getRevisionPrompt } from '../services/aiPrompts'

const props = defineProps({
  student: { type: Object, required: true },
  obsRecords: { type: Object, required: true },
  counselingLogs: { type: Array, required: true }
})
const emit = defineEmits(['apply-to-final'])
const studentStore = useStudentStore()

const isGenerating = ref(false)
const isRevising = ref(false)
const draftHistory = ref([])
const currentVersionIndex = ref(-1)
const revisionRequest = ref('')

const currentDraft = computed(() => {
  if (draftHistory.value.length === 0 || currentVersionIndex.value === -1) return null
  return draftHistory.value[currentVersionIndex.value]
})

const getByteLength = (str) => {
  if (!str) return 0
  let byte = 0
  for (let i = 0; i < str.length; i++) byte += (str.charCodeAt(i) > 128) ? 3 : 1
  return byte
}

watch(() => props.student.recordAiDraftHistory, (newVal) => {
  if (newVal) {
    try {
      draftHistory.value = JSON.parse(newVal)
      currentVersionIndex.value = draftHistory.value.length - 1
    } catch (e) {
      draftHistory.value = []; currentVersionIndex.value = -1;
    }
  } else {
    draftHistory.value = []; currentVersionIndex.value = -1;
  }
}, { immediate: true })

const saveHistory = async () => {
  const historyStr = JSON.stringify(draftHistory.value)
  await studentStore.updateStudent(props.student.id, { recordAiDraftHistory: historyStr })
  props.student.recordAiDraftHistory = historyStr
}

/**
 * 💡 버전 삭제 함수 (복구됨)
 */
const deleteCurrentDraft = async () => {
  if (!confirm('현재 보고 있는 이 버전을 완전히 삭제하시겠습니까?')) return
  
  draftHistory.value.splice(currentVersionIndex.value, 1)
  
  // 삭제 후 인덱스 조정
  if (currentVersionIndex.value >= draftHistory.value.length) {
    currentVersionIndex.value = draftHistory.value.length - 1
  }
  
  await saveHistory()
}

const generateDraft = async () => {
  if (draftHistory.value.length > 0 && !confirm('새 초안을 생성하시겠습니까?')) return
  isGenerating.value = true
  try {
    const counselText = props.counselingLogs.map(l => `${l.date}: ${l.content}`).join('\n')
    const prompt = getRecordPrompt(props.student, counselText, props.obsRecords)
    const result = await aiService.askStructured(prompt, recordSchema)
    
    draftHistory.value.push({
      version: Date.now(), 
      type: draftHistory.value.length === 0 ? '최초 초안' : '새 초안',
      prompt: '자동 종합 생성', 
      data: result, 
      createdAt: new Date().toISOString()
    })
    currentVersionIndex.value = draftHistory.value.length - 1
    await saveHistory()
  } catch (error) {
    alert('오류 발생')
  } finally { isGenerating.value = false }
}

const reviseDraft = async () => {
  if (!revisionRequest.value.trim() || !currentDraft.value) return
  isRevising.value = true
  try {
    const prompt = getRevisionPrompt(currentDraft.value.data, revisionRequest.value)
    const result = await aiService.askStructured(prompt, recordSchema)
    
    draftHistory.value.push({
      version: Date.now(), 
      type: '수정안', 
      prompt: revisionRequest.value,
      data: result, 
      createdAt: new Date().toISOString()
    })
    currentVersionIndex.value = draftHistory.value.length - 1
    revisionRequest.value = ''
    await saveHistory()
  } catch (error) { 
    alert('수정 실패') 
  } finally { isRevising.value = false }
}

const goPrev = () => { if (currentVersionIndex.value > 0) currentVersionIndex.value-- }
const goNext = () => { if (currentVersionIndex.value < draftHistory.value.length - 1) currentVersionIndex.value++ }
</script>

<template>
  <div class="mb-4">
    <div class="flex justify-between items-center mb-4">
      <h5 class="font-bold text-gray-800 flex items-center gap-2">
        <span class="text-purple-500">🤖</span> 3. AI 생기부 어시스턴트
      </h5>
      <button @click="generateDraft" :disabled="isGenerating || isRevising" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
        ✨ 새 초안 자동 생성
      </button>
    </div>

    <div v-if="currentDraft || isGenerating || isRevising" class="bg-purple-50 border-2 border-purple-200 rounded-2xl p-5 shadow-inner flex flex-col gap-5">
      <div class="flex justify-between items-center border-b border-purple-200 pb-4">
        <div v-if="draftHistory.length > 0 && !isGenerating && !isRevising" class="flex items-center gap-4 bg-white px-4 py-1.5 rounded-full border border-purple-200 shadow-sm mx-auto">
          <button @click="goPrev" :disabled="currentVersionIndex === 0" class="text-gray-400 hover:text-purple-600 font-black px-2">&lt;</button>
          <span class="text-xs font-bold text-purple-800">버전 {{ currentVersionIndex + 1 }} / {{ draftHistory.length }}</span>
          <button @click="goNext" :disabled="currentVersionIndex === draftHistory.length - 1" class="text-gray-400 hover:text-purple-600 font-black px-2">&gt;</button>
        </div>
        <button 
          v-if="currentDraft && !isGenerating && !isRevising" 
          @click="deleteCurrentDraft" 
          class="text-xs font-bold text-red-500 bg-white px-2 py-1 rounded border border-red-100 hover:bg-red-50"
        >
          버전 삭제
        </button>
      </div>

      <div v-if="isGenerating || isRevising" class="py-12 text-center text-purple-600 font-bold animate-pulse">
        생기부를 작성 중입니다...
      </div>

      <div v-else-if="currentDraft" class="flex flex-col gap-6">
        <div v-if="currentVersionIndex === draftHistory.length - 1" class="bg-white border border-purple-200 p-4 rounded-xl flex gap-3 shadow-sm">
          <textarea v-model="revisionRequest" class="flex-1 h-16 p-3 bg-gray-50 border border-gray-100 rounded-lg text-sm resize-none focus:ring-2 focus:ring-purple-400 outline-none" placeholder="수정 지시하기"></textarea>
          <button @click="reviseDraft" :disabled="!revisionRequest.trim()" class="h-16 px-5 bg-purple-600 text-white rounded-lg font-bold text-sm">적용</button>
        </div>

        <div v-for="(val, key) in {'autonomous':'자율활동', 'career':'진로활동', 'behavior':'행동특성 및 종합의견'}" :key="key" class="bg-white border border-purple-100 p-5 rounded-xl shadow-sm">
          <div class="flex justify-between items-center mb-3">
            <h5 class="font-bold text-purple-800">{{ val }} <span class="font-mono text-[11px] text-gray-400 ml-1">{{ getByteLength(currentDraft.data[key]) }} byte</span></h5>
            <button @click="$emit('apply-to-final', key, currentDraft.data[key])" class="text-xs px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg font-bold">⬆️ 최종 기록으로 적용</button>
          </div>
          <p class="text-[14px] text-gray-800 whitespace-pre-wrap leading-relaxed">{{ currentDraft.data[key] }}</p>
        </div>
      </div>
    </div>
  </div>
</template>