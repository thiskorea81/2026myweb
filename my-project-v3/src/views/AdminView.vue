<script setup>
import { ref, computed } from 'vue'
import { collection, getDocs, doc, deleteDoc, setDoc, getDoc, writeBatch, addDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getRoom } from '../utils/roomUtils'
import StudySeatGrid from '../components/StudySeatGrid.vue'

const isAdminAuth = ref(false)
const isSuperAdmin = ref(false)
const inputId = ref('')
const inputPw = ref('')

const applications = ref([])
const isLoading = ref(false)

const currentTab = ref('전체')
const viewMode = ref('grid')

const getInitialDay = () => {
  const d = new Date().getDay()
  if (d === 1) return '월'
  if (d === 2) return '화'
  if (d === 3 || d === 4) return '목'
  if (d === 5) return '금'
  return '월'
}

const getInitialPeriod = () => {
  const now = new Date()
  const time = now.getHours() * 100 + now.getMinutes()
  if (time < 1830) return '8'
  if (time < 2030) return '야1'
  return '야2'
}

const currentDay = ref(getInitialDay())
const currentCheckPeriod = ref(getInitialPeriod())
const tabs = computed(() => {
  const base = ['전체', '1반', '2반', '3반', '4반', '5반', '0타임', '결석 리포트']
  if (isSuperAdmin.value) base.push('과거 보관함')
  return base
})

const archivedData = ref([])
const archivedMonths = ref([])
const selectedArchiveMonth = ref('')
const isArchiving = ref(false)

const reportClassFilter = ref('전체')

const getClassFromId = (studentId) => {
  const id = String(studentId)
  if (id.length === 5) return id[2]
  if (id.length === 4) return id[1]
  return '?'
}

const getLocalYYYYMMDD = (date) => {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const todayStr = getLocalYYYYMMDD(new Date())
const todayAttendance = ref({})
const todayAbsenceReasons = ref({})

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)
const reportDate = ref(getLocalYYYYMMDD(yesterday))
const reportAttendance = ref({})
const dailyAbsenceReasons = ref({}) // Store reasons by studentId

const fetchTodayAttendance = async () => {
  try {
    const docSnap = await getDoc(doc(db, 'studyAttendance', todayStr))
    if (docSnap.exists()) {
      todayAttendance.value = docSnap.data().absences || {}
    } else {
      todayAttendance.value = {}
    }

    const reasonsSnap = await getDocs(collection(db, 'studyAbsenceReasons'))
    const reasonsMap = {}
    reasonsSnap.docs.forEach(d => {
      const data = d.data()
      if (data.date === todayStr) {
        reasonsMap[data.studentId] = data
      }
    })
    todayAbsenceReasons.value = reasonsMap
  } catch (error) {
    console.error("오늘 결석 데이터 로드 에러:", error)
  }
}

const fetchReportAttendance = async () => {
  try {
    const docSnap = await getDoc(doc(db, 'studyAttendance', reportDate.value))
    if (docSnap.exists()) {
      reportAttendance.value = docSnap.data().absences || {}
    } else {
      reportAttendance.value = {}
    }

    // Fetch absence reasons for the reportDate
    const reasonsSnap = await getDocs(collection(db, 'studyAbsenceReasons'))
    const reasonsMap = {}
    reasonsSnap.docs.forEach(d => {
      const data = d.data()
      if (data.date === reportDate.value) {
        reasonsMap[data.studentId] = data
      }
    })
    dailyAbsenceReasons.value = reasonsMap
  } catch (error) {
    console.error("리포트 결석 데이터 로드 에러:", error)
  }
}

const toggleAbsence = async (studentId, period) => {
  try {
    const studentAbsences = todayAttendance.value[studentId] || []
    let newList = [...studentAbsences]
    
    if (newList.includes(period)) {
      newList = newList.filter(p => p !== period)
    } else {
      newList.push(period)
    }
    
    const order = { '8': 1, '야1': 2, '야2': 3 }
    newList.sort((a, b) => order[a] - order[b])

    const updatedAbsences = { ...todayAttendance.value }
    if (newList.length === 0) {
      delete updatedAbsences[studentId]
    } else {
      updatedAbsences[studentId] = newList
    }
    
    await setDoc(doc(db, 'studyAttendance', todayStr), {
      absences: updatedAbsences
    }, { merge: true })
    
    todayAttendance.value = updatedAbsences
  } catch (error) {
    alert('결석 상태 변경에 실패했습니다.')
  }
}

