<script setup>
import { ref, computed } from 'vue'
import { useStudentStore } from '../stores/studentStore'
import { createImportSession, collectPatches } from '../utils/schoolDocImport'

// 나이스·KICE에서 내려받은 파일을 이름 바꾸거나 붙여넣지 않고 그대로 올리는 곳.
// 파일 종류를 알아서 판별해 미리보기(바뀌는 내용)를 보여 주고, '저장'을 눌러야 DB에 반영한다.
// 파일 해석·합치기 규칙은 utils/schoolDocImport.js / utils/schoolDocParsers.js 에 있다.
const props = defineProps({
  grade: { type: String, required: true },
  cls: { type: String, required: true },
})
const emit = defineEmits(['close'])

const studentStore = useStudentStore()
const jobs = ref([]) // [{ key, kind, title, file, rows: [{ id, name, status, changes[] }], warnings[], patches: Map, error }]
const isReading = ref(false)
const isSaving = ref(false)
const status = ref('')
const updateAddress = ref(true)
const dragOver = ref(false)

const GUIDE = [
  { icon: '🙋', title: '명렬표', where: '나이스 › 학적 › 기본학적관리 › 명렬표 출력 (명렬표 내용 선택 - 모두 선택) › 엑셀 저장', what: '이름·성별·생년월일·주소·학생개인번호 (주민등록번호는 저장하지 않음)' },
  { icon: '📸', title: '학생 사진', where: '나이스 사진일괄입력에 쓰는 파일 그대로: 성명(번호).jpg (예: 홍길동(1).jpg)', what: '선택한 학년·반 학생에게 번호와 이름으로 연결 (자동 압축)' },
  { icon: '📝', title: '정기시험 일람표', where: '나이스 › 학급담임 › 정기시험조회 › 학급별 일람표 › 엑셀 저장', what: '"N학기중간고사/기말고사" 원점수·합계·평균 (학급/학과 평균 포함)' },
  { icon: '📄', title: '성적통지표', where: '나이스 › 학급담임 › 성적처리 › 성적통지표관리 › 엑셀 저장', what: '과목별 석차·수강자수로 석차백분율(중간·기말은 5등급 예상 등급) + 출결 누계' },
  { icon: '📊', title: '학기말 성적', where: '나이스 › 학급담임 › 성적조회 › 학기말성적조회(개인별 일람표) › 엑셀 저장', what: '"N학기학기말" 원점수(석차등급) + "N학기수행평가" 과목별 합계' },
  { icon: '🎯', title: '모의고사 성적통지표', where: 'KICE 시험업무지원 포털 › 성적통지표 출력 › PDF 저장', what: '"N월모의고사" 원점수(전국백분위, 등급) + 과목별 오답 문항' },
]

const totalPatches = computed(() => collectPatches(jobs.value).length)

// 같은 세션에서 읽은 파일들은 학생별 작업본을 공유한다 (앞 파일 결과 위에 이어서 합침)
let session = null
const getSession = async () => {
  if (studentStore.students.length === 0) await studentStore.fetchStudents()
  if (!session) session = createImportSession(studentStore.students)
  return session
}

async function readPdfPages(file) {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent()
    pages.push(tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width })))
  }
  return pages
}

// 사진: 가로 150px JPEG로 줄여 저장 (DB 용량 절약)
const compressImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 150
      canvas.height = (img.height / img.width) * 150
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = reject
    img.src = e.target.result
  }
  reader.onerror = reject
  reader.readAsDataURL(file)
})

const isPhoto = (f) => /\.(jpe?g|png)$/i.test(f.name)
const jobKey = (name) => `${name}-${Date.now()}-${Math.random()}`

async function handleFiles(fileList) {
  const files = [...fileList]
  if (!files.length) return
  isReading.value = true
  status.value = ''
  const s = await getSession()
  for (const file of files.filter(f => !isPhoto(f))) {
    let job
    try {
      if (/\.pdf$/i.test(file.name)) {
        job = s.addKiceReport(file.name, await readPdfPages(file))
      } else if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
        const XLSX = await import('xlsx') // 엑셀 라이브러리는 파일을 올릴 때만 불러온다 (첫 화면 용량 절약)
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
        job = s.addSheet(file.name, rows, { updateAddress: updateAddress.value })
      } else {
        throw new Error('지원하지 않는 파일 형식입니다')
      }
    } catch (e) {
      console.error(e)
      job = { kind: '', title: file.name, file: file.name, rows: [], warnings: [], patches: new Map(), error: e.message }
    }
    jobs.value.push({ ...job, key: jobKey(file.name) })
  }
  const photos = files.filter(isPhoto)
  if (photos.length) {
    const job = await s.addPhotos(photos.map(f => ({ fileName: f.name, load: () => compressImage(f) })), props.grade, props.cls)
    jobs.value.push({ ...job, key: jobKey('photos') })
  }
  isReading.value = false
}

const onPick = (e) => { handleFiles(e.target.files); e.target.value = '' }
const onDrop = (e) => { dragOver.value = false; handleFiles(e.dataTransfer.files) }

// 학생 작업본이 파일끼리 이어져 있어, 하나만 빼기보다 전체를 비우고 다시 읽는다
const reset = () => { jobs.value = []; session = null }

