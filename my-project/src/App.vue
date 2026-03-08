<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AiAssistant from './components/AiAssistant.vue' 

const router = useRouter()
const route = useRoute()

const isHideUiPage = computed(() => {
  return route.name === 'Login' || route.path === '/login' || 
         route.name === 'StudentBoard' || route.path === '/board'
})

const handleLogout = () => {
  localStorage.removeItem('isLoggedIn')
  router.push('/login')
}

// === 자동 로그아웃 (30분 무방비 방지) 로직 ===
let inactivityTimer = null
const INACTIVITY_LIMIT = 30 * 60 * 1000 // 30분 (1000ms * 60초 * 30분)

const resetTimer = () => {
  if (inactivityTimer) clearTimeout(inactivityTimer)
  
  if (localStorage.getItem('isLoggedIn') === 'true') {
    inactivityTimer = setTimeout(() => {
      alert('🔒 30분 동안 활동이 없어 안전을 위해 자동으로 로그아웃 되었습니다.')
      handleLogout()
    }, INACTIVITY_LIMIT)
  }
}

onMounted(() => {
  const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
  events.forEach(event => window.addEventListener(event, resetTimer))
  resetTimer()
})

onUnmounted(() => {
  const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
  events.forEach(event => window.removeEventListener(event, resetTimer))
  if (inactivityTimer) clearTimeout(inactivityTimer)
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-800">
    <nav v-if="!isHideUiPage" class="print:hidden bg-white shadow-sm px-6 py-4 flex flex-wrap justify-between items-center gap-4 z-40 relative">
      <div class="text-xl font-bold text-blue-600 whitespace-nowrap">
        👨‍🏫 2026 학급 다이어리
      </div>
      
      <div class="flex flex-wrap gap-4 items-center">
        <router-link to="/" class="hover:text-blue-500 font-medium transition-colors" active-class="text-blue-600 font-bold">다이어리</router-link>
        <router-link to="/homeroom" class="hover:text-blue-500 font-medium transition-colors" active-class="text-blue-600 font-bold">학급 관리</router-link>
        <router-link to="/club" class="hover:text-blue-500 font-medium transition-colors" active-class="text-blue-600 font-bold">동아리 관리</router-link>
        <router-link to="/seats" class="hover:text-blue-500 font-medium transition-colors" active-class="text-blue-600 font-bold">자리 배치</router-link>
        <router-link to="/worklog" class="hover:text-blue-500 font-medium transition-colors" active-class="text-blue-600 font-bold">업무 일지</router-link>
        
        <router-link to="/guide" class="hover:text-green-500 font-medium transition-colors text-green-700" active-class="text-green-600 font-bold border-b-2 border-green-500">
          📖 사용 설명서
        </router-link>
        
        <router-link to="/board" target="_blank" class="ml-2 px-3 py-1.5 bg-indigo-100 text-indigo-700 font-bold rounded hover:bg-indigo-200 transition-colors">
          📺 학생 알림장 띄우기
        </router-link>
        
        <button @click="handleLogout" class="ml-2 px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm font-medium hover:bg-gray-300 transition-colors">
          로그아웃
        </button>
      </div>
    </nav>

    <main class="w-full px-4 sm:px-6 lg:px-8 py-6 print:p-0 print:m-0">
      <router-view></router-view>
    </main>

    <AiAssistant v-if="!isHideUiPage" class="print:hidden" />
  </div>
</template>