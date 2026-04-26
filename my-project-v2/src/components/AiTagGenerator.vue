<script setup>
import { ref } from 'vue'
import { aiService } from '../services/aiService'

const props = defineProps({
  content: { type: String, required: true },
  existingTags: { type: Array, default: () => [] },
  departments: { type: Array, default: () => [] }
})

const emit = defineEmits(['tags-generated'])
const isGenerating = ref(false)

const generateTags = async () => {
  if (!props.content.trim()) {
    alert('태그를 생성할 내용을 먼저 작성해주세요.')
    return
  }

  isGenerating.value = true
  try {
    // 💡 AI 프롬프트에 "조회/종례" 필수 태그 지시사항을 강력하게 추가했습니다.
    const prompt = `
      당신은 교사의 업무 일지를 분석하여 핵심 키워드를 추출하는 AI 조수입니다.
      다음 [업무 일지 내용]을 읽고, 가장 관련성이 높은 태그(키워드) 1~4개를 추천해주세요.
      
      [🔥매우 중요한 지시사항🔥]
      1. 내용에 '조회', '아침', '전달사항' 등 아침 조회와 관련된 내용이 있다면 반드시 '조회' 태그를 포함하세요.
      2. 내용에 '종례', '하교', '마침' 등 오후 종례와 관련된 내용이 있다면 반드시 '종례' 태그를 포함하세요.
      3. 내용이 특정 부서의 업무와 관련이 있다면, 아래 [우리 학교 부서 목록]에 있는 정확한 명칭을 태그로 포함하세요.
      4. 그 외의 태그는 최대한 [기존에 사용한 태그 목록]의 단어를 재사용하고, 없을 경우에만 새로 만드세요.
      5. 태그 단어만 쉼표(,)로 구분해서 출력하세요. (예: 조회, 생활안전복지부, 학부모상담)
      6. 절대 '#' 기호나 부가적인 설명을 붙이지 마세요.

      [우리 학교 부서 목록]
      ${props.departments.length > 0 ? props.departments.join(', ') : '등록된 부서 없음'}

      [기존에 사용한 태그 목록]
      ${props.existingTags.length > 0 ? props.existingTags.join(', ') : '등록된 태그 없음'}

      [업무 일지 내용]
      ${props.content}
    `
    
    const response = await aiService.askText(prompt) 
    
    const tags = response
      .split(',')
      .map(t => t.trim().replace(/^#/, '')) 
      .filter(t => t.length > 0)

    emit('tags-generated', tags)
  } catch (error) {
    console.error('AI 태그 생성 에러:', error)
    alert('AI 태그 생성 중 오류가 발생했습니다.')
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <button
    @click.prevent="generateTags"
    :disabled="isGenerating || !content.trim()"
    class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-xs sm:text-sm rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
    title="내용을 분석하여 알맞은 태그(관련 부서 및 조/종례 포함)를 자동으로 달아줍니다."
  >
    <span v-if="isGenerating" class="animate-spin text-indigo-500">🔄</span>
    <span v-else>✨</span>
    {{ isGenerating ? 'AI가 태그 분석 중...' : 'AI 자동 태그' }}
  </button>
</template>