async function save() {
  const patches = collectPatches(jobs.value)
  if (!patches.length) return
  if (!confirm(`${patches.length}명의 자료를 저장할까요?`)) return
  isSaving.value = true
  try {
    await studentStore.saveImportPatches(patches)
    status.value = `✅ ${patches.length}명 저장 완료`
    reset()
  } catch (e) {
    console.error(e)
    status.value = '❌ 저장 중 오류가 발생했습니다'
  } finally {
    isSaving.value = false
  }
}

const KIND_LABEL = { roster: '🙋 명렬표', photo: '📸 사진', exam: '📝 정기시험', semester: '📊 학기말', reportCard: '📄 성적통지표', kice: '🎯 모의고사' }
const countOf = (job, s) => job.rows.filter(r => r.status === s).length
const expanded = ref({})
</script>

<template>
  <div class="mb-6 bg-white border border-indigo-200 rounded-2xl p-6 shadow-sm relative">
    <button @click="emit('close')" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
    <h3 class="text-lg font-black text-gray-900 mb-1">📥 나이스·KICE 자료 올리기</h3>
    <p class="text-sm text-gray-500 mb-4">내려받은 파일을 이름 바꾸지 말고 그대로 올리세요. 종류를 자동으로 알아보고, 바뀌는 내용을 먼저 보여 준 뒤 저장합니다.</p>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-2 mb-4">
      <div v-for="g in GUIDE" :key="g.title" class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs">
        <p class="font-black text-gray-800 mb-1">{{ g.icon }} {{ g.title }}</p>
        <p class="text-gray-600 mb-1">{{ g.where }}</p>
        <p class="text-indigo-600 font-bold">→ {{ g.what }}</p>
      </div>
    </div>

    <label
      class="block border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors"
      :class="dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'"
      @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop">
      <p class="font-black text-gray-700">{{ isReading ? '파일을 읽는 중...' : '여기로 파일을 끌어 놓거나 눌러서 선택 (여러 개 가능)' }}</p>
      <p class="text-xs text-gray-400 mt-1">엑셀(.xlsx) · 성적통지표(.pdf) · 사진(.jpg) — 사진은 {{ grade }}학년 {{ cls }}반 학생에게 연결됩니다</p>
      <input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png" class="hidden" :disabled="isReading || isSaving" @change="onPick" />
    </label>
    <label class="flex items-center gap-2 text-xs text-gray-600 mt-2">
      <input type="checkbox" v-model="updateAddress" /> 명렬표를 올릴 때 주소도 나이스 주소로 바꾸기 (끄면 주소가 비어 있는 학생만 채움)
    </label>

    <div v-if="jobs.length" class="mt-5 space-y-3">
      <div v-for="job in jobs" :key="job.key" class="border rounded-xl overflow-hidden" :class="job.error ? 'border-red-200' : 'border-gray-200'">
        <div class="px-4 py-3 bg-gray-50 flex flex-wrap items-center gap-2">
          <span class="text-xs font-black px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{{ KIND_LABEL[job.kind] || '❓' }}</span>
          <span class="font-bold text-gray-800 text-sm">{{ job.title }}</span>
          <span v-if="job.file && job.title !== job.file" class="text-xs text-gray-400 truncate max-w-xs">{{ job.file }}</span>
          <div class="flex-1"></div>
          <template v-if="!job.error">
            <span class="text-xs font-bold text-green-600">신규 {{ countOf(job, '신규') }}</span>
            <span class="text-xs font-bold text-blue-600">변경 {{ countOf(job, '변경') }}</span>
            <span class="text-xs font-bold text-gray-400">같음 {{ countOf(job, '같음') }}</span>
            <button @click="expanded[job.key] = !expanded[job.key]" class="text-xs font-bold text-gray-500 hover:text-gray-800 ml-2">{{ expanded[job.key] ? '접기 ▲' : '자세히 ▼' }}</button>
          </template>
        </div>
        <p v-if="job.error" class="px-4 py-3 text-sm text-red-600 font-bold">⚠️ {{ job.error }}</p>
        <ul v-if="job.warnings.length" class="px-4 py-2 text-xs text-amber-700 bg-amber-50 space-y-0.5">
          <li v-for="(w, i) in job.warnings" :key="i">⚠️ {{ w }}</li>
        </ul>
        <div v-if="expanded[job.key]" class="max-h-80 overflow-y-auto text-xs divide-y divide-gray-100">
          <div v-for="r in job.rows.filter(r => r.status !== '같음')" :key="r.id + r.changes.join()" class="px-4 py-2 flex gap-3">
            <span class="w-24 shrink-0 font-bold" :class="r.status === '신규' ? 'text-green-600' : 'text-blue-600'">{{ r.id }} {{ r.name }}</span>
            <span class="text-gray-600">{{ r.changes.join(' · ') }}</span>
          </div>
          <p v-if="job.rows.every(r => r.status === '같음')" class="px-4 py-3 text-gray-400">DB와 모두 같습니다.</p>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-2">
        <button @click="reset" class="px-4 py-2 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 text-sm">모두 지우기</button>
        <button @click="save" :disabled="isSaving || totalPatches === 0" class="px-6 py-2 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 disabled:opacity-40 text-sm">
          {{ isSaving ? '저장 중...' : `💾 저장 (${totalPatches}명)` }}
        </button>
      </div>
    </div>
    <p v-if="status" class="mt-3 text-sm font-bold" :class="status.startsWith('✅') ? 'text-green-600' : 'text-red-600'">{{ status }}</p>
  </div>
</template>
