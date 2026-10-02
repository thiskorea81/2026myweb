<script setup>
import { useStudentStore } from '../stores/studentStore'
import { getOrderedScores } from '../utils/gradeUtils'

const props = defineProps({
  student: { type: Object, required: true }
})

const studentStore = useStudentStore()

const deleteGrade = async (gradeId, examName) => {
  if (confirm(`'${examName}' 성적 기록을 완전히 삭제하시겠습니까?`)) {
    await studentStore.deleteGrade(props.student.studentId, gradeId)
  }
}

// 💡 시험명 안의 키워드로 구분(수행평가/모의고사/학기말/정기고사)을 판단해 뱃지로 보여줌
// - 시험명 표기가 자유 양식이라 별도 필드 없이 문자열 매칭으로 분류한다.
// - "학기말"(중간+기말+수행 반영)은 "기말"을 포함하므로 정기고사보다 먼저 판정해야 한다.
const getExamBadge = (examName) => {
  if (/수행/.test(examName)) return { label: '수행평가', class: 'bg-amber-100 text-amber-700' }
  if (/모의고사|모고|학력평가/.test(examName)) return { label: '모의고사', class: 'bg-blue-100 text-blue-700' }
  if (/학기말/.test(examName)) return { label: '학기말', class: 'bg-emerald-100 text-emerald-700' }
  if (/중간|기말|정기고사|지필/.test(examName)) return { label: '정기고사', class: 'bg-indigo-100 text-indigo-700' }
  return { label: '기타', class: 'bg-gray-100 text-gray-600' }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between mb-4 border-b pb-2">
      <h4 class="font-bold text-indigo-800 text-lg">📊 학업 성취도 기록</h4>
    </div>

    <div v-if="!student.grades || student.grades.length === 0" class="flex-1 flex items-center justify-center text-gray-400 text-sm py-20">
      등록된 성적 데이터가 없습니다.
    </div>
    
    <div class="space-y-4">
      <div v-for="grade in (student.grades || []).slice().reverse()" :key="grade.id" class="bg-gray-50 border border-gray-200 p-5 rounded-xl shadow-sm hover:shadow transition-shadow">
        
        <div class="flex justify-between items-center mb-4">
          <span class="flex items-center gap-2">
            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full" :class="getExamBadge(grade.examName).class">
              {{ getExamBadge(grade.examName).label }}
            </span>
            <span class="font-black text-gray-800 text-lg border-l-4 border-indigo-500 pl-2">{{ grade.examName }}</span>
          </span>
          <button @click="deleteGrade(grade.id, grade.examName)" class="text-xs bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 px-3 py-1.5 rounded font-bold transition-colors">
            기록 삭제
          </button>
        </div>
        
        <div class="flex flex-wrap gap-3">
          <div v-for="item in getOrderedScores(grade.scores)" :key="item.label" class="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm flex items-center gap-2 min-w-[80px]">
            <span class="text-xs text-gray-500 font-bold bg-gray-100 px-2 py-1 rounded">{{ item.label }}</span>
            <span class="font-black text-indigo-600 text-base">{{ item.score }}</span>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>