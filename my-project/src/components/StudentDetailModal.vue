<script setup>
import { ref, watch, computed } from 'vue'
import { storeToRefs } from 'pinia'

import { useCounselingStore } from '../stores/counselingStore'
import { useAttendanceStore } from '../stores/attendanceStore'
import { useAiNoteStore } from '../stores/aiNoteStore'

import StudentInfoTab from './StudentInfoTab.vue'
import StudentCounselTab from './StudentCounselTab.vue'
import StudentAttendanceTab from './StudentAttendanceTab.vue'
import StudentGradeTab from './StudentGradeTab.vue'
import StudentAiNoteTab from './StudentAiNoteTab.vue'
import StudentRecordTab from './StudentRecordTab.vue'
import StudentPrintLayout from './StudentPrintLayout.vue' // 💡 분리된 인쇄 레이아웃

const props = defineProps({
  student: { type: Object, required: true }
})
const emit = defineEmits(['close'])
const activeTab = ref('info')

const counselingStore = useCounselingStore()
const attendanceStore = useAttendanceStore()
const aiNoteStore = useAiNoteStore()

const { logs: counselingLogs } = storeToRefs(counselingStore)
const { logs: attendanceLogs } = storeToRefs(attendanceStore)
const { notes: aiNotes } = storeToRefs(aiNoteStore)

watch(() => props.student, (newVal) => {
  if (newVal) {
    counselingStore.fetchLogs(newVal.id)
    attendanceStore.fetchLogs(newVal.id)
    aiNoteStore.fetchNotes(newVal.id)
  }
}, { immediate: true })

const handlePrint = () => window.print()

// 💡 단일 학생 인쇄를 위해 배열 형태로 감싸서 넘겨줌
const singlePrintData = computed(() => [{
  student: props.student,
  counselingLogs: counselingLogs.value,
  attendanceLogs: attendanceLogs.value,
  aiNotes: aiNotes.value
}])
</script>

<template>
  <div class="modal-overlay fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
    
    <div class="modal-content bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
      <div class="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
        <div class="flex items-center gap-3">
          <img v-if="student.photoUrl" :src="student.photoUrl" class="w-10 h-10 rounded-full object-cover border border-gray-300 shadow-sm">
          <div v-else class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-lg shadow-sm">👤</div>
          <h3 class="text-xl font-bold text-gray-800">{{ student.studentId }} {{ student.name }}</h3>
        </div>
        <div class="flex items-center gap-4">
          <button @click="handlePrint" class="text-sm bg-gray-800 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-gray-900 transition-colors shadow-sm">🖨️ 학생 기록부 인쇄</button>
          <button @click="$emit('close')" class="text-gray-400 hover:text-red-500 font-bold text-3xl leading-none">&times;</button>
        </div>
      </div>

      <div class="flex border-b border-gray-200 px-6 pt-2 bg-gray-50 shrink-0 overflow-x-auto custom-scrollbar">
        <button @click="activeTab = 'info'" class="px-5 py-2.5 font-bold text-sm rounded-t-lg transition-colors" :class="activeTab === 'info' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:bg-gray-100'">학생 정보</button>
        <button @click="activeTab = 'counsel'" class="px-5 py-2.5 font-bold text-sm rounded-t-lg transition-colors" :class="activeTab === 'counsel' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:bg-gray-100'">상담 기록</button>
        <button @click="activeTab = 'attendance'" class="px-5 py-2.5 font-bold text-sm rounded-t-lg transition-colors" :class="activeTab === 'attendance' ? 'bg-white border-t border-l border-r border-gray-200 text-blue-600' : 'text-gray-500 hover:bg-gray-100'">출결 관리</button>
        <button @click="activeTab = 'grade'" class="px-5 py-2.5 font-bold text-sm rounded-t-lg transition-colors" :class="activeTab === 'grade' ? 'bg-white border-t border-l border-r border-gray-200 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'">💯 성적 확인</button>
        <button @click="activeTab = 'aiNote'" class="px-5 py-2.5 font-bold text-sm rounded-t-lg transition-colors" :class="activeTab === 'aiNote' ? 'bg-indigo-50 border-t border-l border-r border-indigo-200 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'">🤖 AI 노트</button>
        <button @click="activeTab = 'record'" class="px-5 py-2.5 font-bold text-sm rounded-t-lg transition-colors" :class="activeTab === 'record' ? 'bg-teal-50 border-t border-l border-r border-teal-200 text-teal-800' : 'text-gray-500 hover:bg-gray-100'">📝 생기부</button>
      </div>

      <div class="p-6 overflow-y-auto flex-1 bg-white custom-scrollbar">
        <StudentInfoTab v-if="activeTab === 'info'" :student="student" @close="$emit('close')" />
        <StudentCounselTab v-if="activeTab === 'counsel'" :student="student" />
        <StudentAttendanceTab v-if="activeTab === 'attendance'" :student="student" />
        <StudentGradeTab v-if="activeTab === 'grade'" :student="student" />
        <StudentAiNoteTab v-if="activeTab === 'aiNote'" :student="student" />
        <StudentRecordTab v-if="activeTab === 'record'" :student="student" />
      </div>
    </div>

    <StudentPrintLayout :printDataList="singlePrintData" />
    
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
</style>