<script setup>
import { computed } from 'vue'
import { examRows, examKind, gradeTrends, boundaryNotes, changeFromPrevious, shortExamName } from '../utils/gradeReport'

// 학생 한 명의 시험 성적 안내지 (화면 미리보기와 인쇄에 함께 쓴다)
// compact: 인쇄용 — 글씨·여백을 줄이고 그래프를 한 줄에 3개씩 놓아 A4 한 쪽에 들어가게 한다
const props = defineProps({
  student: { type: Object, required: true },
  examName: { type: String, required: true },
  compact: { type: Boolean, default: false },
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
const examTitle = computed(() => props.examName.replace(/(\d학기)/, '$1 ').replace(/(\d+월)모의고사/, '$1 모의고사').replace(/학기말$/, '학기말 성적'))
const today = new Date()
const printedOn = `${today.getFullYear()}. ${today.getMonth() + 1}. ${today.getDate()}.`

const fmt = (n, d = 1) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(d)).toString() : '—')
const changeOf = (label) => change.value.changes.find(c => c.label === label)

// 표 칸 공통 스타일 (인쇄용은 더 촘촘하게)
const cell = computed(() => `border border-gray-200 ${props.compact ? 'px-1.5 py-1' : 'p-2'}`)
const head = computed(() => `${cell.value} whitespace-nowrap font-bold`)

// 등급 추이 그래프 좌표 (위쪽이 높은 등급). 양 끝 시험 이름이 잘리지 않게 좌우 여백을 둔다
const W = 220
const H = 94
const xOf = (i, n) => (n <= 1 ? W / 2 : 34 + (i * (W - 64)) / (n - 1))
const yOf = (g) => 17 + ((g - 1) * (H - 33)) / (maxGrade.value - 1) // 맨 위(1등급) 점의 숫자가 잘리지 않게 위 여백
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
// 그래프는 두 번 이상 성적이 있는 과목만 (점 하나는 변화가 없어 의미가 없음)
const trendSubjects = computed(() => trends.value.subjects.filter(t => t.points.filter(p => p.grade).length >= 2))
</script>

