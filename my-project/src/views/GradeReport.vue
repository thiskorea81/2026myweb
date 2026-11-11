<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useStudentStore } from '../stores/studentStore'
import GradeReportSheet from '../components/GradeReportSheet.vue'
import { examKind, buildMessage } from '../utils/gradeReport'

// 시험이 끝날 때마다 학생별 성적을 분석해 안내하는 교사용 페이지.
// '학급관리 › 자료 올리기'로 성적이 들어오면 여기서 바로 학생별 분석·안내문·인쇄물을 만든다.
const studentStore = useStudentStore()
const { students } = storeToRefs(studentStore)
onMounted(() => { if (students.value.length === 0) studentStore.fetchStudents() })

const myGrade = ref(localStorage.getItem('myGrade') || '1')
const myClass = ref(localStorage.getItem('myClass') || '1')
const search = ref('')
const selectedId = ref(null)
const message = ref('')
const toast = ref('')
const printTarget = ref(null) // 'one' | 'class' | null

const classStudents = computed(() => students.value
  .filter(s => !s.isArchived && String(s.grade) === myGrade.value && String(s.class) === myClass.value)
  .sort((a, b) => Number(a.number) - Number(b.number)))

// 반 학생들이 가진 시험 목록 (저장 순서 = 시행 순서, 최신이 위)
const exams = computed(() => {
  const names = []
  classStudents.value.forEach(s => (s.grades || []).forEach(g => {
    if (examKind(g.examName) && !names.includes(g.examName)) names.push(g.examName)
  }))
  return names.reverse()
})
const examName = ref('')
watch(exams, (list) => { if (!list.includes(examName.value)) examName.value = list[0] || '' }, { immediate: true })

const hasRecord = (s) => (s.grades || []).some(g => g.examName === examName.value)
const filtered = computed(() => {
  const q = search.value.trim()
  return classStudents.value.filter(s => !q || s.name.includes(q) || String(s.number) === q)
})
const selected = computed(() => classStudents.value.find(s => s.id === selectedId.value) || null)

// 학생이나 시험이 바뀌면 안내문 초안을 새로 만든다 (선생님이 고쳐 쓸 수 있음)
watch([selected, examName], () => {
  toast.value = ''
  const record = selected.value?.grades?.find(g => g.examName === examName.value)
  message.value = record ? buildMessage(selected.value, record) : ''
})

const copyMessage = async () => {
  try {
    await navigator.clipboard.writeText(message.value)
    toast.value = '📋 안내문을 복사했습니다. 메신저에 붙여 넣으세요.'
  } catch {
    toast.value = '복사하지 못했습니다. 안내문을 직접 선택해 복사해 주세요.'
  }
}

// ───────── 인쇄 옵션: 정기고사 / 모의고사 / 정기고사+모의고사 ─────────
// 정기고사(중간·기말·학기말)와 모의고사를 각각 한 회씩 골라, 학생마다 종류별로 A4 한 쪽씩 인쇄한다.
const PRINT_MODES = [
  { value: 'school', label: '정기고사' },
  { value: 'mock', label: '모의고사' },
  { value: 'both', label: '정기고사+모의고사' },
]
const savedMode = (() => { try { return localStorage.getItem('gradeReportPrintMode') } catch { return null } })()
const printMode = ref(PRINT_MODES.some(m => m.value === savedMode) ? savedMode : 'school')
watch(printMode, (v) => { try { localStorage.setItem('gradeReportPrintMode', v) } catch { /* 저장 안 돼도 인쇄는 됨 */ } })

const schoolExams = computed(() => exams.value.filter(e => examKind(e) !== 'mock'))
const mockExams = computed(() => exams.value.filter(e => examKind(e) === 'mock'))
const printSchoolExam = ref('')
const printMockExam = ref('')
// 기본은 각 종류의 최신 시험. 화면에서 시험을 고르면 그 종류의 인쇄 대상도 따라간다.
watch(schoolExams, (list) => { if (!list.includes(printSchoolExam.value)) printSchoolExam.value = list[0] || '' }, { immediate: true })
watch(mockExams, (list) => { if (!list.includes(printMockExam.value)) printMockExam.value = list[0] || '' }, { immediate: true })
watch(examName, (e) => {
  if (!e) return
  if (examKind(e) === 'mock') printMockExam.value = e
  else printSchoolExam.value = e
})

