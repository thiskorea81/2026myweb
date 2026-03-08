<script setup>
import { ref, watch } from 'vue'
import { useStudentStore } from '../stores/studentStore'
import { useCounselingStore } from '../stores/counselingStore'
import StudentRecordAiAssistant from './StudentRecordAiAssistant.vue'

const props = defineProps({
  student: { type: Object, required: true }
})

const studentStore = useStudentStore()
const counselingStore = useCounselingStore()

const obsRecords = ref({ autonomous: '', career: '', behavior: '' })
const finalRecords = ref({ autonomous: '', career: '', behavior: '' })
const isSaving = ref(false)

const getByteLength = (str) => {
  if (!str) return 0
  let byte = 0
  for (let i = 0; i < str.length; i++) byte += (str.charCodeAt(i) > 128) ? 3 : 1
  return byte
}

watch(() => props.student, (newVal) => {
  if (newVal) {
    obsRecords.value = {
      autonomous: newVal.obsAutonomous ?? newVal.recordAutonomous ?? '',
      career: newVal.obsCareer ?? newVal.recordCareer ?? '',
      behavior: newVal.obsBehavior ?? newVal.recordBehavior ?? ''
    }
    finalRecords.value = {
      autonomous: newVal.finalAutonomous ?? '',
      career: newVal.finalCareer ?? '',
      behavior: newVal.finalBehavior ?? ''
    }
  }
}, { immediate: true })

const saveRecords = async () => {
  isSaving.value = true
  try {
    const updateData = {
      obsAutonomous: obsRecords.value.autonomous,
      obsCareer: obsRecords.value.career,
      obsBehavior: obsRecords.value.behavior,
      finalAutonomous: finalRecords.value.autonomous,
      finalCareer: finalRecords.value.career,
      finalBehavior: finalRecords.value.behavior
    }
    await studentStore.updateStudent(props.student.id, updateData)
    Object.assign(props.student, updateData)
  } catch (error) {
    console.error("생기부 저장 실패:", error)
  } finally {
    isSaving.value = false
  }
}

const handleApplyToFinal = (key, text) => {
  if (confirm('이 버전의 내용을 [최종 생기부 기록] 창으로 덮어쓰시겠습니까?')) {
    finalRecords.value[key] = text
    saveRecords()
  }
}
</script>

<template>
  <div class="flex flex-col h-full overflow-y-auto pr-2 custom-scrollbar">
    
    <div class="sticky top-0 bg-white z-10 flex justify-between items-center mb-4 pb-2 border-b pt-1">
      <h4 class="font-bold text-teal-800 text-lg">📝 학교생활기록부 통합 관리</h4>
      <button @click="saveRecords" :disabled="isSaving" class="px-6 py-2 bg-gray-800 text-white rounded-lg text-sm font-bold shadow-sm transition-transform active:scale-95 disabled:opacity-50">
        {{ isSaving ? '저장 중...' : '💾 전체 내용 저장' }}
      </button>
    </div>

    <div class="mb-8">
      <h5 class="font-bold text-gray-700 mb-3 flex items-center gap-2"><span class="text-blue-500">📌</span> 1. 평소 관찰 메모 (수시 기록용)</h5>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div class="flex flex-col bg-blue-50 border border-blue-100 rounded-lg p-3 shadow-sm">
          <label class="text-sm font-bold text-blue-800">자율활동 메모</label>
          <p class="text-[11px] text-blue-600/80 mb-2 mt-0.5 font-medium">💡 학급 회의, 1인 1역, 자율 활동 등</p>
          <textarea v-model="obsRecords.autonomous" @blur="saveRecords" class="w-full flex-1 min-h-[120px] p-2 border border-blue-200 rounded text-sm resize-none focus:ring-2 focus:ring-blue-400 outline-none leading-relaxed"></textarea>
        </div>
        
        <div class="flex flex-col bg-blue-50 border border-blue-100 rounded-lg p-3 shadow-sm">
          <label class="text-sm font-bold text-blue-800">진로활동 메모</label>
          <p class="text-[11px] text-blue-600/80 mb-2 mt-0.5 font-medium">💡 진로 탐색, 희망 대학 관련 활동, 동아리 등</p>
          <textarea v-model="obsRecords.career" @blur="saveRecords" class="w-full flex-1 min-h-[120px] p-2 border border-blue-200 rounded text-sm resize-none focus:ring-2 focus:ring-blue-400 outline-none leading-relaxed"></textarea>
        </div>

        <div class="flex flex-col bg-blue-50 border border-blue-100 rounded-lg p-3 shadow-sm">
          <label class="text-sm font-bold text-blue-800">행동특성/종합의견 메모</label>
          <p class="text-[11px] text-blue-600/80 mb-2 mt-0.5 font-medium">💡 배려, 나눔, 협력, 갈등 관리 등 평소 행동</p>
          <textarea v-model="obsRecords.behavior" @blur="saveRecords" class="w-full flex-1 min-h-[120px] p-2 border border-blue-200 rounded text-sm resize-none focus:ring-2 focus:ring-blue-400 outline-none leading-relaxed"></textarea>
        </div>

      </div>
    </div>

    <div class="mb-8">
      <h5 class="font-bold text-gray-700 mb-3 flex items-center gap-2"><span class="text-emerald-500">🎓</span> 2. 최종 생기부 기록 (NEIS 입력용)</h5>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div v-for="(val, key) in {'autonomous':'자율활동(1500)', 'career':'진로활동(2100)', 'behavior':'행동특성 및 종합의견(1500)'}" :key="'fin'+key" class="flex flex-col bg-emerald-50 border border-emerald-200 rounded-lg p-3 shadow-sm">
          <div class="flex justify-between items-end mb-2">
            <label class="text-sm font-bold text-emerald-800">{{ val }}</label>
            <span class="text-xs font-bold font-mono" :class="getByteLength(finalRecords[key]) > parseInt(val.match(/\d+/)[0]) ? 'text-red-500' : 'text-emerald-600'">{{ getByteLength(finalRecords[key]) }} byte</span>
          </div>
          <textarea v-model="finalRecords[key]" @blur="saveRecords" class="w-full h-40 p-2 border border-emerald-300 rounded text-sm resize-none focus:ring-2 focus:ring-emerald-500 outline-none leading-relaxed" placeholder="AI 초안을 가져오거나 직접 작성하세요."></textarea>
        </div>
      </div>
    </div>

    <StudentRecordAiAssistant 
      :student="student" 
      :obsRecords="obsRecords" 
      :counselingLogs="counselingStore.logs"
      @apply-to-final="handleApplyToFinal" 
    />
    
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #99f6e4; border-radius: 4px; }
</style>