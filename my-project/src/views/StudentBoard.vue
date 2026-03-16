<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService'
import { announcementSchema, getBoardPrompt } from '../services/aiPrompts' 

const aiAnnouncement = ref('')
const isLoading = ref(true)
const isRegenerating = ref(false) 

const isEditing = ref(false)
const editableContent = ref('')

// 💡 히스토리(버전 관리)를 위한 상태 추가
const boardHistory = ref([])
const showHistoryModal = ref(false)

const isLoggedIn = computed(() => localStorage.getItem('isLoggedIn') === 'true')

const isMorningMode = ref(true)
const boardTitle = computed(() => isMorningMode.value ? '🌅 오늘의 아침 조회' : '🌇 오늘의 오후 종례')
const boardSubtitle = computed(() => isMorningMode.value ? '오늘의 핵심 공지사항입니다.' : '하교 전 꼭 확인하세요.')

const getBoardInfo = () => {
  const realNow = new Date()
  const currentHour = realNow.getHours()
  const currentMinute = realNow.getMinutes()
  const timeInt = currentHour * 100 + currentMinute 

  let targetDbDate = new Date(realNow)
  let epochKey = '' 
  let morningMode = true

  if (timeInt >= 1220) {
    epochKey = '1220'
    morningMode = false
  } else if (timeInt >= 730) { 
    epochKey = '0730'
    morningMode = true
  } else {
    targetDbDate.setDate(targetDbDate.getDate() - 1)
    epochKey = '1220' 
    morningMode = false 
  }

  const dateString = `${targetDbDate.getFullYear()}-${String(targetDbDate.getMonth()+1).padStart(2,'0')}-${String(targetDbDate.getDate()).padStart(2,'0')}`
  const documentId = `${dateString}_${epochKey}` 

  let logTargetDate = new Date(targetDbDate)
  if (epochKey === '0730') logTargetDate.setDate(logTargetDate.getDate() - 1) 

  return { documentId, logTargetDate, morningMode }
}

const loadBoardContent = async (forceRegenerate = false) => {
  if (forceRegenerate) isRegenerating.value = true
  else isLoading.value = true

  try {
    const info = getBoardInfo()
    isMorningMode.value = info.morningMode
    const summaryRef = doc(db, 'boardSummaries', info.documentId)

    // 💡 DB에서 기존 히스토리 내역을 무조건 먼저 가져옵니다.
    const summarySnap = await getDoc(summaryRef)
    if (summarySnap.exists()) {
      boardHistory.value = summarySnap.data().history || []
      
      // 강제 재생성이 아니면 현재 화면에 표시만 하고 종료
      if (!forceRegenerate) {
        aiAnnouncement.value = summarySnap.data().content
        isLoading.value = false
        return
      }
    } else {
      boardHistory.value = []
    }

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
      isLoading.value = false
      isRegenerating.value = false
      return
    }

    const logTexts = logs.map(log => `- ${log.tags.includes('#고정') ? '[고정] ' : ''}${log.content}`).join('\n')
    const prompt = getBoardPrompt(info.morningMode, logTexts) + `\n[⚠️ 필수 응답 형식]\n- 반드시 { "announcement": "...", "closing": "..." } 형태의 단일 JSON 객체로 응답하세요. 대괄호([]) 금지.`

    const result = await aiService.askStructured(prompt, announcementSchema)
    
    let finalContent = `${result.announcement}\n\n${result.closing}`
    finalContent = finalContent.replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n')
    
    aiAnnouncement.value = finalContent
    
    // 💡 AI 업데이트 시 히스토리에 기록 추가
    const newEntry = {
      id: Date.now(),
      content: finalContent,
      type: '🤖 AI 자동 업데이트',
      timestamp: new Date().toISOString()
    }
    boardHistory.value.push(newEntry)

    await setDoc(summaryRef, { 
      content: finalContent, 
      history: boardHistory.value,
      updatedAt: new Date().toISOString() 
    }, { merge: true }) 

  } catch (error) {
    console.error("AI 요약 에러:", error)
    aiAnnouncement.value = "공지사항을 동기화하는 중 오류가 발생했습니다."
  } finally {
    isLoading.value = false
    isRegenerating.value = false
  }
}

