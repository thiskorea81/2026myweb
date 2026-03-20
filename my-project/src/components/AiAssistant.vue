<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useStudentStore } from '../stores/studentStore'
import { useAiNoteStore } from '../stores/aiNoteStore'
import { aiService } from '../services/aiService'

const isOpen = ref(false)
const userInput = ref('')
const isLoading = ref(false)
const chatContainer = ref(null)

const defaultWelcome = { 
  role: 'model', 
  text: '안녕하세요 선생님! 학생 이름을 말해주시면 기본 정보부터 출결, 상담, 성적, 교과 세특, 그리고 동아리 활동 내역까지 종합해서 분석해 드려요. 유용한 답변은 [🤖 AI 노트]에 따로 저장해 둘 수 있답니다! 😊' 
}

const chatHistory = ref([defaultWelcome])

const studentStore = useStudentStore()
const aiNoteStore = useAiNoteStore()

const loadChatHistory = async () => {
  try {
    const docRef = doc(db, 'settings', 'aiChatHistory')
    const snap = await getDoc(docRef)
    if (snap.exists() && snap.data().history && snap.data().history.length > 0) {
      chatHistory.value = snap.data().history
    }
  } catch (error) {
    console.error("대화 기록 불러오기 실패:", error)
  }
}

const saveChatHistory = async () => {
  try {
    let historyToSave = chatHistory.value
    if (historyToSave.length > 50) {
      historyToSave = historyToSave.slice(-50)
    }
    await setDoc(doc(db, 'settings', 'aiChatHistory'), { history: historyToSave }, { merge: true })
  } catch (error) {
    console.error("대화 기록 저장 실패:", error)
  }
}

const clearChat = async () => {
  if (!confirm('대화 내용을 모두 초기화하시겠습니까?')) return
  chatHistory.value = [defaultWelcome]
  await saveChatHistory()
}

onMounted(async () => {
  if (studentStore.students.length === 0) {
    studentStore.fetchStudents()
  }
  await loadChatHistory()
  scrollToBottom()
})

