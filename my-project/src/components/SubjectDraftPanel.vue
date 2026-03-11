<script setup>
import { ref, computed, watch } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService'
import { getNeisByteLength } from '../services/textUtils' 

const props = defineProps({
  studentId: { type: String, required: true },
  subject: { type: String, required: true },
  records: { type: Array, required: true }
})

const draftContent = ref('')
const isGenerating = ref(false)
const aiInstruction = ref('') 
const isModifying = ref(false)

const currentBytes = computed(() => getNeisByteLength(draftContent.value))

const loadDraft = async () => {
  if (!props.studentId || !props.subject) return
  draftContent.value = ''
  aiInstruction.value = ''
  try {
    const snap = await getDoc(doc(db, 'subjectDrafts', `${props.subject}_${props.studentId}`))
    if (snap.exists()) draftContent.value = snap.data().content
  } catch (error) { console.error("초안 로드 실패:", error) }
}

watch([() => props.studentId, () => props.subject], loadDraft, { immediate: true })

const saveDraft = async () => {
  if (!draftContent.value.trim()) return alert('저장할 내용이 없습니다.')
  try {
    await setDoc(doc(db, 'subjectDrafts', `${props.subject}_${props.studentId}`), {
      studentId: props.studentId, subject: props.subject, content: draftContent.value, updatedAt: new Date().toISOString()
    })
    alert('💾 세특 초안이 안전하게 저장되었습니다.')
  } catch (error) { alert('저장 중 오류가 발생했습니다.') }
}

const generateAiDraft = async () => {
  if (props.records.length === 0) return alert('누적된 기록이 없습니다.')
  if (draftContent.value && !confirm('기존 초안이 덮어씌워집니다. 계속하시겠습니까?')) return
  isGenerating.value = true
  try {
    const activities = props.records.map(r => `- ${r.date}: ${r.content}`).join('\n')
    const prompt = `고등학교 '${props.subject}' 관찰 기록입니다.\n[기록]\n${activities}\n\n이 기록으로 학교생활기록부 '교과세특' 초안을 작성하세요. 객관적 문장체(~함, ~임)로 NEIS 1500바이트를 넘지 않도록 요약하세요. 인사말 없이 내용만 출력하세요.`
    draftContent.value = (await aiService.askText(prompt)).trim()
  } catch (error) { alert('오류가 발생했습니다.') } finally { isGenerating.value = false }
}

const modifyWithAi = async () => {
  if (!draftContent.value) return alert('수정할 원본이 없습니다.')
  if (!aiInstruction.value.trim()) return alert('수정 방향을 입력해주세요.')
  isModifying.value = true
  try {
    const prompt = `'${props.subject}' 세특 초안입니다.\n[현재 초안]\n${draftContent.value}\n\n선생님 지시사항: "${aiInstruction.value}"\n\n지시사항을 반영하여 다시 작성하세요. NEIS 기준 1500바이트 제한을 지키고 내용만 출력하세요.`
    draftContent.value = (await aiService.askText(prompt)).trim()
    aiInstruction.value = ''
  } catch (error) { alert('오류가 발생했습니다.') } finally { isModifying.value = false }
}
</script>

<template>
  <div class="flex flex-col h-full gap-4">
    <div class="flex justify-between items-end">
      <button @click="generateAiDraft" :disabled="isGenerating || isModifying || records.length === 0" class="px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold rounded-lg shadow-sm hover:from-teal-600 transition-all disabled:opacity-50">
        <span v-if="isGenerating" class="animate-spin">🔄</span> {{ isGenerating ? '생성 중...' : '✨ AI 생성' }}
      </button>
      <div class="text-sm font-bold bg-gray-100 px-3 py-1.5 rounded-lg border" :class="currentBytes > 1500 ? 'text-red-600 border-red-300 bg-red-50' : 'text-gray-700 border-gray-200'">
        <span>{{ currentBytes }}</span> / 1500 Bytes
      </div>
    </div>

    <div class="flex-1 relative">
      <div v-if="isGenerating || isModifying" class="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl border border-teal-100">
        <div class="text-teal-700 font-bold animate-pulse">{{ isGenerating ? 'AI 초안 작성 중...' : 'AI 수정 중...' }}</div>
      </div>
      <textarea 
        v-model="draftContent" 
        class="w-full h-full min-h-[200px] p-4 border rounded-xl outline-none focus:ring-2 resize-none font-medium leading-relaxed placeholder-gray-500" 
        :class="currentBytes > 1500 ? 'border-red-400 focus:ring-red-500 text-red-900 bg-red-50' : 'border-teal-200 focus:ring-teal-500 text-gray-900 bg-white'" 
        placeholder="AI가 생성한 초안이 이곳에 나타납니다. 직접 수정할 수 있습니다."
      ></textarea>
    </div>

    <div class="bg-gray-50 border border-gray-200 p-3 rounded-xl flex gap-2 items-center">
      <span class="text-xl pl-1">🤖</span>
      <input 
        v-model="aiInstruction" 
        @keyup.enter="modifyWithAi" 
        type="text" 
        class="flex-1 p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium bg-white text-gray-900 placeholder-gray-500" 
        placeholder="AI에게 추가 지시 (예: 리더십을 더 강조해줘)" 
        :disabled="isModifying || isGenerating" 
      />
      <button @click="modifyWithAi" :disabled="isModifying || isGenerating || !aiInstruction.trim()" class="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">수정 부탁하기</button>
    </div>

    <div class="flex justify-end pt-2 border-t border-gray-100 mt-2">
      <button @click="saveDraft" class="px-6 py-2.5 bg-gray-800 text-white font-bold rounded-xl hover:bg-black transition-colors">💾 최종 저장</button>
    </div>
  </div>
</template>