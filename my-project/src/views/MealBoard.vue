<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { getDayMealSchedule } from '../utils/mealOrder'
import { fetchLunchMenuForDate } from '../services/neisMealService'

const viewClass = ref(localStorage.getItem('myClass') || '1')
const classes = Array.from({ length: 9 }, (_, i) => i + 1)

const dayOffset = ref(0) // 0=오늘, -1=어제, +1=내일 ...
const isLoading = ref(true)
const menuInfo = ref(null) // { menu, calorie } | null

const targetDate = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset.value)
  return d
})

const dateString = computed(() => {
  const d = targetDate.value
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const dateLabel = computed(() => {
  const d = targetDate.value
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`
})

// 1~9반 전체 이동 순서/출발 시각표 (12:30 5반, 12:32 6반 ... 형태로 그대로 렌더링)
const schedule = computed(() => getDayMealSchedule(dateString.value))

const loadMenu = async () => {
  isLoading.value = true
  menuInfo.value = await fetchLunchMenuForDate(dateString.value)
  isLoading.value = false
}

watch([dateString], loadMenu)
watch(viewClass, (v) => localStorage.setItem('myClass', v))

onMounted(loadMenu)
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center py-8 px-4 font-sans">
    <div class="w-full max-w-6xl">

      <div class="flex flex-wrap justify-center gap-3 mb-6">
        <div class="bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-2 sm:gap-3">
          <button @click="dayOffset--" class="px-2.5 py-1.5 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100">◀</button>
          <button @click="dayOffset = 0" class="px-3 py-1.5 rounded-lg text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100">오늘</button>
          <button @click="dayOffset++" class="px-2.5 py-1.5 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100">▶</button>
        </div>

        <div class="bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-2 sm:gap-3">
          <span class="text-sm font-bold text-gray-500">내 반 확인</span>
          <select v-model="viewClass" class="border border-gray-300 text-gray-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none py-1.5 pl-3 pr-8 bg-gray-50">
            <option v-for="n in classes" :key="n" :value="n">{{ n }}반</option>
          </select>
        </div>
      </div>

      <div class="text-center mb-6">
        <h1 class="text-3xl font-black text-gray-800">🍽 1학년 급식 안내</h1>
        <p class="text-sm text-gray-500 font-bold mt-1">{{ dateLabel }}</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div class="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div class="p-5 border-b border-gray-100 bg-amber-50/50 flex items-center gap-2">
            <span class="text-xl">🚶</span>
            <h2 class="font-black text-gray-800 text-lg">급식실 이동 순서 · 반별 출발 시각</h2>
          </div>

          <div v-if="schedule" class="p-4 2xl:p-6">
            <p v-if="schedule.isMockExamDay" class="text-center text-xs font-bold text-amber-600 mb-3">📌 모의고사일 - 12:10 기준으로 전체 출발 시각이 당겨졌습니다.</p>

            <div class="grid grid-cols-3 gap-2 2xl:gap-3">
              <div
                v-for="row in schedule.rows"
                :key="row.classNum"
                class="rounded-xl border p-3 2xl:p-4 flex flex-col items-center transition-colors"
                :class="Number(viewClass) === row.classNum
                  ? 'bg-amber-500 border-amber-500 text-white shadow-md scale-[1.03]'
                  : 'bg-gray-50 border-gray-100 text-gray-700'"
              >
                <span class="text-xs font-bold opacity-80">{{ row.orderNum }}번째</span>
                <span class="text-xl 2xl:text-2xl font-black my-0.5">{{ row.time }}</span>
                <span class="text-sm font-bold">{{ row.classNum }}반</span>
              </div>
            </div>
          </div>
          <p v-else class="text-center text-gray-400 font-bold py-16">이 날은 급식이 없습니다.</p>
        </div>

        <div class="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div class="p-5 border-b border-gray-100 bg-emerald-50/50 flex items-center gap-2">
            <span class="text-xl">🍚</span>
            <h2 class="font-black text-gray-800 text-lg">오늘의 점심 메뉴</h2>
          </div>
          <div class="p-6 2xl:p-8 min-h-[240px] flex flex-col justify-center">
            <div v-if="isLoading" class="flex flex-col items-center justify-center text-gray-400 space-y-3">
              <div class="w-8 h-8 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin"></div>
              <p class="text-sm font-bold">메뉴를 불러오는 중...</p>
            </div>
            <template v-else-if="menuInfo">
              <p class="whitespace-pre-line text-[16px] 2xl:text-[18px] text-gray-800 leading-[1.9] font-medium text-center">{{ menuInfo.menu }}</p>
              <p v-if="menuInfo.calorie" class="text-center text-xs font-bold text-gray-400 mt-4">{{ menuInfo.calorie }}</p>
            </template>
            <p v-else class="text-center text-gray-400 font-bold py-2">등록된 급식 메뉴가 없습니다.</p>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@500;700;900&display=swap');
.font-sans { font-family: 'Pretendard', sans-serif; }
</style>
