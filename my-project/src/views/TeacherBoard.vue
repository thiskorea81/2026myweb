<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from '../services/aiService' 
import { announcementSchema, getTeacherBoardPrompt } from '../services/aiPrompts'
import { useStudentStore } from '../stores/studentStore' 

const studentStore = useStudentStore()
const isLoggedIn = computed(() => localStorage.getItem('isLoggedIn') === 'true')

const viewGrade = ref(localStorage.getItem('myGrade') || '1')
const viewClass = ref(localStorage.getItem('myClass') || '1')

const aiAnnouncement = ref('')
const isLoading = ref(true)
const isRegenerating = ref(false) 

const isMorningMode = ref(true)
const boardTitle = computed(() => `${viewGrade.value}학년 ${viewClass.value}반 ${isMorningMode.value ? '아침' : '하교 전'} 전달사항`)

const grades = [1, 2, 3]
const classes = Array.from({length: 9}, (_, i) => i + 1)

const getBoardInfo = () => {
  const realNow = new Date()
  const currentHour = realNow.getHours()
  const currentMinute = realNow.getMinutes()
  const timeInt = currentHour * 100 + currentMinute 
  const currentDay = realNow.getDay()

  let targetDbDate = new Date(realNow)
  let epochKey = '' 
  let morningMode = true

  const afternoonTime = (currentDay === 3) ? 1500 : 1600

  if (timeInt >= afternoonTime) {
    epochKey = (currentDay === 3) ? '1500' : '1600'
    morningMode = false
  } else if (timeInt >= 800) { 
    epochKey = '0800'
    morningMode = true
  } else {
    targetDbDate.setDate(targetDbDate.getDate() - 1)
    const prevDay = targetDbDate.getDay()
    epochKey = (prevDay === 3) ? '1500' : '1600'
    morningMode = false 
  }

  const dateString = `${targetDbDate.getFullYear()}-${String(targetDbDate.getMonth()+1).padStart(2,'0')}-${String(targetDbDate.getDate()).padStart(2,'0')}`
  const documentId = `${dateString}_${epochKey}` 

  let logTargetDate = new Date(targetDbDate)
  if (epochKey === '0800') logTargetDate.setDate(logTargetDate.getDate() - 1) 

  return { documentId, logTargetDate, morningMode }
}

const loadBoardContent = async (forceRegenerate = false) => {
  if (!isLoggedIn.value && forceRegenerate) return 
  
  if (forceRegenerate) isRegenerating.value = true
  else isLoading.value = true

  try {
    const info = getBoardInfo()
    isMorningMode.value = info.morningMode
    
    const docId = `${viewGrade.value}_${viewClass.value}_${info.documentId}`
    const summaryRef = doc(db, 'teacherBoardSummaries', docId)
    
    // 💡 교사용 보드 전용 공통 AI 캐시 저장소 (COMMON_TEACHER_날짜)
    const commonDocId = `COMMON_TEACHER_${info.documentId}`
    const commonSummaryRef = doc(db, 'teacherBoardSummaries', commonDocId)

    const summarySnap = await getDoc(summaryRef)

    if (summarySnap.exists() && !forceRegenerate) {
      aiAnnouncement.value = summarySnap.data().content
      isLoading.value = false
      return
    }

    if (!isLoggedIn.value) {
      aiAnnouncement.value = "아직 해당 학급의 담임 선생님께서 전달사항을 등록하지 않으셨습니다. 😊"
      isLoading.value = false
      return
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

    // 💡 교사용 보드 공통 공지사항 AI 처리 및 캐싱
    let commonAnnouncementText = ""
    let commonClosingText = ""
    const commonSnap = await getDoc(commonSummaryRef)

    if (commonSnap.exists() && !forceRegenerate) {
       commonAnnouncementText = commonSnap.data().announcement
       commonClosingText = commonSnap.data().closing
    } else {
       if (commonLogs.length > 0) {
          const logTexts = commonLogs.map(l => `- ${l.tags.includes('#고정') ? '[고정] ' : ''}${l.content}`).join('\n')
          const prompt = getTeacherBoardPrompt(info.morningMode, logTexts) + `\n[⚠️ 필수 응답 형식]\n- 반드시 { "announcement": "...", "closing": "..." } 형태의 단일 JSON 객체로 응답하세요.`
          const result = await aiService.askStructured(prompt, announcementSchema)
          commonAnnouncementText = result.announcement
          commonClosingText = result.closing
          await setDoc(commonSummaryRef, { announcement: commonAnnouncementText, closing: commonClosingText, updatedAt: new Date().toISOString() }, { merge: true })
       } else {
          commonAnnouncementText = "선생님, 오늘 전달할 전체 공지사항이 없습니다."
          commonClosingText = "오늘 하루도 수고 많으셨습니다! 😊"
       }
    }

    // 💡 우리 반 알림 + 공통 공지사항 조립 (스마트 병합)
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

    await setDoc(summaryRef, { 
      content: finalContent.trim(), 
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

const copyToClipboard = () => {
  navigator.clipboard.writeText(`[${boardTitle.value}]\n\n${aiAnnouncement.value}`).then(() => {
    alert('📋 내용이 복사되었습니다. 메신저에 붙여넣기 하세요!')
  })
}

onMounted(() => { loadBoardContent(false) })
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
          
          <button @click="loadBoardContent(false)" class="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap">
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
          <button v-if="isLoggedIn" @click="loadBoardContent(true)" :disabled="isLoading || isRegenerating" class="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-100 disabled:opacity-50 transition-colors">
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