const handleAdminLogin = () => {
  if (inputId.value === 'admin' && inputPw.value === 'admin') {
    isAdminAuth.value = true
    isSuperAdmin.value = false
    fetchApplications()
  } else if (inputId.value === 'admin' && inputPw.value === 'admin2026') {
    isAdminAuth.value = true
    isSuperAdmin.value = true
    fetchApplications()
  } else {
    alert('아이디 또는 비밀번호가 일치하지 않습니다.')
    inputId.value = ''
    inputPw.value = ''
  }
}

const fetchApplications = async () => {
  isLoading.value = true
  try {
    const snap = await getDocs(collection(db, 'studyApplications'))
    const data = snap.docs.map(d => {
      const appData = d.data()
      let studentId = String(appData.studentId).trim()
      
      if (studentId.length === 4) {
        studentId = studentId[0] + '0' + studentId.substring(1)
      }

      let room = appData.room || getRoom(studentId)
      if (room.endsWith('반실')) {
        room = room.replace('반실', '반')
      }
      const timeCount = Object.values(appData.selection || {}).filter(v => v).length
      
      return { id: d.id, ...appData, studentId, room, timeCount }
    })
    
    data.sort((a, b) => {
      const idA = parseInt(a.studentId, 10) || 0
      const idB = parseInt(b.studentId, 10) || 0
      return idA - idB
    })
    
    const activeData = data.filter(app => app.timeCount > 0)
    let overflowQueue = []
    const roomCounts = { '1반': 0, '2반': 0, '3반': 0, '4반': 0, '5반': 0 }
    const roomLimits = { '1반': 30, '2반': 32, '3반': 32, '4반': 30, '5반': 30 }
    
    activeData.forEach(app => {
      if (app.room !== '미배정' && roomCounts[app.room] < roomLimits[app.room]) {
        roomCounts[app.room]++
      } else {
        overflowQueue.push(app)
      }
    })
    
    overflowQueue.forEach(app => {
      let assigned = false
      for (const room of ['1반', '2반', '3반', '4반', '5반']) {
        if (roomCounts[room] < roomLimits[room]) {
          app.room = room
          roomCounts[room]++
          assigned = true
          break
        }
      }
      if (!assigned) app.room = '배정불가(초과)'
    })
    
    applications.value = data
    await fetchTodayAttendance()
    await fetchReportAttendance()
  } catch (error) {
    console.error("데이터 로드 에러:", error)
  } finally {
    isLoading.value = false
  }
}

const filteredApplications = computed(() => {
  if (currentTab.value === '결석 리포트') {
    const absentApps = applications.value.filter(app => reportAttendance.value[app.studentId])
    if (reportClassFilter.value === '전체') return absentApps
    return absentApps.filter(app => getClassFromId(app.studentId) === reportClassFilter.value)
  }
  
  if (currentTab.value === '0타임') {
    return applications.value.filter(app => app.timeCount === 0)
  }
  
  const activeApps = applications.value.filter(app => app.timeCount > 0)
  if (currentTab.value === '전체') return activeApps
  return activeApps.filter(app => app.room === currentTab.value)
})

const deleteRecord = async (id) => {
  if (!confirm('이 학생의 신청 내역을 삭제하시겠습니까?')) return
  try {
    await deleteDoc(doc(db, 'studyApplications', id))
    fetchApplications() 
  } catch (error) {
    alert('삭제 중 오류가 발생했습니다.')
  }
}

const changeReportClass = (cls) => {
  reportClassFilter.value = cls
}

const handleTabChange = (tab) => {
  currentTab.value = tab
  if (tab === '과거 보관함') fetchArchived()
}

