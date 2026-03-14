<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

// 💡 로그인 상태 관리
const isLoggedIn = ref(localStorage.getItem('isLoggedIn') === 'true')

// 주소가 바뀔 때마다 로그인 상태 확인 및 타이머 초기화
watch(() => route.path, () => {
  isLoggedIn.value = localStorage.getItem('isLoggedIn') === 'true'
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
  if (!isLoggedIn.value) return // 이미 로그아웃 상태면 무시

  localStorage.removeItem('isLoggedIn')
  isLoggedIn.value = false
  alert('보안을 위해 30분 동안 활동이 없어 자동으로 로그아웃되었습니다. 다시 로그인해 주세요.')
  router.push('/login')
}

const resetTimer = () => {
  if (inactivityTimer) clearTimeout(inactivityTimer)
  
  // 로그인 상태에서만 타이머를 작동시킵니다.
  if (isLoggedIn.value) {
    inactivityTimer = setTimeout(handleAutoLogout, TIMEOUT_MS)
  }
}

onMounted(() => {
  // 사용자의 움직임 감지 시 타이머 초기화
  window.addEventListener('mousemove', resetTimer)
  window.addEventListener('click', resetTimer)
  window.addEventListener('keydown', resetTimer)
  window.addEventListener('scroll', resetTimer)
  
  resetTimer() // 최초 타이머 시작
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
  <div class="min-h-screen bg-gray-50 flex flex-col font-sans print:bg-white print:min-h-0">
    
    <header v-if="isLoggedIn && route.name !== 'Apply' && route.name !== 'StudentBoard'" class="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40 print:hidden">
      <div class="w-full px-2 sm:px-6">
        <div class="flex justify-between items-center h-16 gap-2 sm:gap-4">
          
          <div class="flex items-center gap-2 cursor-pointer shrink-0" @click="router.push('/')">
            <span class="text-2xl">🏫</span>
            <span class="font-black text-lg xl:text-xl text-gray-800 tracking-tight hidden lg:block">선생님 AI 비서</span>
          </div>

          <nav class="flex-1 flex items-center justify-start xl:justify-center overflow-x-auto custom-scrollbar gap-1 py-2 px-1">
            <router-link 
              v-for="menu in navMenus" 
              :key="menu.path" 
              :to="menu.path"
              class="px-2 sm:px-3 py-2 rounded-lg font-bold text-[12px] sm:text-[13px] xl:text-sm transition-colors whitespace-nowrap shrink-0"
              :class="route.path === menu.path ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'"
            >
              {{ menu.icon }} {{ menu.name }}
            </router-link>
          </nav>

          <div class="flex items-center gap-1 sm:gap-2 shrink-0">
            <router-link to="/board" target="_blank" class="hidden md:inline-flex px-2.5 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors whitespace-nowrap" title="새 창으로 조종례 보드 열기">
              📢 조종례 화면
            </router-link>
            
            <router-link to="/seats" class="hidden md:inline-flex px-2.5 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors whitespace-nowrap" title="학생 자리배치 관리">
              🪑 자리배치
            </router-link>

            <router-link to="/apply" target="_blank" class="hidden md:inline-flex px-2.5 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors whitespace-nowrap" title="학생용 신청 페이지 주소 복사용">
              📝 자율학습 신청폼
            </router-link>
            
            <button @click="handleLogout" class="px-2 sm:px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-colors whitespace-nowrap shadow-sm border border-gray-200">
              로그아웃
            </button>
          </div>
          
        </div>
      </div>
    </header>

    <main class="flex-1 w-full print:p-0 print:m-0">
      <router-view />
    </main>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;700;900&display=swap');
body {
  font-family: 'Pretendard', -apple-system, sans-serif;
  margin: 0;
  padding: 0;
}

.custom-scrollbar::-webkit-scrollbar {
  display: none;
}
.custom-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>