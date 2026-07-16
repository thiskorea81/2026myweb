<script setup>
import { ref } from 'vue'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { getOrderedScores, summaryItems } from '../utils/gradeUtils'

const studentId = ref('')
const parentPhoneLast4 = ref('')
const isVerified = ref(false)
const isSearching = ref(false)
const searchError = ref('')

const studentName = ref('')
const grades = ref([])

// 총점/평균/석차 등 요약 항목 라벨(별칭 포함) 집합 - 성적 아랫줄에 별도로 표시하기 위해 구분
const summaryLabelSet = new Set(summaryItems.flatMap(item => [item.label, ...item.match]))

// 과목별 성취도/등급과 총점·평균·석차(비중요 정보)를 분리
const splitScores = (scores) => {
  const all = getOrderedScores(scores)
  return {
    subjects: all.filter(item => !summaryLabelSet.has(item.label)),
    summary: all.filter(item => summaryLabelSet.has(item.label))
  }
}

// 학번 + 보호자1 연락처 뒤 4자리로 본인 확인 후 본인 성적만 조회 (이름 노출 없이 검증)
const verifyStudent = async () => {
  const id = studentId.value.trim()
  const last4 = parentPhoneLast4.value.trim()
  if (!id || !last4) return alert('학번과 보호자1 연락처 뒤 4자리를 모두 입력해 주세요.')
  if (!/^\d{4}$/.test(last4)) return alert('보호자1 연락처 뒤 4자리는 숫자 4자리로 입력해 주세요.')
  isSearching.value = true
  searchError.value = ''
  try {
    const snap = await getDocs(query(collection(db, 'students'), where('studentId', '==', id)))
    const found = snap.docs.find(d => {
      const phone = (d.data().parent1Phone || '').replace(/\D/g, '')
      return phone.length >= 4 && phone.slice(-4) === last4
    })
    if (!found) {
      searchError.value = '학번/보호자 연락처가 일치하는 학생을 찾을 수 없습니다. 다시 확인해 주세요.'
      return
    }
    studentName.value = found.data().name
    grades.value = (found.data().grades || []).slice().reverse()
    isVerified.value = true
  } catch (e) {
    console.error(e)
    searchError.value = '조회 중 오류가 발생했습니다. 다시 시도해 주세요.'
  } finally {
    isSearching.value = false
  }
}


</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-10 px-4 font-sans">
    <div class="max-w-lg mx-auto">

      <!-- 헤더 -->
      <div class="text-center mb-8">
        <div class="text-5xl mb-3">📊</div>
        <h1 class="text-2xl font-black text-gray-800 tracking-tight">내 성적 확인</h1>
        <p class="text-gray-500 mt-2 text-sm">학번과 보호자1 연락처 뒤 4자리를 입력하면 본인의 성적만 확인할 수 있습니다.</p>
      </div>

      <!-- 학번/보호자 연락처 인증 -->
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
            v-model="parentPhoneLast4"
            type="text"
            inputmode="numeric"
            maxlength="4"
            placeholder="보호자1 연락처 뒤 4자리"
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
        <div class="bg-indigo-600 text-white rounded-2xl px-6 py-4 font-bold flex items-center gap-3">
          <span class="text-2xl">👋</span>
          <span>{{ studentName }}({{ studentId }}) 학생의 성적입니다.</span>
        </div>

        <div v-if="grades.length === 0" class="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 text-center text-gray-400 text-sm">
          아직 등록된 성적이 없습니다.
        </div>

        <div v-for="grade in grades" :key="grade.id" class="bg-white rounded-3xl shadow-lg border border-gray-100 p-6">
          <div class="flex justify-between items-center mb-4">
            <span class="font-black text-gray-800 text-lg border-l-4 border-indigo-500 pl-2">{{ grade.examName }}</span>
          </div>

          <!-- 과목별 성취도/등급 (중요 정보) -->
          <div class="flex flex-wrap gap-3">
            <div v-for="item in splitScores(grade.scores).subjects" :key="item.label" class="bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 flex items-center gap-2 min-w-[80px]">
              <span class="text-xs text-gray-500 font-bold bg-gray-100 px-2 py-1 rounded">{{ item.label }}</span>
              <span class="font-black text-indigo-600 text-base">{{ item.score }}</span>
            </div>
          </div>

          <!-- 총점/평균/석차 등 참고 정보 (아랫줄, 덜 강조) -->
          <div v-if="splitScores(grade.scores).summary.length > 0" class="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 font-medium">
            <span v-for="item in splitScores(grade.scores).summary" :key="item.label">
              {{ item.label }} {{ item.score }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
