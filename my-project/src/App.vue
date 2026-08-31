<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AiAssistant from './components/AiAssistant.vue' // 💡 AI 비서 컴포넌트 불러오기
import { startAutoBoardTimer, stopAutoBoardTimer } from './services/autoBoardService' // 💡 프론트엔드 자동 조종례 스케줄러

const router = useRouter()
const route = useRoute()

// 💡 로그인 상태 및 모바일 메뉴 토글 상태 관리
const isLoggedIn = ref(localStorage.getItem('isLoggedIn') === 'true')
const isMobileMenuOpen = ref(false)

// 주소가 바뀔 때마다 로그인 상태 확인, 모바일 메뉴 닫기 및 타이머 초기화
watch(() => route.path, () => {
  isLoggedIn.value = localStorage.getItem('isLoggedIn') === 'true'
  isMobileMenuOpen.value = false // 페이지 이동 시 모바일 메뉴 자동 닫힘
  openGroup.value = null // 페이지 이동 시 드롭다운 자동 닫힘
  resetTimer()
  if (isLoggedIn.value) {
    startAutoBoardTimer()
  } else {
    stopAutoBoardTimer()
  }
})

const handleLogout = () => {
  if (confirm('로그아웃 하시겠습니까?')) {
    localStorage.removeItem('isLoggedIn')
    isLoggedIn.value = false
    stopAutoBoardTimer()
    router.push('/login')
  }
}

// -----------------------------------------
// 💡 30분 자동 로그아웃 (보안 기능)
// -----------------------------------------
const TIMEOUT_MS = 30 * 60 * 1000 // 30분
let inactivityTimer = null

const handleAutoLogout = () => {
  if (!isLoggedIn.value) return 

  localStorage.removeItem('isLoggedIn')
  isLoggedIn.value = false
  stopAutoBoardTimer()
  alert('보안을 위해 30분 동안 활동이 없어 자동으로 로그아웃되었습니다. 다시 로그인해 주세요.')
  router.push('/login')
}

const resetTimer = () => {
  if (inactivityTimer) clearTimeout(inactivityTimer)
  if (isLoggedIn.value) {
    inactivityTimer = setTimeout(handleAutoLogout, TIMEOUT_MS)
  }
}

onMounted(() => {
  window.addEventListener('mousemove', resetTimer)
  window.addEventListener('click', resetTimer)
  window.addEventListener('keydown', resetTimer)
  window.addEventListener('scroll', resetTimer)
  document.addEventListener('click', handleDocumentClick)

  resetTimer()
  if (isLoggedIn.value) {
    startAutoBoardTimer()
  }
})

onUnmounted(() => {
  window.removeEventListener('mousemove', resetTimer)
  window.removeEventListener('click', resetTimer)
  window.removeEventListener('keydown', resetTimer)
  window.removeEventListener('scroll', resetTimer)
  document.removeEventListener('click', handleDocumentClick)
  if (inactivityTimer) clearTimeout(inactivityTimer)
  stopAutoBoardTimer()
})
// -----------------------------------------

// 💡 메뉴 그룹 (카테고리 드롭다운 구조)
const homeMenu = { path: '/', icon: '🏠', name: '홈' }

const navGroups = [
  {
    label: '학생', icon: '👥',
    items: [
      { path: '/all-students', icon: '🏫', name: '전체 학생' },
      { path: '/homeroom', icon: '👥', name: '학급관리' },
      { path: '/data-export', icon: '📥', name: '진학상담 자료 다운' },
    ]
  },
  {
    label: '수업', icon: '📝',
    items: [
      { path: '/subject', icon: '📝', name: '교과수업' },
      { path: '/career', icon: '🧭', name: '진로' },
      { path: '/club', icon: '🎨', name: '동아리' },
    ]
  },
  {
    label: '운영', icon: '⚙️',
    items: [
      { path: '/worklog', icon: '📓', name: '업무일지' },
      { path: '/board-admin', icon: '📋', name: '조종례 관리' },
      { path: '/admin', icon: '📊', name: '자율학습 관리' },
      { path: '/tts', icon: '🗣️', name: '방송 TTS' },
    ]
  },
]

