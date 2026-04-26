<script setup>
import { ref, onMounted } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import * as XLSX from 'xlsx'

const careerData = ref([])
const isUploading = ref(false)

// 💡 1. 초기화: DB에 저장된 진로 데이터 불러오기
onMounted(async () => {
  try {
    const snap = await getDoc(doc(db, 'settings', 'careerRoadmap'))
    if (snap.exists()) {
      careerData.value = snap.data().data || []
    }
  } catch (error) {
    console.error("데이터 로드 실패:", error)
  }
})

// 💡 2. 엑셀 파일을 JSON으로 변환하여 DB에 저장
const handleExcelUpload = (event) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  isUploading.value = true

  reader.onload = async (e) => {
    const data = new Uint8Array(e.target.result)
    const workbook = XLSX.read(data, { type: 'array' })

    // 첫 번째 시트 데이터 가져오기 (보조자료 시트 구성에 맞춰 수정 가능)
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    
    // 엑셀 데이터를 JSON 배열로 변환
    const jsonData = XLSX.utils.sheet_to_json(worksheet)

    if (confirm(`총 ${jsonData.length}개의 데이터를 데이터베이스에 업데이트하시겠습니까?`)) {
      try {
        await setDoc(doc(db, 'settings', 'careerRoadmap'), {
          data: jsonData,
          updatedAt: new Date().toISOString()
        })
        careerData.value = jsonData
        alert('✅ 진로 데이터가 성공적으로 업데이트되었습니다!')
      } catch (error) {
        alert('❌ DB 저장 중 오류가 발생했습니다.')
      }
    }
    isUploading.value = false
  }
  reader.readAsArrayBuffer(file)
}

const externalLinks = [
  { name: '커리어넷', url: 'https://www.career.go.kr/', icon: '🚀' },
  { name: '아로리(서울대)', url: 'https://snuarori.snu.ac.kr/', icon: '🏛️' },
  { name: '어디가(대입정보)', url: 'https://www.adiga.kr/', icon: '🏫' },
  { name: '워크넷(심리검사)', url: 'https://www.work24.go.kr/', icon: '🧠' }
]
const openLink = (url) => window.open(url, '_blank')
</script>

<template>
  <div class="max-w-7xl mx-auto p-4 sm:p-8 font-sans text-gray-900">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b pb-6 gap-4">
      <div>
        <h2 class="text-3xl font-black text-gray-900 tracking-tight">🧭 진로 데이터 센터</h2>
        <p class="text-gray-500 font-bold mt-1">엑셀 보조자료를 업로드하여 시스템 데이터를 최신으로 유지하세요.</p>
      </div>

      <div class="relative">
        <input 
          type="file" 
          accept=".xlsx, .xls, .xlsm" 
          @change="handleExcelUpload" 
          class="hidden" 
          id="excel-upload"
          :disabled="isUploading"
        />
        <label 
          for="excel-upload" 
          class="flex items-center gap-2 px-5 py-3 bg-gray-800 text-white font-bold rounded-2xl cursor-pointer hover:bg-black transition-all shadow-md"
        >
          {{ isUploading ? '⏳ 변환 중...' : '📁 엑셀 데이터 업데이트' }}
        </label>
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
      <button v-for="link in externalLinks" :key="link.name" @click="openLink(link.url)"
              class="flex flex-col items-center p-4 bg-white border border-gray-200 rounded-2xl hover:border-blue-400 transition-all shadow-sm">
        <span class="text-3xl mb-2">{{ link.icon }}</span>
        <span class="font-bold text-gray-800">{{ link.name }}</span>
      </button>
    </div>

    <div class="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="bg-gray-50 p-6 border-b border-gray-200 flex justify-between items-center">
        <h3 class="text-xl font-black text-gray-900">📊 학과별 권장 과목 명단</h3>
        <span class="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">총 {{ careerData.length }}건</span>
      </div>
      
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-black">
            <tr>
              <th class="p-4 border-b">계열/학과</th>
              <th class="p-4 border-b">권장 과목</th>
              <th class="p-4 border-b">핵심 역량</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(item, idx) in careerData.slice(0, 50)" :key="idx" class="hover:bg-gray-50 transition-colors">
              <td class="p-4 font-bold text-gray-900">{{ item.학과명 || item.계열 }}</td>
              <td class="p-4 text-sm text-gray-600 leading-relaxed">{{ item.권장과목 || item.교과목 }}</td>
              <td class="p-4 text-sm text-gray-500">{{ item.역량 || item.진로정보 }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="careerData.length === 0" class="text-center py-20 text-gray-400 font-bold">
          업로드된 진로 데이터가 없습니다. 엑셀 파일을 선택해 주세요.
        </div>
        <div v-if="careerData.length > 50" class="p-4 text-center text-gray-400 text-sm font-bold bg-gray-50">
          ... 상위 50개 데이터만 표시 중입니다 ...
        </div>
      </div>
    </div>
  </div>
</template>