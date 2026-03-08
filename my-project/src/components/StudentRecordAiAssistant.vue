<script setup>
import { ref, watch, computed } from 'vue'
import { GoogleGenAI } from '@google/genai'
import { useStudentStore } from '../stores/studentStore'

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

const generateDraft = async () => {
  if (draftHistory.value.length > 0 && !confirm('기존 버전을 유지한 채로 새 초안을 생성하시겠습니까?')) return
  isGenerating.value = true
  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY })
    const counselText = props.counselingLogs.map(l => `${l.date}: ${l.content}`).join('\n')

    // 💡 분량 조절 규칙(가변성)이 추가된 프롬프트
    const prompt = `당신은 담임 교사를 돕는 나이스(NEIS) 생활기록부 작성 전문가입니다.
다음 학생의 기본 정보와 평소 관찰 메모를 바탕으로 생기부를 작성해주세요.

[학생 데이터]
이름:${props.student.name}, 진로:${props.student.career}, 특기:${props.student.specialty}, 장단점:${props.student.goodPoint}/${props.student.badPoint}
상담기록:${counselText}
자율활동메모:${props.obsRecords.autonomous} / 진로활동메모:${props.obsRecords.career} / 행동특성메모:${props.obsRecords.behavior}

[🌟 엄격한 작성 규칙]
1. 결과물은 반드시 아래 형태의 순수 JSON 포맷으로만 출력하세요. 마크다운(\`\`\`) 금지.
{"autonomous": "...", "career": "...", "behavior": "..."}
2. 책 제목이 들어갈 땐 반드시 '책제목 (저자)' 형식으로 작성하고, 문장 맨 앞에 어포스트로피(')를 쓰지 마세요.
3. 글자 수 제한: 자율(최대 1500바이트), 진로(최대 2100바이트), 행동특성 및 종합의견(최대 1500바이트)을 절대 넘지 마세요.
4. 분량 자동 조절: 교사가 제공한 메모나 활동 내용이 풍부하면 제한 바이트에 가깝게 최대한 길게 작성하고, 만약 활동 내용이 부실하거나 적으면 억지로 지어내지 말고 제한 분량의 2/3 이내로 알맞게 조절하여 작성하세요.
5. 명사형 종결이나 깔끔한 문장체로 전문성 있게 작성하세요.`

    const response = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt })
    const parsedDraft = JSON.parse(response.text.replace(/```json/gi, '').replace(/```/g, '').trim())
    
    draftHistory.value.push({
      version: Date.now(), type: draftHistory.value.length === 0 ? '최초 초안' : '새 초안',
      prompt: '자동 종합 생성', data: parsedDraft, createdAt: new Date().toISOString()
    })
    currentVersionIndex.value = draftHistory.value.length - 1
    await saveHistory()
  } catch (error) {
    alert('오류가 발생했습니다.')
  } finally { isGenerating.value = false }
}

const reviseDraft = async () => {
  if (!revisionRequest.value.trim() || !currentDraft.value) return
  isRevising.value = true
  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY })
    const prompt = `생기부 작성 전문가로서 아래 '이전 초안'을 교사의 [요청 사항]에 맞게 수정해주세요.
[이전 초안] 자율:${currentDraft.value.data.autonomous} / 진로:${currentDraft.value.data.career} / 행동:${currentDraft.value.data.behavior}
[수정 요청 사항] ${revisionRequest.value}

[엄격한 작성 규칙]
1. 순수 JSON 포맷으로 출력: {"autonomous": "...", "career": "...", "behavior": "..."}
2. 자율(최대 1500바이트), 진로(최대 2100바이트), 행동(최대 1500바이트) 제한 엄수. 내용이 적으면 제한의 2/3 이내로 조절.
3. 책 제목은 '책제목 (저자)' 형식. 맨 앞 어포스트로피 금지.`

    const response = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt })
    const parsedDraft = JSON.parse(response.text.replace(/```json/gi, '').replace(/```/g, '').trim())
    
    draftHistory.value.push({
      version: Date.now(), type: '수정안', prompt: revisionRequest.value,
      data: parsedDraft, createdAt: new Date().toISOString()
    })
    currentVersionIndex.value = draftHistory.value.length - 1
    revisionRequest.value = ''
    await saveHistory()
  } catch (error) { alert('오류가 발생했습니다.') } finally { isRevising.value = false }
}

const deleteCurrentDraft = async () => {
  if (!confirm('이 버전을 완전히 삭제하시겠습니까? (복구할 수 없습니다)')) return
  draftHistory.value.splice(currentVersionIndex.value, 1)
  if (currentVersionIndex.value >= draftHistory.value.length) {
    currentVersionIndex.value = draftHistory.value.length - 1
  }
  await saveHistory()
}

