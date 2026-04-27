<script setup>
import { ref } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getRoom } from '../utils/roomUtils'

const studentId = ref('')
const name = ref('')
const days = ['월', '화', '목', '금']
const periods = ['8', '야1', '야2']

const selection = ref({})
const isSubmitting = ref(false)
const isChecking = ref(false)
const isUpdating = ref(false)

const fetchMyApplication = async () => {
  if (!studentId.value.trim() || !name.value.trim()) {
    return alert('조회하시려면 학번과 이름을 먼저 입력해주세요.')
  }

  if (!/^\d{5}$/.test(studentId.value.trim())) {
    return alert('학번은 5자리 숫자로 입력해주세요. (예: 10401)')
  }
  
  isChecking.value = true
  try {
    const docRef = doc(db, 'studyApplications', studentId.value)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists() && docSnap.data().name === name.value) {
      selection.value = docSnap.data().selection || {}
      isUpdating.value = true
      alert('기존 신청 내역을 불러왔습니다. 아래에서 수정 후 완료해주세요.')
    } else if (docSnap.exists() && docSnap.data().name !== name.value) {
      alert('입력하신 학번과 이름이 기존 기록과 일치하지 않습니다.')
    } else {
      alert('조회된 신청 내역이 없습니다. 새로 신청을 진행해주세요.')
      selection.value = {}
      isUpdating.value = false
    }
  } catch (error) {
    console.error("조회 에러:", error)
    alert('조회 중 오류가 발생했습니다.')
  } finally {
    isChecking.value = false
  }
}

const handleApply = async () => {
  if (!studentId.value.trim() || !name.value.trim()) {
    return alert('학번과 이름을 정확히 입력해주세요.')
  }

  if (!/^\d{5}$/.test(studentId.value.trim())) {
    return alert('학번은 5자리 숫자로 입력해주세요. (예: 10401)')
  }
  
  isSubmitting.value = true

  try {
    const docRef = doc(db, 'studyApplications', studentId.value)
    
    if (!isUpdating.value) {
      const docSnap = await getDoc(docRef)
      if (docSnap.exists()) {
        if (!confirm('기존 신청 내역이 있습니다. 새로운 내용으로 덮어쓰시겠습니까?\n(내 신청내역 조회를 통해 기존 내용을 먼저 확인하실 수 있습니다)')) {
          isSubmitting.value = false
          return
        }
      }
    }

    const room = getRoom(studentId.value)

    await setDoc(docRef, {
      studentId: studentId.value,
      name: name.value,
      room: room,
      selection: selection.value,
      updatedAt: new Date().toISOString()
    })

    alert(`✅ 성공적으로 저장되었습니다!\n${room !== '미배정' ? `(배정 교실: ${room})` : ''}`)
    isUpdating.value = true
  } catch (error) {
    console.error("신청 저장 에러:", error)
    alert('오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="apply-view animate-fade-in-up">
    <!-- Header -->
    <header class="header glass-panel">
      <h1>📝 자율학습 신청</h1>
      <p>참여할 요일과 시간을 정확히 체크해주세요.</p>
    </header>

    <main class="content">
      <!-- User Info Card -->
      <section class="card mb-6">
        <div class="input-group">
          <label>학번</label>
          <input v-model="studentId" type="text" placeholder="예: 10401" />
        </div>
        <div class="input-group">
          <label>이름</label>
          <input v-model="name" type="text" placeholder="예: 홍길동" />
        </div>
        <button @click="fetchMyApplication" :disabled="isChecking" class="btn-secondary mt-4">
          <span v-if="isChecking" class="spinner"></span>
          <span v-else>🔍 내 신청내역 조회</span>
        </button>
      </section>

      <!-- Selection Grid -->
      <section class="card mb-6 selection-card">
        <div class="grid-header">
          <div class="grid-cell empty"></div>
          <div v-for="p in periods" :key="p" class="grid-cell header-cell">{{ p }}</div>
        </div>
        
        <div v-for="day in days" :key="day" class="grid-row">
          <div class="grid-cell day-cell">{{ day }}요일</div>
          <div v-for="p in periods" :key="p" class="grid-cell">
            <label class="custom-checkbox">
              <input type="checkbox" v-model="selection[`${day}${p}`]" />
              <span class="checkmark"></span>
            </label>
          </div>
        </div>
      </section>

      <!-- Submit Button -->
      <button 
        @click="handleApply" 
        :disabled="isSubmitting"
        class="btn-primary"
      >
        <span v-if="isSubmitting" class="spinner"></span>
        <span v-else>{{ isUpdating ? '✅ 내용 수정하기' : '✨ 신청 완료하기' }}</span>
      </button>
    </main>
  </div>
</template>

<style scoped>
.apply-view {
  padding: 16px;
  padding-top: 24px;
}

.header {
  text-align: center;
  padding: 24px 16px;
  margin-bottom: 24px;
  background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
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

.input-group {
  margin-bottom: 16px;
}

.input-group:last-child {
  margin-bottom: 0;
}

.input-group label {
  display: block;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text-main);
  font-size: 0.9rem;
}

/* Custom Grid for Schedule */
.selection-card {
  padding: 16px 8px;
  overflow: hidden;
}

.grid-header {
  display: flex;
  border-bottom: 2px solid var(--border);
  padding-bottom: 12px;
  margin-bottom: 12px;
}

.grid-row {
  display: flex;
  margin-bottom: 8px;
  padding: 8px 0;
  border-radius: var(--radius-md);
  transition: background 0.2s;
}

.grid-row:hover {
  background: rgba(79, 70, 229, 0.05);
}

.grid-cell {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.grid-cell.empty {
  flex: 0.8;
}

.header-cell {
  font-weight: 700;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.day-cell {
  flex: 0.8;
  font-weight: 900;
  color: var(--text-main);
  background: rgba(0,0,0,0.02);
  border-radius: var(--radius-sm);
  padding: 8px;
}

/* Custom Checkbox */
.custom-checkbox {
  position: relative;
  width: 32px;
  height: 32px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.custom-checkbox input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.checkmark {
  position: absolute;
  top: 0;
  left: 0;
  height: 32px;
  width: 32px;
  background-color: var(--background);
  border: 2px solid var(--border);
  border-radius: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.custom-checkbox:hover input ~ .checkmark {
  border-color: var(--primary);
}

.custom-checkbox input:checked ~ .checkmark {
  background-color: var(--primary);
  border-color: var(--primary);
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
}

.checkmark:after {
  content: "";
  position: absolute;
  display: none;
}

.custom-checkbox input:checked ~ .checkmark:after {
  display: block;
}

.custom-checkbox .checkmark:after {
  left: 10px;
  top: 5px;
  width: 6px;
  height: 14px;
  border: solid white;
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
}
</style>
