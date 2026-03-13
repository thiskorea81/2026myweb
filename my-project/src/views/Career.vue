<script setup>
import { ref, computed } from 'vue'
import { useStudentStore } from '../stores/studentStore'
import { storeToRefs } from 'pinia'

const studentStore = useStudentStore()
const { students } = storeToRefs(studentStore)

// 💡 엑셀 보조자료 기반: 계열별 권장 과목 데이터 (요약본)
const careerData = [
  { group: '인문/사회', subjects: '언어와 매체, 사회문화, 정치와 법, 경제, 윤리와 사상', careers: '경영, 경제, 법학, 교육, 심리' },
  { group: '자연/공학', subjects: '미적분, 기하, 물리학, 화학, 정보, 인공지능 기초', careers: '컴퓨터공학, 기계공학, 의학, 생명공학' },
  { group: '예술/체육', subjects: '음악 감상과 비평, 미술 감상과 비평, 스포츠 생활', careers: '디자인, 체육지도자, 예술가' },
  { group: '생활/융합', subjects: '제2외국어, 한문, 생활과 과학, 심리학', careers: '공무원, 전문직, 언론방송' }
]

const selectedGroup = ref(careerData[0])

// 외부 참고 사이트
const externalLinks = [
  { name: '커리어넷', url: 'https://www.career.go.kr/', icon: '🚀' },
  { name: '아로리(서울대)', url: 'https://snuarori.snu.ac.kr/', icon: '🏛️' },
  { name: '어디가(대입정보)', url: 'https://www.adiga.kr/', icon: '🏫' },
  { name: '워크넷(심리검사)', url: 'https://www.work24.go.kr/', icon: '🧠' }
]

const openLink = (url) => window.open(url, '_blank')
</script>

<template>
  <div class="max-w-6xl mx-auto p-4 sm:p-6 font-sans text-gray-900">
    <div class="flex items-center gap-3 mb-8 border-b pb-4">
      <h2 class="text-3xl font-black text-gray-900">🧭 진로 및 선택 과목 안내</h2>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
      <button 
        v-for="link in externalLinks" :key="link.name"
        @click="openLink(link.url)"
        class="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-400 transition-all group"
      >
        <span class="text-3xl mb-2 group-hover:scale-110 transition-transform">{{ link.icon }}</span>
        <span class="font-bold text-gray-800">{{ link.name }}</span>
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-2 bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
        <h3 class="text-xl font-black text-indigo-900 mb-6 flex items-center gap-2">
          📊 계열별 선택 과목 추천 (2022 개정 교육과정)
        </h3>
        
        <div class="flex flex-wrap gap-2 mb-6">
          <button 
            v-for="item in careerData" :key="item.group"
            @click="selectedGroup = item"
            class="px-4 py-2 rounded-xl font-bold text-sm transition-all"
            :class="selectedGroup.group === item.group ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-indigo-700 hover:bg-indigo-100'"
          >
            {{ item.group }}
          </button>
        </div>

        <div class="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100 min-h-[200px]">
          <div class="mb-4">
            <span class="text-xs font-bold text-indigo-500 uppercase tracking-wider">추천 권장 과목</span>
            <p class="text-lg font-bold text-gray-800 mt-1 leading-relaxed">{{ selectedGroup.subjects }}</p>
          </div>
          <div>
            <span class="text-xs font-bold text-orange-500 uppercase tracking-wider">관련 진로/학과</span>
            <p class="text-lg font-bold text-gray-800 mt-1">{{ selectedGroup.careers }}</p>
          </div>
        </div>
        <p class="text-xs text-indigo-400 mt-4 font-medium">※ 위 자료는 2025학년도 엑셀 보조자료를 바탕으로 구성되었습니다.</p>
      </div>

      <div class="bg-gray-50 p-6 rounded-3xl border border-gray-200">
        <h3 class="text-xl font-black text-gray-800 mb-4">✍️ 진로 상담 퀵 메모</h3>
        <textarea 
          class="w-full h-64 p-4 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 placeholder-gray-400 text-sm"
          placeholder="학생과의 진로 상담 내용을 간단히 메모해두세요. (상세 기록은 학급관리에서 가능)"
        ></textarea>
        <button class="w-full mt-4 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-black transition-colors">
          메모 임시 저장
        </button>
      </div>
    </div>
  </div>
</template>