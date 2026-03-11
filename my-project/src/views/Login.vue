<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const id = ref('')
const pw = ref('')
const router = useRouter()

const handleLogin = () => {
  const validId = import.meta.env.VITE_LOGIN_ID
  const validPw = import.meta.env.VITE_LOGIN_PW

  if (id.value === validId && pw.value === validPw) {
    localStorage.setItem('isLoggedIn', 'true')
    router.push('/')
  } else {
    alert('아이디 또는 비밀번호가 일치하지 않습니다. 다시 확인해 주세요.')
  }
}
</script>

<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-100 text-gray-900 font-sans">
    
    <div class="p-10 bg-white rounded-2xl shadow-xl w-full max-w-sm border border-gray-200">
      <div class="text-center mb-8">
        <h2 class="text-2xl font-black text-gray-900">👨‍🏫 학급 다이어리</h2>
        <p class="text-sm text-gray-500 mt-2 font-bold">선생님 전용 로그인 페이지입니다.</p>
      </div>
      
      <div class="space-y-5">
        <div>
          <label for="userId" class="block text-sm font-bold text-gray-800 mb-1">아이디</label>
          <input 
            id="userId"
            v-model="id" 
            type="text" 
            placeholder="아이디를 입력하세요" 
            class="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors bg-white text-gray-900 placeholder-gray-400 font-medium"
          />
        </div>

        <div>
          <label for="userPw" class="block text-sm font-bold text-gray-800 mb-1">비밀번호</label>
          <input 
            id="userPw"
            v-model="pw" 
            type="password" 
            placeholder="비밀번호를 입력하세요" 
            class="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors bg-white text-gray-900 placeholder-gray-400 font-medium"
            @keyup.enter="handleLogin" 
          />
        </div>

        <button 
          @click="handleLogin" 
          class="w-full bg-blue-600 text-white font-bold p-3.5 rounded-xl hover:bg-blue-700 transition-colors mt-2 shadow-md active:scale-[0.98]"
        >
          로그인
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;700;900&display=swap');
.font-sans { font-family: 'Pretendard', sans-serif; }
</style>