// 새 창으로 열거나 별도 페이지로 바로 이동하는 바로가기 메뉴
const quickLinks = [
  { path: '/board', target: '_blank', icon: '📢', name: '학생용 조종례', mobileClass: 'bg-indigo-50 text-indigo-700 border border-indigo-200 active:bg-indigo-100' },
  { path: '/teacher-board', target: '_blank', icon: '👨‍🏫', name: '담임용 조종례', mobileClass: 'bg-blue-50 text-blue-700 border border-blue-200 active:bg-blue-100' },
  { path: '/meal-board', target: '_blank', icon: '🍱', name: '급식 안내', mobileClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200 active:bg-emerald-100' },
  { path: '/seats', target: null, icon: '🪑', name: '자리배치', mobileClass: 'bg-amber-50 text-amber-700 border border-amber-200 active:bg-amber-100' },
  { path: '/apply', target: '_blank', icon: '📝', name: '신청폼', mobileClass: 'bg-green-50 text-green-700 border border-green-200 active:bg-green-100' },
]

// 열려 있는 드롭다운 (그룹 인덱스 또는 'quick'), 없으면 null
const openGroup = ref(null)
const headerRef = ref(null)

const toggleGroup = (key) => {
  openGroup.value = openGroup.value === key ? null : key
}

const isGroupActive = (group) => group.items.some(item => route.path === item.path)

const handleDocumentClick = (e) => {
  if (headerRef.value && !headerRef.value.contains(e.target)) {
    openGroup.value = null
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col font-sans print:bg-white print:min-h-0 relative">
    
    <header ref="headerRef" v-if="isLoggedIn && route.name !== 'Apply' && route.name !== 'StudentBoard' && route.name !== 'TeacherBoard' && route.name !== 'MealBoard'" class="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40 print:hidden">
      <div class="w-full px-4 md:px-6 max-w-screen-2xl mx-auto">
        <div class="flex justify-between items-center h-16">
          
          <div class="flex items-center gap-2 cursor-pointer shrink-0" @click="router.push('/')">
            <span class="text-2xl">🏫</span>
            <span class="font-black text-lg xl:text-xl text-gray-800 tracking-tight">선생님 AI 비서</span>
          </div>

          <nav class="hidden lg:flex flex-1 items-center justify-center gap-1 px-4">
            <router-link
              to="/"
              class="px-3 py-2 rounded-lg font-bold text-sm transition-colors whitespace-nowrap"
              :class="route.path === '/' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'"
            >
              {{ homeMenu.icon }} {{ homeMenu.name }}
            </router-link>

            <div v-for="(group, gi) in navGroups" :key="group.label" class="relative">
              <button
                @click="toggleGroup(gi)"
                class="px-3 py-2 rounded-lg font-bold text-sm transition-colors whitespace-nowrap flex items-center gap-1"
                :class="isGroupActive(group) ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'"
              >
                {{ group.icon }} {{ group.label }}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 transition-transform" :class="openGroup === gi ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div v-show="openGroup === gi" class="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50">
                <router-link
                  v-for="item in group.items"
                  :key="item.path"
                  :to="item.path"
                  class="flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors"
                  :class="route.path === item.path ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'"
                >
                  <span>{{ item.icon }}</span> {{ item.name }}
                </router-link>
              </div>
            </div>
          </nav>

          <div class="hidden lg:flex items-center gap-2 shrink-0">
            <div class="relative">
              <button
                @click="toggleGroup('quick')"
                class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1 border"
                :class="openGroup === 'quick' ? 'bg-gray-100 text-gray-800 border-gray-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'"
              >
                🔗 바로가기
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 transition-transform" :class="openGroup === 'quick' ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div v-show="openGroup === 'quick'" class="absolute top-full right-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50">
                <router-link
                  v-for="q in quickLinks"
                  :key="q.path"
                  :to="q.path"
                  :target="q.target"
                  class="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>{{ q.icon }}</span> {{ q.name }}
                </router-link>
              </div>
            </div>

            <button @click="handleLogout" class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-colors whitespace-nowrap shadow-sm border border-gray-200 ml-1">
              로그아웃
            </button>
          </div>

          <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="lg:hidden p-2 text-gray-600 hover:text-gray-900 focus:outline-none">
            <svg v-if="!isMobileMenuOpen" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
        </div>
      </div>

      <div v-show="isMobileMenuOpen" class="lg:hidden absolute top-16 left-0 w-full bg-white border-b border-gray-200 shadow-xl pb-4 px-4 pt-2">
        
        <div class="flex flex-col gap-1 mb-4">
          <router-link
            to="/"
            class="px-4 py-3 rounded-xl font-bold text-[15px] transition-colors flex items-center gap-3"
            :class="route.path === '/' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'"
          >
            <span class="text-xl">{{ homeMenu.icon }}</span> {{ homeMenu.name }}
          </router-link>

          <div v-for="group in navGroups" :key="group.label" class="mt-2">
            <div class="px-4 pt-2 pb-1 text-xs font-bold text-gray-400 uppercase tracking-wider">{{ group.icon }} {{ group.label }}</div>
            <router-link
              v-for="item in group.items"
              :key="item.path"
              :to="item.path"
              class="px-4 py-3 rounded-xl font-bold text-[15px] transition-colors flex items-center gap-3"
              :class="route.path === item.path ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'"
            >
              <span class="text-xl">{{ item.icon }}</span> {{ item.name }}
            </router-link>
          </div>
        </div>

        <div class="border-t border-gray-100 pt-4 flex flex-col gap-2">
          <div class="grid grid-cols-2 gap-2">
            <router-link
              v-for="q in quickLinks"
              :key="q.path"
              :to="q.path"
              :target="q.target"
              class="flex justify-center items-center py-2.5 rounded-xl text-sm font-bold text-center"
              :class="q.mobileClass"
            >
              {{ q.icon }} {{ q.name }}
            </router-link>
          </div>
          
          <button @click="handleLogout" class="mt-2 w-full py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-red-50 hover:text-red-600 transition-colors border border-gray-200">
            로그아웃
          </button>
        </div>

      </div>
    </header>

    <main class="flex-1 w-full print:p-0 print:m-0">
      <router-view />
    </main>

    <AiAssistant v-if="isLoggedIn" />

  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;700;900&display=swap');
html, body {
  font-family: 'Pretendard', -apple-system, sans-serif;
  margin: 0;
  padding: 0;
  background-color: #f9fafb; 
  color: #111827; 
  color-scheme: light !important; 
}
.custom-scrollbar::-webkit-scrollbar {
  display: none;
}
.custom-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>