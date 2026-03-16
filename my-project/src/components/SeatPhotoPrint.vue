<script setup>
defineProps({
  teacherViewSeats: Array,
  myGrade: String,
  myClass: String
})
</script>

<template>
  <div class="print-container w-full bg-white text-gray-900 font-sans flex flex-col items-center justify-center">

    <div class="flex justify-center gap-2 w-full px-2">
      <div v-for="(col, cIdx) in teacherViewSeats" :key="cIdx" class="flex flex-col gap-2 flex-1">
        
        <div v-for="(student, rIdx) in col" :key="rIdx" 
             class="w-full border-[2px] border-gray-400 rounded-lg flex flex-col items-center p-1 bg-white box-border">
          
          <template v-if="student">
            <div class="w-full aspect-[3/4] mb-1 rounded bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
              <img v-if="student.photoUrl" :src="student.photoUrl" class="w-full h-full object-cover">
              <span v-else class="text-2xl text-gray-300">👤</span>
            </div>
            
            <div class="flex flex-col items-center justify-center w-full shrink-0 pb-0.5">
              <span class="text-[11px] font-black text-gray-900 leading-tight whitespace-nowrap">{{ student.name }}</span>
            </div>
          </template>
          
          <template v-else>
            <div class="w-full aspect-[3/4] mb-1 rounded bg-gray-50 flex items-center justify-center shrink-0">
              <span class="text-gray-300 text-[11px] font-bold">빈자리</span>
            </div>
            <div class="flex flex-col items-center justify-center w-full shrink-0 pb-0.5 h-[15px]"></div>
          </template>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  @page { size: A4 portrait; margin: 8mm; } 
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  
  /* 💡 2페이지 빈 종이 생성을 원천 차단하는 핵심 CSS */
  .print-container { 
    width: 100%; 
    height: 100vh !important;      /* 정확히 1장 높이로 고정 */
    max-height: 100vh !important;  
    overflow: hidden !important;   /* 1장을 넘어가는 눈에 보이지 않는 1~2px의 여백을 완전히 잘라냄 */
    page-break-after: avoid !important; 
    page-break-inside: avoid !important;
    margin: 0 !important;
    padding: 0 !important;
  }
}
</style>