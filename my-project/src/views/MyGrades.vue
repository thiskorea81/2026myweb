<script setup>
import { ref } from 'vue'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { getOrderedScores } from '../utils/gradeUtils'

const studentId = ref('')
const studentName = ref('')
const isVerified = ref(false)
const isSearching = ref(false)
const searchError = ref('')

const grades = ref([])

// 학번+이름으로 본인 확인 후 본인 성적만 조회
const verifyStudent = async () => {
  const id = studentId.value.trim()
  const name = studentName.value.trim()
  if (!id || !name) return alert('학번과 이름을 모두 입력해 주세요.')
  isSearching.value = true
  searchError.value = ''
  try {
    const snap = await getDocs(query(collection(db, 'students'), where('studentId', '==', id)))
    const found = snap.docs.find(d => d.data().name === name)
    if (!found) {
      searchError.value = '학번/이름이 일치하는 학생을 찾을 수 없습니다. 다시 확인해 주세요.'
      return
    }
    grades.value = (found.data().grades || []).slice().reverse()
    isVerified.value = true
  } catch (e) {
    console.error(e)
    searchError.value = '조회 중 오류가 발생했습니다. 다시 시도해 주세요.'
  } finally {
    isSearching.value = false
  }
}

const resetForm = () => {
  isVerified.value = false
  grades.value = []
  studentId.value = ''
  studentName.value = ''
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-10 px-4 font-sans">
    <div class="max-w-lg mx-auto">

      <!-- 헤더 -->
      <div class="text-center mb-8">
        <div class="text-5xl mb-3">📊</div>
        <h1 class="text-2xl font-black text-gray-800 tracking-tight">내 성적 확인</h1>
        <p class="text-gray-500 mt-2 text-sm">학번과 이름을 입력하면 본인의 성적만 확인할 수 있습니다.</p>
      </div>

      <!-- 학번/이름 인증 -->
      <div v-if="!isVerified" class="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 mb-6">
        <h2 class="font-black text-gray-700 mb-5 text-lg">🔍 본인 확인</h2>
        <div class="space-y-3">
          <input
            v-model="studentId"
            type="text"
            inputmode="numeric"
            maxlength="5"
            placeholder="학번 (5자리)"
            class="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none text-gray-800 font-bold text-base"
            @keyup.enter="verifyStudent"
          />
          <input
            v-model="studentName"
            type="text"
            placeholder="이름"
            class="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none text-gray-800 font-bold text-base"
            @keyup.enter="verifyStudent"
          />
          <p v-if="searchError" class="text-red-500 text-sm font-bold">{{ searchError }}</p>
          <button
            @click="verifyStudent"
            :disabled="isSearching"
            class="w-full py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
          >
            {{ isSearching ? '확인 중...' : '확인하기' }}
          </button>
        </div>
      </div>

      <!-- 성적 조회 결과 -->
      <div v-else class="space-y-4">

        <!-- 환영 메시지 -->
        <div class="bg-indigo-600 text-white rounded-2xl px-6 py-4 font-bold flex items-center justify-between gap-3">
          <span class="flex items-center gap-3">
            <span class="text-2xl">👋</span>
            <span>{{ studentName }}({{ studentId }}) 학생의 성적입니다.</span>
          </span>
          <button @click="resetForm" class="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg font-bold whitespace-nowrap">
            다른 학생 조회
          </button>
        </div>

        <div v-if="grades.length === 0" class="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 text-center text-gray-400 text-sm">
          아직 등록된 성적이 없습니다.
        </div>

        <div v-for="grade in grades" :key="grade.id" class="bg-white rounded-3xl shadow-lg border border-gray-100 p-6">
          <div class="flex justify-between items-center mb-4">
            <span class="font-black text-gray-800 text-lg border-l-4 border-indigo-500 pl-2">{{ grade.examName }}</span>
          </div>
          <div class="flex flex-wrap gap-3">
            <div v-for="item in getOrderedScores(grade.scores)" :key="item.label" class="bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 flex items-center gap-2 min-w-[80px]">
              <span class="text-xs text-gray-500 font-bold bg-gray-100 px-2 py-1 rounded">{{ item.label }}</span>
              <span class="font-black text-indigo-600 text-base">{{ item.score }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
