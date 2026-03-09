<script setup>
import { ref, watch, computed } from 'vue'
import { useClubStore } from '../stores/clubStore'
import { aiService } from '../services/aiService' // 💡 최신 공통 서비스 임포트
import { z } from "zod" // 💡 스키마 검증용

const props = defineProps({
  student: { type: Object, required: true }
})
const clubStore = useClubStore()

const obsRecord = ref('')
const finalRecord = ref('')
const isSaving = ref(false)
const isGenerating = ref(false)
const isRevising = ref(false) // 💡 기존 코드에서 누락된 ref 추가

const draftHistory = ref([])
const currentVersionIndex = ref(-1)
const revisionRequest = ref('')

// 💡 동아리 생기부 응답 구조 정의 (스키마)
const clubSchema = z.object({
  clubRecord: z.string().describe("1500바이트 이내의 동아리 활동 특기사항 문장")
});

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

watch(() => props.student, (newVal) => {
  if (newVal) {
    obsRecord.value = newVal.obsClubRecord || ''
    finalRecord.value = newVal.finalClubRecord || ''
    try {
      draftHistory.value = newVal.recordAiDraftHistory ? JSON.parse(newVal.recordAiDraftHistory) : []
      currentVersionIndex.value = draftHistory.value.length - 1
    } catch (e) {
      draftHistory.value = []; currentVersionIndex.value = -1;
    }
  }
}, { immediate: true })

const saveRecords = async () => {
  isSaving.value = true
  try {
    const updateData = {
      obsClubRecord: obsRecord.value,
      finalClubRecord: finalRecord.value,
      recordAiDraftHistory: JSON.stringify(draftHistory.value)
    }
    await clubStore.updateStudent(props.student.id, updateData)
    Object.assign(props.student, updateData)
  } catch (error) { console.error(error) } finally { isSaving.value = false }
}

const generateDraft = async () => {
  if (draftHistory.value.length > 0 && !confirm('새 초안을 생성하시겠습니까?')) return
  isGenerating.value = true
  
  try {
    const acts = props.student.clubActivities || []
    const actsText = acts.map(a => `[${a.date}] ${a.title}: ${a.content}`).join('\n')

    const prompt = `동아리 생기부 전문가로서 다음 데이터를 바탕으로 특기사항을 작성하세요.
    이름/역할: ${props.student.name} / ${props.student.clubRole}
    진로: ${props.student.career}
    메모: ${obsRecord.value}
    활동내역: ${actsText}
    [규칙] 1500바이트 이내, 명사형 종결, 책 제목 '제목 (저자)' 형식 준수.`

    // 💡 최신 aiService.askStructured 사용
    const result = await aiService.askStructured(prompt, clubSchema)
    
    draftHistory.value.push({ 
      version: Date.now(), 
      type: '새 초안', 
      prompt: '자동 종합 생성', 
      data: result, // { clubRecord: "..." }
      createdAt: new Date().toISOString() 
    })
    currentVersionIndex.value = draftHistory.value.length - 1
    await saveRecords()
  } catch (error) { 
    console.error(error)
    alert('AI 초안 생성 중 오류가 발생했습니다.') 
  } finally { isGenerating.value = false }
}

const reviseDraft = async () => {
  if (!revisionRequest.value.trim() || !currentDraft.value) return
  isRevising.value = true
  try {
    const prompt = `아래 동아리 생기부 초안을 선생님의 요청에 맞게 수정하세요.
    [이전 초안] ${currentDraft.value.data.clubRecord}
    [수정 요청] ${revisionRequest.value}
    [규칙] 1500바이트 이내 유지.`

    // 💡 수정 시에도 구조화된 출력 적용
    const result = await aiService.askStructured(prompt, clubSchema)
    
    draftHistory.value.push({ 
      version: Date.now(), 
      type: '수정안', 
      prompt: revisionRequest.value, 
      data: result, 
      createdAt: new Date().toISOString() 
    })
    currentVersionIndex.value = draftHistory.value.length - 1
    revisionRequest.value = ''
    await saveRecords()
  } catch (error) { 
    console.error(error)
    alert('수정안 생성 중 오류가 발생했습니다.') 
  } finally { isRevising.value = false }
}

const applyToFinal = () => {
  if (confirm('이 버전을 [최종 생기부 기록] 창으로 덮어쓰시겠습니까?')) {
    finalRecord.value = currentDraft.value.data.clubRecord
    saveRecords()
  }
}

const copyText = async (text) => { try { await navigator.clipboard.writeText(text); alert('복사되었습니다.') } catch (e) {} }
const goPrev = () => { if (currentVersionIndex.value > 0) currentVersionIndex.value-- }
const goNext = () => { if (currentVersionIndex.value < draftHistory.value.length - 1) currentVersionIndex.value++ }
</script>

