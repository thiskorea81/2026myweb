<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService'
import { announcementSchema, getBoardPrompt } from '../services/aiPrompts' 
import { useStudentStore } from '../stores/studentStore'

const studentStore = useStudentStore()

const aiAnnouncement = ref('')
const isLoading = ref(true)
const isRegenerating = ref(false) 

const isEditing = ref(false)
const editableContent = ref('')

const boardHistory = ref([])
const showHistoryModal = ref(false)

const isLoggedIn = computed(() => localStorage.getItem('isLoggedIn') === 'true')

// 💡 조회할 학년/반 상태 (기본값은 본인 학급)
const viewGrade = ref(localStorage.getItem('myGrade') || '1')
const viewClass = ref(localStorage.getItem('myClass') || '1')

// 💡 1~3학년, 1~9반 배열
const grades = [1, 2, 3]
const classes = [1, 2, 3, 4, 5, 6, 7, 8, 9]

const isMorningMode = ref(true)
const boardTitle = computed(() => `${viewGrade.value}학년 ${viewClass.value}반 ${isMorningMode.value ? '아침 조회' : '오후 종례'}`)
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
  // 💡 선택된 학년과 반을 문서 ID에 포함하여 데이터 완벽 분리
  const documentId = `${viewGrade.value}_${viewClass.value}_${dateString}_${epochKey}` 

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

    const summarySnap = await getDoc(summaryRef)
    if (summarySnap.exists()) {
      boardHistory.value = summarySnap.data().history || []
      if (!forceRegenerate) {
        aiAnnouncement.value = summarySnap.data().content
        isLoading.value = false
        return
      }
    } else {
      boardHistory.value = []
      // 💡 생성된 게 없고 강제 재생성도 아니면 기본 메시지 출력 후 종료 (다른 반을 조회했을 때 덮어쓰기 방지)
      if (!forceRegenerate && !isLoggedIn.value) {
        aiAnnouncement.value = isMorningMode.value ? "아직 오늘 아침 공지사항이 없습니다.\n오늘 하루도 화이팅! ☀️" : "아직 오후 공지사항이 없습니다.\n안전하게 하교하세요! 👋"
        isLoading.value = false
        return
      }
    }

    if (studentStore.students.length === 0) await studentStore.fetchStudents()
    const allStudents = studentStore.students

    const targetStudents = allStudents.filter(s => String(s.grade) === String(viewGrade.value) && String(s.class) === String(viewClass.value))
    const nameCounts = {}
    targetStudents.forEach(s => { nameCounts[s.name] = (nameCounts[s.name] || 0) + 1 })
    const duplicateNames = Object.keys(nameCounts).filter(name => nameCounts[name] > 1)

    const logYear = info.logTargetDate.getFullYear()
    const logMonth = info.logTargetDate.getMonth()
    const logDay = info.logTargetDate.getDate()

    const q = query(collection(db, 'workLogs'), where('tags', 'array-contains-any', ['#조종례', '#조회', '#종례']))
    const snap = await getDocs(q)
    
    const rawLogs = snap.docs
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

    let finalLogs = []
    let allMentionedTargets = new Set()

    rawLogs.forEach(log => {
      let content = log.content
      const mentionedAny = allStudents.filter(s => s.name.length >= 2 && content.includes(s.name))
      
      if (mentionedAny.length > 0) {
        const mentionedTarget = targetStudents.filter(s => s.name.length >= 2 && content.includes(s.name))
        
        if (mentionedTarget.length === 0) return 

        mentionedTarget.forEach(s => {
          allMentionedTargets.add(s.name)
          if (duplicateNames.includes(s.name)) {
            const regex = new RegExp(`${s.name}(?!\\(동명이인\\))`, 'g')
            content = content.replace(regex, `${s.name}(동명이인)`)
          }
        })
        finalLogs.push({ ...log, content })
      } else {
        finalLogs.push(log)
      }
    })

    if (finalLogs.length === 0) {
      aiAnnouncement.value = info.morningMode ? "전달할 공지사항이 없습니다.\n오늘 하루도 화이팅! ☀️" : "전달할 공지사항이 없습니다.\n안전하게 하교하세요! 👋"
      isLoading.value = false
      isRegenerating.value = false
      return
    }

    const logTexts = finalLogs.map(log => `- ${log.tags.includes('#고정') ? '[고정] ' : ''}${log.content}`).join('\n')
    let prompt = getBoardPrompt(info.morningMode, logTexts) 
    
    if (allMentionedTargets.size > 0) {
      prompt += `\n\n[⚠️ 중요 필터링 지시사항]\n현재 학급(${viewGrade.value}학년 ${viewClass.value}반) 소속인 [${Array.from(allMentionedTargets).join(', ')}] 학생과 관련된 내용만 추출하세요. 타 학급 학생의 이름이나 그 학생에 대한 지시사항이 섞여 있다면 절대 출력하지 마세요.`
    }
    prompt += `\n[⚠️ 필수 응답 형식]\n- 반드시 { "announcement": "...", "closing": "..." } 형태의 단일 JSON 객체로 응답하세요. 대괄호([]) 금지.`

    const result = await aiService.askStructured(prompt, announcementSchema)
    
    let finalContent = `${result.announcement}\n\n${result.closing}`
    finalContent = finalContent.replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n')
    
    aiAnnouncement.value = finalContent
    
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

onMounted(() => { loadBoardContent(false) })
</script>

<template>
  <div class="min-h-screen flex flex-col items-center p-2 md:p-4 bg-gray-100 relative">
    
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
          title="과거 업데이트 내역 확인"
        >
          🕒 지난 기록
        </button>
        <button 
          @click="startEditing" 
          :disabled="isLoading || isRegenerating"
          class="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-xs md:text-sm font-bold shadow-sm hover:bg-indigo-100 transition-all disabled:opacity-50"
          title="직접 수정"
        >
          ✏️ 직접 수정
        </button>
        <button 
          @click="loadBoardContent(true)" 
          :disabled="isLoading || isRegenerating"
          class="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-800 rounded-full text-xs md:text-sm font-bold shadow-sm hover:bg-white hover:shadow-md transition-all disabled:opacity-50"
          title="최신 메모 불러오기"
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
          
          <button @click="loadBoardContent(false)" class="bg-gray-800 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-gray-900 transition-colors shadow-sm whitespace-nowrap">
            조회
          </button>
        </div>
      </div>

      <div class="bg-white w-full rounded-2xl md:rounded-[40px] shadow-2xl overflow-hidden border-4 md:border-[6px] border-white ring-1 ring-gray-200 font-sans">
        
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
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@500;700;900&display=swap');
.font-sans { font-family: 'Pretendard', sans-serif; }
</style>