const startEditing = () => {
  editableContent.value = aiAnnouncement.value
  isEditing.value = true
}

const saveEditedContent = async () => {
  try {
    const info = getBoardInfo()
    const summaryRef = doc(db, 'boardSummaries', info.documentId)
    
    // 💡 선생님이 직접 수정할 때도 히스토리에 기록 추가
    const newEntry = {
      id: Date.now(),
      content: editableContent.value,
      type: '✏️ 선생님 직접 수정',
      timestamp: new Date().toISOString()
    }
    boardHistory.value.push(newEntry)

    await setDoc(summaryRef, { 
      content: editableContent.value, 
      history: boardHistory.value,
      updatedAt: new Date().toISOString() 
    }, { merge: true })
    
    aiAnnouncement.value = editableContent.value
    isEditing.value = false
    alert('✅ 공지사항이 성공적으로 수정 및 저장되었습니다.')
  } catch (error) {
    console.error("수정 에러:", error)
    alert('❌ 저장 중 오류가 발생했습니다.')
  }
}

// 💡 특정 히스토리 버전으로 되돌리는 함수
const restoreHistory = async (hist) => {
  if(!confirm('선택하신 이전 버전으로 공지사항을 되돌리시겠습니까?')) return

  try {
    const info = getBoardInfo()
    const summaryRef = doc(db, 'boardSummaries', info.documentId)
    
    const newEntry = {
      id: Date.now(),
      content: hist.content,
      type: '⏪ 이전 버전으로 복구됨',
      timestamp: new Date().toISOString()
    }
    boardHistory.value.push(newEntry)

    await setDoc(summaryRef, { 
      content: hist.content, 
      history: boardHistory.value,
      updatedAt: new Date().toISOString() 
    }, { merge: true })

    aiAnnouncement.value = hist.content
    showHistoryModal.value = false
    alert('✅ 이전 버전으로 성공적으로 복구되었습니다.')
  } catch (error) {
    console.error("복구 에러:", error)
    alert('❌ 복구 중 오류가 발생했습니다.')
  }
}

onMounted(() => {
  loadBoardContent(false)
})
</script>

