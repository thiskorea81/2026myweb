<script setup>
import { computed } from 'vue'

const props = defineProps({
  roomName: String,
  students: Array,
  todayAttendance: Object,
  todayAbsenceReasons: Object,
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

const gridConfig = computed(() => {
  if (['2반', '3반'].includes(props.roomName)) {
    return { rows: 4, cols: 8 }
  } else {
    return { rows: 5, cols: 6 }
  }
})

const gridSeats = computed(() => {
  const { rows, cols } = gridConfig.value
  const grid = Array.from({ length: cols }, () => Array(rows).fill(null))
  
  const colOrder = []
  for (let c = 0; c < cols; c += 2) colOrder.push(c)
  for (let c = 1; c < cols; c += 2) colOrder.push(c)

  const sortedStudents = [...props.students].sort((a, b) => {
    const timeA = a.timeCount || 0
    const timeB = b.timeCount || 0
    if (timeA !== timeB) return timeB - timeA
    
    const idA = parseInt(a.studentId, 10) || 0
    const idB = parseInt(b.studentId, 10) || 0
    return idA - idB
  })

  let studentIdx = 0
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

const hasReason = (studentId) => {
  if (!props.todayAbsenceReasons || !props.todayAbsenceReasons[studentId]) return false
  const reasonObj = props.todayAbsenceReasons[studentId]
  // Check if reason is for the current period
  return reasonObj.periods.includes(props.currentPeriod)
}

const handleSeatClick = (student) => {
  if (!student || !isScheduled(student)) return
  emit('toggle-absence', student.studentId)
}
</script>

<template>
  <div class="seat-map-container">
    <div class="blackboard-wrapper">
      <div class="blackboard">칠 판 (Front)</div>
    </div>
    
    <div class="grid-wrapper">
      <div class="grid-container">
        <div v-for="(col, colIdx) in gridSeats" :key="colIdx" class="column">
          <div class="column-label">COL {{ colIdx + 1 }}</div>
          <div 
            v-for="(student, rowIdx) in col" 
            :key="rowIdx"
            class="seat"
            :class="[
              student && isScheduled(student) ? 'is-active' : 'is-empty',
              student && isScheduled(student) && hasReason(student.studentId) ? 'has-reason' : (student && isScheduled(student) && isAbsent(student.studentId) ? 'is-absent' : '')
            ]"
            @click="handleSeatClick(student)"
          >
            <template v-if="student && isScheduled(student)">
              <span class="student-id">{{ getShortId(student.studentId) }}</span>
              <span class="student-name">{{ student.name }}</span>
              <div v-if="isAbsent(student.studentId)" class="absent-badge">결석</div>
              <div v-if="hasReason(student.studentId)" class="reason-badge">사유</div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.seat-map-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  margin-top: 16px;
}

.blackboard-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.blackboard {
  width: 60%;
  height: 36px;
  background: var(--text-main);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 0.8rem;
  letter-spacing: 0.2em;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
}

.grid-wrapper {
  overflow-x: auto;
  padding-bottom: 8px;
}

.grid-container {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  min-width: 500px; /* Force scroll on small screens */
}

.column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.column-label {
  text-align: center;
  font-size: 0.65rem;
  font-weight: 900;
  color: var(--border);
  margin-bottom: 4px;
}

.seat {
  aspect-ratio: 16/10;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.seat.is-empty {
  background: var(--background);
  border-color: var(--border);
  border-style: dashed;
}

.seat.is-active {
  background: var(--surface);
  border-color: #E0E7FF;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.seat.is-active:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--primary);
}

.seat.is-active:active {
  transform: scale(0.95);
}

.seat.is-absent {
  background: #FEF2F2;
  border-color: #FCA5A5;
}

.seat.has-reason {
  background: #FEF9C3; /* Yellow 100 */
  border-color: #FDE047; /* Yellow 300 */
}

.student-id {
  position: absolute;
  top: 4px;
  left: 6px;
  font-size: 0.6rem;
  font-family: monospace;
  color: var(--text-muted);
}

.student-name {
  font-weight: 900;
  font-size: 0.85rem;
  margin-top: 4px;
  color: var(--text-main);
}

.seat.is-absent .student-name {
  color: var(--danger);
}

.seat.has-reason .student-name {
  color: #A16207; /* Yellow 800 */
}

.absent-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: var(--danger);
  color: white;
  font-size: 0.5rem;
  font-weight: 900;
  padding: 2px 6px;
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
}

.reason-badge {
  position: absolute;
  bottom: -6px;
  right: -6px;
  background: #EAB308; /* Yellow 500 */
  color: white;
  font-size: 0.5rem;
  font-weight: 900;
  padding: 2px 6px;
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
}
</style>
