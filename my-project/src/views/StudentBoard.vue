<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService' // 💡 최신 공통 서비스 임포트
import { z } from "zod"

// 💡 AI 응답 구조 정의 (Zod 스키마)
const announcementSchema = z.object({
  announcement: z.string().describe("간결하고 직관적인 번호 매겨진 공지사항 본문"),
  closing: z.string().describe("짧고 따뜻한 끝인사")
})

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

    // 💡 기준 시간 업데이트: 0830 -> 0730
    if (timeInt >= 1620) {
      epochKey = '1620'; isMorningMode.value = false
    } else if (timeInt >= 1520) {
      epochKey = '1520'; isMorningMode.value = false
    } else if (timeInt >= 730) { // ✅ 07:30 기준 업데이트
      epochKey = '0730'; isMorningMode.value = true
    } else {
      // 밤 자정 ~ 아침 7시 29분 사이: 전날 최종 종례 표시
      targetDbDate.setDate(targetDbDate.getDate() - 1)
      epochKey = '1620'; isMorningMode.value = true 
    }

    const dateString = `${targetDbDate.getFullYear()}-${String(targetDbDate.getMonth()+1).padStart(2,'0')}-${String(targetDbDate.getDate()).padStart(2,'0')}`
    const documentId = `${dateString}_${epochKey}`
    
    const summaryRef = doc(db, 'boardSummaries', documentId)
    const summarySnap = await getDoc(summaryRef)

    if (summarySnap.exists()) {
      aiAnnouncement.value = summarySnap.data().content
      isLoading.value = false
      return
    }

    // 데이터가 없을 때 AI 생성 로직
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
        : "전달할 공지사항이 없습니다.\n안전하게 하교하기! 👋"
      
      await setDoc(summaryRef, { content: aiAnnouncement.value, createdAt: new Date().toISOString() })
      isLoading.value = false
      return
    }

    const logTexts = logs.map(log => `- ${log.tags.includes('#고정') ? '[고정] ' : ''}${log.content}`).join('\n')

    const prompt = `
    학급 담임 교사로서 ${isMorningMode.value ? '아침 조회' : '오후 종례'} 공지를 작성합니다.
    학생들이 직관적으로 이해할 수 있게 명사형 종결 어미를 사용하여 요약하세요.
    고정 공지는 최상단에 배치하세요.

    [메모 내용]
    ${logTexts}
    `

    // 💡 최신 aiService.askStructured 사용
    const result = await aiService.askStructured(prompt, announcementSchema)
    const finalContent = `${result.announcement}\n\n${result.closing}`
    
    aiAnnouncement.value = finalContent

    await setDoc(summaryRef, { 
      content: finalContent, 
      createdAt: new Date().toISOString() 
    })

  } catch (error) {
    console.error("AI 요약 에러:", error)
    aiAnnouncement.value = "공지사항 동기화 중 오류가 발생했습니다."
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="min-h-[80vh] flex flex-col items-center justify-center p-4">
    <div class="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden border-4 border-blue-100">
      <div class="bg-blue-600 text-white p-8 text-center transition-colors" :class="isMorningMode ? 'bg-orange-500' : 'bg-indigo-600'">
        <h1 class="text-4xl md:text-5xl font-black tracking-tight flex items-center justify-center gap-4">
          {{ boardTitle }}
        </h1>
        <p class="mt-4 text-white/90 text-lg md:text-xl font-medium">{{ boardSubtitle }}</p>
      </div>

      <div class="p-10 md:p-16 min-h-[400px] flex flex-col justify-center bg-gray-50 bg-[linear-gradient(transparent_39px,#e5e7eb_40px)] bg-[length:100%_40px]">
        <div v-if="isLoading" class="flex flex-col items-center justify-center text-gray-400 space-y-4">
          <div class="text-6xl animate-spin">⏳</div>
          <p class="text-2xl font-bold bg-white px-4 rounded font-sans">공지사항을 동기화하고 있습니다...</p>
        </div>
        <div v-else class="text-2xl md:text-4xl text-gray-800 leading-[1.6] whitespace-pre-wrap font-bold font-sans px-4">
          {{ aiAnnouncement }}
        </div>
      </div>
    </div>
  </div>
</template>