<template>
  <div class="min-h-[80vh] flex flex-col items-center justify-center p-2 md:p-4 bg-gray-100 relative">
    
    <div v-if="showHistoryModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        <div class="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 class="text-xl font-black text-gray-800">🕒 업데이트 기록 (버전 복구)</h3>
          <button @click="showHistoryModal = false" class="text-3xl font-bold text-gray-400 hover:text-red-500 leading-none">&times;</button>
        </div>
        <div class="p-6 overflow-y-auto flex-1 bg-gray-100 flex flex-col gap-4">
          <div v-for="hist in [...boardHistory].reverse()" :key="hist.id" class="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
              <span class="text-sm font-bold" :class="hist.type.includes('AI') ? 'text-blue-600' : (hist.type.includes('복구') ? 'text-amber-600' : 'text-teal-600')">
                {{ hist.type }} <span class="text-gray-400 font-medium text-xs ml-2">{{ new Date(hist.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) }}</span>
              </span>
              <button @click="restoreHistory(hist)" class="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-bold hover:bg-black transition-colors shrink-0">
                이 버전으로 덮어쓰기
              </button>
            </div>
            <p class="text-[15px] text-gray-800 whitespace-pre-wrap font-medium leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">{{ hist.content }}</p>
          </div>
          <div v-if="boardHistory.length === 0" class="text-center text-gray-400 font-bold py-10">저장된 업데이트 기록이 없습니다.</div>
        </div>
      </div>
    </div>

    <div v-if="isLoggedIn" class="absolute top-4 right-4 z-50 flex flex-wrap justify-end items-center gap-2">
      <template v-if="!isEditing">
        <button 
          @click="showHistoryModal = true" 
          :disabled="isLoading || isRegenerating"
          class="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-gray-50 border border-gray-200 text-gray-600 rounded-full text-xs md:text-sm font-bold shadow-sm hover:bg-gray-100 transition-all disabled:opacity-50"
          title="과거 업데이트 내역을 확인하고 복구합니다"
        >
          🕒 지난 기록
        </button>
        <button 
          @click="startEditing" 
          :disabled="isLoading || isRegenerating"
          class="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-xs md:text-sm font-bold shadow-sm hover:bg-indigo-100 transition-all disabled:opacity-50"
          title="문구를 직접 수정합니다"
        >
          ✏️ 직접 수정
        </button>
        <button 
          @click="loadBoardContent(true)" 
          :disabled="isLoading || isRegenerating"
          class="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-800 rounded-full text-xs md:text-sm font-bold shadow-sm hover:bg-white hover:shadow-md transition-all disabled:opacity-50"
          title="새로운 메모를 추가했다면 눌러서 최신화하세요"
        >
          <span :class="{'animate-spin': isRegenerating}">🔄</span>
          {{ isRegenerating ? '업데이트 중...' : '메모 불러오기' }}
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

    <div class="bg-white w-full max-w-5xl rounded-2xl md:rounded-[40px] shadow-2xl overflow-hidden border-4 md:border-[6px] border-white ring-1 ring-gray-200 font-sans mt-20 md:mt-10">
      
      <div class="p-6 md:p-10 text-center transition-colors duration-700" :class="isMorningMode ? 'bg-gradient-to-br from-orange-400 to-red-500' : 'bg-gradient-to-br from-indigo-600 to-blue-800'">
        <h1 class="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black text-white tracking-tighter drop-shadow-md">
          {{ boardTitle }}
        </h1>
        <p class="mt-2 md:mt-6 text-white/90 text-sm sm:text-base md:text-xl lg:text-2xl font-bold opacity-80">
          {{ boardSubtitle }}
        </p>
      </div>

      <div class="p-6 sm:p-8 md:p-16 lg:p-20 min-h-[300px] md:min-h-[500px] flex flex-col justify-center relative bg-gray-50 bg-[linear-gradient(transparent_47px,#e5e7eb_48px)] bg-[length:100%_48px]">
        
        <div v-if="isLoading || isRegenerating" class="flex flex-col items-center justify-center text-gray-400 space-y-4 md:space-y-6">
          <div class="w-10 h-10 md:w-16 md:h-16 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
          <p class="text-lg md:text-2xl font-black bg-white/80 px-4 py-2 md:px-6 rounded-full shadow-sm text-center">AI가 최신 공지사항을<br class="md:hidden"> 정리하고 있습니다...</p>
        </div>

        <div v-else-if="!isEditing" class="relative z-10 text-xl sm:text-2xl md:text-4xl lg:text-5xl text-gray-800 leading-[1.6] md:leading-[1.7] whitespace-pre-wrap font-black font-sans px-2 md:px-4 tracking-tight drop-shadow-sm">
          {{ aiAnnouncement }}
        </div>

        <textarea 
          v-else 
          v-model="editableContent"
          class="relative z-20 w-full min-h-[300px] md:min-h-[400px] p-6 text-xl sm:text-2xl md:text-4xl lg:text-5xl text-gray-800 leading-[1.6] md:leading-[1.7] font-black font-sans tracking-tight bg-white/90 border-2 border-indigo-400 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-200 resize-none shadow-inner"
          placeholder="여기에 내용을 입력하세요..."
        ></textarea>
        
        <div class="absolute bottom-4 right-4 md:bottom-8 md:right-8 text-6xl md:text-9xl opacity-10 select-none pointer-events-none">
          {{ isMorningMode ? '☀️' : '🌙' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@500;700;900&display=swap');
.font-sans { font-family: 'Pretendard', sans-serif; }
</style>