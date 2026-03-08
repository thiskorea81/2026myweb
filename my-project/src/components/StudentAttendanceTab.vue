<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAttendanceStore } from '../stores/attendanceStore'
import { storeToRefs } from 'pinia'

const props = defineProps({
  student: { type: Object, required: true }
})

const attendanceStore = useAttendanceStore()
const { logs: attendanceLogs } = storeToRefs(attendanceStore)

const newAttDate = ref(new Date().toISOString().split('T')[0])
const newAttType = ref('교외체험학습(국내)')
const newAttDays = ref(1)
const newAttReason = ref('')

onMounted(() => {
  attendanceStore.fetchLogs(props.student.id)
})

const attendanceSummary = computed(() => {
  let domesticUsed = 0
  let internationalUsed = 0
  let menstrualUsedThisMonth = false

  const currentMonthPrefix = new Date().toISOString().slice(0, 7)

  attendanceLogs.value.forEach(log => {
    if (log.type === '교외체험학습(국내)') domesticUsed += Number(log.days)
    else if (log.type === '교외체험학습(국외)') internationalUsed += Number(log.days)
    else if (log.type === '생리결석' && log.date.startsWith(currentMonthPrefix)) menstrualUsedThisMonth = true
  })

  return {
    domesticRemain: Math.max(0, 7 - domesticUsed),
    internationalRemain: Math.max(0, 30 - internationalUsed),
    menstrualUsedThisMonth
  }
})

const saveAttendanceLog = async () => {
  if (newAttType.value === '생리결석' && props.student.gender !== '여') {
    return alert('여학생만 생리결석을 등록할 수 있습니다.')
  }
  if (newAttType.value === '생리결석' && attendanceSummary.value.menstrualUsedThisMonth) {
    if(!confirm('이번 달에 이미 생리결석을 사용했습니다. 추가하시겠습니까?')) return
  }

  await attendanceStore.addLog({
    studentId: props.student.id,
    date: newAttDate.value,
    type: newAttType.value,
    days: newAttDays.value,
    reason: newAttReason.value
  })
  
  newAttReason.value = ''
  newAttDays.value = 1
}

const deleteAttendanceLog = async (logId) => {
  if (confirm('출결 기록을 삭제하시겠습니까? 잔여 일수가 복구됩니다.')) {
    await attendanceStore.deleteLog(logId)
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-lg text-center">
        <p class="text-indigo-800 font-bold mb-1 text-sm">교외체험학습 (국내)</p>
        <p class="text-2xl font-black text-indigo-600">{{ attendanceSummary.domesticRemain }}일 남음</p>
        <p class="text-xs text-indigo-500 mt-1">총 7일 중</p>
      </div>
      <div class="bg-teal-50 border border-teal-100 p-4 rounded-lg text-center">
        <p class="text-teal-800 font-bold mb-1 text-sm">교외체험학습 (국외)</p>
        <p class="text-2xl font-black text-teal-600">{{ attendanceSummary.internationalRemain }}일 남음</p>
        <p class="text-xs text-teal-500 mt-1">총 30일 중</p>
      </div>
      <div v-if="student.gender === '여'" class="bg-pink-50 border border-pink-100 p-4 rounded-lg text-center">
        <p class="text-pink-800 font-bold mb-1 text-sm">이번 달 생리결석</p>
        <p class="text-2xl font-black" :class="attendanceSummary.menstrualUsedThisMonth ? 'text-gray-400' : 'text-pink-600'">
          {{ attendanceSummary.menstrualUsedThisMonth ? '사용 완료' : '사용 가능' }}
        </p>
        <p class="text-xs text-pink-500 mt-1">월 1회</p>
      </div>
    </div>

    <div class="bg-gray-50 border border-gray-200 p-4 rounded-lg mb-6 shrink-0">
      <h4 class="font-bold text-gray-700 mb-3 text-sm">➕ 새 출결 기록 등록</h4>
      <div class="flex flex-wrap gap-3 items-end">
        <div>
          <label class="block text-xs text-gray-500 font-bold mb-1">구분</label>
          <select v-model="newAttType" class="border border-gray-300 p-2 rounded text-sm w-40 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
            <option>교외체험학습(국내)</option>
            <option>교외체험학습(국외)</option>
            <option v-if="student.gender === '여'">생리결석</option>
            <option>질병결석</option>
            <option>미인정결석</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 font-bold mb-1">시작일</label>
          <input type="date" v-model="newAttDate" class="border border-gray-300 p-2 rounded text-sm w-40 focus:ring-2 focus:ring-blue-500 outline-none">
        </div>
        <div v-if="!['생리결석', '질병결석', '미인정결석'].includes(newAttType)">
          <label class="block text-xs text-gray-500 font-bold mb-1">일수</label>
          <input type="number" min="1" v-model="newAttDays" class="border border-gray-300 p-2 rounded text-sm w-16 focus:ring-2 focus:ring-blue-500 outline-none">
        </div>
        <div class="flex-1 min-w-[200px]">
          <label class="block text-xs text-gray-500 font-bold mb-1">사유 / 장소</label>
          <input type="text" v-model="newAttReason" placeholder="예: 가족여행 (제주도)" class="w-full border border-gray-300 p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none">
        </div>
        <button @click="saveAttendanceLog" class="bg-gray-800 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-gray-900 transition-colors h-[38px]">
          등록
        </button>
      </div>
    </div>

    <div class="flex-1 space-y-4">
      <h4 class="font-bold text-gray-700 border-b pb-2">📋 출결 기록 내역</h4>
      <div v-if="attendanceLogs.length === 0" class="text-center text-gray-500 py-10 text-sm">등록된 출결 기록이 없습니다.</div>
      <div v-for="log in attendanceLogs" :key="log.id" class="bg-white border border-gray-200 p-3 rounded-lg shadow-sm flex justify-between items-center group">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="font-bold text-gray-800 text-sm">🗓️ {{ log.date }}</span>
            <span class="px-2 py-0.5 rounded text-xs font-bold" 
                  :class="{
                    'bg-indigo-100 text-indigo-700': log.type.includes('국내'),
                    'bg-teal-100 text-teal-700': log.type.includes('국외'),
                    'bg-pink-100 text-pink-700': log.type === '생리결석',
                    'bg-red-100 text-red-700': log.type.includes('결석') && log.type !== '생리결석'
                  }">
              {{ log.type }}
            </span>
            <span v-if="log.days > 1" class="text-xs text-gray-500 font-bold">({{ log.days }}일)</span>
          </div>
          <p class="text-gray-600 text-xs">{{ log.reason || '사유 없음' }}</p>
        </div>
        <button @click="deleteAttendanceLog(log.id)" class="text-red-500 hover:text-red-700 text-xs font-bold opacity-0 group-hover:opacity-100 bg-red-50 px-2 py-1 rounded">삭제</button>
      </div>
    </div>
  </div>
</template>