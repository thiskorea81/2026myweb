<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AiAssistant from './components/AiAssistant.vue' // 💡 AI 비서 컴포넌트 불러오기

const router = useRouter()
const route = useRoute()

// 💡 로그인 상태 및 모바일 메뉴 토글 상태 관리
const isLoggedIn = ref(localStorage.getItem('isLoggedIn') === 'true')
const isMobileMenuOpen = ref(false)

// 주소가 바뀔 때마다 로그인 상태 확인, 모바일 메뉴 닫기 및 타이머 초기화
watch(() => route.path, () => {
  isLoggedIn.value = localStorage.getItem('isLoggedIn') === 'true'
  isMobileMenuOpen.value = false // 페이지 이동 시 모바일 메뉴 자동 닫힘
  resetTimer()
})

const handleLogout = () => {
  if (confirm('로그아웃 하시겠습니까?')) {
    localStorage.removeItem('isLoggedIn')
    isLoggedIn.value = false
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
  
  resetTimer() 
})

onUnmounted(() => {
  window.removeEventListener('mousemove', resetTimer)
  window.removeEventListener('click', resetTimer)
  window.removeEventListener('keydown', resetTimer)
  window.removeEventListener('scroll', resetTimer)
  if (inactivityTimer) clearTimeout(inactivityTimer)
})
// -----------------------------------------

// 메뉴 리스트
const navMenus = [
  { path: '/', icon: '🏠', name: '홈' },
  { path: '/all-students', icon: '🏫', name: '전체 학생' },
  { path: '/homeroom', icon: '👥', name: '학급관리' },
  { path: '/subject', icon: '📝', name: '교과수업' },
  { path: '/career', icon: '🧭', name: '진로' },
  { path: '/club', icon: '🎨', name: '동아리' },
  { path: '/worklog', icon: '📓', name: '업무일지' },
  { path: '/board-admin', icon: '📋', name: '조종례 관리' },
  { path: '/admin', icon: '📊', name: '자율학습 관리' },
]
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col font-sans print:bg-white print:min-h-0 relative">
    
    <header v-if="isLoggedIn && route.name !== 'Apply' && route.name !== 'StudentBoard' && route.name !== 'TeacherBoard'" class="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40 print:hidden">
      <div class="w-full px-4 md:px-6 max-w-screen-2xl mx-auto">
        <div class="flex justify-between items-center h-16">
          
          <div class="flex items-center gap-2 cursor-pointer shrink-0" @click="router.push('/')">
            <span class="text-2xl">🏫</span>
            <span class="font-black text-lg xl:text-xl text-gray-800 tracking-tight">선생님 AI 비서</span>
          </div>

          <nav class="hidden lg:flex flex-1 items-center justify-center gap-2 px-4">
            <router-link 
              v-for="menu in navMenus" 
              :key="menu.path" 
              :to="menu.path"
              class="px-3 py-2 rounded-lg font-bold text-sm transition-colors whitespace-nowrap"
              :class="route.path === menu.path ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'"
            >
              {{ menu.icon }} {{ menu.name }}
            </router-link>
          </nav>

          <div class="hidden lg:flex items-center gap-2 shrink-0">
            <router-link to="/board" target="_blank" class="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors whitespace-nowrap" title="새 창으로 조종례 보드 열기">
              📢 학생용 조종례
            </router-link>

            <router-link to="/teacher-board" target="_blank" class="px-2.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors whitespace-nowrap" title="담임 교사용 요약 브리핑">
              👨‍🏫 담임용 조종례
            </router-link>
            
            <router-link to="/seats" class="px-2.5 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors whitespace-nowrap" title="학생 자리배치 관리">
              🪑 자리배치
            </router-link>

            <router-link to="/apply" target="_blank" class="px-2.5 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors whitespace-nowrap" title="학생용 신청 페이지 주소 복사용">
              📝 신청폼
            </router-link>
            
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
            v-for="menu in navMenus" 
            :key="menu.path" 
            :to="menu.path"
            class="px-4 py-3 rounded-xl font-bold text-[15px] transition-colors flex items-center gap-3"
            :class="route.path === menu.path ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'"
          >
            <span class="text-xl">{{ menu.icon }}</span> {{ menu.name }}
          </router-link>
        </div>

        <div class="border-t border-gray-100 pt-4 flex flex-col gap-2">
          <div class="grid grid-cols-2 gap-2">
            <router-link to="/board" target="_blank" class="flex justify-center items-center py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-sm font-bold active:bg-indigo-100">
              📢 학생용 조종례
            </router-link>
            <router-link to="/teacher-board" target="_blank" class="flex justify-center items-center py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-sm font-bold active:bg-blue-100">
              👨‍🏫 담임용 조종례
            </router-link>
            <router-link to="/seats" class="flex justify-center items-center py-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-sm font-bold active:bg-amber-100">
              🪑 자리배치
            </router-link>
            <router-link to="/apply" target="_blank" class="flex justify-center items-center py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-bold active:bg-green-100">
              📝 자율학습 신청폼
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