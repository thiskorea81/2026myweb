<script setup>
import { ref, onMounted } from 'vue'
import { useClubStore } from '../stores/clubStore'
import { storeToRefs } from 'pinia'

// 💡 3개의 컴포넌트 모두 완벽하게 연결되었습니다!
import ClubBulkUpload from '../components/ClubBulkUpload.vue'
import ClubActivityBulkUpload from '../components/ClubActivityBulkUpload.vue'
import ClubStudentDetailModal from '../components/ClubStudentDetailModal.vue'

const clubStore = useClubStore()
const { clubStudents } = storeToRefs(clubStore)

onMounted(() => {
  clubStore.fetchClubStudents()
})

const showStudentUploadArea = ref(false)
const showActivityUploadArea = ref(false)
const selectedIds = ref([])

const handleBulkDelete = async () => {
  if (!confirm(`선택한 ${selectedIds.value.length}명의 동아리 부원을 삭제하시겠습니까?`)) return
  await clubStore.bulkDelete(selectedIds.value)
  selectedIds.value = [] 
}

const isModalOpen = ref(false)
const selectedStudent = ref(null)

const openModal = (student) => {
  selectedStudent.value = student
  isModalOpen.value = true
}

const closeModal = () => {
  isModalOpen.value = false
  selectedStudent.value = null
}
</script>

<template>
  <div class="w-full relative">
    
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold text-gray-800">🎸 동아리 부원 관리</h2>
      
      <div class="flex gap-2 flex-wrap justify-end">
        <button v-if="selectedIds.length > 0" @click="handleBulkDelete" class="text-sm px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium transition-colors shadow-sm">
          선택 삭제 ({{ selectedIds.length }}명)
        </button>
        
        <button @click="showActivityUploadArea = !showActivityUploadArea" class="text-sm px-4 py-2 bg-indigo-100 text-indigo-700 font-bold rounded hover:bg-indigo-200 transition-colors shadow-sm">
          {{ showActivityUploadArea ? '창 닫기' : '📝 활동 내용 일괄 등록' }}
        </button>
        
        <button @click="showStudentUploadArea = !showStudentUploadArea" class="text-sm px-4 py-2 bg-orange-100 text-orange-700 font-bold rounded hover:bg-orange-200 transition-colors shadow-sm">
          {{ showStudentUploadArea ? '창 닫기' : '👥 부원 명단 일괄 등록' }}
        </button>
      </div>
    </div>

    <ClubBulkUpload v-if="showStudentUploadArea" />
    <ClubActivityBulkUpload v-if="showActivityUploadArea" />

    <div v-if="clubStudents.length === 0" class="text-center text-gray-500 py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300">
      등록된 동아리 부원이 없습니다. 우측 상단의 '부원 명단 일괄 등록' 버튼을 이용해보세요.
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="student in clubStudents" :key="student.id" class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative group flex flex-col h-full">
        
        <input 
          type="checkbox" 
          :value="student.id" 
          v-model="selectedIds" 
          class="absolute top-4 right-4 w-4 h-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded cursor-pointer"
        >

        <div class="flex flex-col items-start mb-3 pr-8">
          <span class="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded font-bold mb-2">{{ student.clubRole || '부원' }}</span>
          <h3 class="text-lg font-black text-gray-800">{{ student.studentId }} {{ student.name }} <span class="text-sm font-normal text-gray-500">({{ student.gender }})</span></h3>
        </div>
        
        <div class="space-y-1.5 mb-4 flex-1">
          <p class="text-sm text-gray-600"><strong>진로:</strong> <span class="text-orange-700 font-medium">{{ student.career || '-' }}</span></p>
          <p class="text-sm text-gray-600 line-clamp-2"><strong>특기:</strong> {{ student.specialty || '-' }}</p>
        </div>
        
        <div class="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
          <span class="text-sm text-gray-500 font-medium">활동 기록: <strong class="text-indigo-600 text-base">{{ (student.clubActivities || []).length }}</strong>건</span>
          <button @click="openModal(student)" class="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-1.5 rounded font-bold transition-colors">
            자세히
          </button>
        </div>

      </div>
    </div>

    <ClubStudentDetailModal v-if="isModalOpen" :student="selectedStudent" @close="closeModal" />

  </div>
</template>