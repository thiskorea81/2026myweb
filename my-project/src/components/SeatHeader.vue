<script setup>
defineProps({
  colConfigLength: Number,
  myGrade: String,
  myClass: String,
  myRoomStudentsLength: Number,
  totalSeats: Number,
  teacherMode: Boolean
})

defineEmits(['open-config', 'toggle-teacher-mode', 'save-history', 'print-seat', 'print-photo', 'shuffle'])
</script>

<template>
  <header class="flex justify-between items-start mb-8 gap-4 flex-wrap">
    <div class="title-group">
      <h1 class="text-2xl font-bold text-gray-800 m-0 flex items-center gap-3">
        🪑 자리 배치
        <button @click="$emit('open-config')" class="text-sm font-bold bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-colors">
          ⚙️ 형태 설정 (현재 {{ colConfigLength }}열)
        </button>
      </h1>
      <div class="info-badge mt-2 text-sm text-gray-500 flex gap-2 font-bold">
        <span class="text-blue-600">{{ myGrade }}학년 {{ myClass }}반</span>
        <span>|</span>
        <span>👥 우리 반: {{ myRoomStudentsLength }}명</span>
        <span>|</span>
        <span>🪑 총 좌석: {{ totalSeats }}석</span>
      </div>
    </div>
    
    <div class="button-group flex gap-2 flex-wrap">
      <button @click="$emit('toggle-teacher-mode')" class="px-4 py-2 rounded-lg font-bold text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50" :class="{ '!bg-yellow-50 !border-yellow-400 !text-yellow-800': teacherMode }">
        {{ teacherMode ? '📋 명렬표 닫기' : '📋 명렬표 보기' }}
      </button>
      
      <button @click="$emit('save-history')" class="px-4 py-2 rounded-lg font-bold text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm">
        💾 배치 저장
      </button>
      
      <button @click="$emit('shuffle')" class="px-4 py-2 rounded-lg font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 shadow-md">
        🎲 자리 섞기
      </button>

      <div class="flex bg-gray-800 rounded-lg p-1 ml-2 shadow-md">
        <button @click="$emit('print-seat')" class="px-3 py-1.5 rounded text-sm font-bold text-white hover:bg-gray-700 transition-colors">🖨️ 자리표 인쇄</button>
        <div class="w-px bg-gray-600 my-1 mx-1"></div>
        <button @click="$emit('print-photo')" class="px-3 py-1.5 rounded text-sm font-bold text-amber-300 hover:bg-gray-700 transition-colors">📸 사진명렬표</button>
      </div>
    </div>
  </header>
</template>