const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); alert('복사되었습니다.') } catch (e) {}
}

const goPrev = () => { if (currentVersionIndex.value > 0) currentVersionIndex.value-- }
const goNext = () => { if (currentVersionIndex.value < draftHistory.value.length - 1) currentVersionIndex.value++ }
</script>

<template>
  <div class="mb-4">
    <div class="flex justify-between items-center mb-3">
      <h5 class="font-bold text-gray-700 flex items-center gap-2">
        <span class="text-purple-500">🤖</span> 3. AI 생기부 어시스턴트
      </h5>
      <button @click="generateDraft" :disabled="isGenerating || isRevising" class="px-4 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg text-sm font-bold shadow-sm transition-transform active:scale-95 disabled:opacity-50">
        ✨ 새 초안 자동 생성
      </button>
    </div>

    <div v-if="currentDraft || isGenerating || isRevising" class="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 shadow-inner flex flex-col gap-4">
      <div class="flex justify-between items-center border-b border-purple-200 pb-3">
        <div v-if="draftHistory.length > 0 && !isGenerating && !isRevising" class="flex items-center gap-3 bg-white px-3 py-1 rounded-full border border-purple-200 shadow-sm mx-auto">
          <button @click="goPrev" :disabled="currentVersionIndex === 0" class="text-gray-500 hover:text-purple-600 disabled:opacity-30 font-black px-2">&lt;</button>
          <span class="text-xs font-bold text-purple-800 flex flex-col items-center">
            <span>버전 {{ currentVersionIndex + 1 }} / {{ draftHistory.length }}</span>
            <span class="text-[10px] text-purple-600 font-medium bg-purple-100 px-2 rounded mt-0.5">{{ currentDraft.type }}</span>
          </span>
          <button @click="goNext" :disabled="currentVersionIndex === draftHistory.length - 1" class="text-gray-500 hover:text-purple-600 disabled:opacity-30 font-black px-2">&gt;</button>
        </div>
        <button v-if="currentDraft && !isGenerating && !isRevising" @click="deleteCurrentDraft" class="text-xs text-red-500 hover:text-red-700 font-bold bg-white px-2 py-1 rounded border border-red-200 ml-2">버전 삭제</button>
      </div>

      <div v-if="isGenerating || isRevising" class="flex flex-col items-center justify-center py-10 text-purple-600 font-bold animate-pulse gap-4">
        <div class="w-8 h-8 border-4 border-purple-300 border-t-purple-600 rounded-full animate-spin"></div>
        AI가 메모 분량을 분석하여 최적의 생기부를 작성 중입니다...
      </div>

      <div v-else-if="currentDraft" class="flex flex-col gap-4">
        <div v-if="currentVersionIndex === draftHistory.length - 1" class="bg-white border border-purple-200 p-3 rounded-lg flex gap-2 items-start shadow-sm">
          <textarea v-model="revisionRequest" class="flex-1 h-12 p-2 bg-gray-50 border border-gray-200 rounded text-sm resize-none focus:ring-2 focus:ring-purple-400 outline-none" placeholder="AI에게 수정 지시하기 (예: 진로활동에 리더십 내용 추가)"></textarea>
          <button @click="reviseDraft" :disabled="!revisionRequest.trim()" class="h-12 px-4 bg-purple-600 text-white rounded font-bold text-sm hover:bg-purple-700 transition-colors">적용</button>
        </div>

        <div v-for="(val, key) in {'autonomous':'자율활동', 'career':'진로활동', 'behavior':'행동특성 및 종합의견'}" :key="key" class="bg-white border border-purple-100 p-4 rounded-lg shadow-sm">
          <div class="flex justify-between items-center mb-2">
            <h5 class="font-bold text-purple-700">{{ val }} <span class="font-mono text-xs font-normal text-gray-400 ml-1">({{ getByteLength(currentDraft.data[key]) }} byte)</span></h5>
            <div class="flex gap-2">
              <button @click="$emit('apply-to-final', key, currentDraft.data[key])" class="text-xs px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded font-bold transition-colors">⬆️ 최종 기록으로 가져오기</button>
              <button @click="copyText(currentDraft.data[key])" class="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded font-bold transition-colors">📋 복사</button>
            </div>
          </div>
          <p class="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{{ currentDraft.data[key] }}</p>
        </div>

        <div v-if="currentDraft.prompt && currentDraft.prompt !== '자동 종합 생성'" class="text-xs text-gray-500 bg-white p-2 rounded border border-gray-200 text-center">
          <span class="font-bold text-purple-600">💬 수정 요청사항:</span> "{{ currentDraft.prompt }}"
        </div>
      </div>
    </div>
  </div>
</template>