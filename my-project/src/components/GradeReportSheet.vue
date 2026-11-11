<script setup>
import { computed } from 'vue'
import { examRows, examKind, gradeTrends, boundaryNotes, changeFromPrevious, shortExamName } from '../utils/gradeReport'

// 학생 한 명의 시험 성적 안내지 (화면 미리보기와 인쇄에 함께 쓴다)
const props = defineProps({
  student: { type: Object, required: true },
  examName: { type: String, required: true },
})

const record = computed(() => (props.student.grades || []).find(g => g.examName === props.examName))
const kind = computed(() => examKind(props.examName))
const rows = computed(() => examRows(record.value))
const isMock = computed(() => kind.value === 'mock')
const maxGrade = computed(() => (isMock.value ? 9 : 5))
const notes = computed(() => boundaryNotes(rows.value.subjects))
const change = computed(() => changeFromPrevious(props.student, props.examName))
const trends = computed(() => gradeTrends(props.student, kind.value))
const hasStats = computed(() => rows.value.subjects.some(s => s.stats))
const hasWrong = computed(() => rows.value.subjects.some(s => s.wrong?.오답))
const kindLabel = { mock: '전국연합학력평가', term: '정기고사', final: '학기말 종합 (지필+수행)' }

const fmt = (n, d = 1) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(d)).toString() : '—')
const changeOf = (label) => change.value.changes.find(c => c.label === label)

// 등급 추이 그래프 좌표 (위쪽이 높은 등급)
const W = 220
const H = 92
const xOf = (i, n) => (n <= 1 ? W / 2 : 24 + (i * (W - 40)) / (n - 1))
const yOf = (g) => 10 + ((g - 1) * (H - 26)) / (maxGrade.value - 1)
const linePath = (points) => {
  let d = ''
  let pen = false
  points.forEach((p, i) => {
    if (!p.grade) { pen = false; return }
    d += `${pen ? 'L' : 'M'}${xOf(i, points.length).toFixed(1)},${yOf(p.grade).toFixed(1)} `
    pen = true
  })
  return d
}
const gridGrades = computed(() => (isMock.value ? [1, 3, 5, 7, 9] : [1, 2, 3, 4, 5]))
</script>