<template>
  <div class="flex flex-col h-full overflow-y-auto pr-2 custom-scrollbar">
    <div class="sticky top-0 bg-white z-10 flex justify-between items-center mb-4 pb-2 border-b pt-1">
      <h4 class="font-bold text-teal-800 text-lg">📝 동아리 생기부 작성</h4>
      <button @click="saveRecords" :disabled="isSaving" class="px-6 py-2 bg-gray-800 text-white rounded-lg text-sm font-bold shadow-sm">
        {{ isSaving ? '저장 중...' : '💾 내용 저장' }}
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <div class="flex flex-col bg-blue-50 border border-blue-100 rounded-lg p-3 shadow-sm">
        <label class="text-sm font-bold text-blue-800">📌 평소 관찰 메모 (수시 기록용)</label>
        <p class="text-[11px] text-blue-600/80 mb-2 mt-0.5">💡 설문조사에 없는 평소 태도나 역할을 자유롭게 적어두세요.</p>
        <textarea v-model="obsRecord" @blur="saveRecords" class="w-full h-40 p-2 border border-blue-200 rounded text-sm resize-none focus:ring-2 focus:ring-blue-400 outline-none"></textarea>
      </div>

      <div class="flex flex-col bg-emerald-50 border border-emerald-200 rounded-lg p-3 shadow-sm">
        <div class="flex justify-between items-end mb-2">
          <div>
            <label class="text-sm font-bold text-emerald-800">🎓 최종 생기부 특기사항 (NEIS용)</label>
            <p class="text-[11px] text-emerald-600/80 mt-0.5">💡 이 내용이 최종적으로 나이스에 입력됩니다.</p>
          </div>
          <span class="text-xs font-bold font-mono" :class="getByteLength(finalRecord) > 1500 ? 'text-red-500' : 'text-emerald-600'">{{ getByteLength(finalRecord) }} / 1500 byte</span>
        </div>
        <textarea v-model="finalRecord" @blur="saveRecords" class="w-full h-40 p-2 border border-emerald-300 rounded text-sm resize-none focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="AI 초안을 가져오거나 직접 작성하세요."></textarea>
      </div>
    </div>

    <div class="mb-4">
      <div class="flex justify-between items-center mb-3">
        <h5 class="font-bold text-gray-700 flex items-center gap-2"><span class="text-purple-500">🤖</span> AI 생기부 어시스턴트</h5>
        <button @click="generateDraft" :disabled="isGenerating || isRevising" class="px-4 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg text-sm font-bold shadow-sm">✨ 새 초안 자동 생성</button>
      </div>

      <div v-if="currentDraft || isGenerating || isRevising" class="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 shadow-inner flex flex-col gap-4">
        <div v-if="isGenerating || isRevising" class="py-10 text-center text-purple-600 font-bold animate-pulse">
          AI가 학생의 활동 기록을 바탕으로 최적의 문장을 구성 중입니다...
        </div>

        <div v-else-if="currentDraft" class="flex flex-col gap-4">
          <div class="flex justify-between items-center border-b border-purple-200 pb-3">
            <div class="flex items-center gap-3 bg-white px-3 py-1 rounded-full border border-purple-200 shadow-sm mx-auto">
              <button @click="goPrev" :disabled="currentVersionIndex === 0" class="text-gray-500 hover:text-purple-600 font-black px-2">&lt;</button>
              <span class="text-xs font-bold text-purple-800 flex flex-col items-center">
                <span>버전 {{ currentVersionIndex + 1 }} / {{ draftHistory.length }}</span>
                <span class="text-[10px] text-purple-600 font-medium bg-purple-100 px-2 rounded mt-0.5">{{ currentDraft.type }}</span>
              </span>
              <button @click="goNext" :disabled="currentVersionIndex === draftHistory.length - 1" class="text-gray-500 hover:text-purple-600 font-black px-2">&gt;</button>
            </div>
          </div>

          <div v-if="currentVersionIndex === draftHistory.length - 1" class="bg-white border border-purple-200 p-3 rounded-lg flex gap-2 items-start shadow-sm">
            <textarea v-model="revisionRequest" class="flex-1 h-12 p-2 bg-gray-50 border border-gray-200 rounded text-sm resize-none focus:ring-2 focus:ring-purple-400 outline-none" placeholder="수정 지시하기 (예: 진로와의 연관성을 더 높여줘)"></textarea>
            <button @click="reviseDraft" :disabled="!revisionRequest.trim()" class="h-12 px-4 bg-purple-600 text-white rounded font-bold text-sm hover:bg-purple-700">적용</button>
          </div>

          <div class="bg-white border border-purple-100 p-4 rounded-lg shadow-sm">
            <div class="flex justify-between items-center mb-2">
              <h5 class="font-bold text-purple-700">동아리 특기사항 초안 <span class="font-mono text-xs font-normal text-gray-400 ml-1">({{ getByteLength(currentDraft.data.clubRecord) }} byte)</span></h5>
              <div class="flex gap-2">
                <button @click="applyToFinal" class="text-xs px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded font-bold">⬆️ 최종 기록으로 가져오기</button>
                <button @click="copyText(currentDraft.data.clubRecord)" class="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded font-bold">📋 복사</button>
              </div>
            </div>
            <p class="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{{ currentDraft.data.clubRecord }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>