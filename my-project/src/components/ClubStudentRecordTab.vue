<script setup>
import { ref, watch, computed } from 'vue'
import { useClubStore } from '../stores/clubStore'
import { aiService } from '../services/aiService' 
import { clubSchema, getClubRecordPrompt } from '../services/aiPrompts' // 💡 공통 프롬프트 및 스키마 임포트

const props = defineProps({
  student: { type: Object, required: true }
})
const clubStore = useClubStore()

const obsRecord = ref('')
const finalRecord = ref('')
const isSaving = ref(false)
const isGenerating = ref(false)
const isRevising = ref(false) 

const draftHistory = ref([])
const currentVersionIndex = ref(-1)
const revisionRequest = ref('')

/**
 * 💡 현재 선택된 초안 버전 데이터
 */
const currentDraft = computed(() => {
  if (draftHistory.value.length === 0 || currentVersionIndex.value === -1) return null
  return draftHistory.value[currentVersionIndex.value]
})

/**
 * 💡 나이스 바이트 계산 (한글 3바이트 기준)
 */
const getByteLength = (str) => {
  if (!str) return 0
  let byte = 0
  for (let i = 0; i < str.length; i++) byte += (str.charCodeAt(i) > 128) ? 3 : 1
  return byte
}

/**
 * 💡 학생 데이터 변경 시 초기화 로직
 */
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

/**
 * 💡 Firebase 저장 로직
 */
const saveRecords = async () => {
  isSaving.value = true
  try {
    const updateData = {
      obsClubRecord: obsRecord.value,
      finalClubRecord: finalRecord.value,
      recordAiDraftHistory: JSON.stringify(draftHistory.value)
    }
    await clubStore.updateStudent(props.student.id, updateData)
    // 부모 객체 데이터 동기화
    Object.assign(props.student, updateData)
  } catch (error) { 
    console.error("저장 에러:", error) 
  } finally { 
    isSaving.value = false 
  }
}

/**
 * 💡 AI 초안 생성
 */
const generateDraft = async () => {
  if (draftHistory.value.length > 0 && !confirm('새 초안을 생성하시겠습니까?')) return
  isGenerating.value = true
  
  try {
    const acts = props.student.clubActivities || []
    const actsText = acts.map(a => `[${a.date}] ${a.title}: ${a.content}`).join('\n')

    // 💡 공통 프롬프트 빌더 사용
    const prompt = getClubRecordPrompt(props.student, actsText, obsRecord.value)
    const result = await aiService.askStructured(prompt, clubSchema)
    
    draftHistory.value.push({ 
      version: Date.now(), 
      type: '새 초안', 
      prompt: '자동 종합 생성', 
      data: result, 
      createdAt: new Date().toISOString() 
    })
    currentVersionIndex.value = draftHistory.value.length - 1
    await saveRecords()
  } catch (error) { 
    console.error(error)
    alert('AI 초안 생성 중 오류가 발생했습니다.') 
  } finally { isGenerating.value = false }
}

/**
 * 💡 AI 초안 수정 요청
 */
