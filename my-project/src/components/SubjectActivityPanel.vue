<script setup>
import { ref, watch } from 'vue'
import { collection, getDocs, addDoc, deleteDoc, doc, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import SubjectDraftPanel from './SubjectDraftPanel.vue'

const props = defineProps({
  student: { type: Object, default: null },
  subject: { type: String, required: true },
  isEditingRoster: { type: Boolean, default: false },
  refreshKey: { type: Number, default: 0 }
})

const records = ref([])
const recordDate = ref(new Date().toISOString().substring(0, 10))
const recordContent = ref('')
const isLoadingRecords = ref(false)
const isSaving = ref(false)
const activeTab = ref('records')

const fetchRecords = async () => {
  if (!props.student || !props.subject) { records.value = []; return }
  isLoadingRecords.value = true
  try {
    const q = query(collection(db, 'subjectRecords'), where('studentId', '==', props.student.studentId), where('subject', '==', props.subject))
    const snap = await getDocs(q)
    let data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    data.sort((a, b) => new Date(b.date) - new Date(a.date))
    records.value = data
  } catch (error) { console.error("기록 로드 에러:", error) } finally { isLoadingRecords.value = false }
}

watch(() => [props.student?.studentId, props.subject, props.refreshKey], fetchRecords, { immediate: true })

const saveRecord = async () => {
  if (!recordContent.value.trim() || !recordDate.value) return alert('내용을 입력해주세요.')
  isSaving.value = true
  try {
    await addDoc(collection(db, 'subjectRecords'), {
      studentId: props.student.studentId, studentName: props.student.name, subject: props.subject, date: recordDate.value, content: recordContent.value, createdAt: new Date().toISOString()
    })
    recordContent.value = ''
    fetchRecords()
  } catch (error) { alert('저장 중 오류 발생') } finally { isSaving.value = false }
}

const deleteRecord = async (recordId) => {
  if (!confirm('삭제하시겠습니까?')) return
  try { await deleteDoc(doc(db, 'subjectRecords', recordId)); fetchRecords() } catch (error) { alert('삭제 실패') }
}
</script>

<template>
  <div v-if="!student || isEditingRoster" class="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl shadow-sm border border-gray-200 border-dashed text-gray-400 p-6 h-[75vh]">
    <span class="text-5xl mb-4">👈</span>
    <p class="text-lg font-bold text-gray-700">왼쪽 수강생 명단에서 학생을 선택해주세요.</p>
  </div>

  <div v-else class="flex flex-col gap-4 h-[75vh]">
    <div class="bg-blue-50 rounded-2xl shadow-sm border border-blue-200 p-5 shrink-0">
      <h3 class="text-xl font-black text-blue-900 mb-4 border-b border-blue-200 pb-2">🎓 {{ student.name }} <span class="text-sm text-blue-700 ml-2">({{ subject }})</span></h3>
      <div class="flex flex-col gap-3">
        <input v-model="recordDate" type="date" class="w-40 p-2 border border-blue-300 rounded-lg outline-none focus:ring-2 bg-white text-gray-900 font-bold">
        <textarea v-model="recordContent" class="w-full h-20 p-3 border border-blue-300 rounded-xl outline-none focus:ring-2 resize-none bg-white text-gray-900 font-medium placeholder-gray-500" placeholder="활동 내역을 적어주세요."></textarea>
        <div class="flex justify-end"><button @click="saveRecord" :disabled="isSaving" class="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">{{ isSaving ? '저장 중...' : '💾 활동 기록' }}</button></div>
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden">
      <div class="flex border-b border-gray-200 shrink-0 bg-gray-50">
        <button @click="activeTab = 'records'" class="flex-1 py-3 font-bold text-sm" :class="activeTab === 'records' ? 'bg-white text-blue-800 border-b-2 border-blue-600' : 'text-gray-500'">📋 누적 기록 ({{ records.length }}건)</button>
        <button @click="activeTab = 'draft'" class="flex-1 py-3 font-bold text-sm" :class="activeTab === 'draft' ? 'bg-white text-teal-800 border-b-2 border-teal-600' : 'text-gray-500'">✨ AI 세특 초안 작성</button>
      </div>
      <div class="p-5 flex-1 overflow-y-auto custom-scrollbar relative">
        <div v-if="activeTab === 'records'" class="space-y-3 h-full">
          <div v-if="records.length === 0" class="text-center py-12 text-gray-500 font-medium">작성된 수업 기록이 없습니다.</div>
          <div v-for="rec in records" :key="rec.id" class="bg-gray-50 border border-gray-200 p-4 rounded-xl relative group">
            <button @click="deleteRecord(rec.id)" class="absolute top-3 right-3 text-xs px-2 py-1 bg-red-100 text-red-600 rounded opacity-0 group-hover:opacity-100">삭제</button>
            <div class="font-bold text-blue-900 text-sm mb-2">🗓️ {{ rec.date }}</div>
            <p class="text-gray-900 whitespace-pre-wrap text-sm font-medium">{{ rec.content }}</p>
          </div>
        </div>
        <div v-else-if="activeTab === 'draft'" class="h-full">
          <SubjectDraftPanel :studentId="student.studentId" :subject="subject" :records="records" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
</style>