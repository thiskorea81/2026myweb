<script setup>
defineProps({
  teacherViewSeats: { type: Array, required: true },
  myGrade: String,
  myClass: String
})
</script>

<template>
  <div class="print-container bg-white p-8">
    <div class="text-center mb-8">
      <h2 class="text-3xl font-black text-gray-900 tracking-tight">{{ myGrade }}학년 {{ myClass }}반 사진 명렬표</h2>
      <p class="text-gray-500 font-bold mt-2">현재 자리 배치 기준 (교탁 시점)</p>
    </div>

    <div class="w-1/2 mx-auto bg-gray-200 text-gray-600 font-black text-xl py-3 rounded-t-xl text-center mb-8 border border-gray-300">
      교 탁
    </div>

    <div class="flex justify-center gap-4">
      <div v-for="(col, cIdx) in teacherViewSeats" :key="cIdx" class="flex flex-col gap-4">
        
        <div v-for="(student, rIdx) in col" :key="rIdx" class="w-[110px] h-[150px] border-2 border-gray-300 rounded-xl flex flex-col items-center justify-center p-2 bg-white box-border">
          <template v-if="student">
            <img v-if="student.photoUrl" :src="student.photoUrl" class="w-[70px] h-[90px] object-cover mb-2 rounded border border-gray-200 shadow-sm">
            <div v-else class="w-[70px] h-[90px] bg-gray-100 flex items-center justify-center text-3xl mb-2 rounded border border-gray-200 shadow-sm">👤</div>
            
            <div class="text-[11px] font-bold text-blue-600 leading-none mb-1">{{ student.studentId }}</div>
            <div class="text-[15px] font-black text-gray-900 leading-none">{{ student.name }}</div>
          </template>
          <template v-else>
            <div class="flex-1 flex items-center justify-center text-gray-300 text-sm font-bold">빈 자리</div>
          </template>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  @page { margin: 10mm; size: landscape; }
  .print-container { padding: 0 !important; }
}
</style>