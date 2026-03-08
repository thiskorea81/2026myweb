<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

// 사용자가 입력할 아이디와 비밀번호를 담을 변수입니다.
const id = ref('')
const pw = ref('')
const router = useRouter()

// 로그인 버튼을 누르거나 엔터키를 쳤을 때 실행되는 함수입니다.
const handleLogin = () => {
  // 💡 .env 파일에 저장된 아이디와 비밀번호를 불러옵니다.
  const validId = import.meta.env.VITE_LOGIN_ID
  const validPw = import.meta.env.VITE_LOGIN_PW

  // 불러온 정보와 사용자가 입력한 정보가 맞는지 확인합니다.
  if (id.value === validId && pw.value === validPw) {
    // 맞다면 브라우저에 '로그인 성공' 상태를 저장합니다.
    localStorage.setItem('isLoggedIn', 'true')
    // 첫 페이지(HomeView)로 이동합니다.
    router.push('/')
  } else {
    alert('아이디 또는 비밀번호가 일치하지 않습니다. 다시 확인해 주세요.')
  }
}
</script>

<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-100">
    <div class="p-10 bg-white rounded-xl shadow-lg w-full max-w-sm">
      <div class="text-center mb-8">
        <h2 class="text-2xl font-bold text-gray-800">👨‍🏫 학급 다이어리</h2>
        <p class="text-sm text-gray-500 mt-2">선생님 전용 로그인 페이지입니다.</p>
      </div>
      
      <div class="space-y-4">
        <div>
          <label for="userId" class="block text-sm font-medium text-gray-700 mb-1">아이디</label>
          <input 
            id="userId"
            v-model="id" 
            type="text" 
            placeholder="아이디를 입력하세요" 
            class="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
          />
        </div>

        <div>
          <label for="userPw" class="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
          <input 
            id="userPw"
            v-model="pw" 
            type="password" 
            placeholder="비밀번호를 입력하세요" 
            class="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            @keyup.enter="handleLogin" 
          />
        </div>

        <button 
          @click="handleLogin" 
          class="w-full bg-blue-600 text-white font-bold p-3 rounded hover:bg-blue-700 transition-colors mt-4"
        >
          로그인
        </button>
      </div>
    </div>
  </div>
</template>