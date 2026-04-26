<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'

const email = ref('')
const pw = ref('')
const errorMsg = ref('')
const isLoading = ref(false)
const router = useRouter()

const handleLogin = async () => {
  if (!email.value.trim() || !pw.value) {
    errorMsg.value = '이메일과 비밀번호를 입력해 주세요.'
    return
  }
  isLoading.value = true
  errorMsg.value = ''
  try {
    await signInWithEmailAndPassword(auth, email.value.trim(), pw.value)
    router.push('/')
  } catch (err) {
    switch (err.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        errorMsg.value = '이메일 또는 비밀번호가 올바르지 않습니다.'
        break
      case 'auth/too-many-requests':
        errorMsg.value = '로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.'
        break
      case 'auth/invalid-email':
        errorMsg.value = '이메일 형식이 올바르지 않습니다.'
        break
      default:
        errorMsg.value = '로그인 중 오류가 발생했습니다.'
    }
  } finally {
    isLoading.value = false
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
          <label for="userEmail" class="block text-sm font-bold text-gray-800 mb-1">이메일</label>
          <input
            id="userEmail"
            v-model="email"
            type="email"
            placeholder="이메일을 입력하세요"
            class="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400 font-medium"
            @keyup.enter="handleLogin"
          />
        </div>

        <div>
          <label for="userPw" class="block text-sm font-bold text-gray-800 mb-1">비밀번호</label>
          <input
            id="userPw"
            v-model="pw"
            type="password"
            placeholder="비밀번호를 입력하세요"
            class="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400 font-medium"
            @keyup.enter="handleLogin"
          />
        </div>

        <p v-if="errorMsg" class="text-sm text-red-600 font-medium">{{ errorMsg }}</p>

        <button
          @click="handleLogin"
          :disabled="isLoading"
          class="w-full bg-blue-600 text-white font-bold p-3.5 rounded-xl hover:bg-blue-700 transition-colors mt-2 shadow-md active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {{ isLoading ? '로그인 중...' : '로그인' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;700;900&display=swap');
.font-sans { font-family: 'Pretendard', sans-serif; }
</style>