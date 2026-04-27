<script setup>
import { ref, computed } from 'vue'
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'

const studentId = ref('')
const studentName = ref('')
const isVerified = ref(false)
const isSearching = ref(false)
const searchError = ref('')

const absenceDate = ref(new Date().toISOString().split('T')[0])
const selectedPeriods = ref([])
const reason = ref('')
const customReason = ref('')
const note = ref('')

const PERIODS = [
  { key: '8', label: '8교시 (16:40~18:10)' },
  { key: '야1', label: '야자 1 (19:00~20:30)' },
  { key: '야2', label: '야자 2 (20:40~22:00)' }
]

const REASONS = ['병원', '학원보강', '가족행사', '집안일', '기타']

const isSubmitting = ref(false)
const isDone = ref(false)
const myRequests = ref([])

// 학번+이름으로 신청 여부 확인 (야자 신청자 조회)
const verifyStudent = async () => {
  const id = studentId.value.trim()
  const name = studentName.value.trim()
  if (!id || !name) return alert('학번과 이름을 모두 입력해 주세요.')
  isSearching.value = true
  searchError.value = ''
  try {
    const snap = await getDocs(query(collection(db, 'studyApplications'), where('studentId', '==', id)))
    const found = snap.docs.find(d => d.data().name === name)
    if (!found) {
      searchError.value = '자율학습 신청자 명단에서 학번/이름을 찾을 수 없습니다.'
      return
    }
    isVerified.value = true

    // 이전에 제출한 사유 불러오기
    const reasonSnap = await getDocs(query(collection(db, 'studyAbsenceReasons'), where('studentId', '==', id)))
    myRequests.value = reasonSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
  } catch (e) {
    console.error(e)
    searchError.value = '조회 중 오류가 발생했습니다. 다시 시도해 주세요.'
  } finally {
    isSearching.value = false
  }
}

const togglePeriod = (p) => {
  if (selectedPeriods.value.includes(p)) {
    selectedPeriods.value = selectedPeriods.value.filter(x => x !== p)
  } else {
    selectedPeriods.value = [...selectedPeriods.value, p]
  }
}

const finalReason = computed(() => {
  if (reason.value === '기타') return customReason.value.trim()
  return reason.value
})

const canSubmit = computed(() => {
  return absenceDate.value && selectedPeriods.value.length > 0 && finalReason.value
})

