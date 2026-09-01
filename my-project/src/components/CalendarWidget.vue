<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDiaryStore } from '../stores/diaryStore'
import { storeToRefs } from 'pinia'

const diaryStore = useDiaryStore()
const { diaries } = storeToRefs(diaryStore)

// 컴포넌트가 화면에 나타날 때 Firebase에서 일정 불러오기
onMounted(() => {
  diaryStore.fetchDiaries()
})

const currentDate = ref(new Date())
const weekDays = ['일', '월', '화', '수', '목', '금', '토']

const currentYear = computed(() => currentDate.value.getFullYear())
const currentMonth = computed(() => currentDate.value.getMonth())

const prevMonth = () => { currentDate.value = new Date(currentYear.value, currentMonth.value - 1, 1) }
const nextMonth = () => { currentDate.value = new Date(currentYear.value, currentMonth.value + 1, 1) }
const goToday = () => { currentDate.value = new Date() }

// 날짜를 YYYY-MM-DD 문자열로 변환하는 함수 (비교 및 저장용)
const formatDate = (dateObj) => {
  const y = dateObj.getFullYear()
  const m = String(dateObj.getMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const daysArray = []

  for (let i = firstDay - 1; i >= 0; i--) {
    daysArray.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false, isToday: false })
  }

  const todayStr = formatDate(new Date())
  for (let i = 1; i <= daysInMonth; i++) {
    const thisDate = new Date(year, month, i)
    daysArray.push({ date: thisDate, isCurrentMonth: true, isToday: formatDate(thisDate) === todayStr })
  }

  const remainingDays = 42 - daysArray.length
  for (let i = 1; i <= remainingDays; i++) {
    daysArray.push({ date: new Date(year, month + 1, i), isCurrentMonth: false, isToday: false })
  }

  return daysArray
})

// === 모달(팝업) 관련 상태 및 함수 ===
const isModalOpen = ref(false)
const selectedDate = ref(null)
const newDiaryText = ref('')

const openModal = (day) => {
  selectedDate.value = day.date
  newDiaryText.value = ''
  isModalOpen.value = true
}

const closeModal = () => {
  isModalOpen.value = false
  selectedDate.value = null
}

const saveDiary = () => {
  if (newDiaryText.value.trim() === '') return
  const dateStr = formatDate(selectedDate.value)
  diaryStore.addDiary(dateStr, newDiaryText.value)
  closeModal()
}

const handleDelete = (id) => {
  if(confirm('이 일정을 삭제하시겠습니까?')) {
    diaryStore.deleteDiary(id)
  }
}
</script>

<template>
  <div class="flex flex-col h-full relative">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-4">
        <h2 class="text-2xl font-bold text-gray-800">{{ currentYear }}년 {{ currentMonth + 1 }}월</h2>
        <button @click="goToday" class="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200">오늘</button>
      </div>
      <div class="flex gap-2">
        <button @click="prevMonth" class="p-2 bg-gray-100 rounded hover:bg-gray-200">◀</button>
        <button @click="nextMonth" class="p-2 bg-gray-100 rounded hover:bg-gray-200">▶</button>
      </div>
    </div>

    <div class="flex-1 border border-gray-200 bg-gray-200 rounded-lg overflow-hidden flex flex-col">
      <div class="grid grid-cols-7 gap-px bg-gray-200 border-b border-gray-200">
        <div v-for="(day, index) in weekDays" :key="index" class="bg-gray-50 py-2 text-center font-semibold text-sm"
          :class="{ 'text-red-500': index === 0, 'text-blue-500': index === 6 }">
          {{ day }}
        </div>
      </div>

      <div class="grid grid-cols-7 gap-px flex-1 bg-gray-200">
        <div v-for="(day, index) in calendarDays" :key="index" @click="openModal(day)"
          class="bg-white p-2 min-h-[120px] cursor-pointer hover:bg-blue-50 transition-colors flex flex-col group"
          :class="!day.isCurrentMonth ? 'opacity-40 bg-gray-50' : ''">

          <div class="flex justify-between items-start mb-1">
            <span class="text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full"
              :class="{
                'bg-blue-600 text-white': day.isToday,
                'text-red-500': day.date.getDay() === 0 && !day.isToday,
                'text-blue-500': day.date.getDay() === 6 && !day.isToday,
                'text-gray-700': day.date.getDay() !== 0 && day.date.getDay() !== 6 && !day.isToday
              }">
              {{ day.date.getDate() }}
            </span>
            <span class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 font-bold">+</span>
          </div>

          <div class="flex-1 overflow-y-auto space-y-1">
            <div v-for="diary in diaries.filter(d => d.date === formatDate(day.date))" :key="diary.id"
                 class="text-xs bg-blue-100 text-blue-800 p-1 rounded flex justify-between items-center group/item"
                 @click.stop> <span class="truncate pr-1">{{ diary.text }}</span>
              <button @click="handleDelete(diary.id)" class="text-blue-400 hover:text-red-500 opacity-0 group-hover/item:opacity-100">x</button>
            </div>
          </div>

        </div>
      </div>
    </div>

    <div v-if="isModalOpen" class="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div class="bg-white p-6 rounded-lg shadow-xl w-96">
        <h3 class="text-lg font-bold mb-4">
          {{ selectedDate?.getFullYear() }}년 {{ selectedDate?.getMonth() + 1 }}월 {{ selectedDate?.getDate() }}일 일정 추가
        </h3>
        <input
          v-model="newDiaryText"
          type="text"
          placeholder="일정 내용을 입력하세요"
          class="w-full p-2 border border-gray-300 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          @keyup.enter="saveDiary"
          autofocus
        />
        <div class="flex justify-end gap-2">
          <button @click="closeModal" class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">취소</button>
          <button @click="saveDiary" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">저장</button>
        </div>
      </div>
    </div>

  </div>
</template>
