<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService'
import { announcementSchema, getBoardPrompt } from '../services/aiPrompts' 

const aiAnnouncement = ref('')
const isLoading = ref(true)

const isMorningMode = ref(true)
const boardTitle = computed(() => isMorningMode.value ? '🌅 오늘의 아침 조회 🌅' : '🌇 오늘의 오후 종례 🌇')
const boardSubtitle = computed(() => isMorningMode.value ? '오늘의 핵심 공지사항입니다.' : '하교 전 꼭 확인하세요.')

onMounted(async () => {
  try {
    const realNow = new Date()
    const currentHour = realNow.getHours()
    const currentMinute = realNow.getMinutes()
    const timeInt = currentHour * 100 + currentMinute 

    let targetDbDate = new Date(realNow)
    let epochKey = '' 

    // 💡 기준 시간 업데이트: 07:30
    if (timeInt >= 1620) {
      epochKey = '1620'; isMorningMode.value = false
    } else if (timeInt >= 1520) {
      epochKey = '1520'; isMorningMode.value = false
    } else if (timeInt >= 730) { 
      epochKey = '0730'; isMorningMode.value = true
    } else {
      // 밤 자정 ~ 아침 7시 29분 사이: 전날 최종 종례 표시
      targetDbDate.setDate(targetDbDate.getDate() - 1)
      epochKey = '1620'; isMorningMode.value = true 
    }

    const dateString = `${targetDbDate.getFullYear()}-${String(targetDbDate.getMonth()+1).padStart(2,'0')}-${String(targetDbDate.getDate()).padStart(2,'0')}`
    const documentId = `${dateString}_${epochKey}`
    
    // ==========================================
    // STEP 1: Firebase 캐시 확인
    // ==========================================
    const summaryRef = doc(db, 'boardSummaries', documentId)
    const summarySnap = await getDoc(summaryRef)

    if (summarySnap.exists()) {
      aiAnnouncement.value = summarySnap.data().content
      isLoading.value = false
      return
    }

    // ==========================================
    // STEP 2: 데이터 수집 및 필터링
    // ==========================================
    let logTargetDate = new Date(targetDbDate)
    if (epochKey === '0730') {
      logTargetDate.setDate(logTargetDate.getDate() - 1) 
    }
    const logYear = logTargetDate.getFullYear()
    const logMonth = logTargetDate.getMonth()
    const logDay = logTargetDate.getDate()

    const q = query(
      collection(db, 'workLogs'), 
      where('tags', 'array-contains-any', ['#조종례', '#조회', '#종례'])
    )
    const snap = await getDocs(q)
    
    const logs = snap.docs
      .map(doc => doc.data())
      .filter(log => {
        if (!log.tags) return false
        const isRelevantForMode = isMorningMode.value 
          ? (log.tags.includes('#조종례') || log.tags.includes('#조회'))
          : (log.tags.includes('#조종례') || log.tags.includes('#종례'))
        
        if (!isRelevantForMode) return false
        if (log.tags.includes('#고정')) return true

        if (!log.createdAt) return false
        const logDate = new Date(log.createdAt)
        return logDate.getFullYear() === logYear &&
               logDate.getMonth() === logMonth &&
               logDate.getDate() === logDay
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    if (logs.length === 0) {
      aiAnnouncement.value = isMorningMode.value 
        ? "전달할 공지사항이 없습니다.\n오늘 하루도 화이팅! ☀️"
        : "전달할 공지사항이 없습니다.\n안전하게 하교하세요! 👋"
      
      await setDoc(summaryRef, { content: aiAnnouncement.value, createdAt: new Date().toISOString() })
      isLoading.value = false
      return
    }

    const logTexts = logs.map(log => `- ${log.tags.includes('#고정') ? '[고정] ' : ''}${log.content}`).join('\n')

    // ==========================================
    // STEP 3: AI 요약 요청 (스키마 준수 강조)
    // ==========================================
    
    // 💡 프롬프트에 '단일 객체'임을 한 번 더 강조합니다.
    const prompt = getBoardPrompt(isMorningMode.value, logTexts) + `
    
    [⚠️ 필수 응답 형식]
    - 반드시 { "announcement": "...", "closing": "..." } 형태의 단일 JSON 객체로만 응답하세요.
    - 대괄호([])를 사용하여 리스트로 감싸지 마세요.
    - 'announcement' 필드 내에 모든 공지사항을 번호를 매겨 하나의 문자열로 작성하세요.
    `;

    const result = await aiService.askStructured(prompt, announcementSchema)
    const finalContent = `${result.announcement}\n\n${result.closing}`
    
    aiAnnouncement.value = finalContent

    // Firebase에 결과 캐싱
    await setDoc(summaryRef, { 
      content: finalContent, 
      createdAt: new Date().toISOString() 
    })

  } catch (error) {
    console.error("AI 요약 에러:", error)
    aiAnnouncement.value = "공지사항을 불러오는 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요."
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="min-h-[80vh] flex flex-col items-center justify-center p-4 bg-gray-100">
    <div class="bg-white w-full max-w-5xl rounded-[40px] shadow-2xl overflow-hidden border-[6px] border-white ring-1 ring-gray-200 font-sans">
      
      <div class="p-10 text-center transition-colors duration-700" :class="isMorningMode ? 'bg-gradient-to-br from-orange-400 to-red-500' : 'bg-gradient-to-br from-indigo-600 to-blue-800'">
        <h1 class="text-5xl md:text-7xl font-black text-white tracking-tighter drop-shadow-md">
          {{ boardTitle }}
        </h1>
        <p class="mt-6 text-white/90 text-xl md:text-2xl font-bold opacity-80">
          {{ boardSubtitle }}
        </p>
      </div>

      <div class="p-12 md:p-20 min-h-[500px] flex flex-col justify-center relative bg-gray-50 bg-[linear-gradient(transparent_47px,#e5e7eb_48px)] bg-[length:100%_48px]">
        
        <div v-if="isLoading" class="flex flex-col items-center justify-center text-gray-400 space-y-6">
          <div class="w-16 h-16 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
          <p class="text-2xl font-black bg-white/80 px-6 py-2 rounded-full shadow-sm">AI가 오늘 하루를 정리하고 있습니다...</p>
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
/* 나이스(NEIS) 서체와 유사한 느낌을 위해 굵고 깔끔한 폰트 적용 */
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@900&display=swap');

.font-sans {
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
}
</style>