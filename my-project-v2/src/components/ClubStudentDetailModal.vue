<script setup>
import { ref } from 'vue'
import ClubStudentInfoTab from './ClubStudentInfoTab.vue'
import ClubStudentRecordTab from './ClubStudentRecordTab.vue'

const props = defineProps({
  student: { type: Object, required: true }
})
const emit = defineEmits(['close'])
const activeTab = ref('info')
</script>

<template>
  <div class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
      
      <div class="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-orange-200 flex items-center justify-center text-lg shadow-sm">🎸</div>
          <h3 class="text-xl font-bold text-gray-800">{{ student.studentId }} {{ student.name }}</h3>
        </div>
        <button @click="$emit('close')" class="text-gray-400 hover:text-red-500 font-bold text-3xl leading-none">&times;</button>
      </div>

      <div class="flex border-b border-gray-200 px-6 pt-2 bg-gray-50 shrink-0">
        <button @click="activeTab = 'info'" class="px-6 py-2.5 font-bold text-sm rounded-t-lg transition-colors" :class="activeTab === 'info' ? 'bg-white border-t border-l border-r border-gray-200 text-orange-600' : 'text-gray-500 hover:bg-gray-100'">부원 정보 및 활동내역</button>
        <button @click="activeTab = 'record'" class="px-6 py-2.5 font-bold text-sm rounded-t-lg transition-colors" :class="activeTab === 'record' ? 'bg-teal-50 border-t border-l border-r border-teal-200 text-teal-800' : 'text-gray-500 hover:bg-gray-100'">📝 동아리 생기부</button>
      </div>

      <div class="p-6 overflow-y-auto flex-1 bg-white">
        <ClubStudentInfoTab v-if="activeTab === 'info'" :student="student" @close="$emit('close')" />
        <ClubStudentRecordTab v-if="activeTab === 'record'" :student="student" />
      </div>

    </div>
  </div>
</template>