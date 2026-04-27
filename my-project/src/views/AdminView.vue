<script setup>
import { ref, computed } from 'vue'
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getRoom } from '../utils/roomUtils'

const isAdminAuth = ref(false)
const inputId = ref('')
const inputPw = ref('')

const applications = ref([])
const isLoading = ref(false)

const currentTab = ref('전체')
const tabs = ['전체', '1반실', '2반실', '3반실', '미배정']

const handleAdminLogin = () => {
  if (inputId.value === 'admin' && inputPw.value === 'admin') {
    isAdminAuth.value = true
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
      return { id: d.id, ...appData, studentId, room }
    })
    
    // 학번 순으로 오름차순 정렬 (관리 편의성을 위함)
    data.sort((a, b) => {
      const idA = parseInt(a.studentId, 10) || 0
      const idB = parseInt(b.studentId, 10) || 0
      return idA - idB
    })
    
    applications.value = data
  } catch (error) {
    console.error("데이터 로드 에러:", error)
  } finally {
    isLoading.value = false
  }
}

const filteredApplications = computed(() => {
  if (currentTab.value === '전체') return applications.value
  return applications.value.filter(app => app.room === currentTab.value)
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

const downloadCSV = () => {
  const dataToExport = currentTab.value === '전체' ? applications.value : filteredApplications.value
  if (dataToExport.length === 0) return alert('다운로드할 데이터가 없습니다.')
  
  const header = ['배정교실', '학번', '이름', '월8', '월야1', '월야2', '화8', '화야1', '화야2', '목8', '목야1', '목야2', '금8', '금야1', '금야2']
  let csvContent = '\uFEFF' + header.join(',') + '\n'

  const keys = ['월8', '월야1', '월야2', '화8', '화야1', '화야2', '목8', '목야1', '목야2', '금8', '금야1', '금야2']

  dataToExport.forEach(item => {
    const row = [item.room, item.studentId, item.name]
    keys.forEach(k => {
      row.push(item.selection && item.selection[k] ? '1' : '')
    })
    csvContent += row.join(',') + '\n'
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `자율학습신청현황_${currentTab.value}_${new Date().toLocaleDateString()}.csv`
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
        
        <div class="flex gap-2">
          <button @click="fetchApplications" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors">
            🔄 새로고침
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
          @click="currentTab = tab"
          :class="['px-5 py-2 rounded-full font-bold whitespace-nowrap transition-all shadow-sm', currentTab === tab ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50']"
        >
          {{ tab }}
        </button>
      </div>

      <div v-if="isLoading" class="py-20 text-center text-gray-400">
        <div class="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
        데이터를 불러오는 중입니다...
      </div>

      <div v-else class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left whitespace-nowrap">
            <thead class="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
              <tr>
                <th class="px-6 py-4">교실</th>
                <th class="px-6 py-4">학번</th>
                <th class="px-6 py-4">이름</th>
                <th class="px-6 py-4 text-center">신청 시간 합계</th>
                <th class="px-6 py-4 text-gray-400 text-xs">최종 수정일</th>
                <th class="px-6 py-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredApplications.length === 0">
                <td colspan="6" class="px-6 py-12 text-center text-gray-500 font-medium">선택한 그룹에 신청한 학생이 없습니다.</td>
              </tr>
              <tr v-for="app in filteredApplications" :key="app.id" class="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                <td class="px-6 py-4 font-bold text-gray-600">
                  <span class="bg-gray-100 px-2 py-1 rounded-md">{{ app.room }}</span>
                </td>
                <td class="px-6 py-4 font-bold text-gray-800">{{ app.studentId }}</td>
                <td class="px-6 py-4 font-bold text-blue-800">{{ app.name }}</td>
                <td class="px-6 py-4 text-center">
                  <span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold text-xs">
                    {{ Object.values(app.selection || {}).filter(v => v).length }}타임
                  </span>
                </td>
                <td class="px-6 py-4 text-gray-400 text-xs">
                  {{ new Date(app.updatedAt).toLocaleString() }}
                </td>
                <td class="px-6 py-4 text-right">
                  <button @click="deleteRecord(app.id)" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                    삭제
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

  </div>
</template>