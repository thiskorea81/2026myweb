<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY })

const aiAnnouncement = ref('')
const isLoading = ref(true)

// 화면 UI 상태 (오전/오후)
const isMorningMode = ref(true)
const boardTitle = computed(() => isMorningMode.value ? '🌅 오늘의 아침 조회 🌅' : '🌇 오늘의 오후 종례 🌇')
const boardSubtitle = computed(() => isMorningMode.value ? '오늘의 핵심 공지사항입니다.' : '하교 전 꼭 확인하세요.')

onMounted(async () => {
  try {
    const realNow = new Date()
    const currentHour = realNow.getHours()
    const currentMinute = realNow.getMinutes()
    const timeInt = currentHour * 100 + currentMinute // 예: 8시 30분 -> 830, 15시 20분 -> 1520

    let targetDbDate = new Date(realNow)
    let epochKey = '' // 저장/불러올 시간대 키값

    // 1. 현재 시간에 따른 기준 시간대 설정 (8:30, 15:20, 16:20)
    if (timeInt >= 1620) {
      epochKey = '1620'
      isMorningMode.value = false
    } else if (timeInt >= 1520) {
      epochKey = '1520'
      isMorningMode.value = false
    } else if (timeInt >= 830) {
      epochKey = '0830'
      isMorningMode.value = true
    } else {
      // 밤 자정 ~ 아침 8시 29분 사이 (전날 16:20에 만들어진 최종 종례를 조회 화면으로 띄움)
      targetDbDate.setDate(targetDbDate.getDate() - 1)
      epochKey = '1620'
      isMorningMode.value = true 
    }

    // 데이터베이스에 저장할/불러올 고유 ID 만들기 (예: "2026-03-06_0830")
    const dateString = `${targetDbDate.getFullYear()}-${String(targetDbDate.getMonth()+1).padStart(2,'0')}-${String(targetDbDate.getDate()).padStart(2,'0')}`
    const documentId = `${dateString}_${epochKey}`
    
    // ==========================================
    // STEP 1: Firebase에 이미 만들어둔 알림장이 있는지 확인!
    // ==========================================
    const summaryRef = doc(db, 'boardSummaries', documentId)
    const summarySnap = await getDoc(summaryRef)

    if (summarySnap.exists()) {
      // 이미 저장된 데이터가 있다면 AI를 부르지 않고 바로 화면에 띄웁니다! (1초 컷)
      aiAnnouncement.value = summarySnap.data().content
      isLoading.value = false
      return
    }

    // ==========================================
    // STEP 2: 저장된게 없다면? AI로 새로 만들고 DB에 저장합니다.
    // ==========================================
    
    // 조회용(0830)은 '전날' 기록을, 종례용은 '오늘' 기록을 찾아야 합니다.
    let logTargetDate = new Date(targetDbDate)
    if (epochKey === '0830') {
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
        
        const hasJoJongRye = log.tags.includes('#조종례')
        const hasJoHwe = log.tags.includes('#조회')
        const hasJongRye = log.tags.includes('#종례')
        const isFixed = log.tags.includes('#고정')

        const isRelevantForMode = isMorningMode.value ? (hasJoJongRye || hasJoHwe) : (hasJoJongRye || hasJongRye)
        if (!isRelevantForMode) return false
        if (isFixed) return true

        if (!log.createdAt) return false
        const logDate = new Date(log.createdAt)
        return logDate.getFullYear() === logYear &&
               logDate.getMonth() === logMonth &&
               logDate.getDate() === logDay
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    if (logs.length === 0) {
      aiAnnouncement.value = isMorningMode.value 
        ? "전달할 공지사항이 없습니다.\n즐거운 하루 보내세요! ☀️"
        : "전달할 공지사항이 없습니다.\n조심히 하교하세요! 👋"
      
      // 내용이 없다는 것도 캐싱(저장)해둡니다.
      await setDoc(summaryRef, { content: aiAnnouncement.value, createdAt: new Date().toISOString() })
      isLoading.value = false
      return
    }

    const logTexts = logs.map(log => {
      const isFixed = log.tags.includes('#고정')
      return `- ${isFixed ? '[고정공지] ' : ''}${log.content}`
    }).join('\n')

    const prompt = `
    당신은 우리 반 담임 선생님입니다. 지금은 ${isMorningMode.value ? '아침 조회' : '오후 종례'} 시간입니다.
    학생들이 화면을 보고 3초 만에 이해할 수 있도록 아주 **간결하고 직관적으로** 요약해주세요.

    [작성 조건]
    1. 구구절절한 설명을 빼고 **핵심 행동(Action)만 짧은 문장(명사형 종결 등)**으로 작성해주세요.
    2. '[고정공지]'라고 적힌 항목은 최상단에 배치하고 알맞은 이모지를 넣어주세요.
    3. 전체 공지사항은 번호(1. 2. 3.)를 매겨서 텍스트가 너무 길어지지 않게 정리해주세요.
    4. 끝인사는 "${isMorningMode.value ? '오늘 하루도 화이팅! ☀️' : '안전하게 하교하기! 👋'}" 정도로 한 줄만 짧게 적어주세요.

    [선생님 메모 내용]
    ${logTexts}
    `

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    })
    
    aiAnnouncement.value = response.text

    // AI가 생성한 멋진 결과를 Firebase 'boardSummaries' 컬렉션에 영구 저장합니다.
    await setDoc(summaryRef, { 
      content: response.text, 
      createdAt: new Date().toISOString() 
    })

  } catch (error) {
    console.error("AI 요약 에러:", error)
    aiAnnouncement.value = "오류가 발생했습니다.\n새로고침을 해보시거나 인터넷 연결을 확인해주세요."
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
        <p class="mt-4 text-white/90 text-lg md:text-xl font-medium">
          {{ boardSubtitle }}
        </p>
      </div>

      <div class="p-10 md:p-16 min-h-[400px] flex flex-col justify-center bg-gray-50 bg-[linear-gradient(transparent_39px,#e5e7eb_40px)] bg-[length:100%_40px]">
        
        <div v-if="isLoading" class="flex flex-col items-center justify-center text-gray-400 space-y-4">
          <div class="text-6xl animate-spin">⏳</div>
          <p class="text-2xl font-bold bg-white px-4 rounded">공지사항을 동기화하고 있습니다...</p>
        </div>

        <div v-else class="text-2xl md:text-3xl text-gray-800 leading-[50px] whitespace-pre-wrap font-bold font-sans px-4">
          {{ aiAnnouncement }}
        </div>
        
      </div>
    </div>
  </div>
</template>