<script setup>
defineProps({
  seats: Array,
  teacherViewSeats: Array,
  students: Array,
  myGrade: String,
  myClass: String
})
</script>

<template>
  <div class="print-container w-full bg-white text-gray-900 font-sans">
    
    <div class="print-page w-full flex flex-col items-center pt-8 pb-8 px-8">
      <div class="text-center mb-8 shrink-0">
        <h2 class="text-4xl font-black text-gray-900">{{ myGrade }}학년 {{ myClass }}반 자리 배치도</h2>
        <p class="text-gray-500 font-bold mt-2">게시판용 (앞에서 바라본 모습)</p>
      </div>

      <div class="w-full flex justify-center mb-24 shrink-0">
        <div class="w-1/3 py-3 bg-gray-200 border-[3px] border-gray-400 text-center font-black text-2xl text-gray-700 tracking-[0.5em] rounded-b-2xl shadow-sm">
          교 탁
        </div>
      </div>

      <div class="flex justify-center gap-4 w-full box-border">
        <div v-for="(col, cIdx) in seats" :key="cIdx" class="flex flex-col gap-4 flex-1 max-w-[160px]">
          <div v-for="(student, rIdx) in col" :key="rIdx" 
               class="w-full aspect-[2/1] border-[3px] border-gray-400 rounded-xl flex flex-col items-center justify-center p-2 bg-white box-border shadow-sm">
            <template v-if="student">
              <div class="text-sm font-black text-blue-700 mb-1 leading-none">{{ student.studentId }}</div>
              <div class="text-2xl font-black text-gray-900 tracking-tight whitespace-nowrap leading-none">{{ student.name }}</div>
            </template>
            <template v-else>
              <div class="text-sm font-black text-transparent mb-1 leading-none">00000</div>
              <div class="text-2xl font-black text-gray-300 tracking-tight whitespace-nowrap leading-none">빈 자리</div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div class="print-page w-full flex gap-6 pt-6 pb-6 px-6 page-break-before">
      
      <div class="w-3/4 flex flex-col h-full border-r-2 border-dashed border-gray-300 pr-6">
        
        <div class="text-center mb-10 shrink-0">
          <h2 class="text-3xl font-black text-gray-900">{{ myGrade }}학년 {{ myClass }}반 자리 배치도</h2>
          <p class="text-gray-500 font-bold mt-2">교사 시점 (교탁에서 바라본 모습)</p>
        </div>

        <div class="flex-1 flex flex-col items-center justify-start min-h-0 w-full">
          
          <div class="flex justify-center gap-3 w-full mb-10">
            <div v-for="(col, cIdx) in teacherViewSeats" :key="cIdx" class="flex flex-col gap-3 flex-1">
              <div v-for="(student, rIdx) in col" :key="rIdx" 
                   class="w-full aspect-[2/1] border-[2px] border-gray-400 rounded-lg flex flex-col items-center justify-center p-1.5 bg-white box-border">
                <template v-if="student">
                  <div class="text-xs font-black text-blue-700 mb-1 leading-none">{{ student.studentId }}</div>
                  <div class="text-lg font-black text-gray-900 tracking-tight whitespace-nowrap leading-none">{{ student.name }}</div>
                </template>
                <template v-else>
                  <div class="text-xs font-black text-transparent mb-1 leading-none">00000</div>
                  <div class="text-lg font-black text-gray-300 tracking-tight whitespace-nowrap leading-none">빈 자리</div>
                </template>
              </div>
            </div>
          </div>

          <div class="w-1/3 py-2 bg-gray-200 border-[3px] border-gray-400 text-center font-black text-xl text-gray-700 tracking-[0.5em] rounded-t-2xl shrink-0 shadow-sm">
            교 탁
          </div>
        </div>
      </div>

      <div class="w-1/4 h-full border-[3px] border-gray-400 rounded-xl p-3 bg-white flex flex-col shadow-sm box-border shrink-0">
        <h3 class="text-base font-black text-center border-b-2 border-gray-400 pb-2 mb-2 bg-gray-100 rounded shrink-0">학급 명렬표</h3>
        <div class="flex-1 flex flex-col justify-between overflow-hidden">
          <div v-for="s in students" :key="s.studentId" class="flex justify-between border-b border-gray-100 py-[2px] px-1">
            <span class="text-gray-500 text-[11px] sm:text-xs font-bold">{{ s.studentId }}</span>
            <span class="text-gray-900 text-[12px] sm:text-sm font-black">{{ s.name }}</span>
          </div>
        </div>
      </div>

    </div>

  </div>
</template>

<style scoped>
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .print-page { 
    width: 100%; 
    height: 100vh !important; 
    max-height: 100vh !important;
    overflow: hidden !important; 
    page-break-after: always; 
    box-sizing: border-box; 
  }
  .page-break-before { page-break-before: always; }
}
</style>