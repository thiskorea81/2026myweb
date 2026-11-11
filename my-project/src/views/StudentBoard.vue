<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { syncBoardsNow, getCurrentSlot } from '../services/boardSync'

// 💡 분리된 컴포넌트 불러오기
import BoardHistoryModal from '../components/board/BoardHistoryModal.vue'
import BoardDisplay from '../components/board/BoardDisplay.vue'

// 게시판 내용은 업무일지(#조회/#종례/#조종례)를 저장할 때 services/boardSync.js 가 만들어 두고,
// 이 화면은 해당 문서를 실시간 구독만 한다 (열어 둔 교실 TV에도 새 메모가 바로 뜬다).
const aiAnnouncement = ref('')
const isLoading = ref(true)
const isRegenerating = ref(false)

const isEditing = ref(false)
const editableContent = ref('')

const boardHistory = ref([])
const showHistoryModal = ref(false)

const isLoggedIn = computed(() => localStorage.getItem('isLoggedIn') === 'true')

const viewGrade = ref(localStorage.getItem('myGrade') || '1')
const viewClass = ref(localStorage.getItem('myClass') || '1')

const grades = [1, 2, 3]
const classes = [1, 2, 3, 4, 5, 6, 7, 8, 9]

const slot = ref(getCurrentSlot())
const isMorningMode = computed(() => slot.value.morning)
const boardTitle = computed(() => `${viewGrade.value}학년 ${viewClass.value}반 ${isMorningMode.value ? '아침 조회' : '오후 종례'}`)
const boardSubtitle = computed(() => isMorningMode.value ? '오늘의 핵심 공지사항입니다.' : '하교 전 꼭 확인하세요.')

const summaryRef = () => doc(db, 'boardSummaries', `${viewGrade.value}_${viewClass.value}_${slot.value.key}`)

let unsubscribe = null
const subscribe = () => {
  if (unsubscribe) unsubscribe()
  isLoading.value = true
  unsubscribe = onSnapshot(summaryRef(), (snap) => {
    if (snap.exists()) {
      boardHistory.value = snap.data().history || []
      if (!isEditing.value) aiAnnouncement.value = snap.data().content
    } else {
      boardHistory.value = []
      aiAnnouncement.value = isMorningMode.value
        ? "아직 오늘 아침 공지사항이 없습니다.\n오늘 하루도 화이팅! ☀️"
        : "아직 오후 공지사항이 없습니다.\n안전하게 하교하세요! 👋"
    }
    isLoading.value = false
  }, (error) => {
    console.error("조종례 게시판 구독 에러:", error)
    aiAnnouncement.value = "공지사항을 불러오는 중 오류가 발생했습니다."
    isLoading.value = false
  })
}

// 로그인한 선생님 화면이면 열 때마다 최신 업무일지로 맞춰 둔다 (바뀐 게 없으면 아무것도 쓰지 않음)
const syncIfTeacher = () => {
  if (isLoggedIn.value) syncBoardsNow().catch(e => console.error('조종례 동기화 실패:', e))
}

