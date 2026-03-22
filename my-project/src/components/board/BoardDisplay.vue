<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { aiService } from '../../services/aiService'

const props = defineProps({
  title: String,
  subtitle: String,
  content: String,
  isLoading: Boolean,
  isEditing: Boolean,
  isMorningMode: Boolean,
  modelValue: String // 에디터용 v-model
})

const emit = defineEmits(['update:modelValue'])

// 💡 TTS (음성 읽어주기) 상태 관리
const isPlaying = ref(false)
const isPreparingAudio = ref(false)
let currentAudio = null

const toggleSpeech = async () => {
  if (!props.content) return

  // 이미 재생 중이면 중지
  if (isPlaying.value && currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    isPlaying.value = false
    return
  }

  isPreparingAudio.value = true
  try {
    const audioUrl = await aiService.generateSpeech(props.content)
    currentAudio = new Audio(audioUrl)
    
    currentAudio.onended = () => {
      isPlaying.value = false
    }
    
    await currentAudio.play()
    isPlaying.value = true
  } catch (error) {
    alert('음성을 생성하는 중 문제가 발생했습니다.')
  } finally {
    isPreparingAudio.value = false
  }
}

// 창이 닫히거나 내용이 바뀔 때 오디오 정지
onUnmounted(() => {
  if (currentAudio) currentAudio.pause()
})
watch(() => props.content, () => {
  if (isPlaying.value && currentAudio) {
    currentAudio.pause()
    isPlaying.value = false
  }
})
</script>

<template>
  <div class="bg-white w-full rounded-2xl md:rounded-[40px] shadow-2xl overflow-hidden border-4 md:border-[6px] border-white ring-1 ring-gray-200 font-sans relative group">
    
    <div v-if="!isEditing && !isLoading && content" class="absolute top-4 right-4 md:top-6 md:right-6 z-30">
      <button 
        @click="toggleSpeech" 
        :disabled="isPreparingAudio"
        class="flex items-center gap-2 px-4 py-2 rounded-full font-black text-sm shadow-md transition-all duration-300 backdrop-blur-sm"
        :class="isPlaying ? 'bg-red-500 text-white animate-pulse' : 'bg-white/80 text-indigo-700 hover:bg-indigo-50 border border-indigo-100'"
      >
        <span v-if="isPreparingAudio" class="animate-spin">⏳</span>
        <span v-else>{{ isPlaying ? '⏹️ 낭독 중지' : '🔊 AI 낭독하기' }}</span>
      </button>
    </div>

    <div class="p-6 md:p-10 text-center transition-colors duration-700" :class="isMorningMode ? 'bg-gradient-to-br from-orange-400 to-red-500' : 'bg-gradient-to-br from-indigo-600 to-blue-800'">
      <h1 class="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black text-white tracking-tighter drop-shadow-md">
        {{ title }}
      </h1>
      <p class="mt-2 md:mt-6 text-white/90 text-sm sm:text-base md:text-xl lg:text-2xl font-bold opacity-80">
        {{ subtitle }}
      </p>
    </div>

    <div class="p-6 sm:p-8 md:p-16 lg:p-20 min-h-[300px] md:min-h-[500px] flex flex-col justify-center relative bg-gray-50 bg-[linear-gradient(transparent_47px,#e5e7eb_48px)] bg-[length:100%_48px]">
      
      <div v-if="isLoading" class="flex flex-col items-center justify-center text-gray-400 space-y-4 md:space-y-6">
        <div class="w-10 h-10 md:w-16 md:h-16 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
        <p class="text-lg md:text-2xl font-black bg-white/80 px-4 py-2 md:px-6 rounded-full shadow-sm text-center">AI가 최신 공지사항을<br class="md:hidden"> 정리하고 있습니다...</p>
      </div>

      <div v-else-if="!isEditing" class="relative z-10 text-xl sm:text-2xl md:text-4xl lg:text-5xl text-gray-800 leading-[1.6] md:leading-[1.7] whitespace-pre-wrap font-black font-sans px-2 md:px-4 tracking-tight drop-shadow-sm">
        {{ content }}
      </div>

      <textarea 
        v-else 
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
        class="relative z-20 w-full min-h-[300px] md:min-h-[400px] p-6 text-xl sm:text-2xl md:text-4xl lg:text-5xl text-gray-800 leading-[1.6] md:leading-[1.7] font-black font-sans tracking-tight bg-white/90 border-2 border-indigo-400 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-200 resize-none shadow-inner"
        placeholder="여기에 내용을 입력하세요..."
      ></textarea>
      
      <div class="absolute bottom-4 right-4 md:bottom-8 md:right-8 text-6xl md:text-9xl opacity-10 select-none pointer-events-none">
        {{ isMorningMode ? '☀️' : '🌙' }}
      </div>
    </div>
  </div>
</template>