<script setup>
import { useStudentStore } from '../stores/studentStore'

const props = defineProps({
  student: { type: Object, required: true }
})

const studentStore = useStudentStore()

const deleteGrade = async (gradeId, examName) => {
  if (confirm(`'${examName}' 성적 기록을 완전히 삭제하시겠습니까?`)) {
    await studentStore.deleteGrade(props.student.studentId, gradeId)
  }
}

// 💡 지정된 순서와 풀네임 매핑 규칙
const orderedSubjects = [
  { match: ['국', '국어'], label: '국어' },
  { match: ['수', '수학'], label: '수학' },
  { match: ['영', '영어'], label: '영어' },
  { match: ['한', '한국사'], label: '한국사' },
  { match: ['사탐', '사회탐구'], label: '사회탐구' },
  { match: ['과탐', '과학탐구'], label: '과학탐구' },
  { match: ['국수영 점수합', '국수영 합', '국수영합'], label: '국수영 점수합' },
  { match: ['국수영 평균'], label: '국수영 평균' },
  { match: ['국수영 등수'], label: '국수영 등수' },
  { match: ['전체 점수합', '전체 합', '전체합'], label: '전체 점수합' },
  { match: ['전체 등수'], label: '전체 등수' }
]

// 💡 성적 데이터를 정해진 순서와 풀네임으로 재배열하는 함수
const getOrderedScores = (scores) => {
  if (!scores) return []
  
  const result = []
  const usedKeys = new Set()

  // 1. 우리가 지정한 순서대로 먼저 찾아서 배열에 넣습니다.
  orderedSubjects.forEach(orderItem => {
    for (const alias of orderItem.match) {
      if (scores[alias] !== undefined) {
        result.push({ label: orderItem.label, score: scores[alias] })
        usedKeys.add(alias)
        break // 매칭되는 것을 찾으면 다음 순서로 넘어감
      }
    }
  })

  // 2. 혹시 지정된 목록에 없는 예외 과목(예: 제2외국어, 직업탐구 등)이 있다면 맨 뒤에 붙여줍니다.
  Object.keys(scores).forEach(key => {
    if (!usedKeys.has(key)) {
      result.push({ label: key, score: scores[key] })
    }
  })

  return result
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
          <span class="font-black text-gray-800 text-lg border-l-4 border-indigo-500 pl-2">{{ grade.examName }}</span>
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