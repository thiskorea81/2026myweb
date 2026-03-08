<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { GoogleGenAI } from '@google/genai'
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useStudentStore } from '../stores/studentStore'
import { useAiNoteStore } from '../stores/aiNoteStore' // 💡 상담 스토어 대신 AI 노트 스토어 연결!

const isOpen = ref(false)
const userInput = ref('')
const isLoading = ref(false)
const chatContainer = ref(null)

const defaultWelcome = { 
  role: 'model', 
  text: '안녕하세요 선생님! 학생 이름을 말해주시면 기본 정보부터 출결, 상담, 성적까지 종합해서 분석해 드려요. 유용한 답변은 공식 상담기록과 분리된 [🤖 AI 노트]에 따로 저장해 둘 수 있답니다! 😊' 
}

const chatHistory = ref([defaultWelcome])

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY })
const studentStore = useStudentStore()
const aiNoteStore = useAiNoteStore() // 💡 AI 노트 스토어 사용

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

// 💡 공식 상담기록이 아닌 AI 노트로 저장하는 기능!
const saveToAiNote = async (chat) => {
  if (!chat.matchedStudentId) return
  
  const content = `❓ 선생님의 질문:\n${chat.originalPrompt}\n\n💡 AI 분석 및 답변:\n${chat.text}`
  
  try {
    // 💡 aiNoteStore.addNote 호출
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
    let finalPrompt = originalPrompt
    let contextStr = ''
    let matchedStudentInfo = null 

    const matchedStudent = studentStore.students.find(s => originalPrompt.includes(s.name))

    if (matchedStudent) {
      matchedStudentInfo = matchedStudent 

      const counselQuery = query(collection(db, 'counselingLogs'), where('studentId', '==', matchedStudent.id))
      const counselSnap = await getDocs(counselQuery)
      const counselLogs = counselSnap.docs.map(d => d.data())

      const attQuery = query(collection(db, 'attendanceLogs'), where('studentId', '==', matchedStudent.id))
      const attSnap = await getDocs(attQuery)
      const attLogs = attSnap.docs.map(d => d.data())

      contextStr += `\n\n[시스템 컨텍스트: 사용자가 '${matchedStudent.name}' 학생에 대해 질문했습니다. 아래 데이터를 바탕으로 조언해주세요.]\n`
      contextStr += `- 기본정보: ${matchedStudent.studentId} ${matchedStudent.name} (${matchedStudent.gender})\n`
      contextStr += `- 진로/대학: ${matchedStudent.career} / ${matchedStudent.university}\n`
      contextStr += `- 취미/특기: ${matchedStudent.hobby} / ${matchedStudent.specialty}\n`
      contextStr += `- 장단점: 칭찬할점(${matchedStudent.goodPoint}), 부족한점(${matchedStudent.badPoint})\n`
      contextStr += `- 좋아하는 과목: ${matchedStudent.favoriteSubject} / 싫어하는 과목: ${matchedStudent.dislikeSubject}\n`
      contextStr += `- 가족/메모: ${matchedStudent.family} / ${matchedStudent.memo}\n`

      contextStr += `\n[최근 성적 기록]\n`
      if (matchedStudent.grades && matchedStudent.grades.length > 0) {
        matchedStudent.grades.forEach(grade => {
          const scoreDetails = Object.entries(grade.scores || {})
                                     .map(([subject, score]) => `${subject}: ${score}`)
                                     .join(', ')
          contextStr += `- ${grade.examName} | ${scoreDetails}\n`
        })
      } else {
        contextStr += `- 성적 기록 없음\n`
      }

      contextStr += `\n[최근 상담 기록]\n`
      if (counselLogs.length > 0) {
        counselLogs.forEach(log => { contextStr += `- ${log.date}: ${log.content}\n` })
      } else {
        contextStr += `- 기록 없음\n`
      }

      contextStr += `\n[최근 출결 기록]\n`
      if (attLogs.length > 0) {
        attLogs.forEach(log => { contextStr += `- ${log.date}: ${log.type} (${log.reason || '사유없음'})\n` })
      } else {
        contextStr += `- 기록 없음\n`
      }
    }

    if (originalPrompt.includes('#업무')) {
      const workSnap = await getDocs(collection(db, 'workLogs'))
      const workLogs = workSnap.docs.map(d => d.data())
      
      workLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      contextStr += `\n\n[시스템 컨텍스트: 사용자가 '#업무' 키워드를 포함하여 질문했습니다. 아래 제공된 선생님의 최근 업무 일지 내용을 바탕으로 종합해서 답변해주세요.]\n`
      
      if (workLogs.length > 0) {
        workLogs.forEach(log => {
          const dateStr = log.createdAt ? log.createdAt.split('T')[0] : '날짜미상'
          const tagsStr = log.tags && log.tags.length > 0 ? log.tags.join(', ') : '태그없음'
          contextStr += `- [${dateStr}] ${log.content} (태그: ${tagsStr})\n`
        })
      } else {
        contextStr += `- 작성된 업무 일지가 없습니다.\n`
      }
    }

    if (contextStr !== '') {
      finalPrompt = originalPrompt + contextStr
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: finalPrompt,
    })
    
    chatHistory.value.push({ 
      role: 'model', 
      text: response.text,
      matchedStudentId: matchedStudentInfo ? matchedStudentInfo.id : null,
      matchedStudentName: matchedStudentInfo ? matchedStudentInfo.name : null,
      originalPrompt: originalPrompt,
      isSaved: false
    })
    
    await saveChatHistory()

  } catch (error) {
    console.error('Gemini API Error:', error)
    chatHistory.value.push({ role: 'model', text: '앗, 오류가 발생했어요. API 키나 네트워크 상태를 확인해 주세요.' })
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}
</script>

