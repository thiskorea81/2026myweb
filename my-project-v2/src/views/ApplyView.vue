<script setup>
import { ref } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const studentId = ref('')
const name = ref('')
// 💡 이미지에 있던 요일과 교시 설정
const days = ['월', '화', '목', '금']
const periods = ['8', '야1', '야2']

// 체크박스 상태를 저장할 객체 (예: { '월8': true, '화야1': true })
const selection = ref({})
const isSubmitting = ref(false)

const handleApply = async () => {
  if (!studentId.value.trim() || !name.value.trim()) {
    return alert('학번과 이름을 정확히 입력해주세요.')
  }
  
  isSubmitting.value = true

  try {
    // 학번을 문서 ID로 사용하여 중복 방지
    const docRef = doc(db, 'studyApplications', studentId.value)
    const docSnap = await getDoc(docRef)

    // 기존 신청 내역이 있는지 확인
    if (docSnap.exists()) {
      if (!confirm('기존 신청 내역이 있습니다. 새로운 내용으로 수정(덮어쓰기) 하시겠습니까?')) {
        isSubmitting.value = false
        return
      }
    }

    // Firestore에 저장
    await setDoc(docRef, {
      studentId: studentId.value,
      name: name.value,
      selection: selection.value,
      updatedAt: new Date().toISOString()
    })

    alert('✅ 신청이 성공적으로 완료되었습니다!')
    
    // 제출 후 폼 초기화 (선택사항)
    // studentId.value = ''
    // name.value = ''
    // selection.value = {}

  } catch (error) {
    console.error("신청 저장 에러:", error)
    alert('오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
    <div class="max-w-3xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
      
      <div class="bg-blue-600 px-6 py-8 text-center">
        <h2 class="text-3xl font-black text-white tracking-tight">📝 방과후/야간 자율학습 신청</h2>
        <p class="mt-2 text-blue-100 font-medium">참여할 요일과 시간을 정확히 체크해주세요.</p>
      </div>
      
      <div class="p-6 sm:p-10">
        <div class="flex flex-col sm:flex-row gap-4 mb-8">
          <div class="flex-1">
            <label class="block text-sm font-bold text-gray-700 mb-1">학번</label>
            <input v-model="studentId" type="text" placeholder="예: 1401" class="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <div class="flex-1">
            <label class="block text-sm font-bold text-gray-700 mb-1">이름</label>
            <input v-model="name" type="text" placeholder="예: 홍길동" class="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
        </div>

        <div class="overflow-x-auto mb-10 rounded-xl border border-gray-200">
          <table class="w-full border-collapse text-center">
            <thead>
              <tr class="bg-gray-100">
                <th class="border-b border-r border-gray-200 p-3 text-gray-700 font-bold w-1/4">요일</th>
                <th v-for="p in periods" :key="p" class="border-b border-gray-200 p-3 text-gray-700 font-bold w-1/4">{{ p }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="day in days" :key="day" class="hover:bg-blue-50/50 transition-colors">
                <td class="border-t border-r border-gray-200 p-4 font-black text-gray-800 bg-gray-50/50">{{ day }}요일</td>
                <td v-for="p in periods" :key="p" class="border-t border-gray-200 p-4">
                  <label class="flex items-center justify-center cursor-pointer w-full h-full">
                    <input 
                      type="checkbox" 
                      v-model="selection[`${day}${p}`]" 
                      class="w-6 h-6 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer transition-all" 
                    />
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <button 
          @click="handleApply" 
          :disabled="isSubmitting"
          class="w-full p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg md:text-xl shadow-lg hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {{ isSubmitting ? '저장 중...' : '신청 / 수정 완료하기' }}
        </button>
      </div>
    </div>
  </div>
</template>