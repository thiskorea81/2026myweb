<script setup>
import { ref, computed } from 'vue'
import { collection, getDocs, doc, deleteDoc, setDoc, getDoc, writeBatch, addDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getRoom } from '../utils/roomUtils'
import StudySeatGrid from '../components/StudySeatGrid.vue'

const isAdminAuth = ref(false)
const isSuperAdmin = ref(false)  // 슈퍼관리자 여부 (보관/복구/삭제 권한)
const inputId = ref('')
const inputPw = ref('')

const applications = ref([])
const isLoading = ref(false)

const currentTab = ref('전체')
const viewMode = ref('list')

const getInitialDay = () => {
  const d = new Date().getDay()
  if (d >= 1 && d <= 5) return ['월', '화', '수', '목', '금'][d - 1]
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
// 탭은 슈퍼관리자일 때만 '과거 보관함' 포함
const tabs = computed(() => {
  const base = ['전체', '1반실', '2반실', '3반실', '4반실', '5반실', '미배정', '0타임', '결석 리포트', '📝 결석사유 관리']
  if (isSuperAdmin.value) base.push('📦 과거 보관함')
  return base
})

// 아카이브 관련 상태
const archivedData = ref([])        // 과거 보관함 데이터
const archivedMonths = ref([])      // 보관된 월 목록 (드롭다운)
const selectedArchiveMonth = ref('')
const isArchiving = ref(false)

// 결석 리포트 반별 필터 (실제 학급, 1~9반)
const reportClassFilter = ref('전체')
const reportRoomFilter = ref('전체')

// 학생 결석 사유 신청 관리
const absenceReasons = ref([])
const absenceReasonDate = ref(new Date().toISOString().split('T')[0])
const isLoadingReasons = ref(false)

const fetchAbsenceReasons = async () => {
  isLoadingReasons.value = true
  try {
    const snap = await getDocs(collection(db, 'studyAbsenceReasons'))
    absenceReasons.value = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
  } catch (e) {
    console.error('결석 사유 로드 오류:', e)
  } finally {
    isLoadingReasons.value = false
  }
}

const filteredReasons = computed(() => {
  if (!absenceReasonDate.value) return absenceReasons.value
  return absenceReasons.value.filter(r => r.date === absenceReasonDate.value)
})

const pendingCount = computed(() =>
  absenceReasons.value.filter(r => !r.confirmed).length
)

const confirmReason = async (reasonDoc) => {
  try {
    await updateDoc(doc(db, 'studyAbsenceReasons', reasonDoc.id), { confirmed: true })
    const idx = absenceReasons.value.findIndex(r => r.id === reasonDoc.id)
    if (idx !== -1) absenceReasons.value[idx].confirmed = true
  } catch (e) {
    alert('확정 실패')
  }
}

const updateTeacherNote = async (reasonDoc, note) => {
  try {
    await updateDoc(doc(db, 'studyAbsenceReasons', reasonDoc.id), { teacherNote: note })
    const idx = absenceReasons.value.findIndex(r => r.id === reasonDoc.id)
    if (idx !== -1) absenceReasons.value[idx].teacherNote = note
  } catch (e) {
    console.error('비고 저장 실패:', e)
  }
}

// 학번에서 실제 학급 번호 추출 (5자리: 10401 → 4반, 10301 → 3반)
const getClassFromId = (studentId) => {
  const id = String(studentId)
  if (id.length === 5) return id[2]   // 3번째 자리 = 학급
  if (id.length === 4) return id[1]   // 4자리 패턴 호환
  return '?'
}

// 결석 학생에 상담 로그 저장
const savingCounsel = ref(false)
const savedStudentIds = ref(new Set())

const saveCounselForAbsent = async (app) => {
  if (savingCounsel.value) return
  const absentTimes = (reportAttendance.value[app.studentId] || []).join(', ')
  const content = `[자율학습 결석] ${reportDate.value} - ${absentTimes} 결석`
  try {
    savingCounsel.value = true
    await addDoc(collection(db, 'counselingLogs'), {
      studentId: app.studentId,
      date: reportDate.value,
      content,
      createdAt: new Date()
    })
    savedStudentIds.value = new Set([...savedStudentIds.value, app.studentId])
  } catch (e) {
    alert('상담 기록 저장에 실패했습니다.')
  } finally {
    savingCounsel.value = false
  }
}

const changeReportClass = (cls) => {
  reportClassFilter.value = cls
  savedStudentIds.value = new Set()
}

const getLocalYYYYMMDD = (date) => {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const todayStr = getLocalYYYYMMDD(new Date())
const todayAttendance = ref({})

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)
const reportDate = ref(getLocalYYYYMMDD(yesterday))
const reportAttendance = ref({})

const fetchTodayAttendance = async () => {
  try {
    const docSnap = await getDoc(doc(db, 'studyAttendance', todayStr))
    if (docSnap.exists()) {
      todayAttendance.value = docSnap.data().absences || {}
    } else {
      todayAttendance.value = {}
    }
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
    // 일반 선생님 - 출결 체크만 가능
    isAdminAuth.value = true
    isSuperAdmin.value = false
    fetchApplications()
  } else if (inputId.value === 'admin' && inputPw.value === 'admin2026') {
    // 슈퍼관리자 - 보관/복구/삭제 기능 포함
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
      
      // 4자리 학번을 5자리로 통일하여 표시 (예: 1401 -> 10401)
      if (studentId.length === 4) {
        studentId = studentId[0] + '0' + studentId.substring(1)
      }

      const room = appData.room || getRoom(studentId)
      const timeCount = Object.values(appData.selection || {}).filter(v => v).length
      
      return { id: d.id, ...appData, studentId, room, timeCount }
    })
    
    // 학번 순으로 오름차순 정렬 (관리 편의성을 위함)
    data.sort((a, b) => {
      const idA = parseInt(a.studentId, 10) || 0
      const idB = parseInt(b.studentId, 10) || 0
      return idA - idB
    })
    
    // 교실 수용 인원 초과 시 4/5반실로 동적 할당 로직
    const activeData = data.filter(app => app.timeCount > 0)
    let overflowQueue = []
    const roomCounts = { '1반실': 0, '2반실': 0, '3반실': 0 }
    const roomLimits = { '1반실': 30, '2반실': 32, '3반실': 32 }
    
    activeData.forEach(app => {
      if (roomCounts[app.room] !== undefined) {
        if (roomCounts[app.room] < roomLimits[app.room]) {
          roomCounts[app.room]++
        } else {
          overflowQueue.push(app)
        }
      }
    })
    
    let count4 = 0
    let count5 = 0
    overflowQueue.forEach(app => {
      if (count4 < 30) {
        app.room = '4반실'
        count4++
      } else if (count5 < 30) {
        app.room = '5반실'
        count5++
      } else {
        app.room = '미배정'
      }
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

// 현재 신청 데이터를 보관(아카이브)하고 초기화
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
  if (archiveName === null) return  // 취소
  const label = archiveName.trim() || defaultLabel

  if (!confirm(`"${label}" 이름으로 현재 신청 데이터(${applications.value.length}건)를 보관하고\n신청 목록을 초기화합니다. 계속하시겠습니까?`)) return

  isArchiving.value = true
  try {
    // Firestore writeBatch로 한 번에 처리 (최대 500건)
    const chunks = []
    for (let i = 0; i < applications.value.length; i += 400) {
      chunks.push(applications.value.slice(i, i + 400))
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db)
      chunk.forEach(app => {
        // archivedStudyApplications에 복사
        const archiveRef = doc(db, 'archivedStudyApplications', `${label}_${app.studentId}`)
        batch.set(archiveRef, { ...app, archiveName: label, archivedAt: new Date().toISOString() })
        // 원본 삭제
        const origRef = doc(db, 'studyApplications', app.id)
        batch.delete(origRef)
      })
      await batch.commit()
    }
    alert(`"${label}" 데이터를 보관했습니다. 신청 목록이 초기화되었습니다.`)
    await fetchApplications()
  } catch (error) {
    console.error('아카이브 오류:', error)
    alert('데이터 보관 중 오류가 발생했습니다. 일부 데이터가 남아있을 수 있습니다.')
  } finally {
    isArchiving.value = false
  }
}

// 과거 보관함 데이터 불러오기
const fetchArchived = async () => {
  isLoading.value = true
  try {
    const snap = await getDocs(collection(db, 'archivedStudyApplications'))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    // 월별 목록 추출
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

// 현재 선택된 월의 보관 데이터
const filteredArchived = computed(() => {
  if (!selectedArchiveMonth.value) return archivedData.value
  return archivedData.value
    .filter(d => d.archiveName === selectedArchiveMonth.value)
    .sort((a, b) => (parseInt(a.studentId) || 0) - (parseInt(b.studentId) || 0))
})

// 탭 변경 시 과거 보관함 자동 로드
const handleTabChange = (tab) => {
  currentTab.value = tab
  if (tab === '📦 과거 보관함') fetchArchived()
}

// 보관 데이터를 현재 신청 목록으로 복구
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
        // studyApplications 에 복원 (학번을 ID로)
        const { id, archiveName, archivedAt, ...restData } = item
        const restoreRef = doc(db, 'studyApplications', item.studentId)
        batch.set(restoreRef, { ...restData, restoredFrom: archiveName, restoredAt: new Date().toISOString() })
        // 보관함에서 삭제
        const archiveRef = doc(db, 'archivedStudyApplications', item.id)
        batch.delete(archiveRef)
      })
      await batch.commit()
    }
    alert(`"${selectedArchiveMonth.value}" 데이터를 성공적으로 복구했습니다.`)
    await fetchArchived()
    await fetchApplications()
    handleTabChange('전체')
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
  if (isReport) {
    header.push('결석시간')
  } else {
    header.push('월8', '월야1', '월야2', '화8', '화야1', '화야2', '목8', '목야1', '목야2', '금8', '금야1', '금야2')
  }
  
  let csvContent = '\uFEFF' + header.join(',') + '\n'

  const keys = ['월8', '월야1', '월야2', '화8', '화야1', '화야2', '목8', '목야1', '목야2', '금8', '금야1', '금야2']

  dataToExport.forEach(item => {
    const row = [item.room, item.studentId, item.name]
    if (isReport) {
      const absentTimes = (reportAttendance.value[item.studentId] || []).join(', ')
      row.push(`"${absentTimes}"`)
    } else {
      keys.forEach(k => {
        row.push(item.selection && item.selection[k] ? '1' : '')
      })
    }
    csvContent += row.join(',') + '\n'
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = currentTab.value === '결석 리포트' 
    ? `야자결석리포트_${reportDate.value}.csv` 
    : `자율학습신청현황_${currentTab.value}_${new Date().toLocaleDateString()}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <div class="max-w-6xl mx-auto p-4 sm:p-6 font-sans">
    
    <div v-if="!isAdminAuth" class="min-h-[60vh] flex flex-col items-center justify-center">
      <div class="bg-white p-10 rounded-3xl shadow-xl border border-gray-100 max-w-sm w-full text-center">
        <div class="text-5xl mb-6">🔒</div>
        <h2 class="text-2xl font-black text-gray-800 mb-6 tracking-tight">관리자 인증</h2>
        
        <div class="space-y-4 mb-8">
          <input 
            v-model="inputId" 
            type="text" 
            placeholder="아이디" 
            class="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            @keyup.enter="handleAdminLogin"
          />
          <input 
            v-model="inputPw" 
            type="password" 
            placeholder="비밀번호" 
            class="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            @keyup.enter="handleAdminLogin"
          />
        </div>

        <button 
          @click="handleAdminLogin" 
          class="w-full py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-black transition-all active:scale-95 shadow-md"
        >
          접속하기
        </button>
      </div>
    </div>

    <div v-else>
      <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h2 class="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">📊 자율학습 신청 관리</h2>
          <p class="text-gray-500 mt-1">현재 총 <span class="font-bold text-blue-600">{{ filteredApplications.length }}</span>명 신청 ({{ currentTab }})</p>
        </div>
        
        <div class="flex gap-2 flex-wrap justify-end">
          <button @click="fetchApplications" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors">
            🔄 새로고침
          </button>
          <button 
            v-if="isSuperAdmin"
            @click="archiveData" 
            :disabled="isArchiving"
            class="px-4 py-2 bg-amber-500 text-white rounded-lg font-bold shadow-md hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {{ isArchiving ? '보관 중...' : '📦 데이터 보관 및 초기화' }}
          </button>
          <button @click="downloadCSV" class="px-5 py-2 bg-green-600 text-white rounded-lg font-bold shadow-md hover:bg-green-700 transition-colors flex items-center gap-2">
            ⬇️ 엑셀(CSV) 다운로드
          </button>
        </div>
      </div>

      <div class="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button 
          v-for="tab in tabs" 
          :key="tab"
          @click="handleTabChange(tab)"
          :class="['px-5 py-2 rounded-full font-bold whitespace-nowrap transition-all shadow-sm', 
            currentTab === tab 
              ? (tab === '결석 리포트' ? 'bg-red-600 text-white' : tab === '📦 과거 보관함' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white') 
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50']"
        >
          {{ tab }}
        </button>
      </div>

      <div v-if="currentTab === '결석 리포트'" class="mb-6 space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center gap-4 bg-red-50 p-5 rounded-2xl border border-red-100 shadow-sm">
          <div class="flex items-center gap-3">
            <span class="font-black text-red-800">📅 결석 조회 날짜:</span>
            <input 
              type="date" 
              v-model="reportDate" 
              @change="fetchReportAttendance"
              class="p-2 rounded-xl border border-red-300 outline-none focus:ring-2 focus:ring-red-500 text-gray-800 font-bold bg-white"
            />
          </div>
          <p class="text-sm font-medium text-red-600">
            선택하신 날짜에 결석으로 체크된 학생 명단입니다.
          </p>
        </div>

        <!-- 실제 학급별 필터 소탭 (1~9반) -->
        <div class="flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="cls in ['전체', '1', '2', '3', '4', '5', '6', '7', '8', '9']"
            :key="cls"
            @click="changeReportClass(cls)"
            :class="['px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm border',
              reportClassFilter === cls
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-red-50']"
          >
            {{ cls === '전체' ? '전체' : cls + '반' }}
            <span class="ml-1 text-[0.7rem] opacity-80">
              ({{ cls === '전체'
                ? applications.filter(a => reportAttendance[a.studentId]).length
                : applications.filter(a => reportAttendance[a.studentId] && getClassFromId(a.studentId) === cls).length
              }}명)
            </span>
          </button>
        </div>
      </div>

      <!-- 뷰 모드 토글 (반실 탭일 때만 표시) -->
      <div v-if="['1반실', '2반실', '3반실', '4반실', '5반실'].includes(currentTab)" class="mb-6 flex flex-col sm:flex-row justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm">
        <div class="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm mb-4 sm:mb-0">
          <button 
            @click="viewMode = 'list'" 
            :class="['px-4 py-2 text-sm font-bold rounded-md transition-colors', viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50']"
          >
            📋 명단 보기
          </button>
          <button 
            @click="viewMode = 'grid'" 
            :class="['px-4 py-2 text-sm font-bold rounded-md transition-colors', viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50']"
          >
            🪑 자리배치도 보기
          </button>
        </div>

        <div v-if="viewMode === 'grid'" class="flex items-center gap-4 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="text-sm font-black text-gray-700">체크 요일:</span>
            <div class="flex gap-1 bg-white p-1 rounded-lg border border-gray-200">
              <button 
                v-for="day in ['월', '화', '수', '목', '금']"
                :key="day"
                @click="currentDay = day" 
                :class="['px-3 py-1.5 text-xs font-bold rounded-md transition-colors', currentDay === day ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50']"
              >{{ day }}</button>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-black text-gray-700">체크 시간:</span>
            <div class="flex gap-1 bg-white p-1 rounded-lg border border-gray-200">
              <button 
                @click="currentCheckPeriod = '8'" 
                :class="['px-3 py-1.5 text-xs font-bold rounded-md transition-colors', currentCheckPeriod === '8' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50']"
              >8교시 (16:40~)</button>
              <button 
                @click="currentCheckPeriod = '야1'" 
                :class="['px-3 py-1.5 text-xs font-bold rounded-md transition-colors', currentCheckPeriod === '야1' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50']"
              >야1 (19:00~)</button>
              <button 
                @click="currentCheckPeriod = '야2'" 
                :class="['px-3 py-1.5 text-xs font-bold rounded-md transition-colors', currentCheckPeriod === '야2' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50']"
              >야2 (20:40~)</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 과거 보관함 탭 (슈퍼관리자 전용) -->
      <div v-if="currentTab === '📦 과거 보관함'" class="space-y-4">
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
          <span class="font-black text-amber-800">📦 보관 시점 선택:</span>
          <select 
            v-model="selectedArchiveMonth" 
            class="p-2 rounded-xl border border-amber-300 outline-none focus:ring-2 focus:ring-amber-400 text-gray-800 font-bold bg-white"
          >
            <option v-for="m in archivedMonths" :key="m" :value="m">{{ m }}</option>
            <option v-if="archivedMonths.length === 0" value="">보관된 데이터 없음</option>
          </select>
          <span class="text-sm text-amber-700 font-medium">총 {{ filteredArchived.length }}건</span>
          <button
            @click="restoreArchive"
            :disabled="isArchiving || filteredArchived.length === 0"
            class="ml-auto px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors disabled:opacity-40 flex items-center gap-2 shadow-sm"
          >
            {{ isArchiving ? '복구 중...' : '↩️ 이 데이터 현재로 복구' }}
          </button>
        </div>
        <div v-if="isLoading" class="py-20 text-center text-gray-400">
          <div class="w-10 h-10 border-4 border-gray-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-4"></div>
          보관 데이터를 불러오는 중입니다...
        </div>
        <div v-else class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left whitespace-nowrap">
              <thead class="bg-amber-50 text-gray-700 font-bold border-b border-amber-100">
                <tr>
                  <th class="px-6 py-4">보관월</th>
                  <th class="px-6 py-4">배정교실</th>
                  <th class="px-6 py-4">학번</th>
                  <th class="px-6 py-4">이름</th>
                  <th class="px-6 py-4 text-center">신청 타임 수</th>
                  <th class="px-6 py-4 text-gray-400 text-xs">보관일시</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredArchived.length === 0">
                  <td colspan="6" class="px-6 py-12 text-center text-gray-400 font-medium">보관된 데이터가 없습니다.</td>
                </tr>
                <tr v-for="item in filteredArchived" :key="item.id" class="border-b border-gray-100 hover:bg-amber-50/30 transition-colors">
                  <td class="px-6 py-4">
                    <span class="bg-amber-100 text-amber-800 px-2 py-1 rounded-md font-bold text-xs">{{ item.archiveName }}</span>
                  </td>
                  <td class="px-6 py-4 font-bold text-gray-600">
                    <span class="bg-gray-100 px-2 py-1 rounded-md">{{ item.room }}</span>
                  </td>
                  <td class="px-6 py-4 font-bold text-gray-800">{{ item.studentId }}</td>
                  <td class="px-6 py-4 font-bold text-blue-800">{{ item.name }}</td>
                  <td class="px-6 py-4 text-center">
                    <span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold text-xs">{{ item.timeCount }}타임</span>
                  </td>
                  <td class="px-6 py-4 text-gray-400 text-xs">{{ new Date(item.archivedAt).toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <template v-else>
      <div v-if="isLoading" class="py-20 text-center text-gray-400">
        <div class="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
        데이터를 불러오는 중입니다...
      </div>

      <div v-else class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        
        <template v-if="viewMode === 'grid' && ['1반실', '2반실', '3반실', '4반실', '5반실'].includes(currentTab)">
          <div class="p-6 bg-gray-50">
            <StudySeatGrid 
              :roomName="currentTab" 
              :students="filteredApplications" 
              :todayAttendance="todayAttendance"
              :currentDay="currentDay"
              :currentPeriod="currentCheckPeriod"
              @toggle-absence="toggleAbsence($event, currentCheckPeriod)"
            />
          </div>
        </template>
        
        <template v-else>
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left whitespace-nowrap">
            <thead class="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
              <tr>
                <th class="px-6 py-4">교실</th>
                <th class="px-6 py-4">학번</th>
                <th class="px-6 py-4">이름</th>
                <th v-if="currentTab === '결석 리포트'" class="px-6 py-4 text-center text-red-600">결석 시간대</th>
                <th v-else class="px-6 py-4 text-center">신청 시간 합계</th>
                <th class="px-6 py-4 text-gray-400 text-xs">최종 수정일</th>
                <th class="px-6 py-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredApplications.length === 0">
                <td colspan="6" class="px-6 py-12 text-center text-gray-500 font-medium">조회된 학생이 없습니다.</td>
              </tr>
              <tr v-for="app in filteredApplications" :key="app.id" class="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                <td class="px-6 py-4 font-bold text-gray-600">
                  <span class="bg-gray-100 px-2 py-1 rounded-md">{{ app.room }}</span>
                </td>
                <td class="px-6 py-4 font-bold text-gray-800">{{ app.studentId }}</td>
                <td class="px-6 py-4 font-bold text-blue-800">{{ app.name }}</td>
                <td v-if="currentTab === '결석 리포트'" class="px-6 py-4">
                  <div class="flex flex-col items-start gap-1">
                    <span class="bg-red-100 text-red-700 px-3 py-1 rounded-full font-bold text-xs">
                      {{ (reportAttendance[app.studentId] || []).join(', ') }} 결석
                    </span>
                    <span class="text-[0.65rem] text-gray-400">{{ getClassFromId(app.studentId) }}반</span>
                  </div>
                </td>
                <td v-else class="px-6 py-4 text-center">
                  <span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold text-xs">
                    {{ app.timeCount }}타임
                  </span>
                </td>
                <td class="px-6 py-4 text-gray-400 text-xs">
                  {{ new Date(app.updatedAt).toLocaleString() }}
                </td>
                <td class="px-6 py-4 text-right">
                   <div class="flex justify-end gap-2 items-center">
                    <div v-if="currentTab !== '결석 리포트'" class="flex gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
                      <button 
                        @click="toggleAbsence(app.studentId, '8')" 
                        :class="['font-bold text-xs px-2.5 py-1.5 rounded-md transition-colors', (todayAttendance[app.studentId] || []).includes('8') ? 'bg-red-500 text-white shadow-sm' : 'bg-white text-gray-500 hover:bg-gray-200 border border-gray-200']"
                      >8</button>
                      <button 
                        @click="toggleAbsence(app.studentId, '야1')" 
                        :class="['font-bold text-xs px-2.5 py-1.5 rounded-md transition-colors', (todayAttendance[app.studentId] || []).includes('야1') ? 'bg-red-500 text-white shadow-sm' : 'bg-white text-gray-500 hover:bg-gray-200 border border-gray-200']"
                      >야1</button>
                      <button 
                        @click="toggleAbsence(app.studentId, '야2')" 
                        :class="['font-bold text-xs px-2.5 py-1.5 rounded-md transition-colors', (todayAttendance[app.studentId] || []).includes('야2') ? 'bg-red-500 text-white shadow-sm' : 'bg-white text-gray-500 hover:bg-gray-200 border border-gray-200']"
                      >야2</button>
                    </div>
                    <button
                      v-if="currentTab === '결석 리포트'"
                      @click="saveCounselForAbsent(app)"
                      :disabled="savedStudentIds.has(app.studentId)"
                      :class="['font-bold text-xs px-3 py-1.5 rounded-lg transition-colors border',
                        savedStudentIds.has(app.studentId)
                          ? 'bg-green-100 text-green-600 border-green-200 cursor-default'
                          : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100']"
                    >
                      {{ savedStudentIds.has(app.studentId) ? '✅ 상담기록 저장됨' : '📓 상담기록' }}
                    </button>
                    <button v-if="isSuperAdmin" @click="deleteRecord(app.id)" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-red-100">
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
            </table>
          </div>
        </template>
      </div>
      </template>
    </div>

  </div>
</template>