<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService'
import { announcementSchema, getBoardPrompt } from '../services/aiPrompts' 

const aiAnnouncement = ref('')
const isLoading = ref(true)
const isRegenerating = ref(false) // 수동 업데이트 로딩 상태

const isMorningMode = ref(true)
const boardTitle = computed(() => isMorningMode.value ? '🌅 오늘의 아침 조회 🌅' : '🌇 오늘의 오후 종례 🌇')
const boardSubtitle = computed(() => isMorningMode.value ? '오늘의 핵심 공지사항입니다.' : '하교 전 꼭 확인하세요.')

// 💡 날짜와 모드를 계산하는 함수 (일자별/시간별 고유 ID 생성)
const getBoardInfo = () => {
  const realNow = new Date()
  const currentHour = realNow.getHours()
  const currentMinute = realNow.getMinutes()
  const timeInt = currentHour * 100 + currentMinute 

  let targetDbDate = new Date(realNow)
  let epochKey = '' 
  let morningMode = true

  if (timeInt >= 1620) {
    epochKey = '1620'; morningMode = false
  } else if (timeInt >= 1520) {
    epochKey = '1520'; morningMode = false
  } else if (timeInt >= 730) { 
    epochKey = '0730'; morningMode = true
  } else {
    targetDbDate.setDate(targetDbDate.getDate() - 1)
    epochKey = '1620'; morningMode = true 
  }

  const dateString = `${targetDbDate.getFullYear()}-${String(targetDbDate.getMonth()+1).padStart(2,'0')}-${String(targetDbDate.getDate()).padStart(2,'0')}`
  const documentId = `${dateString}_${epochKey}` // 예: 2026-03-10_1520 (일자별 저장 핵심)

  let logTargetDate = new Date(targetDbDate)
  if (epochKey === '0730') logTargetDate.setDate(logTargetDate.getDate() - 1) 

  return { documentId, logTargetDate, morningMode }
}

// 💡 보드 내용을 불러오거나 생성하는 핵심 함수 (forceRegenerate가 true면 기존 데이터 무시하고 다시 생성)
const loadBoardContent = async (forceRegenerate = false) => {
  if (forceRegenerate) isRegenerating.value = true
  else isLoading.value = true

  try {
    const info = getBoardInfo()
    isMorningMode.value = info.morningMode
    const summaryRef = doc(db, 'boardSummaries', info.documentId)

    // 1. 강제 재생성이 아니면, 기존 캐시된(일자별 저장된) 내용 표시
    if (!forceRegenerate) {
      const summarySnap = await getDoc(summaryRef)
      if (summarySnap.exists()) {
        aiAnnouncement.value = summarySnap.data().content
        isLoading.value = false
        return
      }
    }

    // 2. 업무일지에서 데이터 수집
    const logYear = info.logTargetDate.getFullYear()
    const logMonth = info.logTargetDate.getMonth()
    const logDay = info.logTargetDate.getDate()

    const q = query(collection(db, 'workLogs'), where('tags', 'array-contains-any', ['#조종례', '#조회', '#종례']))
    const snap = await getDocs(q)
    
    const logs = snap.docs
      .map(d => d.data())
      .filter(log => {
        if (!log.tags) return false
        const isRelevant = info.morningMode 
          ? (log.tags.includes('#조종례') || log.tags.includes('#조회'))
          : (log.tags.includes('#조종례') || log.tags.includes('#종례'))
        
        if (!isRelevant) return false
        if (log.tags.includes('#고정')) return true

        if (!log.createdAt) return false
        const logDate = new Date(log.createdAt)
        return logDate.getFullYear() === logYear && logDate.getMonth() === logMonth && logDate.getDate() === logDay
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    if (logs.length === 0) {
      aiAnnouncement.value = info.morningMode ? "전달할 공지사항이 없습니다.\n오늘 하루도 화이팅! ☀️" : "전달할 공지사항이 없습니다.\n안전하게 하교하세요! 👋"
      await setDoc(summaryRef, { content: aiAnnouncement.value, createdAt: new Date().toISOString() })
      return
    }

    // 3. AI 재생성 로직
    const logTexts = logs.map(log => `- ${log.tags.includes('#고정') ? '[고정] ' : ''}${log.content}`).join('\n')
    const prompt = getBoardPrompt(info.morningMode, logTexts) + `\n[⚠️ 필수 응답 형식]\n- 반드시 { "announcement": "...", "closing": "..." } 형태의 단일 JSON 객체로 응답하세요. 대괄호([]) 금지.`

    const result = await aiService.askStructured(prompt, announcementSchema)
    const finalContent = `${result.announcement}\n\n${result.closing}`
    
    aiAnnouncement.value = finalContent
    await setDoc(summaryRef, { content: finalContent, createdAt: new Date().toISOString() }) // 일자별 DB에 덮어쓰기

  } catch (error) {
    console.error("AI 요약 에러:", error)
    aiAnnouncement.value = "공지사항을 동기화하는 중 오류가 발생했습니다."
  } finally {
    isLoading.value = false
    isRegenerating.value = false
  }
}

onMounted(() => {
  loadBoardContent(false)
})
</script>

<template>
  <div class="min-h-[80vh] flex flex-col items-center justify-center p-4 bg-gray-100 relative">
    
    <button 
      @click="loadBoardContent(true)" 
      :disabled="isLoading || isRegenerating"
      class="absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-700 rounded-full font-bold shadow-sm hover:bg-white hover:shadow-md transition-all disabled:opacity-50"
      title="새로운 메모를 추가했다면 눌러서 최신화하세요"
    >
      <span :class="{'animate-spin': isRegenerating}">🔄</span>
      {{ isRegenerating ? '업데이트 중...' : '최신 메모로 수동 업데이트' }}
    </button>

    <div class="bg-white w-full max-w-5xl rounded-[40px] shadow-2xl overflow-hidden border-[6px] border-white ring-1 ring-gray-200 font-sans mt-10">
      
      <div class="p-10 text-center transition-colors duration-700" :class="isMorningMode ? 'bg-gradient-to-br from-orange-400 to-red-500' : 'bg-gradient-to-br from-indigo-600 to-blue-800'">
        <h1 class="text-5xl md:text-7xl font-black text-white tracking-tighter drop-shadow-md">
          {{ boardTitle }}
        </h1>
        <p class="mt-6 text-white/90 text-xl md:text-2xl font-bold opacity-80">
          {{ boardSubtitle }}
        </p>
      </div>

      <div class="p-12 md:p-20 min-h-[500px] flex flex-col justify-center relative bg-gray-50 bg-[linear-gradient(transparent_47px,#e5e7eb_48px)] bg-[length:100%_48px]">
        
        <div v-if="isLoading || isRegenerating" class="flex flex-col items-center justify-center text-gray-400 space-y-6">
          <div class="w-16 h-16 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
          <p class="text-2xl font-black bg-white/80 px-6 py-2 rounded-full shadow-sm">AI가 최신 공지사항을 정리하고 있습니다...</p>
        </div>

        <div v-else class="relative z-10 text-3xl md:text-5xl text-gray-800 leading-[1.6] whitespace-pre-wrap font-black font-sans px-4 tracking-tight drop-shadow-sm">
          {{ aiAnnouncement }}
        </div>
        
        <div class="absolute bottom-8 right-8 text-9xl opacity-10 select-none">
          {{ isMorningMode ? '☀️' : '🌙' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@900&display=swap');
.font-sans { font-family: 'Pretendard', sans-serif; }
</style>