<template>
  <div class="report-sheet text-gray-800" :class="compact ? 'text-[12px]' : ''">
    <div class="flex flex-wrap items-end justify-between gap-2" :class="compact ? 'mb-2 pb-2 border-b-2 border-emerald-700' : 'mb-4'">
      <div>
        <p class="text-xs font-bold text-emerald-700 tracking-wide">{{ kindLabel[kind] }} · {{ examTitle }}</p>
        <h2 class="font-black" :class="compact ? 'text-xl' : 'text-2xl'">
          {{ student.name }}
          <span class="font-medium text-gray-500" :class="compact ? 'text-sm' : 'text-base'">{{ student.grade }}학년 {{ student.class }}반 {{ student.number }}번</span>
        </h2>
      </div>
      <p v-if="change.previous" class="text-xs text-gray-500">비교 기준: {{ shortExamName(change.previous) }}</p>
    </div>

    <p v-if="!record" class="text-gray-400 py-10 text-center">이 학생은 {{ examTitle }} 기록이 없습니다.</p>
    <template v-else>
      <!-- 요약 -->
      <div v-if="Object.keys(rows.summary).length" class="grid grid-cols-4 gap-2" :class="compact ? 'mb-2' : 'mb-4'">
        <div v-for="(v, k) in rows.summary" :key="k" class="bg-emerald-50 border border-emerald-100 rounded-lg" :class="compact ? 'px-2 py-1' : 'px-3 py-2'">
          <p class="text-[11px] text-emerald-800 whitespace-nowrap">{{ k }}</p>
          <p class="font-black text-emerald-900" :class="compact ? 'text-base' : 'text-lg'">{{ v }}</p>
        </div>
      </div>

      <!-- 과목별 성적 -->
      <table class="w-full border-collapse" :class="compact ? 'text-[12px] mb-3' : 'text-sm mb-4'">
        <thead>
          <tr class="bg-gray-50 text-gray-600 text-xs">
            <th :class="head" class="text-left">과목</th>
            <th :class="head">점수</th>
            <th v-if="hasStats" :class="head">석차 / 수강자</th>
            <th :class="head">{{ isMock ? '백분위' : '백분율(%)' }}</th>
            <th :class="head">등급</th>
            <th v-if="hasStats" :class="head">과목평균</th>
            <th v-if="change.previous" :class="head">직전 대비</th>
            <th v-if="hasWrong" :class="head" class="w-[38%]">오답 문항</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in rows.subjects" :key="s.label" class="break-inside-avoid">
            <td :class="cell" class="font-bold whitespace-nowrap">{{ s.label }}</td>
            <td :class="cell" class="text-center whitespace-nowrap">
              <template v-if="s.raw !== null">
                <b>{{ fmt(s.raw) }}</b>
                <div v-if="!isMock && !compact && s.raw <= 100" class="h-1 bg-gray-100 rounded mt-1 overflow-hidden"><i class="block h-full bg-emerald-500" :style="{ width: Math.max(0, Math.min(100, s.raw)) + '%' }"></i></div>
              </template>
              <span v-else class="text-gray-400">{{ s.text }}</span>
            </td>
            <td v-if="hasStats" :class="cell" class="text-center whitespace-nowrap">
              <template v-if="s.stats?.석차">{{ s.stats.석차 }}<span v-if="s.stats.동석차수 > 1" class="text-gray-400">({{ s.stats.동석차수 }})</span> / {{ s.stats.수강자수 }}</template>
              <span v-else class="text-gray-300">—</span>
            </td>
            <td :class="cell" class="text-center whitespace-nowrap">{{ s.pct !== null ? fmt(s.pct, 2) : (s.achievement ? '성취도 ' + s.achievement : '—') }}</td>
            <td :class="cell" class="text-center whitespace-nowrap">
              <b v-if="s.grade">{{ s.grade }}</b><span v-else class="text-gray-300">—</span>
              <span v-if="s.grade && s.estimate" class="text-[10px] text-gray-400"> (예상)</span>
            </td>
            <td v-if="hasStats" :class="cell" class="text-center whitespace-nowrap">
              <template v-if="s.stats?.과목평균 != null">
                {{ fmt(s.stats.과목평균) }}
                <span class="text-[11px]" :class="s.raw >= s.stats.과목평균 ? 'text-emerald-600' : 'text-rose-600'">({{ s.raw >= s.stats.과목평균 ? '+' : '' }}{{ fmt(s.raw - s.stats.과목평균) }})</span>
              </template>
              <span v-else class="text-gray-300">—</span>
            </td>
            <td v-if="change.previous" :class="cell" class="text-center text-xs font-bold whitespace-nowrap">
              <template v-if="changeOf(s.label)">
                <span v-if="changeOf(s.label).delta > 0" class="text-emerald-600">▲ {{ changeOf(s.label).delta }}</span>
                <span v-else-if="changeOf(s.label).delta < 0" class="text-rose-600">▼ {{ -changeOf(s.label).delta }}</span>
                <span v-else class="text-gray-400">-</span>
              </template>
            </td>
            <td v-if="hasWrong" :class="cell" class="text-[11px] text-gray-600 leading-snug">
              <template v-if="s.wrong?.오답">
                <b class="text-gray-800">{{ s.wrong.오답.length }}</b>/{{ s.wrong.문항수 }}
                <span v-if="s.wrong.오답.length" class="text-gray-500"> · {{ s.wrong.오답.join(', ') }}</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 등급 추이 -->
      <section v-if="trends.exams.length > 1 && trendSubjects.length" class="break-inside-avoid" :class="compact ? 'mb-2' : 'mb-4'">
        <h3 class="font-black text-sm mb-1">과목별 등급 변화 <span class="font-normal text-xs text-gray-400">(위쪽이 높은 등급 · {{ trends.exams.join(' → ') }})</span></h3>
        <div class="grid gap-2" :class="compact ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-3'">
          <div v-for="t in trendSubjects" :key="t.label" class="border border-gray-200 rounded-lg" :class="compact ? 'px-1.5 py-1' : 'p-2'">
            <p class="text-xs font-bold">{{ t.label }}</p>
            <svg :viewBox="`0 0 ${W} ${H}`" class="w-full block">
              <g v-for="g in gridGrades" :key="g">
                <line x1="22" :x2="W - 10" :y1="yOf(g)" :y2="yOf(g)" stroke="#e5ebe6" />
                <text x="14" :y="yOf(g) + 3" font-size="8" text-anchor="end" fill="#94a3b8">{{ g }}</text>
              </g>
              <path :d="linePath(t.points)" fill="none" stroke="#059669" stroke-width="2" />
              <g v-for="(p, i) in t.points" :key="i">
                <circle v-if="p.grade" :cx="xOf(i, t.points.length)" :cy="yOf(p.grade)" r="3.5" fill="#059669" stroke="white" />
                <text v-if="p.grade" :x="xOf(i, t.points.length)" :y="yOf(p.grade) - 6" font-size="8.5" font-weight="bold" text-anchor="middle" fill="#064e3b">{{ p.grade }}</text>
                <text :x="xOf(i, t.points.length)" :y="H - 3" font-size="8" text-anchor="middle" fill="#64748b">{{ p.exam }}</text>
              </g>
            </svg>
          </div>
        </div>
      </section>

      <!-- 등급 경계 -->
      <section v-if="notes.length" class="bg-amber-50 border border-amber-100 rounded-lg break-inside-avoid" :class="compact ? 'p-2 mb-2' : 'p-3 mb-2'">
        <h3 class="font-black text-sm mb-0.5 text-amber-900">등급 경계 참고</h3>
        <p v-for="n in notes" :key="n" class="text-xs text-amber-800">· {{ n }}</p>
      </section>
      <p class="text-[10.5px] text-gray-400 leading-relaxed">
        <template v-if="rows.subjects.some(s => s.estimate)">※ 예상 등급은 석차백분율로 계산한 5등급제 값이며 확정 성적과 다를 수 있습니다. </template>
        <template v-if="hasStats">※ 석차의 괄호 안 숫자는 동석차 수입니다. </template>
        <template v-if="isMock">※ 영어·한국사는 절대평가라 백분위가 없습니다.</template>
      </p>
    </template>

    <!-- 인쇄물 아래 빈 곳: 학생이 다음 시험 목표를 적거나 상담 때 메모하는 칸 -->
    <section v-if="compact && record" class="mt-3 border border-gray-300 rounded-lg p-2 break-inside-avoid">
      <p class="text-xs font-bold text-gray-600 mb-1">✏️ 다음 시험 목표 · 학습 계획 · 상담 메모</p>
      <div class="h-24 bg-[repeating-linear-gradient(to_bottom,transparent,transparent_23px,#e5e7eb_23px,#e5e7eb_24px)]"></div>
    </section>

    <p v-if="compact" class="mt-2 pt-1 border-t border-gray-200 text-[10px] text-gray-400 flex justify-between">
      <span>{{ student.grade }}학년 {{ student.class }}반 {{ student.number }}번 {{ student.name }} · {{ examTitle }}</span>
      <span>출력 {{ printedOn }}</span>
    </p>
  </div>
</template>
