<script setup>
import { ref } from 'vue'
import { aiTtsService } from '../services/aiTtsService'

const inputText = ref('')
const isLoading = ref(false)
const audioUrl = ref(null)

const handleGenerate = async () => {
  if (!inputText.value.trim()) {
    alert('음성으로 변환할 텍스트를 입력해주세요.')
    return
  }

  isLoading.value = true
  audioUrl.value = null // 기존 오디오 초기화

  try {
    const audioBlob = await aiTtsService.generateSpeechBlob(inputText.value)
    audioUrl.value = URL.createObjectURL(audioBlob)
  } catch (error) {
    alert('음성 생성 중 오류가 발생했습니다. (텍스트가 너무 길면 잘라서 시도해보세요!)')
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto p-4 md:p-6 font-sans">
    <div class="mb-6 border-b border-gray-200 pb-4">
      <h2 class="text-2xl md:text-3xl font-black text-gray-900">🗣️ AI 방송국 (TTS 변환기)</h2>
      <p class="text-gray-600 mt-2 font-bold">긴 안내문이나 공지사항을 아나운서 음성 파일(WAV)로 만들어 줍니다.</p>
    </div>

    <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
      <label class="block text-sm font-bold text-gray-700 mb-2">낭독할 텍스트 입력</label>
      <textarea 
        v-model="inputText" 
        class="w-full h-64 p-4 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium text-gray-800 leading-relaxed"
        placeholder="여기에 시험 계획이나 공지사항을 붙여넣어 주세요..."
        :disabled="isLoading"
      ></textarea>

      <div class="mt-4 flex justify-end">
        <button 
          @click="handleGenerate" 
          :disabled="isLoading || !inputText.trim()"
          class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition-colors disabled:bg-gray-400 flex items-center gap-2 shadow-sm"
        >
          <span v-if="isLoading" class="animate-spin">⏳</span>
          {{ isLoading ? '음성 파일 생성 중...' : '🔊 음성 파일 만들기' }}
        </button>
      </div>
    </div>

    <div v-if="audioUrl" class="mt-6 bg-indigo-50 p-6 rounded-2xl border border-indigo-200 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div class="flex-1 w-full">
        <p class="text-indigo-900 font-bold mb-2">✅ 음성 생성이 완료되었습니다!</p>
        <audio :src="audioUrl" controls class="w-full h-12 rounded-lg"></audio>
      </div>
      
      <a 
        :href="audioUrl" 
        download="학교방송_안내음성.wav" 
        class="shrink-0 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
      >
        💾 WAV 다운로드
      </a>
    </div>
  </div>
</template>