// '다시 생성': AI 요약까지 새로 만든다 (직접 수정한 내용도 덮어씀)
const regenerate = async () => {
  if (!confirm('업무일지를 바탕으로 조종례를 다시 생성할까요?\n직접 수정한 내용은 새로 만든 내용으로 바뀝니다.')) return
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

const startEditing = () => {
  editableContent.value = aiAnnouncement.value
  isEditing.value = true
}

// 직접 수정한 내용은 sourceHash를 건드리지 않으므로, 관련 업무일지가 새로 바뀌기 전까지 유지된다
const saveBoardContent = async (content, type) => {
  const newEntry = { id: Date.now(), content, type, timestamp: new Date().toISOString() }
  await setDoc(summaryRef(), {
    content,
    history: [...boardHistory.value, newEntry].slice(-30),
    updatedAt: new Date().toISOString()
  }, { merge: true })
  aiAnnouncement.value = content
}

const saveEditedContent = async () => {
  try {
    await saveBoardContent(editableContent.value, '✏️ 선생님 직접 수정')
    isEditing.value = false
    alert('✅ 공지사항이 성공적으로 수정 및 저장되었습니다.')
  } catch (error) {
    console.error("수정 에러:", error)
    alert('❌ 저장 중 오류가 발생했습니다.')
  }
}

const restoreHistory = async (hist) => {
  if(!confirm('선택하신 이전 버전으로 공지사항을 되돌리시겠습니까?')) return
  try {
    await saveBoardContent(hist.content, '⏪ 이전 버전으로 복구됨')
    showHistoryModal.value = false
    alert('✅ 이전 버전으로 성공적으로 복구되었습니다.')
  } catch (error) {
    console.error("복구 에러:", error)
    alert('❌ 복구 중 오류가 발생했습니다.')
  }
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
  <div class="min-h-screen flex flex-col items-center p-2 md:p-4 bg-gray-100 relative">
    
    <BoardHistoryModal 
      :show="showHistoryModal" 
      :history="boardHistory" 
      @close="showHistoryModal = false"
      @restore="restoreHistory"
    />

    <div v-if="isLoggedIn" class="absolute top-4 right-4 z-50 flex flex-wrap justify-end items-center gap-2">
      <template v-if="!isEditing">
        <button 
          @click="showHistoryModal = true" 
          :disabled="isLoading || isRegenerating"
          class="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-gray-50 border border-gray-200 text-gray-600 rounded-full text-xs md:text-sm font-bold shadow-sm hover:bg-gray-100 transition-all disabled:opacity-50"
        >
          🕒 지난 기록
        </button>
        <button 
          @click="startEditing" 
          :disabled="isLoading || isRegenerating"
          class="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-xs md:text-sm font-bold shadow-sm hover:bg-indigo-100 transition-all disabled:opacity-50"
        >
          ✏️ 직접 수정
        </button>
        <button 
          @click="regenerate" 
          :disabled="isLoading || isRegenerating"
          class="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-800 rounded-full text-xs md:text-sm font-bold shadow-sm hover:bg-white hover:shadow-md transition-all disabled:opacity-50"
        >
          <span :class="{'animate-spin': isRegenerating}">🔄</span>
          {{ isRegenerating ? '생성 중...' : '다시 생성' }}
        </button>
      </template>
      <template v-else>
        <button 
          @click="isEditing = false"
          class="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-gray-200 border border-gray-300 text-gray-700 rounded-full text-xs md:text-sm font-bold shadow-sm hover:bg-gray-300 transition-all"
        >
          취소
        </button>
        <button 
          @click="saveEditedContent" 
          class="flex items-center gap-2 px-4 py-1.5 md:px-6 md:py-2 bg-indigo-600 text-white rounded-full text-xs md:text-sm font-bold shadow-md hover:bg-indigo-700 transition-all"
        >
          💾 저장하기
        </button>
      </template>
    </div>

    <div class="w-full max-w-5xl mt-16 md:mt-6 z-40">
      <div class="flex justify-center md:justify-start mb-4">
        <div class="bg-white/80 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-2 sm:gap-3">
          <span class="text-sm font-bold text-gray-600 hidden sm:inline">학급 선택:</span>
          
          <select v-model="viewGrade" class="border border-gray-300 text-gray-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none py-1.5 pl-2 sm:pl-3 pr-6 bg-white">
            <option v-for="n in grades" :key="n" :value="n">{{ n }}학년</option>
          </select>
          
          <select v-model="viewClass" class="border border-gray-300 text-gray-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none py-1.5 pl-2 sm:pl-3 pr-6 bg-white">
            <option v-for="n in classes" :key="n" :value="n">{{ n }}반</option>
          </select>
          
          <button @click="subscribe" class="bg-gray-800 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-gray-900 transition-colors shadow-sm whitespace-nowrap">
            조회
          </button>
        </div>
      </div>

      <BoardDisplay 
        :title="boardTitle"
        :subtitle="boardSubtitle"
        :content="aiAnnouncement"
        :isLoading="isLoading || isRegenerating"
        :isEditing="isEditing"
        :isMorningMode="isMorningMode"
        v-model="editableContent"
      />
      
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@500;700;900&display=swap');
.font-sans { font-family: 'Pretendard', sans-serif; }
</style>