<script setup>
defineProps({
  seats: Array,
  teacherViewSeats: Array,
  students: Array
})

const getShortId = (fullId) => fullId ? String(fullId).slice(-2) : ''
</script>

<template>
  <div class="print-only hidden">
    <div class="print-page pb-6 flex flex-col">
      <h2 class="text-center text-2xl font-bold mb-6">자리배치 (게시용)</h2>
      <div class="border border-gray-300 p-8 rounded-xl bg-white shadow-sm flex-1 flex flex-col">
        <div class="flex justify-center mb-12">
          <div class="w-1/2 h-10 bg-gray-50 border-2 border-gray-400 rounded-lg flex items-center justify-center text-gray-700 font-bold tracking-[0.5rem] text-sm shadow-inner">
            칠 판
          </div>
        </div>
        <div class="flex justify-between gap-4">
          <div v-for="(col, colIdx) in seats" :key="colIdx" class="flex-1 flex flex-col gap-3">
            <div class="text-center text-xs font-bold text-gray-400 mb-1">COL {{ colIdx + 1 }}</div>
            <div v-for="(student, rowIdx) in col" :key="rowIdx" class="aspect-[16/10] border-2 border-gray-200 rounded-xl flex flex-col items-center justify-center relative" :class="{ 'bg-gray-50 border-dashed': !student }">
              <template v-if="student">
                <span class="absolute top-2 left-2 text-[0.65rem] text-gray-500 font-mono">{{ getShortId(student.studentId) }}</span>
                <span class="font-bold text-xl" :class="student.gender === '남' ? 'text-blue-700' : 'text-rose-700'">{{ student.name }}</span>
              </template>
            </div>
            <div v-if="col.length < 6" class="aspect-[16/10] invisible"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="print-page pt-6 flex gap-6 h-full">
      
      <div class="w-4/5 flex flex-col">
        <h2 class="text-center text-2xl font-bold mb-6">자리배치 (교탁용)</h2>
        <div class="border border-gray-300 p-6 rounded-xl bg-white shadow-sm flex flex-col flex-1">
          
          <div class="flex justify-between gap-4 mb-12">
            <div v-for="(col, colIdx) in teacherViewSeats" :key="colIdx" class="flex-1 flex flex-col gap-2">
              <div v-for="(student, rowIdx) in col" :key="rowIdx" class="aspect-[16/10] border-2 border-gray-200 rounded-lg flex flex-col items-center justify-center relative" :class="{ 'bg-gray-50 border-dashed': !student }">
                <template v-if="student">
                  <span class="absolute top-1 left-1.5 text-[0.6rem] text-gray-500 font-mono">{{ getShortId(student.studentId) }}</span>
                  <span class="font-bold text-sm mt-1" :class="student.gender === '남' ? 'text-blue-700' : 'text-rose-700'">{{ student.name }}</span>
                </template>
              </div>
            </div>
          </div>
          
          <div class="flex justify-center">
            <div class="w-1/2 h-10 bg-gray-50 border-2 border-gray-400 rounded flex items-center justify-center text-gray-700 font-bold text-xs">
              칠 판 (교탁 앞)
            </div>
          </div>
        </div>
      </div>

      <div class="w-1/5 border-l border-gray-200 pl-4 flex flex-col">
        <table class="w-full text-xs text-left border-collapse">
          <thead>
            <tr><th colspan="2" class="pb-3 text-sm font-bold text-center text-gray-800">학생 명렬표</th></tr>
            <tr class="border-b-2 border-gray-300"><th class="py-1 w-10">번호</th><th class="py-1">이름</th></tr>
          </thead>
          <tbody>
            <tr v-for="s in students" :key="s.id" class="border-b border-gray-100">
              <td class="py-1 font-mono text-gray-500">{{ getShortId(s.studentId) }}</td>
              <td class="py-1 font-bold" :class="s.gender === '남' ? 'text-blue-700' : 'text-rose-700'">{{ s.name }}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </div>
</template>

<style scoped>
@media print {
  @page { margin: 10mm; }
  body, html { height: auto !important; }
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  
  .print-page {
    page-break-inside: avoid;
    page-break-after: always;
    height: 100vh;
    box-sizing: border-box;
  }
  .print-page:last-child {
    page-break-after: auto;
  }
}
</style>