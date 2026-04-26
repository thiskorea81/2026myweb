<script setup>
defineProps({
  seats: Array
})

defineEmits(['dragstart', 'drop'])

const getShortId = (fullId) => fullId ? String(fullId).slice(-2) : ''
</script>

<template>
  <div class="seat-map-container bg-white border border-gray-200 rounded-2xl p-8 lg:p-12 shadow-sm relative">
    <div class="flex justify-center mb-10">
      <div class="blackboard w-1/2 h-12 bg-gray-800 rounded-xl flex items-center justify-center text-gray-400 font-bold tracking-[0.5rem] text-sm shadow-inner">
        칠 판 (Front)
      </div>
    </div>
    
    <div class="grid-container flex justify-between gap-4">
      <div v-for="(col, colIdx) in seats" :key="colIdx" class="column flex-1 flex flex-col gap-3">
        <div class="column-label text-center text-[0.65rem] font-black text-gray-300 mb-2">COL {{ colIdx + 1 }}</div>
        <div 
          v-for="(student, rowIdx) in col" 
          :key="rowIdx"
          class="seat aspect-[16/10] bg-white border-2 border-gray-100 rounded-xl flex flex-col items-center justify-center relative transition-all cursor-grab hover:border-blue-500 hover:shadow-lg"
          :class="{ 'bg-gray-50 border-dashed cursor-default': !student }"
          draggable="true"
          @dragstart="$emit('dragstart', colIdx, rowIdx)"
          @dragover.prevent
          @drop="$emit('drop', colIdx, rowIdx)"
        >
          <template v-if="student">
            <span class="student-id absolute top-1.5 left-2 text-[0.6rem] font-mono text-gray-400 leading-none">{{ getShortId(student.studentId) }}</span>
            <span class="student-name font-black text-lg mt-1" :class="student.gender === '남' ? 'text-blue-700' : 'text-rose-700'">{{ student.name }}</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>