const submitReason = async () => {
  if (!canSubmit.value) return alert('날짜, 빠지는 시간, 사유를 모두 입력해 주세요.')
  isSubmitting.value = true
  try {
    const docRef = await addDoc(collection(db, 'studyAbsenceReasons'), {
      studentId: studentId.value.trim(),
      name: studentName.value.trim(),
      date: absenceDate.value,
      periods: selectedPeriods.value,
      reason: finalReason.value,
      note: note.value.trim(),
      confirmed: false,
      teacherNote: '',
      submittedAt: new Date().toISOString()
    })
    myRequests.value.unshift({
      id: docRef.id,
      studentId: studentId.value.trim(),
      name: studentName.value.trim(),
      date: absenceDate.value,
      periods: selectedPeriods.value,
      reason: finalReason.value,
      note: note.value.trim(),
      confirmed: false,
      teacherNote: '',
      submittedAt: new Date().toISOString()
    })
    // 입력 초기화
    selectedPeriods.value = []
    reason.value = ''
    customReason.value = ''
    note.value = ''
    absenceDate.value = new Date().toISOString().split('T')[0]
    isDone.value = true
    setTimeout(() => isDone.value = false, 3000)
  } catch (e) {
    alert('제출 중 오류가 발생했습니다.')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-10 px-4 font-sans">
    <div class="max-w-lg mx-auto">

      <!-- 헤더 -->
      <div class="text-center mb-8">
        <div class="text-5xl mb-3">📋</div>
        <h1 class="text-2xl font-black text-gray-800 tracking-tight">자율학습 결석 사유 신청</h1>
        <p class="text-gray-500 mt-2 text-sm">자율학습에 빠지는 날짜·시간·사유를 미리 입력해 주세요.</p>
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
            class="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none text-gray-800 font-bold text-base"
            @keyup.enter="verifyStudent"
          />
          <input
            v-model="studentName"
            type="text"
            placeholder="이름"
            class="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none text-gray-800 font-bold text-base"
            @keyup.enter="verifyStudent"
          />
          <p v-if="searchError" class="text-red-500 text-sm font-bold">{{ searchError }}</p>
          <button
            @click="verifyStudent"
            :disabled="isSearching"
            class="w-full py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
          >
            {{ isSearching ? '확인 중...' : '확인하기' }}
          </button>
        </div>
      </div>

      <!-- 신청 폼 -->
      <div v-else class="space-y-4">

        <!-- 환영 메시지 -->
        <div class="bg-blue-600 text-white rounded-2xl px-6 py-4 font-bold flex items-center gap-3">
          <span class="text-2xl">👋</span>
          <span>{{ studentName }}({{ studentId }}) 학생 확인되었습니다.</span>
        </div>

        <!-- 입력 카드 -->
        <div class="bg-white rounded-3xl shadow-lg border border-gray-100 p-7 space-y-6">

          <!-- 날짜 -->
          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">📅 빠지는 날짜</label>
            <input
              type="date"
              v-model="absenceDate"
              class="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none font-bold text-gray-800"
            />
          </div>

          <!-- 시간 -->
          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">⏰ 빠지는 시간 (복수 선택 가능)</label>
            <div class="flex flex-col gap-2">
              <button
                v-for="p in PERIODS"
                :key="p.key"
                @click="togglePeriod(p.key)"
                :class="['w-full py-3 px-4 rounded-xl font-bold text-sm border-2 transition-all text-left',
                  selectedPeriods.includes(p.key)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300']"
              >
                {{ selectedPeriods.includes(p.key) ? '✅ ' : '⬜ ' }}{{ p.label }}
              </button>
            </div>
          </div>

          <!-- 사유 -->
          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">📝 결석 사유</label>
            <div class="grid grid-cols-3 gap-2 mb-2">
              <button
                v-for="r in REASONS"
                :key="r"
                @click="reason = r"
                :class="['py-2 px-3 rounded-xl font-bold text-sm border-2 transition-all',
                  reason === r
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300']"
              >{{ r }}</button>
            </div>
            <input
              v-if="reason === '기타'"
              v-model="customReason"
              type="text"
              placeholder="사유를 직접 입력해 주세요"
              class="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-400 outline-none font-bold text-gray-800 text-sm"
            />
          </div>

          <!-- 추가 메모 -->
          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">🗒️ 추가 메모 (선택)</label>
            <textarea
              v-model="note"
              rows="2"
              placeholder="선생님께 전달할 내용이 있으면 입력해 주세요."
              class="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none text-gray-700 text-sm resize-none"
            ></textarea>
          </div>

          <!-- 제출 버튼 -->
          <button
            @click="submitReason"
            :disabled="!canSubmit || isSubmitting"
            class="w-full py-4 bg-gray-800 text-white font-black rounded-xl hover:bg-black transition-all active:scale-95 disabled:opacity-40 text-base"
          >
            {{ isSubmitting ? '제출 중...' : isDone ? '✅ 제출 완료!' : '결석 사유 제출하기' }}
          </button>

          <p v-if="isDone" class="text-center text-green-600 font-bold text-sm animate-pulse">
            ✅ 제출이 완료되었습니다! 담당 선생님이 확인합니다.
          </p>
        </div>

        <!-- 이전 신청 내역 -->
        <div v-if="myRequests.length > 0" class="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          <h3 class="font-black text-gray-700 mb-4">📋 내 신청 내역</h3>
          <div class="space-y-3">
            <div
              v-for="req in myRequests"
              :key="req.id"
              class="border border-gray-100 rounded-2xl p-4 bg-gray-50"
            >
              <div class="flex justify-between items-center mb-2">
                <span class="font-bold text-gray-700">{{ req.date }}</span>
                <span :class="['text-xs font-bold px-2 py-1 rounded-full', req.confirmed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700']">
                  {{ req.confirmed ? '✅ 확인됨' : '⏳ 확인 대기' }}
                </span>
              </div>
              <p class="text-sm text-gray-600">
                <span class="font-bold">시간:</span> {{ req.periods.join(', ') }}
                &nbsp;|&nbsp;
                <span class="font-bold">사유:</span> {{ req.reason }}
              </p>
              <p v-if="req.note" class="text-xs text-gray-400 mt-1">메모: {{ req.note }}</p>
              <p v-if="req.teacherNote" class="text-xs text-blue-600 mt-1 font-bold">선생님 비고: {{ req.teacherNote }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