<template>
  <div class="report-sheet text-gray-800">
    <div class="flex flex-wrap items-end justify-between gap-2 mb-4">
      <div>
        <p class="text-xs font-bold text-emerald-700 tracking-wide">{{ kindLabel[kind] }} · {{ examName }}</p>
        <h2 class="text-2xl font-black">
          {{ student.name }}
          <span class="text-base font-medium text-gray-500">{{ student.grade }}학년 {{ student.class }}반 {{ student.number }}번</span>
        </h2>
      </div>
      <p v-if="change.previous" class="text-xs text-gray-500">비교 기준: {{ shortExamName(change.previous) }}</p>
    </div>

    <p v-if="!record" class="text-gray-400 py-10 text-center">이 학생은 {{ examName }} 기록이 없습니다.</p>
    <template v-else>
      <!-- 요약 -->
      <div v-if="Object.keys(rows.summary).length" class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div v-for="(v, k) in rows.summary" :key="k" class="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          <p class="text-[11px] text-emerald-800">{{ k }}</p>
          <p class="text-lg font-black text-emerald-900">{{ v }}</p>
        </div>
      </div>

      <!-- 과목별 성적 -->
      <table class="w-full text-sm border-collapse mb-4">
        <thead>
          <tr class="bg-gray-50 text-gray-600 text-xs">
            <th class="border border-gray-200 p-2 text-left">과목</th>
            <th class="border border-gray-200 p-2">점수</th>
            <th v-if="hasStats" class="border border-gray-200 p-2">석차 / 수강자</th>
            <th class="border border-gray-200 p-2">{{ isMock ? '백분위' : '백분율(%)' }}</th>
            <th class="border border-gray-200 p-2">등급</th>
            <th v-if="hasStats" class="border border-gray-200 p-2">과목평균</th>
            <th v-if="change.previous" class="border border-gray-200 p-2">직전 대비</th>
            <th v-if="hasWrong" class="border border-gray-200 p-2">오답</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in rows.subjects" :key="s.label">
            <td class="border border-gray-200 p-2 font-bold">{{ s.label }}</td>
            <td class="border border-gray-200 p-2 text-center">
              <template v-if="s.raw !== null">
                <b>{{ fmt(s.raw) }}</b>
                <div v-if="!isMock && s.raw <= 100" class="h-1 bg-gray-100 rounded mt-1 overflow-hidden"><i class="block h-full bg-emerald-500" :style="{ width: Math.max(0, Math.min(100, s.raw)) + '%' }"></i></div>
              </template>
              <span v-else class="text-gray-400">{{ s.text }}</span>
            </td>
            <td v-if="hasStats" class="border border-gray-200 p-2 text-center">
              <template v-if="s.stats?.석차">{{ s.stats.석차 }}<span v-if="s.stats.동석차수 > 1" class="text-gray-400">({{ s.stats.동석차수 }})</span> / {{ s.stats.수강자수 }}</template>
              <span v-else class="text-gray-300">—</span>
            </td>
            <td class="border border-gray-200 p-2 text-center">{{ s.pct !== null ? fmt(s.pct, 2) : (s.achievement ? '성취도 ' + s.achievement : '—') }}</td>
            <td class="border border-gray-200 p-2 text-center">
              <b v-if="s.grade">{{ s.grade }}</b><span v-else class="text-gray-300">—</span>
              <span v-if="s.grade && s.estimate" class="text-[10px] text-gray-400 ml-0.5">예상</span>
            </td>
            <td v-if="hasStats" class="border border-gray-200 p-2 text-center">
              <template v-if="s.stats?.과목평균 != null">
                {{ fmt(s.stats.과목평균) }}
                <span class="text-[11px]" :class="s.raw >= s.stats.과목평균 ? 'text-emerald-600' : 'text-rose-600'">({{ s.raw >= s.stats.과목평균 ? '+' : '' }}{{ fmt(s.raw - s.stats.과목평균) }})</span>
              </template>
              <span v-else class="text-gray-300">—</span>
            </td>
            <td v-if="change.previous" class="border border-gray-200 p-2 text-center text-xs font-bold">
              <template v-if="changeOf(s.label)">
                <span v-if="changeOf(s.label).delta > 0" class="text-emerald-600">▲ {{ changeOf(s.label).delta }}</span>
                <span v-else-if="changeOf(s.label).delta < 0" class="text-rose-600">▼ {{ -changeOf(s.label).delta }}</span>
                <span v-else class="text-gray-400">-</span>
              </template>
            </td>
            <td v-if="hasWrong" class="border border-gray-200 p-2 text-[11px] text-gray-600">
              <template v-if="s.wrong?.오답">
                <b>{{ s.wrong.오답.length }}</b>/{{ s.wrong.문항수 }}
                <span v-if="s.wrong.오답.length" class="block text-gray-400 leading-tight">{{ s.wrong.오답.join(', ') }}</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 등급 추이 -->
      <section v-if="trends.exams.length > 1" class="mb-4 break-inside-avoid">
        <h3 class="font-black text-sm mb-1">과목별 등급 변화 <span class="font-normal text-xs text-gray-400">(위쪽이 높은 등급 · {{ trends.exams.join(' → ') }})</span></h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div v-for="t in trends.subjects" :key="t.label" class="border border-gray-200 rounded-lg p-2">
            <p class="text-xs font-bold mb-1">{{ t.label }}</p>
            <svg :viewBox="`0 0 ${W} ${H}`" class="w-full">
              <g v-for="g in gridGrades" :key="g">
                <line x1="18" :x2="W - 8" :y1="yOf(g)" :y2="yOf(g)" stroke="#eef2ee" />
                <text x="12" :y="yOf(g) + 3" font-size="8" text-anchor="end" fill="#94a3b8">{{ g }}</text>
              </g>
              <path :d="linePath(t.points)" fill="none" stroke="#059669" stroke-width="2" />
              <g v-for="(p, i) in t.points" :key="i">
                <circle v-if="p.grade" :cx="xOf(i, t.points.length)" :cy="yOf(p.grade)" r="3.5" fill="#059669" stroke="white" />
                <text v-if="p.grade" :x="xOf(i, t.points.length)" :y="yOf(p.grade) - 6" font-size="8" font-weight="bold" text-anchor="middle" fill="#064e3b">{{ p.grade }}</text>
                <text :x="xOf(i, t.points.length)" :y="H - 3" font-size="7.5" text-anchor="middle" fill="#64748b">{{ p.exam }}</text>
              </g>
            </svg>
          </div>
        </div>
      </section>

      <!-- 등급 경계 -->
      <section v-if="notes.length" class="mb-2 bg-amber-50 border border-amber-100 rounded-lg p-3 break-inside-avoid">
        <h3 class="font-black text-sm mb-1 text-amber-900">등급 경계 참고</h3>
        <p v-for="n in notes" :key="n" class="text-xs text-amber-800">· {{ n }}</p>
      </section>
      <p class="text-[11px] text-gray-400 leading-relaxed">
        <template v-if="rows.subjects.some(s => s.estimate)">※ 예상 등급은 석차백분율로 계산한 5등급제 값이며 확정 성적과 다를 수 있습니다. </template>
        <template v-if="hasStats">※ 석차의 괄호 안 숫자는 동석차 수입니다. </template>
        <template v-if="isMock">※ 영어·한국사는 절대평가라 백분위가 없습니다.</template>
      </p>
    </template>
  </div>
</template>