const scrollToBottom = async () => {
  await nextTick()
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

const saveToAiNote = async (chat) => {
  if (!chat.matchedStudentId) return
  const content = `❓ 선생님의 질문:\n${chat.originalPrompt}\n\n💡 AI 분석 및 답변:\n${chat.text}`
  try {
    await aiNoteStore.addNote(chat.matchedStudentId, content)
    chat.isSaved = true 
    await saveChatHistory() 
  } catch (error) {
    console.error(error)
    alert('AI 노트 저장에 실패했습니다.')
  }
}

const sendMessage = async () => {
  if (!userInput.value.trim() || isLoading.value) return

  const originalPrompt = userInput.value
  chatHistory.value.push({ role: 'user', text: originalPrompt })
  userInput.value = ''
  isLoading.value = true
  scrollToBottom()
  
  await saveChatHistory()

  try {
    let contextStr = ''
    let matchedStudentInfo = null 

    const matchedStudent = studentStore.students.find(s => originalPrompt.includes(s.name))

    if (matchedStudent) {
      matchedStudentInfo = matchedStudent 
      
      // 1. 상담 기록 스캔
      const counselQuery = query(collection(db, 'counselingLogs'), where('studentId', '==', matchedStudent.id))
      const counselSnap = await getDocs(counselQuery)
      const counselLogs = counselSnap.docs.map(d => d.data())

      // 2. 출결 기록 스캔
      const attQuery = query(collection(db, 'attendanceLogs'), where('studentId', '==', matchedStudent.id))
      const attSnap = await getDocs(attQuery)
      const attLogs = attSnap.docs.map(d => d.data())

      // 3. 교과 수업(세특) 기록 스캔
      const subjectQuery = query(collection(db, 'subjectRecords'), where('studentId', '==', matchedStudent.studentId))
      const subjectSnap = await getDocs(subjectQuery)
      const subjectLogs = subjectSnap.docs.map(d => d.data())
      
      let subjectContext = ''
      if (subjectLogs.length > 0) {
        const grouped = {}
        subjectLogs.forEach(l => {
          if (!grouped[l.subject]) grouped[l.subject] = []
          grouped[l.subject].push(`(${l.date}) ${l.content}`)
        })
        for (const [subj, logs] of Object.entries(grouped)) {
          subjectContext += `\n    - [${subj}] ${logs.join(' / ')}`
        }
      }

      // 💡 4. 동아리 활동 기록 스캔 추가!
      // (동아리 정보는 studentStore 안에 내장되어 있으므로 최신 DB 데이터를 한 번 더 가져옵니다)
      const studentDocSnap = await getDoc(doc(db, 'students', matchedStudent.id))
      let clubContext = ''
      if (studentDocSnap.exists()) {
        const sData = studentDocSnap.data()
        // 동아리 기본 정보
        if (sData.clubRole || sData.motivation || sData.specialty) {
          clubContext += `\n    - [기본정보] 역할: ${sData.clubRole || '없음'}, 특기: ${sData.specialty || '없음'}, 동기: ${sData.motivation || '없음'}`
        }
        // 동아리 활동 내역 배열 (clubActivities)
        if (sData.clubActivities && sData.clubActivities.length > 0) {
          const actLogs = sData.clubActivities.map(a => `(${a.date}) [${a.title}] ${a.content}`).join(' / ')
          clubContext += `\n    - [활동내역] ${actLogs}`
        }
      }

      // 종합 컨텍스트 조립
      contextStr += `\n\n[학급 데이터 컨텍스트]\n- 학생: ${matchedStudent.name} (${matchedStudent.studentId})\n- 진로: ${matchedStudent.career}\n- 장단점: ${matchedStudent.goodPoint}/${matchedStudent.badPoint}\n- 성적: ${JSON.stringify(matchedStudent.grades || [])}\n- 최근상담: ${counselLogs.map(l => l.content).join('; ')}\n- 출결: ${attLogs.map(l => l.type).join(', ')}`
      
      if (subjectContext) {
         contextStr += `\n- 교과 수업(세특) 기록:${subjectContext}`
      }
      if (clubContext) {
         contextStr += `\n- 동아리 활동 기록:${clubContext}`
      }
    }

    if (originalPrompt.includes('#업무')) {
      const workSnap = await getDocs(collection(db, 'workLogs'))
      const workLogs = workSnap.docs.map(d => d.data()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10)
      contextStr += `\n\n[최근 업무 일지 컨텍스트]\n${workLogs.map(l => `- [${l.createdAt?.split('T')[0]}] ${l.content}`).join('\n')}`
    }

    const finalPrompt = contextStr ? `${originalPrompt}\n\n${contextStr}` : originalPrompt

    const aiResponse = await aiService.askText(finalPrompt)
    
    chatHistory.value.push({ 
      role: 'model', 
      text: aiResponse,
      matchedStudentId: matchedStudentInfo ? matchedStudentInfo.id : null,
      matchedStudentName: matchedStudentInfo ? matchedStudentInfo.name : null,
      originalPrompt: originalPrompt,
      isSaved: false
    })
    
    await saveChatHistory()

  } catch (error) {
    console.error('AI Assistant Error:', error)
    chatHistory.value.push({ role: 'model', text: '앗, 오류가 발생했어요. 서비스 설정이나 네트워크 상태를 확인해 주세요.' })
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}
</script>

<template>
  <div class="fixed bottom-6 right-6 z-50 flex flex-col items-end print:hidden">
    <div 
      v-if="isOpen" 
      class="bg-white w-[350px] sm:w-[450px] rounded-2xl shadow-2xl border border-gray-200 flex flex-col mb-4 overflow-hidden h-[600px]"
    >
      <div class="bg-blue-600 text-white p-4 flex justify-between items-center">
        <div class="font-bold flex items-center gap-2">✨ AI 업무 비서</div>
        <div class="flex items-center gap-3">
          <button @click="clearChat" class="text-xs bg-blue-700 px-2 py-1 rounded font-bold hover:bg-blue-800 transition-colors">초기화</button>
          <button @click="isOpen = false" class="text-2xl leading-none hover:text-gray-200">&times;</button>
        </div>
      </div>

      <div ref="chatContainer" class="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col gap-3 custom-scrollbar">
        <div 
          v-for="(chat, index) in chatHistory" :key="index"
          class="max-w-[85%] p-3 rounded-lg text-sm leading-relaxed"
          :class="chat.role === 'user' ? 'bg-blue-500 text-white self-end rounded-br-none shadow-sm' : 'bg-white border border-gray-200 text-gray-800 self-start rounded-bl-none shadow-sm'"
        >
          <p class="whitespace-pre-wrap">{{ chat.text }}</p>
          <div v-if="chat.role === 'model' && chat.matchedStudentId" class="mt-3 pt-3 border-t border-gray-100 flex justify-end">
            <button v-if="!chat.isSaved" @click="saveToAiNote(chat)" class="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-bold border border-indigo-200 transition-colors hover:bg-indigo-100">
              💾 {{ chat.matchedStudentName }} AI 노트에 저장
            </button>
            <span v-else class="text-xs text-green-600 font-bold">✅ AI 노트에 저장됨</span>
          </div>
        </div>
        <div v-if="isLoading" class="bg-white border p-3 rounded-lg text-sm flex gap-1 shadow-sm self-start">
          <span class="animate-bounce">●</span><span class="animate-bounce delay-100">●</span><span class="animate-bounce delay-200">●</span>
        </div>
      </div>

      <div class="p-3 bg-white border-t border-gray-200 flex gap-2">
        <input v-model="userInput" type="text" placeholder="학생 이름이나 #업무 질문..." class="flex-1 p-2 border rounded-lg text-sm outline-none focus:border-blue-500" @keyup.enter="sendMessage" :disabled="isLoading" />
        <button @click="sendMessage" :disabled="isLoading" class="bg-blue-600 text-white px-3 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors">전송</button>
      </div>
    </div>

    <button @click="isOpen = !isOpen" class="w-14 h-14 bg-blue-600 text-white rounded-full shadow-[0_4px_14px_0_rgba(79,70,229,0.4)] hover:scale-105 transition-all flex items-center justify-center text-2xl border-4 border-white hover:-translate-y-1 duration-300">
      {{ isOpen ? '✖' : '🤖' }}
    </button>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
</style>