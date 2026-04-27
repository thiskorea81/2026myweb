<script setup>
import { ref } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getRoom } from '../utils/roomUtils'

const studentId = ref('')
const name = ref('')
// 💡 이미지에 있던 요일과 교시 설정
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
  <div class="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
    <div class="max-w-3xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
      
      <div class="bg-blue-600 px-6 py-8 text-center">
        <h2 class="text-3xl font-black text-white tracking-tight">📝 방과후/야간 자율학습 신청</h2>
        <p class="mt-2 text-blue-100 font-medium">참여할 요일과 시간을 정확히 체크해주세요.</p>
      </div>
      
      <div class="p-6 sm:p-10">
        <div class="flex flex-col sm:flex-row gap-4 mb-4">
          <div class="flex-1">
            <label class="block text-sm font-bold text-gray-700 mb-1">학번</label>
            <input v-model="studentId" type="text" placeholder="예: 10401" class="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <div class="flex-1">
            <label class="block text-sm font-bold text-gray-700 mb-1">이름</label>
            <input v-model="name" type="text" placeholder="예: 홍길동" class="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
        </div>
        
        <div class="flex justify-end mb-8">
          <button @click="fetchMyApplication" :disabled="isChecking" class="px-5 py-2 bg-gray-100 text-gray-700 font-bold rounded-lg shadow-sm border border-gray-200 hover:bg-gray-200 hover:shadow transition-all flex items-center gap-2">
            <span v-if="isChecking" class="w-4 h-4 border-2 border-gray-400 border-t-gray-600 rounded-full animate-spin"></span>
            🔍 내 신청내역 조회
          </button>
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
          {{ isSubmitting ? '저장 중...' : (isUpdating ? '✅ 내용 수정하기' : '✨ 신청 완료하기') }}
        </button>
      </div>
    </div>
  </div>
</template>