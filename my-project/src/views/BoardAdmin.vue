<script setup>
import { ref, onMounted } from 'vue'
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

const boards = ref([])
const isLoading = ref(true)

// 수정 모드 상태 관리
const editingId = ref(null)
const editContent = ref('')

const fetchBoards = async () => {
  isLoading.value = true
  try {
    const snap = await getDocs(collection(db, 'boardSummaries'))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    
    // 문서 ID(예: 2026-03-10_1520)를 기준으로 최신순 정렬
    data.sort((a, b) => b.id.localeCompare(a.id))
    boards.value = data
  } catch (error) {
    console.error("게시판 로드 에러:", error)
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchBoards)

// ID를 예쁜 날짜 포맷으로 변환 (예: 2026-03-10_0730 -> 2026년 3월 10일 아침 조회)
const formatTitle = (id) => {
  const [dateStr, timeStr] = id.split('_')
  const type = timeStr === '0730' ? '🌅 아침 조회' : '🌇 오후 종례'
  return `${dateStr} ${type}`
}

// 💡 수정 모드 켜기
const startEdit = (board) => {
  editingId.value = board.id
  editContent.value = board.content
}

// 💡 수정 취소
const cancelEdit = () => {
  editingId.value = null
  editContent.value = ''
}

// 💡 최신 내용으로 업데이트 (학생들이 보는 알림판에 즉시 반영됨)
const saveEdit = async (id) => {
  if (!confirm('수정된 내용을 최신 사항으로 저장하시겠습니까?')) return
  
  try {
    const nowStr = new Date().toISOString()
    await updateDoc(doc(db, 'boardSummaries', id), {
      content: editContent.value,
      updatedAt: nowStr
    })
    
    // 로컬 데이터도 즉시 업데이트
    const target = boards.value.find(b => b.id === id)
    if (target) {
      target.content = editContent.value
      target.updatedAt = nowStr
    }
    
    cancelEdit()
    alert('✅ 최신 내용으로 업데이트 되었습니다!')
  } catch (error) {
    alert('저장에 실패했습니다.')
  }
}

// 기록 삭제
const deleteBoard = async (id) => {
  if (!confirm('이 기록을 완전히 삭제하시겠습니까?')) return
  try {
    await deleteDoc(doc(db, 'boardSummaries', id))
    boards.value = boards.value.filter(b => b.id !== id)
  } catch (error) {
    alert('삭제 실패')
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto p-4 sm:p-6 font-sans">
    
    <div class="flex justify-between items-center mb-8 border-b pb-4">
      <h2 class="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">📋 조종례 기록 게시판</h2>
      <button @click="fetchBoards" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors">
        🔄 새로고침
      </button>
    </div>

    <div v-if="isLoading" class="py-20 text-center text-gray-400">
      <div class="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
      조종례 기록을 불러오고 있습니다...
    </div>

    <div v-else class="space-y-6">
      <div v-if="boards.length === 0" class="text-center py-10 text-gray-500 font-medium bg-white rounded-2xl shadow-sm border border-gray-100">
        아직 저장된 조종례 기록이 없습니다.
      </div>

      <div 
        v-for="board in boards" 
        :key="board.id" 
        class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden"
      >
        <div class="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 class="font-bold text-lg text-gray-800">{{ formatTitle(board.id) }}</h3>
            <p class="text-xs text-gray-500 mt-1">
              최종 수정: {{ board.updatedAt ? new Date(board.updatedAt).toLocaleString() : new Date(board.createdAt).toLocaleString() }}
            </p>
          </div>
          <div v-if="editingId !== board.id" class="flex gap-2">
            <button @click="startEdit(board)" class="text-sm px-3 py-1.5 bg-blue-100 text-blue-700 font-bold rounded-lg hover:bg-blue-200 transition-colors">수정</button>
            <button @click="deleteBoard(board.id)" class="text-sm px-3 py-1.5 bg-red-50 text-red-600 font-bold rounded-lg hover:bg-red-100 transition-colors">삭제</button>
          </div>
        </div>

        <div v-if="editingId !== board.id" class="p-6">
          <p class="whitespace-pre-wrap text-gray-800 leading-relaxed font-medium">{{ board.content }}</p>
        </div>

        <div v-else class="p-6 bg-blue-50/30">
          <textarea 
            v-model="editContent" 
            class="w-full h-48 p-4 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none font-medium leading-relaxed"
            placeholder="수정할 공지사항 내용을 입력하세요..."
          ></textarea>
          <div class="flex justify-end gap-2 mt-4">
            <button @click="cancelEdit" class="px-4 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition-colors">취소</button>
            <button @click="saveEdit(board.id)" class="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md transition-colors active:scale-95">💾 최신 사항으로 저장</button>
          </div>
        </div>
      </div>
    </div>
    
  </div>
</template>