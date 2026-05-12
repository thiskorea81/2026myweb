<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService' 
import { announcementSchema, getBoardPrompt } from '../services/aiPrompts' 
import { useStudentStore } from '../stores/studentStore'

// 💡 분리된 컴포넌트 불러오기
import BoardHistoryModal from '../components/board/BoardHistoryModal.vue'
import BoardDisplay from '../components/board/BoardDisplay.vue'

const studentStore = useStudentStore()

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

const isMorningMode = ref(true)
const boardTitle = computed(() => `${viewGrade.value}학년 ${viewClass.value}반 ${isMorningMode.value ? '아침 조회' : '오후 종례'}`)
const boardSubtitle = computed(() => isMorningMode.value ? '오늘의 핵심 공지사항입니다.' : '하교 전 꼭 확인하세요.')

const getBoardInfo = () => {
  const realNow = new Date()
  const currentHour = realNow.getHours()
  const currentMinute = realNow.getMinutes()
  const timeInt = currentHour * 100 + currentMinute 
  const currentDay = realNow.getDay() // 0=Sun, 1=Mon, ..., 6=Sat

  let targetDbDate = new Date(realNow)
  let epochKey = '' 
  let morningMode = true

  // 종례 시간: 수요일(3)은 14:00, 나머지는 15:00
  const afternoonTime = (currentDay === 3) ? 1400 : 1500

  if (timeInt >= afternoonTime) {
    epochKey = (currentDay === 3) ? '1400' : '1500'
    morningMode = false
  } else if (timeInt >= 800) { 
    epochKey = '0800'
    morningMode = true
  } else {
    targetDbDate.setDate(targetDbDate.getDate() - 1)
    const prevDay = targetDbDate.getDay()
    epochKey = (prevDay === 3) ? '1400' : '1500'
    morningMode = false 
  }

  const dateString = `${targetDbDate.getFullYear()}-${String(targetDbDate.getMonth()+1).padStart(2,'0')}-${String(targetDbDate.getDate()).padStart(2,'0')}`
  const documentId = `${viewGrade.value}_${viewClass.value}_${dateString}_${epochKey}` 

  let logTargetDate = new Date(targetDbDate)
  if (epochKey === '0800') logTargetDate.setDate(logTargetDate.getDate() - 1) 

  return { documentId, logTargetDate, morningMode }
}

const loadBoardContent = async (forceRegenerate = false) => {
  if (forceRegenerate) isRegenerating.value = true
  else isLoading.value = true

  try {
    const info = getBoardInfo()
    isMorningMode.value = info.morningMode
    const summaryRef = doc(db, 'boardSummaries', info.documentId)
    
    const commonDocId = `COMMON_${info.documentId.split('_').slice(-2).join('_')}`
    const commonSummaryRef = doc(db, 'boardSummaries', commonDocId)

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
        if (log.tags.includes('#고정') || log.tags.includes('#중요')) return true

        if (!log.createdAt) return false
        const logDate = new Date(log.createdAt)
        return logDate.getFullYear() === logYear && logDate.getMonth() === logMonth && logDate.getDate() === logDay
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    const commonLogs = []
    const myClassLogs = []
    
    rawLogs.forEach(log => {
      let content = log.content
      const mentionedAny = allStudents.filter(s => s.name.length >= 2 && content.includes(s.name))
      
      if (mentionedAny.length > 0) {
        const mentionedTarget = targetStudents.filter(s => s.name.length >= 2 && content.includes(s.name))
        if (mentionedTarget.length > 0) {
          mentionedTarget.forEach(s => {
            if (duplicateNames.includes(s.name)) {
              const regex = new RegExp(`${s.name}(?!\\(동명이인\\))`, 'g')
              content = content.replace(regex, `${s.name}(동명이인)`)
            }
          })
          myClassLogs.push({ ...log, content })
        }
      } else {
        commonLogs.push(log)
      }
    })

    let commonAnnouncementText = ""
    let commonClosingText = ""
    const commonSnap = await getDoc(commonSummaryRef)

    if (commonSnap.exists() && !forceRegenerate) {
       commonAnnouncementText = commonSnap.data().announcement
       commonClosingText = commonSnap.data().closing
    } else {
       if (commonLogs.length > 0) {
          const logTexts = commonLogs.map(l => `- ${l.tags.includes('#고정') ? '[고정] ' : ''}${l.content}`).join('\n')
          const prompt = getBoardPrompt(info.morningMode, logTexts) + `\n[⚠️ 필수 응답 형식]\n- 반드시 { "announcement": "...", "closing": "..." } 형태의 단일 JSON 객체로 응답하세요. 대괄호([]) 금지.`
          const result = await aiService.askStructured(prompt, announcementSchema)
          commonAnnouncementText = result.announcement
          commonClosingText = result.closing
          await setDoc(commonSummaryRef, { announcement: commonAnnouncementText, closing: commonClosingText, updatedAt: new Date().toISOString() }, { merge: true })
       } else {
          commonAnnouncementText = "전달할 전체 공지사항이 없습니다."
          commonClosingText = info.morningMode ? "오늘 하루도 화이팅! ☀️" : "안전하게 하교하세요! 👋"
       }
    }

    let finalContent = ''
    if (myClassLogs.length > 0) {
       finalContent += `🏫 [우리 반 알림]\n`
       myClassLogs.forEach((l, i) => {
          finalContent += `${i + 1}. ${l.content}\n`
       })
       finalContent += `\n`
    }

    if (commonLogs.length > 0) {
       finalContent += `📢 [전체 공지]\n${commonAnnouncementText}\n\n`
    } else if (myClassLogs.length === 0) {
       finalContent += `📢 [전체 공지]\n전달할 공지사항이 없습니다.\n\n`
    }
    
    finalContent += `${commonClosingText}`

    aiAnnouncement.value = finalContent.trim()
    
    const newEntry = {
      id: Date.now(),
      content: finalContent.trim(),
      type: '🤖 스마트 병합 (공통AI + 우리반)',
      timestamp: new Date().toISOString()
    }
    boardHistory.value.push(newEntry)

    await setDoc(summaryRef, { 
      content: finalContent.trim(), 
      history: boardHistory.value,
      updatedAt: new Date().toISOString() 
    }, { merge: true }) 

  } catch (error) {
    console.error("데이터 로드 에러:", error)
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
          @click="loadBoardContent(true)" 
          :disabled="isLoading || isRegenerating"
          class="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-800 rounded-full text-xs md:text-sm font-bold shadow-sm hover:bg-white hover:shadow-md transition-all disabled:opacity-50"
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