const archiveData = async () => {
  if (applications.value.length === 0) {
    alert('보관할 신청 데이터가 없습니다.')
    return
  }
  const now = new Date()
  const defaultLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const archiveName = prompt(
    `이번 보관 데이터의 이름을 입력해 주세요.\n(예: 2026-04, 2026년 4월)\n기본값: ${defaultLabel}`,
    defaultLabel
  )
  if (archiveName === null) return
  const label = archiveName.trim() || defaultLabel

  if (!confirm(`"${label}" 이름으로 현재 신청 데이터(${applications.value.length}건)를 보관하고\n신청 목록을 초기화합니다. 계속하시겠습니까?`)) return

  isArchiving.value = true
  try {
    const chunks = []
    for (let i = 0; i < applications.value.length; i += 400) {
      chunks.push(applications.value.slice(i, i + 400))
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db)
      chunk.forEach(app => {
        const archiveRef = doc(db, 'archivedStudyApplications', `${label}_${app.studentId}`)
        batch.set(archiveRef, { ...app, archiveName: label, archivedAt: new Date().toISOString() })
        const origRef = doc(db, 'studyApplications', app.id)
        batch.delete(origRef)
      })
      await batch.commit()
    }
    alert(`"${label}" 데이터를 보관했습니다. 신청 목록이 초기화되었습니다.`)
    await fetchApplications()
  } catch (error) {
    console.error('아카이브 오류:', error)
    alert('데이터 보관 중 오류가 발생했습니다.')
  } finally {
    isArchiving.value = false
  }
}

const fetchArchived = async () => {
  isLoading.value = true
  try {
    const snap = await getDocs(collection(db, 'archivedStudyApplications'))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const months = [...new Set(data.map(d => d.archiveName).filter(Boolean))].sort().reverse()
    archivedMonths.value = months
    if (!selectedArchiveMonth.value && months.length > 0) {
      selectedArchiveMonth.value = months[0]
    }
    archivedData.value = data
  } catch (error) {
    console.error('보관함 로드 오류:', error)
  } finally {
    isLoading.value = false
  }
}

const filteredArchived = computed(() => {
  if (!selectedArchiveMonth.value) return archivedData.value
  return archivedData.value
    .filter(d => d.archiveName === selectedArchiveMonth.value)
    .sort((a, b) => (parseInt(a.studentId) || 0) - (parseInt(b.studentId) || 0))
})

const restoreArchive = async () => {
  if (filteredArchived.value.length === 0) {
    alert('복구할 데이터가 없습니다.')
    return
  }
  if (!confirm(`"${selectedArchiveMonth.value}" 데이터(${filteredArchived.value.length}건)를 현재 신청 목록으로 복구합니다.\n기존에 있던 신청 데이터가 있다면 덮어씁니다. 계속하시겠습니까?`)) return

  isArchiving.value = true
  try {
    const chunks = []
    for (let i = 0; i < filteredArchived.value.length; i += 400) {
      chunks.push(filteredArchived.value.slice(i, i + 400))
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db)
      chunk.forEach(item => {
        const { id, archiveName, archivedAt, ...restData } = item
        const restoreRef = doc(db, 'studyApplications', item.studentId)
        batch.set(restoreRef, { ...restData, restoredFrom: archiveName, restoredAt: new Date().toISOString() })
        const archiveRef = doc(db, 'archivedStudyApplications', item.id)
        batch.delete(archiveRef)
      })
      await batch.commit()
    }
    alert(`"${selectedArchiveMonth.value}" 데이터를 성공적으로 복구했습니다.`)
    await fetchArchived()
    await fetchApplications()
    currentTab.value = '전체'
  } catch (error) {
    console.error('복구 오류:', error)
    alert('복구 중 오류가 발생했습니다.')
  } finally {
    isArchiving.value = false
  }
}

