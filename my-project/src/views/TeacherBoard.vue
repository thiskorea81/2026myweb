<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { syncBoardsNow, getCurrentSlot } from '../services/boardSync'

// 게시판 내용은 업무일지(#조회/#종례/#조종례)를 저장할 때 services/boardSync.js 가 만들어 두고,
// 이 화면은 해당 문서를 실시간 구독만 한다.
const isLoggedIn = computed(() => localStorage.getItem('isLoggedIn') === 'true')

const viewGrade = ref(localStorage.getItem('myGrade') || '1')
const viewClass = ref(localStorage.getItem('myClass') || '1')

const aiAnnouncement = ref('')
const isLoading = ref(true)
const isRegenerating = ref(false)

const slot = ref(getCurrentSlot())
const isMorningMode = computed(() => slot.value.morning)
const boardTitle = computed(() => `${viewGrade.value}학년 ${viewClass.value}반 ${isMorningMode.value ? '아침' : '하교 전'} 전달사항`)

const grades = [1, 2, 3]
const classes = Array.from({length: 9}, (_, i) => i + 1)

let unsubscribe = null
const subscribe = () => {
  if (unsubscribe) unsubscribe()
  isLoading.value = true
  const ref_ = doc(db, 'teacherBoardSummaries', `${viewGrade.value}_${viewClass.value}_${slot.value.key}`)
  unsubscribe = onSnapshot(ref_, (snap) => {
    aiAnnouncement.value = snap.exists()
      ? snap.data().content
      : "아직 해당 학급의 전달사항이 없습니다. 😊"
    isLoading.value = false
  }, (error) => {
    console.error("담임용 조종례 구독 에러:", error)
    aiAnnouncement.value = "공지사항을 불러오는 중 오류가 발생했습니다."
    isLoading.value = false
  })
}

const syncIfTeacher = () => {
  if (isLoggedIn.value) syncBoardsNow().catch(e => console.error('조종례 동기화 실패:', e))
}

// '갱신': AI 요약까지 새로 만든다
const regenerate = async () => {
  if (!isLoggedIn.value) return
  isRegenerating.value = true
  try {
    await syncBoardsNow({ force: true })
  } catch (error) {
    console.error("다시 생성 에러:", error)
    alert('❌ 다시 생성하는 중 오류가 발생했습니다.')
  } finally {
    isRegenerating.value = false
  }
}

const copyToClipboard = () => {
  navigator.clipboard.writeText(`[${boardTitle.value}]\n\n${aiAnnouncement.value}`).then(() => {
    alert('📋 내용이 복사되었습니다. 메신저에 붙여넣기 하세요!')
  })
}

// 조회 ↔ 종례 시각이 지나면 화면을 다음 회차로 넘긴다
let slotTimer = null
onMounted(() => {
  subscribe()
  syncIfTeacher()
  slotTimer = setInterval(() => {
    const next = getCurrentSlot()
    if (next.key !== slot.value.key) {
      slot.value = next
      subscribe()
      syncIfTeacher()
    }
  }, 60 * 1000)
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
  clearInterval(slotTimer)
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center py-6 px-4 font-sans">
    
    <div class="w-full max-w-3xl">
      
      <div class="flex justify-center mb-8">
        <div class="bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-2 sm:gap-3">
          <span class="text-sm font-bold text-gray-500 hidden sm:inline">학급 선택:</span>
          
          <select v-model="viewGrade" class="border border-gray-300 text-gray-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none py-1.5 pl-3 pr-8 bg-gray-50">
            <option v-for="n in grades" :key="n" :value="n">{{ n }}학년</option>
          </select>
          
          <select v-model="viewClass" class="border border-gray-300 text-gray-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none py-1.5 pl-3 pr-8 bg-gray-50">
            <option v-for="n in classes" :key="n" :value="n">{{ n }}반</option>
          </select>
          
          <button @click="subscribe" class="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap">
            조회
          </button>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 px-2 gap-4">
        <div>
            <h2 class="text-2xl font-black text-gray-800">👨‍🏫 담임 교사용 조종례 브리핑</h2>
            <p class="text-sm text-gray-500 font-bold mt-1">담임 선생님이 우리 반 전달사항을 한눈에 파악할 수 있도록 정리해 드립니다.</p>
        </div>
        
        <div class="flex gap-2">
          <button v-if="isLoggedIn" @click="regenerate" :disabled="isLoading || isRegenerating" class="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-100 disabled:opacity-50 transition-colors">
            <span :class="{'animate-spin inline-block': isRegenerating}">🔄</span> 갱신
          </button>
          
          <button @click="copyToClipboard" class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-1.5">
            📋 메신저 복사
          </button>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        
        <div class="p-5 sm:p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
          <span class="text-3xl">{{ isMorningMode ? '☀️' : '🌙' }}</span>
          <h1 class="text-lg sm:text-xl font-black text-gray-800 tracking-tight">{{ boardTitle }}</h1>
        </div>

        <div class="p-6 sm:p-8 min-h-[300px] flex flex-col justify-center">
          
          <div v-if="isLoading || isRegenerating" class="flex flex-col items-center justify-center text-gray-400 space-y-4">
            <div class="w-10 h-10 border-4 border-gray-200 border-t-indigo-500 rounded-full animate-spin"></div>
            <p class="text-sm font-bold">안내문을 불러오고 있습니다...</p>
          </div>

          <div v-else class="text-[15px] sm:text-[16px] text-gray-700 leading-[1.8] whitespace-pre-wrap font-medium">
            {{ aiAnnouncement }}
          </div>

        </div>
      </div>
      
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@500;700;900&display=swap');
.font-sans { font-family: 'Pretendard', sans-serif; }
</style>