const reviseDraft = async () => {
  if (!revisionRequest.value.trim() || !currentDraft.value) return
  isRevising.value = true
  try {
    const prompt = `동아리 생기부 초안을 수정합니다.\n[이전 초안] ${currentDraft.value.data.clubRecord}\n[요청] ${revisionRequest.value}\n규칙: 1500바이트 이내 유지 및 명사형 종결.`;

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

/**
 * 💡 현재 보고 있는 버전 삭제 (복구됨)
 */
const deleteCurrentDraft = async () => {
  if (!confirm('이 초안 버전을 삭제하시겠습니까? (복구할 수 없습니다)')) return
  
  draftHistory.value.splice(currentVersionIndex.value, 1)
  
  // 삭제 후 인덱스 보정
  if (currentVersionIndex.value >= draftHistory.value.length) {
    currentVersionIndex.value = draftHistory.value.length - 1
  }
  
  await saveRecords()
}

/**
 * 💡 최종 기록으로 적용
 */
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
  <div class="flex flex-col h-full overflow-y-auto pr-2 custom-scrollbar font-sans">
    
    <div class="sticky top-0 bg-white z-10 flex justify-between items-center mb-4 pb-2 border-b pt-1">
      <h4 class="font-bold text-teal-800 text-lg flex items-center gap-2">
        <span class="text-xl">🎨</span> 동아리 생기부 작성
      </h4>
      <button @click="saveRecords" :disabled="isSaving" class="px-6 py-2 bg-gray-800 text-white rounded-xl text-sm font-bold shadow-md hover:bg-black transition-all active:scale-95">
        {{ isSaving ? '저장 중...' : '💾 내용 저장' }}
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <div class="flex flex-col bg-blue-50/50 border border-blue-100 rounded-2xl p-4 shadow-sm">
        <label class="text-sm font-bold text-blue-800">📌 평소 관찰 메모 (수시 기록용)</label>
        <p class="text-[11px] text-blue-600/70 mb-2 mt-0.5">설문조사에 없는 학생의 태도나 특이사항을 기록해 두세요.</p>
        <textarea v-model="obsRecord" @blur="saveRecords" class="w-full h-44 p-3 border border-blue-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-400 outline-none transition-all"></textarea>
      </div>

      <div class="flex flex-col bg-emerald-50/50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
        <div class="flex justify-between items-end mb-2">
          <div>
            <label class="text-sm font-bold text-emerald-800">🎓 최종 생기부 기록 (NEIS용)</label>
            <p class="text-[11px] text-emerald-600/70 mt-0.5">이 내용이 생활기록부에 최종적으로 입력됩니다.</p>
          </div>
          <span class="text-[11px] font-bold font-mono px-2 py-0.5 rounded bg-white border border-emerald-200" :class="getByteLength(finalRecord) > 1500 ? 'text-red-500' : 'text-emerald-600'">
            {{ getByteLength(finalRecord) }} / 1500 byte
          </span>
        </div>
        <textarea v-model="finalRecord" @blur="saveRecords" class="w-full h-44 p-3 border border-emerald-300 rounded-xl text-sm resize-none focus:ring-2 focus:ring-emerald-500 outline-none transition-all" placeholder="AI 초안을 가져오거나 직접 입력하세요."></textarea>
      </div>
    </div>

    <div class="mb-6">
      <div class="flex justify-between items-center mb-4">
        <h5 class="font-bold text-gray-700 flex items-center gap-2">
          <span class="text-purple-500">🤖</span> AI 생기부 어시스턴트
        </h5>
        <button @click="generateDraft" :disabled="isGenerating || isRevising" class="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg hover:scale-105 transition-all disabled:opacity-50">
          ✨ 새 초안 자동 생성
        </button>
      </div>

      <div v-if="currentDraft || isGenerating || isRevising" class="bg-purple-50/50 border-2 border-purple-100 rounded-3xl p-6 shadow-inner flex flex-col gap-5">
        
        <div class="flex justify-between items-center border-b border-purple-100 pb-4">
          <div v-if="draftHistory.length > 0 && !isGenerating && !isRevising" class="flex items-center gap-4 bg-white px-4 py-1.5 rounded-full border border-purple-200 shadow-sm mx-auto">
            <button @click="goPrev" :disabled="currentVersionIndex === 0" class="text-gray-400 hover:text-purple-600 font-black px-2 disabled:opacity-30">&lt;</button>
            <span class="text-xs font-bold text-purple-800 flex flex-col items-center">
              <span>버전 {{ currentVersionIndex + 1 }} / {{ draftHistory.length }}</span>
              <span class="text-[10px] text-purple-500 bg-purple-50 px-2 rounded-lg mt-0.5">{{ currentDraft.type }}</span>
            </span>
            <button @click="goNext" :disabled="currentVersionIndex === draftHistory.length - 1" class="text-gray-400 hover:text-purple-600 font-black px-2 disabled:opacity-30">&gt;</button>
          </div>
          <button 
            v-if="currentDraft && !isGenerating && !isRevising" 
            @click="deleteCurrentDraft" 
            class="text-xs font-bold text-red-500 hover:text-red-700 bg-white px-3 py-1 rounded-lg border border-red-100 transition-colors"
          >
            버전 삭제
          </button>
        </div>

        <div v-if="isGenerating || isRevising" class="py-12 text-center text-purple-600 font-bold animate-pulse flex flex-col items-center gap-4">
          <div class="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
          활동 기록과 관찰 메모를 분석 중입니다...
        </div>

        <div v-else-if="currentDraft" class="flex flex-col gap-6">
          <div v-if="currentVersionIndex === draftHistory.length - 1" class="bg-white border border-purple-100 p-4 rounded-2xl flex gap-3 shadow-sm">
            <textarea v-model="revisionRequest" class="flex-1 h-16 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm resize-none focus:ring-2 focus:ring-purple-400 outline-none" placeholder="수정 지시하기 (예: 리더십과 협업 태도를 더 강조해줘)"></textarea>
            <button @click="reviseDraft" :disabled="!revisionRequest.trim()" class="h-16 px-5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 shadow-md transition-colors">적용</button>
          </div>

          <div class="bg-white border border-purple-100 p-6 rounded-2xl shadow-sm">
            <div class="flex justify-between items-center mb-4">
              <h5 class="font-bold text-purple-800 flex items-center gap-2">
                동아리 활동 특기사항 초안 
                <span class="font-mono text-[11px] font-normal text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                  {{ getByteLength(currentDraft.data.clubRecord) }} byte
                </span>
              </h5>
              <div class="flex gap-2">
                <button @click="applyToFinal" class="text-xs px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg font-bold shadow-sm transition-colors">⬆️ 최종 기록으로 적용</button>
                <button @click="copyText(currentDraft.data.clubRecord)" class="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg font-bold">📋 복사</button>
              </div>
            </div>
            <p class="text-[14px] text-gray-800 whitespace-pre-wrap leading-relaxed font-medium">{{ currentDraft.data.clubRecord }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #99f6e4; border-radius: 4px; }
</style>