const downloadCSV = () => {
  const dataToExport = currentTab.value === '전체' ? applications.value : filteredApplications.value
  if (dataToExport.length === 0) return alert('다운로드할 데이터가 없습니다.')
  
  const isReport = currentTab.value === '결석 리포트'
  const header = ['배정교실', '학번', '이름']
  if (isReport) header.push('결석시간')
  else header.push('월8', '월야1', '월야2', '화8', '화야1', '화야2', '목8', '목야1', '목야2', '금8', '금야1', '금야2')
  
  let csvContent = '\uFEFF' + header.join(',') + '\n'
  const keys = ['월8', '월야1', '월야2', '화8', '화야1', '화야2', '목8', '목야1', '목야2', '금8', '금야1', '금야2']

  dataToExport.forEach(item => {
    const row = [item.room, item.studentId, item.name]
    if (isReport) {
      const absentTimes = (reportAttendance.value[item.studentId] || []).join(', ')
      row.push(`"${absentTimes}"`)
    } else {
      keys.forEach(k => row.push(item.selection && item.selection[k] ? '1' : ''))
    }
    csvContent += row.join(',') + '\n'
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `자율학습_${currentTab.value}_${new Date().toLocaleDateString()}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <div class="admin-view animate-fade-in-up">
    <!-- Login Screen -->
    <div v-if="!isAdminAuth" class="login-container">
      <div class="card login-card animate-fade-in-up">
        <div class="icon">🔒</div>
        <h2>관리자 로그인</h2>
        <div class="input-group">
          <input v-model="inputId" type="text" placeholder="아이디" @keyup.enter="handleAdminLogin" />
        </div>
        <div class="input-group mt-4">
          <input v-model="inputPw" type="password" placeholder="비밀번호" @keyup.enter="handleAdminLogin" />
        </div>
        <button @click="handleAdminLogin" class="btn-primary mt-6">접속하기</button>
      </div>
    </div>

    <!-- Dashboard -->
    <div v-else class="dashboard">
      <header class="admin-header">
        <div class="header-content">
          <h2>📊 자율학습 관리</h2>
          <p>총 <span class="highlight">{{ filteredApplications.length }}</span>명 ({{ currentTab }})</p>
        </div>
        <div class="header-actions">
          <button v-if="isSuperAdmin" @click="archiveData" :disabled="isArchiving" class="action-btn highlight-bg">
            {{ isArchiving ? '보관 중...' : '📦 보관' }}
          </button>
          <button @click="fetchApplications" class="action-btn">🔄 새로고침</button>
          <button @click="downloadCSV" class="action-btn outline">⬇️ CSV</button>
        </div>
      </header>

      <!-- Select Dropdown Tabs -->
      <div class="select-container mb-4">
        <select v-model="currentTab" @change="handleTabChange(currentTab)" class="tab-select">
          <option v-for="tab in tabs" :key="tab" :value="tab">{{ tab }}</option>
        </select>
      </div>

      <!-- Toolbar (Filters / Views) -->
      <div class="toolbar glass-panel mb-4" v-if="['1반', '2반', '3반', '4반', '5반'].includes(currentTab)">
        <div class="view-toggle">
          <button @click="viewMode = 'list'" :class="['toggle-btn', viewMode === 'list' ? 'active' : '']">📋 명단</button>
          <button @click="viewMode = 'grid'" :class="['toggle-btn', viewMode === 'grid' ? 'active' : '']">🪑 배치도</button>
        </div>

        <div v-if="viewMode === 'grid'" class="grid-filters mt-4">
          <div class="filter-group">
            <span class="label">요일</span>
            <div class="btn-group">
              <button v-for="day in ['월', '화', '목', '금']" :key="day" @click="currentDay = day" :class="['mini-btn', currentDay === day ? 'active' : '']">{{ day }}</button>
            </div>
          </div>
          <div class="filter-group mt-2">
            <span class="label">시간</span>
            <div class="btn-group">
              <button @click="currentCheckPeriod = '8'" :class="['mini-btn', currentCheckPeriod === '8' ? 'active' : '']">8</button>
              <button @click="currentCheckPeriod = '야1'" :class="['mini-btn', currentCheckPeriod === '야1' ? 'active' : '']">야1</button>
              <button @click="currentCheckPeriod = '야2'" :class="['mini-btn', currentCheckPeriod === '야2' ? 'active' : '']">야2</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Report Filter -->
      <div v-if="currentTab === '결석 리포트'" class="report-filters mb-4 card">
        <div class="input-group">
          <label>📅 조회 날짜</label>
          <input type="date" v-model="reportDate" @change="fetchReportAttendance" />
        </div>
        <div class="class-filters mt-4">
          <button
            v-for="cls in ['전체', '1', '2', '3', '4', '5', '6', '7', '8', '9']"
            :key="cls"
            @click="changeReportClass(cls)"
            :class="['class-btn', reportClassFilter === cls ? 'active' : '']"
          >
            {{ cls === '전체' ? '전체' : cls + '반' }}
          </button>
        </div>
      </div>

      <!-- Archive Filter -->
      <div v-if="currentTab === '과거 보관함'" class="report-filters mb-4 card">
        <div class="input-group">
          <label>📦 보관 시점 선택</label>
          <select v-model="selectedArchiveMonth" class="archive-select">
            <option v-for="m in archivedMonths" :key="m" :value="m">{{ m }}</option>
            <option v-if="archivedMonths.length === 0" value="">데이터 없음</option>
          </select>
        </div>
        <button 
          @click="restoreArchive" 
          :disabled="isArchiving || filteredArchived.length === 0" 
          class="btn-primary mt-4"
        >
          {{ isArchiving ? '처리 중...' : '↩️ 이 데이터를 현재로 복구' }}
        </button>
      </div>

      <!-- Main Content Area -->
      <div v-if="isLoading" class="loading-state">
        <span class="spinner dark"></span>
        <p>데이터 로드 중...</p>
      </div>

      <div v-else>
        <template v-if="currentTab === '과거 보관함'">
          <div class="list-container">
            <div v-if="filteredArchived.length === 0" class="empty-state">
              보관된 데이터가 없습니다.
            </div>
            
            <div v-for="item in filteredArchived" :key="item.id" class="student-card">
              <div class="card-header">
                <span class="room-badge">{{ item.room }}</span>
                <span class="time-badge">{{ item.timeCount }}타임</span>
              </div>
              <div class="card-body">
                <div class="student-info">
                  <span class="id">{{ item.studentId }}</span>
                  <span class="name">{{ item.name }}</span>
                </div>
                <div class="absent-info mt-2">
                  <span style="font-size: 0.75rem; color: var(--text-muted);">보관일시: {{ new Date(item.archivedAt).toLocaleString() }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="viewMode === 'grid' && ['1반', '2반', '3반', '4반', '5반'].includes(currentTab)">
          <StudySeatGrid 
            :roomName="currentTab" 
            :students="filteredApplications" 
            :todayAttendance="todayAttendance"
            :todayAbsenceReasons="todayAbsenceReasons"
            :currentDay="currentDay"
            :currentPeriod="currentCheckPeriod"
            @toggle-absence="toggleAbsence($event, currentCheckPeriod)"
          />
        </template>
        
        <template v-else>
          <div class="list-container">
            <div v-if="filteredApplications.length === 0" class="empty-state">
              조회된 학생이 없습니다.
            </div>
            
            <!-- Mobile Optimized Cards -->
            <div v-for="app in filteredApplications" :key="app.id" class="student-card">
              <div class="card-header">
                <span class="room-badge">{{ app.room }}</span>
                <span class="time-badge" v-if="currentTab !== '결석 리포트'">{{ app.timeCount }}타임</span>
              </div>
              <div class="card-body">
                <div class="student-info">
                  <span class="id">{{ app.studentId }}</span>
                  <span class="name">{{ app.name }}</span>
                </div>
                
                <div v-if="currentTab === '결석 리포트'" class="absent-info">
                  <div class="absent-badge-container">
                    <span class="absent-badge">결석: {{ (reportAttendance[app.studentId] || []).join(', ') }}</span>
                  </div>
                  
                  <div v-if="dailyAbsenceReasons[app.studentId]" class="reason-box mt-4">
                    <div class="reason-header">📝 학생 제출 사유</div>
                    <p class="reason-text"><strong>사유:</strong> {{ dailyAbsenceReasons[app.studentId].reason }}</p>
                    <p class="reason-text"><strong>시간:</strong> {{ dailyAbsenceReasons[app.studentId].periods.join(', ') }}</p>
                    <p v-if="dailyAbsenceReasons[app.studentId].note" class="reason-text note"><strong>메모:</strong> {{ dailyAbsenceReasons[app.studentId].note }}</p>
                  </div>
                </div>
              </div>
              
              <div class="card-footer">
                <div v-if="currentTab !== '결석 리포트'" class="attendance-checks">
                  <button @click="toggleAbsence(app.studentId, '8')" :class="['check-btn', (todayAttendance[app.studentId] || []).includes('8') ? 'checked' : '']">8</button>
                  <button @click="toggleAbsence(app.studentId, '야1')" :class="['check-btn', (todayAttendance[app.studentId] || []).includes('야1') ? 'checked' : '']">야1</button>
                  <button @click="toggleAbsence(app.studentId, '야2')" :class="['check-btn', (todayAttendance[app.studentId] || []).includes('야2') ? 'checked' : '']">야2</button>
                </div>
                
                <button v-if="isSuperAdmin" @click="deleteRecord(app.id)" class="delete-btn">삭제</button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-view {
  padding: 16px;
  min-height: 100vh;
}

.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 80vh;
}

.login-card {
  width: 100%;
  max-width: 360px;
  text-align: center;
}

.login-card .icon {
  font-size: 3rem;
  margin-bottom: 16px;
}

.login-card h2 {
  margin-bottom: 24px;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-content h2 {
  font-size: 1.5rem;
  margin-bottom: 4px;
}

.header-content p {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.highlight {
  color: var(--primary);
  font-weight: 900;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 8px 12px;
  background: var(--surface);
  border: none;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 700;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.action-btn.outline {
  border: 1px solid var(--border);
}

/* Select Tab */
.select-container {
  padding: 0 4px;
}

.tab-select {
  width: 100%;
  padding: 12px 16px;
  font-size: 1rem;
  font-weight: 700;
  color: var(--primary);
  background-color: var(--surface);
  border: 2px solid var(--primary);
  border-radius: var(--radius-md);
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234F46E5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 16px center;
  background-size: 1em;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.tab-select:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2);
}

/* Toolbar */
.toolbar {
  padding: 12px;
}

.view-toggle {
  display: flex;
  background: var(--background);
  padding: 4px;
  border-radius: var(--radius-sm);
}

.toggle-btn {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.toggle-btn.active {
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.grid-filters {
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-group .label {
  font-size: 0.8rem;
  font-weight: 900;
}

.btn-group {
  display: flex;
  gap: 4px;
}

.mini-btn {
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
}

.mini-btn.active {
  background: var(--secondary);
  color: white;
  border-color: var(--secondary);
}

.highlight-bg {
  background: var(--warning);
  color: #78350F;
  border-color: #FCD34D;
}

/* Report Filters & Archive */
.class-filters {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.class-btn {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 700;
  border: 1px solid var(--border);
  background: var(--surface);
  white-space: nowrap;
}

.class-btn.active {
  background: var(--danger);
  color: white;
  border-color: var(--danger);
}

.archive-select {
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 0.9rem;
  margin-top: 4px;
}

/* List Container & Cards */
.list-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
}

.student-card {
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

.card-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.room-badge {
  background: var(--background);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 900;
}

.time-badge {
  background: rgba(79, 70, 229, 0.1);
  color: var(--primary);
  padding: 4px 8px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 900;
}

.student-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.student-info .id {
  font-weight: 700;
  color: var(--text-muted);
}

.student-info .name {
  font-size: 1.1rem;
  font-weight: 900;
  color: var(--text-main);
}

.absent-badge-container {
  margin-bottom: 8px;
}

.absent-badge {
  background: #FEE2E2;
  color: #991B1B;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  display: inline-block;
}

.reason-box {
  background: #F0FDF4; /* Green 50 */
  border: 1px solid #BBF7D0; /* Green 200 */
  padding: 12px;
  border-radius: var(--radius-sm);
}

.reason-header {
  font-size: 0.75rem;
  font-weight: 900;
  color: #166534; /* Green 800 */
  margin-bottom: 4px;
}

.reason-text {
  font-size: 0.8rem;
  color: #14532D; /* Green 900 */
  margin-bottom: 2px;
}

.reason-text.note {
  color: #166534;
  font-style: italic;
  margin-top: 4px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.attendance-checks {
  display: flex;
  gap: 8px;
}

.check-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  font-weight: 900;
  font-size: 0.8rem;
  color: var(--text-muted);
  transition: all 0.2s;
}

.check-btn.checked {
  background: var(--danger);
  color: white;
  border-color: var(--danger);
}

.counsel-btn {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 700;
  border: 1px solid var(--border);
  background: var(--surface);
}

.counsel-btn.done {
  background: #D1FAE5;
  color: #065F46;
  border-color: #A7F3D0;
}

.delete-btn {
  padding: 6px 10px;
  border: none;
  background: #FEF2F2;
  color: #DC2626;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 700;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px dashed var(--border);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--text-muted);
}

.spinner.dark {
  border-top-color: var(--primary);
  margin-bottom: 16px;
}
</style>
