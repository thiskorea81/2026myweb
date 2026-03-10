<script setup>
import { ref, onMounted } from 'vue'
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

const applications = ref([])
const isLoading = ref(true)

// 💡 데이터 불러오기
const fetchApplications = async () => {
  isLoading.value = true
  try {
    const snap = await getDocs(collection(db, 'studyApplications'))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    
    // 학번 순으로 정렬
    data.sort((a, b) => String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true }))
    applications.value = data
  } catch (error) {
    console.error("데이터 로드 에러:", error)
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchApplications)

// 💡 개별 삭제 로직 (필요시 사용)
const deleteRecord = async (id) => {
  if (!confirm('이 학생의 신청 내역을 삭제하시겠습니까?')) return
  try {
    await deleteDoc(doc(db, 'studyApplications', id))
    fetchApplications() // 새로고침
  } catch (error) {
    alert('삭제 중 오류가 발생했습니다.')
  }
}

// 💡 CSV 다운로드 로직 (선생님이 원하신 엑셀 포맷)
const downloadCSV = () => {
  if (applications.value.length === 0) return alert('다운로드할 데이터가 없습니다.')
  
  // 헤더 구성
  const header = ['학번', '이름', '월8', '월야1', '월야2', '화8', '화야1', '화야2', '목8', '목야1', '목야2', '금8', '금야1', '금야2']
  let csvContent = '\uFEFF' + header.join(',') + '\n' // 한글 깨짐 방지 BOM

  // 열에 맞게 데이터 매핑
  const keys = ['월8', '월야1', '월야2', '화8', '화야1', '화야2', '목8', '목야1', '목야2', '금8', '금야1', '금야2']

  applications.value.forEach(item => {
    const row = [item.studentId, item.name]
    
    keys.forEach(k => {
      // 선택된 항목은 '1', 아니면 빈칸 ''
      row.push(item.selection && item.selection[k] ? '1' : '')
    })
    
    csvContent += row.join(',') + '\n'
  })

  // 파일 다운로드 트리거
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `자율학습신청현황_${new Date().toLocaleDateString()}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <div class="max-w-6xl mx-auto p-4 sm:p-6 font-sans">
    <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
      <div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight">📊 자율학습 신청 관리</h2>
        <p class="text-gray-500 mt-1">현재 총 <span class="font-bold text-blue-600">{{ applications.length }}</span>명 신청</p>
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

    <div v-if="isLoading" class="py-20 text-center text-gray-400">
      <div class="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
      데이터를 불러오는 중입니다...
    </div>

    <div v-else class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left whitespace-nowrap">
          <thead class="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
            <tr>
              <th class="px-6 py-4">학번</th>
              <th class="px-6 py-4">이름</th>
              <th class="px-6 py-4 text-center">신청 시간 합계</th>
              <th class="px-6 py-4 text-gray-400 text-xs">최종 수정일</th>
              <th class="px-6 py-4 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="applications.length === 0">
              <td colspan="5" class="px-6 py-12 text-center text-gray-500 font-medium">아직 신청한 학생이 없습니다.</td>
            </tr>
            <tr v-for="app in applications" :key="app.id" class="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
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
</template>