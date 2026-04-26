<script setup>
defineProps({
  savedLayouts: Array,
  teacherMode: Boolean,
  students: Array
})

defineEmits(['clear', 'load', 'delete'])

const getShortId = (fullId) => fullId ? String(fullId).slice(-2) : ''
</script>

<template>
  <div class="side-panel flex flex-col gap-6">
    <div class="card bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">배치 옵션</h2>
      <p class="text-xs text-gray-500 mb-4 leading-relaxed">
        • 학생 칸을 드래그하여 직접 바꿀 수 있습니다.<br>
        • 자리를 바꾸면 <strong>현재 상태가 자동 저장</strong>됩니다.<br>
        • <strong>중복 피해 섞기</strong>는 이전 위치를 피합니다.
      </p>
      <button @click="$emit('clear')" class="w-full py-2 bg-red-50 text-red-700 border border-red-200 rounded text-sm font-bold hover:bg-red-100 transition-colors">
        🗑️ 기본 정렬로 초기화
      </button>
    </div>
    
    <div class="card bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">저장된 배치 목록</h2>
      <div v-if="savedLayouts.length === 0" class="text-xs text-gray-400 text-center py-4">
        저장된 배치가 없습니다.
      </div>
      <div v-else class="flex flex-col gap-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
        <div v-for="layout in savedLayouts" :key="layout.id" class="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-100 group">
          <div class="flex flex-col flex-1 truncate cursor-pointer" @click="$emit('load', layout)">
            <span class="text-sm font-bold text-gray-700 hover:text-blue-600 truncate">{{ layout.name }}</span>
            <span class="text-[0.6rem] text-gray-400 mt-0.5">{{ layout.date }}</span>
          </div>
          <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
            <button @click="$emit('load', layout)" class="text-[0.65rem] bg-blue-100 text-blue-700 px-1.5 py-1 rounded hover:bg-blue-200 font-bold">불러오기</button>
            <button @click="$emit('delete', layout.id)" class="text-[0.65rem] bg-red-100 text-red-700 px-1.5 py-1 rounded hover:bg-red-200 font-bold">삭제</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="teacherMode" class="card bg-yellow-50 border border-yellow-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">전체 명렬표</h2>
      <div class="roster-list max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
        <div v-for="s in students" :key="s.id" class="flex justify-between py-2 border-b border-yellow-100 text-sm">
          <span><b>{{ getShortId(s.studentId) }}.</b> {{ s.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
</style>