<template>
  <div class="fixed bottom-6 right-6 z-50 flex flex-col items-end">
    
    <div 
      v-if="isOpen" 
      class="bg-white w-[350px] sm:w-[450px] rounded-2xl shadow-2xl border border-gray-200 flex flex-col mb-4 overflow-hidden transition-all h-[600px]"
    >
      <div class="bg-blue-600 text-white p-4 flex justify-between items-center">
        <div class="font-bold flex items-center gap-2">
          <span class="text-xl">✨</span> AI 업무 비서
        </div>
        <div class="flex items-center gap-3">
          <button @click="clearChat" class="text-xs bg-blue-700 hover:bg-blue-800 text-blue-100 px-2 py-1 rounded font-bold transition-colors">초기화</button>
          <button @click="isOpen = false" class="text-blue-100 hover:text-white font-bold text-xl leading-none">&times;</button>
        </div>
      </div>

      <div ref="chatContainer" class="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col gap-3 custom-scrollbar">
        <div 
          v-for="(chat, index) in chatHistory" 
          :key="index"
          class="max-w-[85%] p-3 rounded-lg text-sm leading-relaxed"
          :class="chat.role === 'user' ? 'bg-blue-500 text-white self-end rounded-br-none shadow-sm' : 'bg-white border border-gray-200 text-gray-800 self-start rounded-bl-none shadow-sm'"
        >
          <p class="whitespace-pre-wrap">{{ chat.text }}</p>
          
          <div v-if="chat.role === 'model' && chat.matchedStudentId" class="mt-3 pt-3 border-t border-gray-100 flex justify-end">
            <button 
              v-if="!chat.isSaved"
              @click="saveToAiNote(chat)" 
              class="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors"
            >
              💾 {{ chat.matchedStudentName }} AI 노트에 따로 저장
            </button>
            <span v-else class="text-xs text-green-600 font-bold flex items-center gap-1">
              ✅ AI 노트에 저장됨
            </span>
          </div>
        </div>
        
        <div v-if="isLoading" class="bg-white border border-gray-200 text-gray-500 self-start rounded-lg rounded-bl-none p-3 text-sm flex gap-1 shadow-sm">
          <span class="animate-bounce">●</span><span class="animate-bounce delay-100">●</span><span class="animate-bounce delay-200">●</span>
        </div>
      </div>

      <div class="p-3 bg-white border-t border-gray-200 flex gap-2">
        <input 
          v-model="userInput" 
          type="text" 
          placeholder="학생 이름이나 #업무 키워드를 포함해 질문하세요..." 
          class="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
          @keyup.enter="sendMessage"
          :disabled="isLoading"
        />
        <button 
          @click="sendMessage" 
          :disabled="isLoading"
          class="bg-blue-600 text-white px-3 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          전송
        </button>
      </div>
    </div>

    <button 
      @click="isOpen = !isOpen"
      class="w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:scale-105 transition-all flex items-center justify-center text-2xl border-4 border-white"
    >
      {{ isOpen ? '✖' : '🤖' }}
    </button>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
</style>