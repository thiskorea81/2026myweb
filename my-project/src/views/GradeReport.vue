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

const print = async (target) => {
  printTarget.value = target
  await nextTick()
  window.print()
}
const onAfterPrint = () => { printTarget.value = null }
onMounted(() => window.addEventListener('afterprint', onAfterPrint))
onUnmounted(() => window.removeEventListener('afterprint', onAfterPrint))

const classWithRecord = computed(() => classStudents.value.filter(hasRecord))
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
          <button @click="print('class')" :disabled="!classWithRecord.length"
            class="w-full mt-3 py-2 bg-gray-800 text-white text-sm font-bold rounded-lg hover:bg-black disabled:opacity-40">
            🖨️ 반 전체 인쇄 ({{ classWithRecord.length }}명)
          </button>
          <p class="text-[11px] text-gray-400 mt-1">한 학생당 A4 한 쪽씩 인쇄됩니다.</p>
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
                  <button @click="print('one')" class="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-50">🖨️ 이 학생 인쇄</button>
                </div>
              </div>
              <textarea v-model="message" class="w-full h-72 border border-gray-300 rounded-lg p-3 text-sm font-mono leading-relaxed"></textarea>
              <p v-if="toast" class="text-sm font-bold text-emerald-600 mt-1">{{ toast }}</p>
            </section>
          </template>
        </article>
      </div>
    </div>

    <!-- 인쇄 전용 (한 학생 또는 반 전체, 학생당 한 쪽) -->
    <div class="hidden print:block">
      <template v-if="printTarget === 'one' && selected">
        <div class="print-page"><GradeReportSheet :student="selected" :exam-name="examName" /></div>
      </template>
      <template v-else-if="printTarget === 'class'">
        <div v-for="s in classWithRecord" :key="s.id" class="print-page"><GradeReportSheet :student="s" :exam-name="examName" /></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
@media print {
  @page { size: A4; margin: 12mm; }
  .print-page { break-after: page; page-break-after: always; }
  .print-page:last-child { break-after: auto; page-break-after: auto; }
}
</style>
