<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

// 로그인 여부 확인
const isLoggedIn = computed(() => localStorage.getItem('isLoggedIn') === 'true')

const handleLogout = () => {
  if(confirm('로그아웃 하시겠습니까?')) {
    localStorage.removeItem('isLoggedIn')
    router.push('/login')
  }
}

// 💡 메뉴 리스트 (경로, 아이콘, 메뉴명)
const navMenus = [
  { path: '/', icon: '🏠', name: '홈' },
  { path: '/homeroom', icon: '👥', name: '학급관리' },
  { path: '/club', icon: '🎨', name: '동아리' },
  { path: '/seats', icon: '🪑', name: '자리배치' },
  { path: '/worklog', icon: '📓', name: '업무일지' },
  { path: '/board-admin', icon: '📋', name: '조종례 관리' },
  { path: '/admin', icon: '📊', name: '자율학습 관리' },
]
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col font-sans print:bg-white print:min-h-0">
    
    <header v-if="isLoggedIn && route.name !== 'Apply' && route.name !== 'StudentBoard'" class="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40 print:hidden">
      <div class="w-full px-4 sm:px-6">
        <div class="flex justify-between items-center h-16 gap-4">
          
          <div class="flex items-center gap-2 cursor-pointer shrink-0" @click="router.push('/')">
            <span class="text-2xl">🏫</span>
            <span class="font-black text-lg xl:text-xl text-gray-800 tracking-tight hidden lg:block">선생님 AI 비서</span>
          </div>

          <nav class="flex-1 flex items-center justify-start xl:justify-center overflow-x-auto custom-scrollbar gap-1 py-2 px-2">
            <router-link 
              v-for="menu in navMenus" 
              :key="menu.path" 
              :to="menu.path"
              class="px-3 py-2 rounded-lg font-bold text-[13px] xl:text-sm transition-colors whitespace-nowrap shrink-0"
              :class="route.path === menu.path ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'"
            >
              {{ menu.icon }} {{ menu.name }}
            </router-link>
          </nav>

          <div class="flex items-center gap-2 shrink-0">
            <router-link to="/board" target="_blank" class="hidden md:inline-flex px-2.5 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors whitespace-nowrap" title="새 창으로 조종례 보드 열기">
              📢 조종례 화면
            </router-link>
            <router-link to="/apply" target="_blank" class="hidden md:inline-flex px-2.5 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors whitespace-nowrap" title="학생용 신청 페이지 주소 복사용">
              📝 자율학습 신청폼
            </router-link>
            <button @click="handleLogout" class="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors whitespace-nowrap">
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
/* 전체 기본 폰트 설정 */
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;700;900&display=swap');
body {
  font-family: 'Pretendard', -apple-system, sans-serif;
  margin: 0;
  padding: 0;
}

/* 💡 메뉴 가로 스크롤바 숨기기 (모바일/작은 모니터용) */
.custom-scrollbar::-webkit-scrollbar {
  display: none;
}
.custom-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>