const printExamNames = computed(() => [
  ...(printMode.value !== 'mock' && printSchoolExam.value ? [printSchoolExam.value] : []),
  ...(printMode.value !== 'school' && printMockExam.value ? [printMockExam.value] : []),
])
const recordOf = (s, e) => (s.grades || []).some(g => g.examName === e)
// 학생별로 인쇄할 쪽. 기록이 없는 시험은 빼되, 정기고사+모의고사(양면)에서는 한쪽만 있어도 두 쪽을 모두 넣어
// 다음 학생이 뒷면으로 밀리지 않게 한다 (기록 없는 쪽에는 '기록이 없습니다'가 찍힘).
const pagesFor = (s) => {
  const have = printExamNames.value.filter(e => recordOf(s, e))
  const exams = printMode.value === 'both' && have.length ? printExamNames.value : have
  return exams.map(e => ({ key: `${s.id}-${e}`, student: s, examName: e }))
}
const printPages = computed(() => {
  if (printTarget.value === 'one') return selected.value ? pagesFor(selected.value) : []
  if (printTarget.value === 'class') return classStudents.value.flatMap(pagesFor)
  return []
})
const classPrintCount = computed(() => classStudents.value.filter(s => pagesFor(s).length).length)
const selectedPrintCount = computed(() => (selected.value ? pagesFor(selected.value).length : 0))

const print = async (target) => {
  printTarget.value = target
  await nextTick()
  window.print()
}
const onAfterPrint = () => { printTarget.value = null }
onMounted(() => window.addEventListener('afterprint', onAfterPrint))
onUnmounted(() => window.removeEventListener('afterprint', onAfterPrint))
</script>

