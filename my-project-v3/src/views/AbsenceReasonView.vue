<script setup>
import { ref, computed } from 'vue'
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

const studentId = ref('')
const studentName = ref('')
const isVerified = ref(false)
const isSearching = ref(false)
const searchError = ref('')

const getLocalYYYYMMDD = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const absenceDate = ref(getLocalYYYYMMDD())
const selectedPeriods = ref([])
const reason = ref('')
const customReason = ref('')
const note = ref('')
const editModeId = ref(null)

const PERIODS = [
  { key: '8', label: '8교시 (16:40~18:10)' },
  { key: '야1', label: '야자 1 (19:00~20:30)' },
  { key: '야2', label: '야자 2 (20:40~22:00)' }
]

const REASONS = ['병원', '학원보강', '가족행사', '집안일', '기타']

const isSubmitting = ref(false)
const isDone = ref(false)
const myRequests = ref([])

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
    if (editModeId.value) {
      // Update existing record
      const docRef = doc(db, 'studyAbsenceReasons', editModeId.value)
      await updateDoc(docRef, {
        date: absenceDate.value,
        periods: selectedPeriods.value,
        reason: finalReason.value,
        note: note.value.trim()
      })
      // Update local list
      const idx = myRequests.value.findIndex(r => r.id === editModeId.value)
      if (idx !== -1) {
        myRequests.value[idx].date = absenceDate.value
        myRequests.value[idx].periods = selectedPeriods.value
        myRequests.value[idx].reason = finalReason.value
        myRequests.value[idx].note = note.value.trim()
      }
      isDone.value = true
      editModeId.value = null
    } else {
      // Add new record
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
      isDone.value = true
    }
    
    selectedPeriods.value = []
    reason.value = ''
    customReason.value = ''
    note.value = ''
    absenceDate.value = getLocalYYYYMMDD()
    setTimeout(() => isDone.value = false, 3000)
  } catch (e) {
    alert('제출 중 오류가 발생했습니다.')
  } finally {
    isSubmitting.value = false
  }
}

const editReason = (req) => {
  editModeId.value = req.id
  absenceDate.value = req.date
  selectedPeriods.value = [...req.periods]
  if (REASONS.includes(req.reason)) {
    reason.value = req.reason
    customReason.value = ''
  } else {
    reason.value = '기타'
    customReason.value = req.reason
  }
  note.value = req.note || ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const deleteReason = async (id) => {
  if (!confirm('이 결석 사유를 삭제하시겠습니까?')) return
  try {
    await deleteDoc(doc(db, 'studyAbsenceReasons', id))
    myRequests.value = myRequests.value.filter(r => r.id !== id)
    if (editModeId.value === id) {
      cancelEdit()
    }
  } catch (e) {
    alert('삭제 중 오류가 발생했습니다.')
  }
}

const cancelEdit = () => {
  editModeId.value = null
  selectedPeriods.value = []
  reason.value = ''
  customReason.value = ''
  note.value = ''
  absenceDate.value = getLocalYYYYMMDD()
}
</script>

<template>
  <div class="absence-view animate-fade-in-up">
    <!-- Header -->
    <header class="header glass-panel">
      <h1>📋 결석 사유 신청</h1>
      <p>자율학습에 빠지는 날짜와 사유를 미리 입력해주세요.</p>
    </header>

    <main class="content">
      <!-- Auth Section -->
      <section v-if="!isVerified" class="card mb-6 animate-fade-in-up">
        <h2 class="section-title">🔍 본인 확인</h2>
        <div class="input-group">
          <input
            v-model="studentId"
            type="text"
            inputmode="numeric"
            maxlength="5"
            placeholder="학번 (5자리)"
            @keyup.enter="verifyStudent"
          />
        </div>
        <div class="input-group">
          <input
            v-model="studentName"
            type="text"
            placeholder="이름"
            @keyup.enter="verifyStudent"
          />
        </div>
        <p v-if="searchError" class="error-msg">{{ searchError }}</p>
        <button
          @click="verifyStudent"
          :disabled="isSearching"
          class="btn-primary mt-4"
        >
          <span v-if="isSearching" class="spinner"></span>
          <span v-else>확인하기</span>
        </button>
      </section>

      <!-- Application Form Section -->
      <section v-else class="form-section animate-fade-in-up">
        <div class="welcome-banner mb-6">
          <span class="emoji">👋</span>
          <span class="welcome-text">{{ studentName }}({{ studentId }}) 학생 확인되었습니다.</span>
        </div>

        <div class="card mb-6">
          <div class="input-group">
            <label>📅 빠지는 날짜</label>
            <input type="date" v-model="absenceDate" />
          </div>

          <div class="input-group">
            <label>⏰ 빠지는 시간 (복수 선택)</label>
            <div class="period-list">
              <button
                v-for="p in PERIODS"
                :key="p.key"
                @click="togglePeriod(p.key)"
                :class="['period-btn', selectedPeriods.includes(p.key) ? 'active' : '']"
              >
                {{ selectedPeriods.includes(p.key) ? '✅ ' : '⬜ ' }}{{ p.label }}
              </button>
            </div>
          </div>

          <div class="input-group">
            <label>📝 결석 사유</label>
            <div class="reason-grid">
              <button
                v-for="r in REASONS"
                :key="r"
                @click="reason = r"
                :class="['reason-btn', reason === r ? 'active' : '']"
              >
                {{ r }}
              </button>
            </div>
            <transition name="fade">
              <input
                v-if="reason === '기타'"
                v-model="customReason"
                type="text"
                placeholder="사유를 직접 입력해 주세요"
                class="mt-2"
              />
            </transition>
          </div>

          <div class="input-group">
            <label>🗒️ 추가 메모 (선택)</label>
            <textarea
              v-model="note"
              rows="2"
              placeholder="선생님께 전달할 내용"
            ></textarea>
          </div>

          <div class="action-buttons mt-6">
            <button
              @click="submitReason"
              :disabled="!canSubmit || isSubmitting"
              class="btn-primary"
            >
              <span v-if="isSubmitting" class="spinner"></span>
              <span v-else>{{ isDone ? '✅ 제출 완료!' : (editModeId ? '수정하기' : '결석 사유 제출하기') }}</span>
            </button>
            <button v-if="editModeId" @click="cancelEdit" class="btn-cancel">취소</button>
          </div>
          <p v-if="isDone" class="success-msg">담당 선생님이 확인합니다!</p>
        </div>

        <!-- History -->
        <div v-if="myRequests.length > 0" class="card mb-6">
          <h3 class="section-title">📋 내 신청 내역</h3>
          <div class="history-list">
            <div v-for="req in myRequests" :key="req.id" class="history-item">
              <div class="history-header">
                <span class="history-date">{{ req.date }}</span>
                <span :class="['status-badge', req.confirmed ? 'confirmed' : 'pending']">
                  {{ req.confirmed ? '✅ 확인됨' : '⏳ 대기' }}
                </span>
              </div>
              <p class="history-detail">
                <strong>시간:</strong> {{ req.periods.join(', ') }} | <strong>사유:</strong> {{ req.reason }}
              </p>
              <p v-if="req.note" class="history-note">메모: {{ req.note }}</p>
              <p v-if="req.teacherNote" class="teacher-note">선생님 비고: {{ req.teacherNote }}</p>
              <div class="history-actions mt-2" v-if="!req.confirmed">
                <button @click="editReason(req)" class="action-btn edit-btn">수정</button>
                <button @click="deleteReason(req.id)" class="action-btn delete-btn">삭제</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.absence-view {
  padding: 16px;
  padding-top: 24px;
}

.header {
  text-align: center;
  padding: 24px 16px;
  margin-bottom: 24px;
  background: linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%);
  color: white;
  border-radius: var(--radius-lg);
  border: none;
}

