<script setup>
import { ref, computed, watch } from 'vue'
import { getDayMealSchedule } from '../utils/mealOrder'
import { fetchLunchMenuForDate, fetchSchoolEventsForDate } from '../services/neisService'

// 첫 화면 급식 안내: 반별 급식실 이동 순서/시각(1학년) + NEIS 점심 메뉴 + 그날 학사일정
// (github.com/thiskorea81/sch-meal 화면을 위젯으로 옮긴 것)
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const myClass = Number(localStorage.getItem('myClass') || '1')

const dayOffset = ref(0)
const menu = ref(null)
const events = ref([])
const isMenuLoading = ref(false)

const targetDate = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset.value)
  return d
})
const dateStr = computed(() => {
  const d = targetDate.value
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})
const dateLabel = computed(() => {
  const d = targetDate.value
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_LABELS[d.getDay()]})`
})

const schedule = computed(() => getDayMealSchedule(dateStr.value))
const myRow = computed(() => schedule.value?.rows.find(r => r.classNum === myClass) || null)

const load = async (target) => {
  isMenuLoading.value = true
  const [menuInfo, dayEvents] = await Promise.all([fetchLunchMenuForDate(target), fetchSchoolEventsForDate(target)])
  if (target !== dateStr.value) return // 그 사이 날짜를 넘겼으면 오래된 응답은 버림
  menu.value = menuInfo
  events.value = dayEvents
  isMenuLoading.value = false
}
watch(dateStr, load, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h4 class="text-lg font-bold text-gray-800">🍱 급식 안내</h4>
      <div class="flex items-center gap-1">
        <button @click="dayOffset--" class="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200">◀</button>
        <button @click="dayOffset = 0" class="px-2 py-1 text-xs rounded font-bold" :class="dayOffset === 0 ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'">오늘</button>
        <button @click="dayOffset++" class="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200">▶</button>
      </div>
    </div>
    <p class="text-sm font-bold text-gray-600 -mt-1">{{ dateLabel }}</p>

    <div v-if="events.length" class="flex flex-wrap gap-1">
      <span v-for="(e, i) in events" :key="i" class="text-xs px-2 py-0.5 rounded-full font-bold"
        :class="e.holiday ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'">
        {{ e.name }}<template v-if="e.grades.length && e.grades[0] !== '전체'"> ({{ e.grades.join('·') }})</template>
      </span>
    </div>

    <!-- 반별 이동 순서 -->
    <div v-if="schedule" class="rounded-lg border border-orange-100 bg-orange-50/50 p-3">
      <p v-if="myRow" class="text-sm font-bold text-orange-800 mb-2">
        우리 반({{ myClass }}반): <span class="text-lg">{{ myRow.orderNum }}번째</span> · {{ myRow.time }} 출발
      </p>
      <p v-if="schedule.note" class="text-xs text-orange-700 mb-2">{{ schedule.note }}</p>
      <div class="grid grid-cols-3 gap-1">
        <div v-for="row in schedule.rows" :key="row.classNum"
          class="text-xs text-center rounded py-1"
          :class="row.classNum === myClass ? 'bg-orange-500 text-white font-black' : 'bg-white text-gray-600 border border-orange-100'">
          {{ row.time }} {{ row.classNum }}반
        </div>
      </div>
    </div>
    <p v-else class="text-sm text-gray-400 bg-gray-50 rounded p-3">이 날은 급식 순서가 없습니다.</p>

    <!-- 점심 메뉴 -->
    <div>
      <p v-if="isMenuLoading" class="text-sm text-gray-400">메뉴를 불러오는 중...</p>
      <p v-else-if="!menu || menu.dishes.length === 0" class="text-sm text-gray-400">등록된 급식 메뉴가 없습니다.</p>
      <template v-else>
        <ul class="space-y-1">
          <li v-for="(dish, i) in menu.dishes" :key="i" class="text-sm text-gray-800 flex justify-between gap-2">
            <span class="font-medium">{{ dish.name }}</span>
            <span v-if="dish.allergy" class="text-[11px] text-gray-400 text-right">{{ dish.allergy }}</span>
          </li>
        </ul>
        <p v-if="menu.calorie" class="text-xs text-gray-400 mt-2 text-right">{{ menu.calorie }}</p>
      </template>
    </div>
  </div>
</template>