<template>
  <div class="max-w-screen-2xl mx-auto">
    <!-- 화면 -->
    <div class="print:hidden">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h2 class="text-2xl font-black text-gray-800">📈 성적 안내</h2>
          <p class="text-sm text-gray-500">시험이 끝나면 '학급관리 › 자료 올리기'로 성적을 올리고, 여기서 학생별 분석과 안내문을 확인하세요.</p>
        </div>
        <span class="text-xs font-bold px-3 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">교사용 · 학생에게는 개별 안내문/인쇄물만 전달</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <aside class="bg-white border border-gray-200 rounded-xl p-4 h-fit lg:sticky lg:top-20">
          <div class="flex gap-2 mb-3">
            <select v-model="myGrade" class="flex-1 border border-gray-300 rounded-lg p-2 text-sm font-bold">
              <option v-for="g in ['1', '2', '3']" :key="g" :value="g">{{ g }}학년</option>
            </select>
            <select v-model="myClass" class="flex-1 border border-gray-300 rounded-lg p-2 text-sm font-bold">
              <option v-for="c in 15" :key="c" :value="String(c)">{{ c }}반</option>
            </select>
          </div>
          <label class="text-xs font-bold text-gray-500">시험</label>
          <select v-model="examName" class="w-full border border-gray-300 rounded-lg p-2 text-sm font-bold mb-3">
            <option v-for="e in exams" :key="e" :value="e">{{ e }}</option>
          </select>
          <input v-model="search" placeholder="이름 또는 번호" class="w-full border border-gray-300 rounded-lg p-2 text-sm mb-2" />
          <nav class="max-h-[55vh] overflow-y-auto space-y-1">
            <button v-for="s in filtered" :key="s.id" @click="selectedId = s.id"
              class="w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between items-center transition-colors"
              :class="selectedId === s.id ? 'bg-emerald-600 text-white font-bold' : 'hover:bg-gray-50 text-gray-700'">
              <span>{{ s.number }}. {{ s.name }}</span>
              <span v-if="!hasRecord(s)" class="text-[10px]" :class="selectedId === s.id ? 'text-emerald-100' : 'text-gray-300'">기록 없음</span>
            </button>
            <p v-if="!filtered.length" class="text-sm text-gray-400 text-center py-4">학생이 없습니다.</p>
          </nav>
          <section class="mt-4 pt-4 border-t border-gray-100">
            <p class="text-xs font-bold text-gray-500 mb-2">🖨️ 인쇄 옵션</p>
            <div class="grid grid-cols-3 gap-1 mb-2">
              <button v-for="m in PRINT_MODES" :key="m.value" @click="printMode = m.value"
                class="px-1 py-1.5 rounded-lg text-[11px] font-bold border transition-colors"
                :class="printMode === m.value ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'">
                {{ m.label }}
              </button>
            </div>
            <label v-if="printMode !== 'mock'" class="block text-[11px] text-gray-500 mb-1">
              정기고사
              <select v-model="printSchoolExam" class="w-full border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-gray-800">
                <option v-if="!schoolExams.length" value="">기록 없음</option>
                <option v-for="e in schoolExams" :key="e" :value="e">{{ e }}</option>
              </select>
            </label>
            <label v-if="printMode !== 'school'" class="block text-[11px] text-gray-500 mb-1">
              모의고사
              <select v-model="printMockExam" class="w-full border border-gray-300 rounded-lg p-1.5 text-xs font-bold text-gray-800">
                <option v-if="!mockExams.length" value="">기록 없음</option>
                <option v-for="e in mockExams" :key="e" :value="e">{{ e }}</option>
              </select>
            </label>
            <button @click="print('class')" :disabled="!classPrintCount"
              class="w-full mt-2 py-2 bg-gray-800 text-white text-sm font-bold rounded-lg hover:bg-black disabled:opacity-40">
              🖨️ 반 전체 인쇄 ({{ classPrintCount }}명)
            </button>
            <p class="text-[11px] text-gray-400 mt-1 leading-relaxed">
              시험 종류마다 학생당 A4 한 쪽씩 인쇄됩니다.
              <template v-if="printMode === 'both'">정기고사+모의고사는 양면(긴 쪽 넘김)으로 인쇄하면 앞면 정기고사, 뒷면 모의고사가 됩니다.</template>
            </p>
          </section>
        </aside>

        <article class="lg:col-span-3 bg-white border border-gray-200 rounded-xl p-6">
          <div v-if="!exams.length" class="text-center py-20 text-gray-400">
            {{ myGrade }}학년 {{ myClass }}반에 등록된 시험 성적이 없습니다.
          </div>
          <div v-else-if="!selected" class="text-center py-20 text-gray-400">
            왼쪽 목록에서 학생을 선택하세요.
          </div>
          <template v-else>
            <GradeReportSheet :student="selected" :exam-name="examName" />

            <section v-if="message" class="mt-6 border-t border-gray-100 pt-5">
              <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 class="font-black text-gray-800">✉️ 개별 안내문 <span class="text-xs font-normal text-gray-400">보내기 전에 고쳐 쓸 수 있습니다</span></h3>
                <div class="flex gap-2">
                  <button @click="copyMessage" class="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700">📋 안내문 복사</button>
                  <button @click="print('one')" :disabled="!selectedPrintCount" :title="`인쇄 옵션(${PRINT_MODES.find(m => m.value === printMode).label})대로 인쇄`"
                    class="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-50 disabled:opacity-40">
                    🖨️ 이 학생 인쇄 ({{ PRINT_MODES.find(m => m.value === printMode).label }})
                  </button>
                </div>
              </div>
              <textarea v-model="message" class="w-full h-72 border border-gray-300 rounded-lg p-3 text-sm font-mono leading-relaxed"></textarea>
              <p v-if="toast" class="text-sm font-bold text-emerald-600 mt-1">{{ toast }}</p>
            </section>
          </template>
        </article>
      </div>
    </div>

    <!-- 인쇄 전용: 인쇄 옵션에 따라 학생마다 정기고사 쪽 / 모의고사 쪽 (각 A4 한 쪽) -->
    <div class="hidden print:block">
      <div v-for="p in printPages" :key="p.key" class="print-page">
        <GradeReportSheet :student="p.student" :exam-name="p.examName" compact />
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  @page { size: A4; margin: 12mm; }
  .print-page { break-after: page; page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-page:last-child { break-after: auto; page-break-after: auto; }
}
</style>