.header h1 {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.header p {
  font-size: 0.9rem;
  opacity: 0.9;
}

.section-title {
  font-size: 1.1rem;
  margin-bottom: 16px;
  color: var(--text-main);
}

.input-group {
  margin-bottom: 20px;
}

.input-group:last-child {
  margin-bottom: 0;
}

.input-group label {
  display: block;
  font-weight: 900;
  margin-bottom: 8px;
  color: var(--text-main);
  font-size: 0.9rem;
}

.error-msg {
  color: var(--danger);
  font-weight: 700;
  font-size: 0.85rem;
  margin-top: 8px;
}

.success-msg {
  color: var(--success);
  font-weight: 700;
  font-size: 0.9rem;
  text-align: center;
  margin-top: 12px;
  animation: pulse 2s infinite;
}

.welcome-banner {
  background: var(--primary);
  color: white;
  padding: 16px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--shadow-md);
}

.welcome-text {
  font-weight: 700;
  font-size: 0.95rem;
}

.emoji {
  font-size: 1.5rem;
}

/* Periods */
.period-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.period-btn {
  padding: 14px 16px;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-main);
  font-weight: 700;
  text-align: left;
  transition: all 0.2s;
}

.period-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

/* Reasons */
.reason-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.reason-btn {
  padding: 10px 8px;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-main);
  font-weight: 700;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.reason-btn.active {
  background: #0D9488; /* Teal 600 */
  border-color: #0D9488;
  color: white;
}

/* History */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-item {
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.history-date {
  font-weight: 900;
  color: var(--text-main);
}

.status-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
}

.status-badge.confirmed {
  background: #D1FAE5;
  color: #065F46;
}

.status-badge.pending {
  background: #FEF3C7;
  color: #92400E;
}

.history-detail {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.history-note {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.teacher-note {
  font-size: 0.8rem;
  color: var(--primary);
  font-weight: 700;
  margin-top: 4px;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  padding: 14px 20px;
  background: var(--surface);
  color: var(--text-main);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.history-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.action-btn {
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 700;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
}

.edit-btn {
  color: var(--primary);
  border-color: var(--primary);
}

.delete-btn {
  color: var(--danger);
  border-color: var(--danger);
  background: #FEF2F2;
}
</style>
