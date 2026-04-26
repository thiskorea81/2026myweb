<script setup>
defineProps({
  printDataList: { type: Array, required: true }
})

const formatDate = (isoString) => {
  if (!isoString) return '-'
  const date = new Date(isoString)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}
</script>

<template>
  <div class="print-only hidden print-area w-full bg-white text-black">
    <div v-for="data in printDataList" :key="data.student.id" class="page-break-container">
      
      <div class="flex items-center justify-center gap-6 mb-10 mt-4 border-b-4 border-double border-gray-800 pb-4">
        <div class="w-20 h-28 bg-gray-100 border border-gray-400 overflow-hidden shrink-0 flex items-center justify-center">
          <img v-if="data.student.photoUrl" :src="data.student.photoUrl" class="w-full h-full object-cover">
          <span v-else class="text-xs text-gray-400 font-bold">사진</span>
        </div>
        <div class="text-left">
          <h2 class="text-3xl font-black mb-1">학생 종합 기록부</h2>
          <p class="text-xl text-gray-700 font-bold">{{ data.student.studentId }} {{ data.student.name }} <span class="text-lg text-gray-500 font-medium">({{ data.student.gender }})</span></p>
        </div>
      </div>

      <div class="print-section mb-8">
        <h3 class="text-lg font-bold border-b-2 border-gray-800 pb-1 mb-3">1. 기본 및 진로 정보</h3>
        <table class="w-full border-collapse border border-gray-400 text-sm">
          <tbody>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 w-1/6 text-left font-bold text-gray-700">연락처</th><td class="border border-gray-400 p-2 w-2/6 font-mono">{{ data.student.phone || '-' }}</td><th class="border border-gray-400 bg-gray-100 p-2 w-1/6 text-left font-bold text-gray-700">생년월일</th><td class="border border-gray-400 p-2 w-2/6">{{ data.student.birthDate || '-' }}</td></tr>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 text-left font-bold text-gray-700">보호자1</th><td class="border border-gray-400 p-2 font-mono">{{ data.student.parent1Phone || '-' }}</td><th class="border border-gray-400 bg-gray-100 p-2 text-left font-bold text-gray-700">보호자2</th><td class="border border-gray-400 p-2 font-mono">{{ data.student.parent2Phone || '-' }}</td></tr>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 text-left font-bold text-gray-700">주소</th><td colspan="3" class="border border-gray-400 p-2">{{ data.student.address || '-' }}</td></tr>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 text-left font-bold text-gray-700">진로/대학</th><td colspan="3" class="border border-gray-400 p-2">{{ data.student.career || '-' }} <span v-if="data.student.university">/ {{ data.student.university }}</span></td></tr>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 text-left font-bold text-gray-700">취미/특기</th><td colspan="3" class="border border-gray-400 p-2">{{ data.student.hobby || '-' }} <span v-if="data.student.specialty">/ {{ data.student.specialty }}</span></td></tr>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 text-left font-bold text-gray-700">교과(호/불호)</th><td colspan="3" class="border border-gray-400 p-2">😍 {{ data.student.favoriteSubject || '-' }} &nbsp;|&nbsp; 😫 {{ data.student.dislikeSubject || '-' }}</td></tr>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 text-left align-top font-bold text-gray-700">장단점/메모</th><td colspan="3" class="border border-gray-400 p-2 whitespace-pre-wrap">{{ data.student.goodPoint || '-' }} / {{ data.student.badPoint || '-' }}<br>{{ data.student.memo || '-' }}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="print-section mb-8">
        <h3 class="text-lg font-bold border-b-2 border-gray-800 pb-1 mb-3">2. 성적 기록</h3>
        <div v-if="!data.student.grades || data.student.grades.length === 0" class="text-gray-500 text-sm">기록이 없습니다.</div>
        <div v-else class="space-y-3">
          <div v-for="grade in [...data.student.grades].reverse()" :key="grade.id" class="border border-gray-300 p-3 bg-gray-50 rounded">
            <div class="font-bold text-sm mb-2 text-indigo-900 border-l-4 border-indigo-500 pl-2">{{ grade.examName }}</div>
            <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm"><span v-for="(score, subject) in grade.scores" :key="subject"><span class="font-bold text-gray-600 bg-white border border-gray-200 px-1 rounded">{{ subject }}</span> <span class="font-bold ml-1">{{ score }}</span></span></div>
          </div>
        </div>
      </div>

      <div class="print-section mb-8">
        <h3 class="text-lg font-bold border-b-2 border-gray-800 pb-1 mb-3">3. 생활기록부 (상시 메모 및 최종 기록)</h3>
        <h4 class="font-bold text-sm text-gray-600 mb-1">📌 상시 관찰 메모</h4>
        <table class="w-full border-collapse border border-gray-400 text-sm mb-4">
          <tbody>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 w-1/4 text-center font-bold text-gray-700">자율활동 메모</th><td class="border border-gray-400 p-2 whitespace-pre-wrap">{{ data.student.obsAutonomous || '-' }}</td></tr>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 w-1/4 text-center font-bold text-gray-700">진로활동 메모</th><td class="border border-gray-400 p-2 whitespace-pre-wrap">{{ data.student.obsCareer || '-' }}</td></tr>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 w-1/4 text-center font-bold text-gray-700">행동발달 메모</th><td class="border border-gray-400 p-2 whitespace-pre-wrap">{{ data.student.obsBehavior || '-' }}</td></tr>
          </tbody>
        </table>
        <h4 class="font-bold text-sm text-gray-600 mb-1">🎓 최종 생기부 기록 (NEIS)</h4>
        <table class="w-full border-collapse border border-gray-400 text-sm">
          <tbody>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 w-1/4 text-center font-bold text-gray-700">자율활동</th><td class="border border-gray-400 p-2 whitespace-pre-wrap">{{ data.student.finalAutonomous || '-' }}</td></tr>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 w-1/4 text-center font-bold text-gray-700">진로활동</th><td class="border border-gray-400 p-2 whitespace-pre-wrap">{{ data.student.finalCareer || '-' }}</td></tr>
            <tr><th class="border border-gray-400 bg-gray-100 p-2 w-1/4 text-center font-bold text-gray-700">행동특성/종합</th><td class="border border-gray-400 p-2 whitespace-pre-wrap">{{ data.student.finalBehavior || '-' }}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="print-section mb-8">
        <h3 class="text-lg font-bold border-b-2 border-gray-800 pb-1 mb-3">4. 상담/출결 기록</h3>
        <div v-if="data.counselingLogs.length === 0 && data.attendanceLogs.length === 0" class="text-gray-500 text-sm">기록이 없습니다.</div>
        <div v-else class="space-y-4 text-sm">
          <div v-for="log in data.counselingLogs" :key="'c'+log.id" class="border-b border-gray-300 pb-2">
            <span class="font-bold text-gray-500">🗓️ {{ log.date }} [상담]</span> {{ log.content }}
          </div>
          <div v-for="log in data.attendanceLogs" :key="'a'+log.id" class="border-b border-gray-300 pb-2">
            <span class="font-bold text-gray-500">🗓️ {{ log.date }} [{{ log.type }}]</span> {{ log.reason || '-' }}
          </div>
        </div>
      </div>
      
      <div class="print-section mb-8">
        <h3 class="text-lg font-bold border-b-2 border-gray-800 pb-1 mb-3">5. AI 분석 노트</h3>
        <div v-if="data.aiNotes.length === 0" class="text-gray-500 text-sm">기록이 없습니다.</div>
        <div v-else class="space-y-4 text-sm">
          <div v-for="note in data.aiNotes" :key="note.id" class="border border-gray-300 bg-gray-50 p-4 rounded">
            <div class="font-bold text-xs text-gray-500 mb-2">🗓️ {{ formatDate(note.createdAt) }}</div>
            <div class="whitespace-pre-wrap leading-relaxed">{{ note.content }}</div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style>
/* 프린트 레이아웃 글로벌 스타일 덮어쓰기 위해 일반 style 태그 사용 */
@media print {
  @page { margin: 15mm; }
  body, html { background-color: white !important; }
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  .page-break-container { page-break-after: always; page-break-inside: avoid; padding-bottom: 20px; }
  .page-break-container:last-child { page-break-after: auto; }
  .print-section { page-break-inside: avoid; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
</style>