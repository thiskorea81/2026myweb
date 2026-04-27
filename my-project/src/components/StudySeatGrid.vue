<script setup>
import { computed } from 'vue'

const props = defineProps({
  roomName: String,
  students: Array,
  todayAttendance: Object,
  currentDay: String,
  currentPeriod: String
})

const emit = defineEmits(['toggle-absence'])

const getShortId = (fullId) => fullId ? String(fullId).slice(-2) : ''

const isScheduled = (student) => {
  if (!student || !student.selection) return false
  if (!props.currentDay || !props.currentPeriod) return true
  return student.selection[props.currentDay + props.currentPeriod]
}

// 1반은 5행 6열, 2반은 4행 8열, 3반은 4행 8열. 4반/5반은 5행 6열.
const gridConfig = computed(() => {
  if (['2반실', '3반실'].includes(props.roomName)) {
    return { rows: 4, cols: 8 }
  } else {
    // 1반실, 4반실, 5반실은 5행 6열
    return { rows: 5, cols: 6 }
  }
})

// 배열을 행/열 격자(seats[colIdx][rowIdx]) 구조로 변환
const gridSeats = computed(() => {
  const { rows, cols } = gridConfig.value
  const grid = Array.from({ length: cols }, () => Array(rows).fill(null))
  
  // 홀수 열(1,3,5...)을 먼저 채우고 짝수 열(2,4,6...)을 나중에 채움 (거리두기 배치)
  // 인덱스 기준: 0, 2, 4 -> 1, 3, 5
  const colOrder = []
  for (let c = 0; c < cols; c += 2) colOrder.push(c)
  for (let c = 1; c < cols; c += 2) colOrder.push(c)

  // 신청 시간이 많은 학생(계속 남아있는 학생)을 우선 배치(1,3,5열)하기 위해 정렬
  // timeCount 내림차순 -> 학번 오름차순
  const sortedStudents = [...props.students].sort((a, b) => {
    const timeA = a.timeCount || 0
    const timeB = b.timeCount || 0
    if (timeA !== timeB) return timeB - timeA
    
    const idA = parseInt(a.studentId, 10) || 0
    const idB = parseInt(b.studentId, 10) || 0
    return idA - idB
  })

  let studentIdx = 0
  // 지정된 열 순서대로 앞에서부터(행) 차례대로 앉힘
  for (const c of colOrder) {
    for (let r = 0; r < rows; r++) {
      if (studentIdx < sortedStudents.length) {
        grid[c][r] = sortedStudents[studentIdx++]
      }
    }
  }
  
  return grid
})

const isAbsent = (studentId) => {
  if (!props.todayAttendance || !props.currentPeriod) return false
  const absences = props.todayAttendance[studentId] || []
  return absences.includes(props.currentPeriod)
}
</script>

<template>
  <div class="seat-map-container bg-white border border-gray-200 rounded-2xl p-6 lg:p-10 shadow-sm relative overflow-x-auto">
    <div class="flex justify-center mb-8">
      <div class="blackboard w-1/2 h-12 bg-gray-800 rounded-xl flex items-center justify-center text-gray-400 font-bold tracking-[0.5rem] text-sm shadow-inner">
        칠 판 (Front)
      </div>
    </div>
    
    <div class="grid-container flex justify-between gap-3 min-w-[600px]">
      <div v-for="(col, colIdx) in gridSeats" :key="colIdx" class="column flex-1 flex flex-col gap-3">
        <div class="column-label text-center text-[0.65rem] font-black text-gray-300 mb-1">COL {{ colIdx + 1 }}</div>
        <div 
          v-for="(student, rowIdx) in col" 
          :key="rowIdx"
          class="seat aspect-[16/10] border-2 rounded-xl flex flex-col items-center justify-center relative transition-all"
          :class="[
            student && isScheduled(student) ? 'cursor-pointer hover:shadow-md hover:scale-105 active:scale-95' : 'bg-gray-50 border-gray-100 border-dashed cursor-default',
            student && isScheduled(student) && !isAbsent(student.studentId) ? 'bg-white border-blue-100 hover:border-blue-400' : '',
            student && isScheduled(student) && isAbsent(student.studentId) ? 'bg-red-50 border-red-400 shadow-sm' : ''
          ]"
          @click="student && isScheduled(student) ? emit('toggle-absence', student.studentId) : null"
        >
          <template v-if="student && isScheduled(student)">
            <span class="student-id absolute top-1.5 left-2 text-[0.6rem] font-mono text-gray-400 leading-none">
              {{ getShortId(student.studentId) }}
            </span>
            <span 
              class="student-name font-black text-sm mt-1" 
              :class="isAbsent(student.studentId) ? 'text-red-700' : 'text-gray-800'"
            >
              {{ student.name }}
            </span>
            <div v-if="isAbsent(student.studentId)" class="absolute -top-2 -right-2 bg-red-500 text-white text-[0.5rem] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
              결석
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
