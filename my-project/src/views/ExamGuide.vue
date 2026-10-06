<script setup>
// 📝 정기고사 학급 안내
// 시험마다 연구부 안내문을 학생용 슬라이드 + 낭독 원고로 만들어 교실 TV로 보여주고 들려준다.
// 시험이 끝나면 해당 자료를 삭제하고, 다음 시험 때는 복제하거나 원문을 붙여넣어 새로 만든다.
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useExamGuideStore } from '../stores/examGuideStore'
import { aiService } from '../services/aiService'
import { aiTtsService } from '../services/aiTtsService'
import { examGuideSchema, getExamGuidePrompt } from '../services/aiPrompts'
import ExamGuideSlide from '../components/examGuide/ExamGuideSlide.vue'
import ExamGuideEditor from '../components/examGuide/ExamGuideEditor.vue'

const store = useExamGuideStore()

const mode = ref('list') // 'list' | 'present' | 'edit'
const activeGuide = ref(null)
const editingGuide = ref(null) // { id?: string, title, examDate, slides }
const isSaving = ref(false)

onMounted(() => store.fetchGuides())

const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD (로컬 기준)
const isPast = (guide) => guide.examDate && guide.examDate < today

// ------------------------------
// 목록: 삭제 / 복제 / 편집
// ------------------------------
const handleDelete = async (guide) => {
  if (!confirm(`"${guide.title}" 자료를 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) return
  try {
    await store.deleteGuide(guide.id)
  } catch {
    alert('삭제에 실패했습니다.')
  }
}

const handleDuplicate = async (guide) => {
  try {
    await store.addGuide({ title: `${guide.title} (복사본)`, examDate: '', slides: guide.slides || [] })
  } catch {
    alert('복제에 실패했습니다.')
  }
}

const openEditor = (guide) => {
  editingGuide.value = guide
  mode.value = 'edit'
}

const handleSave = async (data) => {
  isSaving.value = true
  try {
    if (editingGuide.value?.id) {
      await store.updateGuide(editingGuide.value.id, data)
    } else {
      await store.addGuide(data)
    }
    editingGuide.value = null
    mode.value = 'list'
  } catch {
    alert('저장에 실패했습니다. (데이터베이스 권한 또는 용량을 확인해주세요)')
  } finally {
    isSaving.value = false
  }
}

// ------------------------------
// 새 자료: 안내문 원문 → AI 슬라이드
// ------------------------------
const showCreate = ref(false)
const createForm = ref({ title: '', examDate: '', sourceText: '' })
const isGenerating = ref(false)

const handleGenerate = async () => {
  const { title, examDate, sourceText } = createForm.value
  if (!title.trim() || !sourceText.trim()) return alert('제목과 안내문 원문을 입력해주세요.')
  isGenerating.value = true
  try {
    const result = await aiService.askStructured(getExamGuidePrompt(title.trim(), sourceText), examGuideSchema)
    const slides = result.slides.map((s, i) => ({
      ...s,
      layout: i === 0 ? 'cover' : 'content',
      images: [],
      table: null,
      seats: null
    }))
    showCreate.value = false
    createForm.value = { title: '', examDate: '', sourceText: '' }
    // 바로 저장하지 않고 편집기로 넘겨서 확인·이미지 추가 후 저장
    openEditor({ title: title.trim(), examDate, slides })
  } catch {
    alert('AI 슬라이드 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
  } finally {
    isGenerating.value = false
  }
}

// ------------------------------
// 발표: 슬라이드 넘기기 + 음성 낭독
// ------------------------------
const currentIndex = ref(0)
const slides = computed(() => activeGuide.value?.slides || [])
const currentSlide = computed(() => slides.value[currentIndex.value])
const presentRef = ref(null)
const isFullscreen = ref(false)

const autoAdvance = ref(true) // 낭독이 끝나면 다음 슬라이드로
const audioState = ref('idle') // 'idle' | 'loading' | 'playing' | 'paused'
const usingFallbackVoice = ref(false)

const audio = new Audio()
const audioCache = new Map() // 낭독 원고 → Promise<objectURL> (같은 원고는 한 번만 생성)
let playToken = 0

const getAudioUrl = (text) => {
  if (!audioCache.has(text)) {
    const promise = aiTtsService.generateSpeechBlob(text).then(blob => URL.createObjectURL(blob))
    promise.catch(() => audioCache.delete(text)) // 실패한 원고는 다음에 다시 시도
    audioCache.set(text, promise)
  }
  return audioCache.get(text)
}

const prefetch = (index) => {
  const text = slides.value[index]?.narration?.trim()
  if (text) getAudioUrl(text).catch(() => {})
}

const stopAudio = () => {
  playToken++
  audio.pause()
  window.speechSynthesis?.cancel()
  audioState.value = 'idle'
}

const onNarrationEnded = () => {
  audioState.value = 'idle'
  if (autoAdvance.value && currentIndex.value < slides.value.length - 1) {
    currentIndex.value++
    playCurrent()
  }
}
audio.addEventListener('ended', onNarrationEnded)

// Gemini TTS가 실패하면 브라우저 내장 음성으로라도 읽어준다
const speakWithBrowser = (text, token) => {
  if (!window.speechSynthesis) {
    audioState.value = 'idle'
    return alert('음성을 만들지 못했습니다.')
  }
  usingFallbackVoice.value = true
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  utterance.rate = 0.95
  utterance.onend = () => { if (token === playToken) onNarrationEnded() }
  window.speechSynthesis.speak(utterance)
  audioState.value = 'playing'
}

const playCurrent = async () => {
  stopAudio()
  const token = playToken
  const text = currentSlide.value?.narration?.trim()
  if (!text) return
  audioState.value = 'loading'
  prefetch(currentIndex.value + 1)
  try {
    const url = await getAudioUrl(text)
    if (token !== playToken) return // 그 사이 슬라이드를 넘긴 경우
    usingFallbackVoice.value = false
    audio.src = url
    await audio.play()
    audioState.value = 'playing'
  } catch (error) {
    if (token !== playToken) return
    console.error('낭독 실패, 브라우저 음성으로 대체:', error)
    speakWithBrowser(text, token)
  }
}

const togglePlay = () => {
  if (audioState.value === 'playing' && !usingFallbackVoice.value) {
    audio.pause()
    audioState.value = 'paused'
  } else if (audioState.value === 'paused') {
    audio.play()
    audioState.value = 'playing'
  } else if (audioState.value === 'idle') {
    playCurrent()
  } else {
    stopAudio()
  }
}

const goTo = (index) => {
  if (index < 0 || index >= slides.value.length) return
  const wasPlaying = audioState.value === 'playing' || audioState.value === 'loading'
  stopAudio()
  currentIndex.value = index
  if (wasPlaying) playCurrent()
}

const startPresent = async (guide) => {
  activeGuide.value = guide
  currentIndex.value = 0
  mode.value = 'present'
  prefetch(0)
  prefetch(1)
  await nextTick()
  presentRef.value?.focus()
}

const exitPresent = () => {
  stopAudio()
  if (document.fullscreenElement) document.exitFullscreen()
  mode.value = 'list'
}

const toggleFullscreen = () => {
  if (document.fullscreenElement) document.exitFullscreen()
  else presentRef.value?.requestFullscreen?.()
}
const onFullscreenChange = () => { isFullscreen.value = !!document.fullscreenElement }

const onKeydown = (e) => {
  if (mode.value !== 'present') return
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goTo(currentIndex.value + 1) }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goTo(currentIndex.value - 1) }
  else if (e.key === ' ') { e.preventDefault(); togglePlay() }
  else if (e.key === 'Escape' && !document.fullscreenElement) exitPresent()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onBeforeUnmount(() => {
  stopAudio()
  audio.removeEventListener('ended', onNarrationEnded)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  audioCache.forEach(p => p.then(url => URL.revokeObjectURL(url)).catch(() => {}))
  audioCache.clear()
})

// 발표 중 자료가 다시 불러와지면(편집 등) 최신 데이터로 교체
watch(() => store.guides, (list) => {
  if (activeGuide.value) {
    activeGuide.value = list.find(g => g.id === activeGuide.value.id) || activeGuide.value
  }
})
</script>

<template>
  <!-- 발표 화면 -->
  <div
    v-if="mode === 'present' && activeGuide"
    ref="presentRef"
    tabindex="-1"
    class="flex flex-col bg-gray-900 outline-none"
    :class="isFullscreen ? 'h-screen' : 'h-[calc(100vh-4rem)]'"
  >
    <div class="flex-1 min-h-0 p-2 md:p-4">
      <div class="h-full rounded-2xl overflow-hidden shadow-2xl">
        <ExamGuideSlide v-if="currentSlide" :slide="currentSlide" :guide-title="activeGuide.title" />
      </div>
    </div>

    <div class="shrink-0 bg-gray-800 text-white px-3 md:px-6 py-3 flex flex-wrap items-center gap-2 md:gap-4">
      <button @click="goTo(currentIndex - 1)" :disabled="currentIndex === 0" class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold disabled:opacity-30">◀ 이전</button>

      <button
        @click="togglePlay"
        :disabled="!currentSlide?.narration"
        class="px-5 py-2 rounded-lg font-black min-w-36 disabled:opacity-30"
        :class="audioState === 'playing' ? 'bg-amber-500 hover:bg-amber-600 text-gray-900' : 'bg-blue-600 hover:bg-blue-500'"
      >
        <span v-if="audioState === 'loading'" class="inline-block animate-spin">⏳</span>
        {{ audioState === 'loading' ? ' 음성 준비 중' : audioState === 'playing' ? '⏸ 일시정지' : audioState === 'paused' ? '▶ 이어 듣기' : '🔊 들려주기' }}
      </button>

      <button @click="goTo(currentIndex + 1)" :disabled="currentIndex >= slides.length - 1" class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold disabled:opacity-30">다음 ▶</button>

      <label class="flex items-center gap-2 text-sm font-bold cursor-pointer select-none">
        <input v-model="autoAdvance" type="checkbox" class="w-4 h-4" />
        낭독 후 자동 넘김
      </label>

      <span v-if="usingFallbackVoice && audioState === 'playing'" class="text-xs font-bold text-amber-300">기본 음성으로 읽는 중</span>

      <div class="flex-1 flex items-center justify-center gap-1.5 min-w-32">
        <button
          v-for="(s, i) in slides"
          :key="s.id || i"
          @click="goTo(i)"
          :title="s.title"
          class="h-2.5 rounded-full transition-all"
          :class="i === currentIndex ? 'w-8 bg-blue-400' : 'w-2.5 bg-gray-500 hover:bg-gray-400'"
        ></button>
      </div>

      <span class="text-sm font-bold text-gray-300">{{ currentIndex + 1 }} / {{ slides.length }}</span>
      <button @click="toggleFullscreen" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-sm">{{ isFullscreen ? '전체화면 해제' : '⛶ 전체화면' }}</button>
      <button @click="exitPresent" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-red-600 font-bold text-sm">✕ 나가기</button>
    </div>
  </div>

  <!-- 편집 화면 -->
  <div v-else-if="mode === 'edit' && editingGuide" class="max-w-screen-2xl mx-auto p-4 md:p-6">
    <h2 class="text-2xl font-black text-gray-900 mb-4">✏️ {{ editingGuide.id ? '안내 자료 편집' : '새 안내 자료 확인 후 저장' }}</h2>
    <ExamGuideEditor
      :guide="editingGuide"
      :is-saving="isSaving"
      @save="handleSave"
      @cancel="editingGuide = null; mode = 'list'"
    />
  </div>

  <!-- 목록 화면 -->
  <div v-else class="max-w-5xl mx-auto p-4 md:p-6 font-sans">
    <div class="mb-6 border-b border-gray-200 pb-4 flex flex-col md:flex-row md:items-end justify-between gap-3">
      <div>
        <h2 class="text-2xl md:text-3xl font-black text-gray-900">📝 시험 안내</h2>
        <p class="text-gray-600 mt-2 font-bold">정기고사 학급 안내사항을 교실 화면에 띄우고 음성으로 들려줍니다. 시험이 끝난 자료는 삭제하세요.</p>
      </div>
      <button @click="showCreate = !showCreate" class="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-sm">
        + 새 시험 안내 만들기
      </button>
    </div>

    <!-- 새 자료 만들기 -->
    <div v-if="showCreate" class="mb-6 bg-white p-5 rounded-2xl shadow-sm border border-blue-200">
      <p class="font-black text-gray-900 mb-1">연구부 안내문으로 새 자료 만들기</p>
      <p class="text-sm text-gray-500 font-bold mb-4">한글 파일 내용을 복사해 붙여넣으면 AI가 학생용 슬라이드와 낭독 원고를 만듭니다. 저장 전에 편집 화면에서 확인하고 이미지를 넣을 수 있어요. (지난 자료를 <b>복제</b>해서 고치는 방법도 있습니다)</p>
      <div class="flex flex-col md:flex-row gap-3 mb-3">
        <input v-model="createForm.title" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 font-bold" placeholder="제목 (예: 2026학년도 2학기 기말고사 안내)" />
        <input v-model="createForm.examDate" type="date" class="border border-gray-300 rounded-lg px-3 py-2 font-bold" title="시험 시작일" />
      </div>
      <textarea
        v-model="createForm.sourceText"
        rows="10"
        :disabled="isGenerating"
        class="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm leading-relaxed"
        placeholder="학급 안내사항 원문을 여기에 붙여넣으세요..."
      ></textarea>
      <div class="mt-3 flex justify-end gap-2">
        <button @click="showCreate = false" class="px-4 py-2 rounded-lg font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">닫기</button>
        <button @click="handleGenerate" :disabled="isGenerating" class="px-5 py-2 rounded-lg font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400">
          <span v-if="isGenerating" class="inline-block animate-spin">⏳</span>
          {{ isGenerating ? ' 슬라이드 만드는 중...' : '✨ AI로 슬라이드 만들기' }}
        </button>
      </div>
    </div>

    <div v-if="store.isLoading && !store.guides.length" class="text-center py-16 text-gray-400 font-bold">불러오는 중...</div>
    <div v-else-if="!store.guides.length" class="text-center py-16 text-gray-400 font-bold">등록된 시험 안내 자료가 없습니다.</div>

    <div v-else class="flex flex-col gap-3">
      <div
        v-for="guide in store.guides"
        :key="guide.id"
        class="bg-white rounded-2xl border shadow-sm p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4"
        :class="isPast(guide) ? 'border-gray-200 opacity-80' : 'border-blue-200'"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="text-lg md:text-xl font-black text-gray-900">{{ guide.title }}</h3>
            <span v-if="isPast(guide)" class="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">시험 시작일 지남 · 끝났으면 삭제</span>
          </div>
          <p class="text-sm text-gray-500 font-bold mt-1">
            슬라이드 {{ guide.slides?.length || 0 }}장
            <template v-if="guide.examDate"> · 시험 시작 {{ guide.examDate }}</template>
            · 수정 {{ (guide.updatedAt || guide.createdAt || '').slice(0, 10) }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button @click="startPresent(guide)" class="px-4 py-2 rounded-lg font-bold bg-blue-600 text-white hover:bg-blue-700">▶ 보여주기</button>
          <button @click="openEditor(guide)" class="px-3 py-2 rounded-lg font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">✏️ 편집</button>
          <button @click="handleDuplicate(guide)" class="px-3 py-2 rounded-lg font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">📄 복제</button>
          <button @click="handleDelete(guide)" class="px-3 py-2 rounded-lg font-bold bg-red-50 text-red-600 hover:bg-red-100">🗑 삭제</button>
        </div>
      </div>
    </div>
  </div>
</template>
