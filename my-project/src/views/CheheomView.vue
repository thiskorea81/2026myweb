<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { collection, addDoc } from 'firebase/firestore'
import { db } from '../firebase'

/* ---------- 탭 ---------- */
const tab = ref('apply') // 'apply' | 'report'

/* ---------- 2026학년도 학사일정 (2026 상당고 학사운영계획.hwpx 기준) ---------- */
const CLOSED_RANGES = [
  ['2026-03-01', '2026-03-02'],
  ['2026-05-01', '2026-05-01'],
  ['2026-05-04', '2026-05-05'],
  ['2026-05-24', '2026-05-25'],
  ['2026-06-03', '2026-06-03'],
  ['2026-06-06', '2026-06-06'],
  ['2026-07-17', '2026-07-17'],
  ['2026-07-21', '2026-08-17'],
  ['2026-09-24', '2026-09-26'],
  ['2026-10-03', '2026-10-03'],
  ['2026-10-05', '2026-10-05'],
  ['2026-10-09', '2026-10-09'],
  ['2026-11-09', '2026-11-09'],
  ['2026-12-25', '2026-12-25'],
  ['2026-12-31', '2027-01-31'],
  ['2027-02-03', '2027-02-03'],
  ['2027-02-06', '2027-02-28'],
]
const EXAM_RANGES = [
  ['2026-04-21', '2026-04-24', '1학기 중간고사'],
  ['2026-06-22', '2026-06-26', '1학기 기말고사'],
  ['2026-10-13', '2026-10-16', '2학기 중간고사'],
]

function parseYmd(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]) }
function toYmd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
function inRanges(ymd, ranges) {
  for (const r of ranges) if (ymd >= r[0] && ymd <= r[1]) return r[2] || true
  return null
}
function isWeekend(d) { const w = d.getDay(); return w === 0 || w === 6 }
function isSchoolDay(d) { return !isWeekend(d) && !inRanges(toYmd(d), CLOSED_RANGES) }
function overlapsExam(startYmd, endYmd) {
  for (const r of EXAM_RANGES) if (startYmd <= r[1] && endYmd >= r[0]) return r[2]
  return null
}
function countSchoolDays(startYmd, endYmd) {
  const start = parseYmd(startYmd), end = parseYmd(endYmd)
  if (end < start) return { days: 0, weekend: 0, closed: 0, total: 0 }
  let days = 0, weekend = 0, closed = 0, total = 0
  const cur = new Date(start)
  while (cur <= end) {
    total++
    if (isWeekend(cur)) weekend++
    else if (inRanges(toYmd(cur), CLOSED_RANGES)) closed++
    else days++
    cur.setDate(cur.getDate() + 1)
  }
  return { days, weekend, closed, total }
}

/* ---------- 신청서 상태 ---------- */
const a = ref({
  name: '', grade: '1', klass: '5', number: '',
  mode: 'full', start: '', end: '', halfDate: '', halfAmpm: '오전',
  studyType: '현장체험학습', place: '',
  escort: '부모', escortName: '',
  guardianName: '', guardianRel: '', plan: '',
  agreeRule: false, agreeSafety: false,
})
const aError = ref('')
const aSubmitting = ref(false)
const aDone = ref(null) // ref id string when done

const STUDY_TYPES = ['현장체험학습', '친인척 방문', '가족동반여행', '고적답사 및 향토행사 참여', '가정학습', '기타']
const ESCORTS = ['부모', '조부모', '친척 및 형제자매', '시설관리자', '기타']

const fullDaycount = computed(() => {
  if (!a.value.start || !a.value.end || a.value.end < a.value.start) return null
  return countSchoolDays(a.value.start, a.value.end)
})
const fullExamHit = computed(() => {
  if (!a.value.start || !a.value.end || a.value.end < a.value.start) return null
  return overlapsExam(a.value.start, a.value.end)
})
const halfBlocked = computed(() => {
  if (!a.value.halfDate) return null
  const hit = overlapsExam(a.value.halfDate, a.value.halfDate)
  if (hit) return hit + ' 기간에는 신청할 수 없습니다.'
  if (!isSchoolDay(parseYmd(a.value.halfDate))) return '등교일이 아닙니다(주말 또는 공휴일·방학).'
  return null
})

/* ---------- 서명 패드 ---------- */
function useSignaturePad(canvasRef) {
  const has = ref(false)
  let ctx = null, drawing = false, last = null
  function resize() {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    const prev = has.value ? canvas.toDataURL() : null
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1c2733'
    if (prev) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height); img.src = prev }
  }
  function pos(e) {
    const canvas = canvasRef.value
    const rect = canvas.getBoundingClientRect()
    const p = (e.touches && e.touches[0]) || e
    return { x: p.clientX - rect.left, y: p.clientY - rect.top }
  }
  function start(e) { drawing = true; last = pos(e); e.preventDefault() }
  function move(e) {
    if (!drawing) return
    const p = pos(e)
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last = p; has.value = true
    e.preventDefault()
  }
  function end() { drawing = false }
  function clear() {
    const canvas = canvasRef.value
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    has.value = false
  }
  function attach() {
    const canvas = canvasRef.value
    if (!canvas) return
    canvas.addEventListener('pointerdown', start)
    canvas.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', end)
    window.addEventListener('resize', resize)
    resize()
  }
  function toDataUrl() { return canvasRef.value.toDataURL('image/png') }
  return { has, attach, clear, toDataUrl }
}

const guardianCanvas = ref(null)
const studentCanvas = ref(null)
const sigGuardian = useSignaturePad(guardianCanvas)
const sigStudent = useSignaturePad(studentCanvas)

onMounted(() => { sigGuardian.attach(); sigStudent.attach() })

/* ---------- 신청서 제출 ---------- */
async function submitApply() {
  aError.value = ''
  const v = a.value
  let period, days
  if (v.mode === 'full') {
    if (!v.start || !v.end) { aError.value = '신청 기간을 선택해 주세요.'; return }
    if (v.end < v.start) { aError.value = '종료일이 시작일보다 빠릅니다.'; return }
    if (overlapsExam(v.start, v.end)) { aError.value = '정기고사 기간과 겹쳐 신청할 수 없습니다.'; return }
    const r = countSchoolDays(v.start, v.end)
    if (r.days === 0) { aError.value = '선택한 기간에 등교일이 없습니다.'; return }
    period = { mode: 'full', start: v.start, end: v.end }
    days = r.days
  } else {
    if (!v.halfDate) { aError.value = '날짜를 선택해 주세요.'; return }
    if (halfBlocked.value) { aError.value = halfBlocked.value; return }
    period = { mode: 'half', date: v.halfDate, ampm: v.halfAmpm }
    days = 0.5
  }
  if (!v.name.trim()) { aError.value = '성명을 입력해 주세요.'; return }
  if (!v.number.trim()) { aError.value = '번호를 입력해 주세요.'; return }
  if (!v.place.trim()) { aError.value = '체험학습 장소를 입력해 주세요.'; return }
  if (!v.plan.trim()) { aError.value = '체험학습 계획을 입력해 주세요.'; return }
  if (!v.guardianName.trim()) { aError.value = '보호자명을 입력해 주세요.'; return }
  if (!v.agreeRule || !v.agreeSafety) { aError.value = '확인 사항에 모두 동의해 주세요.'; return }
  if (sigGuardian.has.value === false) { aError.value = '보호자 서명을 해 주세요.'; return }
  if (sigStudent.has.value === false) { aError.value = '학생 서명을 해 주세요.'; return }

  aSubmitting.value = true
  try {
    const docRef = await addDoc(collection(db, 'cheheomApplications'), {
      name: v.name.trim(), grade: v.grade, class: v.klass, number: v.number.trim(),
      period, days,
      studyType: v.studyType, place: v.place.trim(),
      escort: v.escort, escortName: v.escortName.trim() || null,
      guardianName: v.guardianName.trim(), guardianRel: v.guardianRel.trim(),
      plan: v.plan.trim(),
      guardianSignature: sigGuardian.toDataUrl(),
      studentSignature: sigStudent.toDataUrl(),
      submittedAt: new Date().toISOString(),
      status: '접수',
    })
    aDone.value = docRef.id
  } catch (e) {
    aError.value = '제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  } finally {
    aSubmitting.value = false
  }
}
function resetApply() {
  a.value = { name: '', grade: '1', klass: '5', number: '', mode: 'full', start: '', end: '', halfDate: '', halfAmpm: '오전', studyType: '현장체험학습', place: '', escort: '부모', escortName: '', guardianName: '', guardianRel: '', plan: '', agreeRule: false, agreeSafety: false }
  sigGuardian.clear(); sigStudent.clear()
  aDone.value = null
  aError.value = ''
}

/* ---------- 결과보고서 상태 ---------- */
const r = ref({ name: '', grade: '1', klass: '5', number: '', start: '', end: '', docNumber: '', place: '', summary: '', agreeFinal: false })
const rError = ref('')
const rSubmitting = ref(false)
const rDone = ref(null)
const photos = ref([]) // {dataUrl, bytes}
const MAX_PHOTOS = 2
const TARGET_BYTES = 110 * 1024

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()
    reader.onload = (e) => { img.src = e.target.result }
    reader.onerror = reject
    img.onload = () => {
      const maxDim = 1100
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      let quality = 0.72
      let dataUrl = canvas.toDataURL('image/jpeg', quality)
      let tries = 0
      while (dataUrl.length * 0.75 > TARGET_BYTES && quality > 0.25 && tries < 7) {
        quality -= 0.1
        dataUrl = canvas.toDataURL('image/jpeg', quality)
        tries++
      }
      resolve({ dataUrl, bytes: Math.round(dataUrl.length * 0.75) })
    }
    img.onerror = reject
    reader.readAsDataURL(file)
  })
}
async function onPhotoInput(e) {
  const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS - photos.value.length)
  const results = await Promise.all(files.map(compressImage))
  photos.value = [...photos.value, ...results].slice(0, MAX_PHOTOS)
  e.target.value = ''
}
function removePhoto(i) { photos.value = photos.value.filter((_, idx) => idx !== i) }

async function submitReport() {
  rError.value = ''
  const v = r.value
  if (!v.name.trim()) { rError.value = '성명을 입력해 주세요.'; return }
  if (!v.number.trim()) { rError.value = '번호를 입력해 주세요.'; return }
  if (!v.start || !v.end) { rError.value = '체험학습 기간을 입력해 주세요.'; return }
  if (v.end < v.start) { rError.value = '종료일이 시작일보다 빠릅니다.'; return }
  if (!v.place.trim()) { rError.value = '다녀온 장소를 입력해 주세요.'; return }
  if (!v.summary.trim()) { rError.value = '체험 내용을 입력해 주세요.'; return }
  if (photos.value.length < 2) { rError.value = '보호자와 함께 있는 사진을 2장 첨부해 주세요.'; return }
  if (!v.agreeFinal) { rError.value = '확인에 동의해 주세요.'; return }

  rSubmitting.value = true
  try {
    const docRef = await addDoc(collection(db, 'cheheomReports'), {
      name: v.name.trim(), grade: v.grade, class: v.klass, number: v.number.trim(),
      start: v.start, end: v.end, docNumber: v.docNumber.trim() || null,
      place: v.place.trim(), summary: v.summary.trim(),
      photos: photos.value.map((p) => p.dataUrl),
      submittedAt: new Date().toISOString(),
      status: '접수',
    })
    rDone.value = docRef.id
  } catch (e) {
    rError.value = '제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  } finally {
    rSubmitting.value = false
  }
}
function resetReport() {
  r.value = { name: '', grade: '1', klass: '5', number: '', start: '', end: '', docNumber: '', place: '', summary: '', agreeFinal: false }
  photos.value = []
  rDone.value = null
  rError.value = ''
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 py-8 px-4 font-sans">
    <div class="max-w-lg mx-auto">
      <div class="text-center mb-6">
        <div class="text-5xl mb-3">🧾</div>
        <h1 class="text-2xl font-black text-gray-800 tracking-tight">체험학습 창구</h1>
        <p class="text-gray-500 mt-2 text-sm">「학교장허가 교외체험학습」 신청서·결과보고서를 온라인으로 제출합니다.</p>
      </div>

      <div class="flex gap-1 bg-white rounded-full p-1 shadow-sm border border-gray-100 mb-6">
        <button @click="tab = 'apply'" :class="['flex-1 py-3 rounded-full font-black text-sm transition-all', tab === 'apply' ? 'bg-teal-600 text-white' : 'text-gray-500']">신청서 제출</button>
        <button @click="tab = 'report'" :class="['flex-1 py-3 rounded-full font-black text-sm transition-all', tab === 'report' ? 'bg-teal-600 text-white' : 'text-gray-500']">결과보고서 제출</button>
      </div>

      <!-- ===================== 신청서 ===================== -->
      <div v-if="tab === 'apply'">
        <div v-if="aDone" class="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 text-center">
          <div class="text-4xl mb-3">✅</div>
          <h3 class="font-black text-gray-800 text-lg mb-2">신청서가 접수되었습니다</h3>
          <p class="text-gray-500 text-sm">담임 선생님이 확인 후 통보서(또는 문자)로 최종 허가 여부를 안내합니다.</p>
          <p class="text-gray-400 text-xs mt-2">보호자가 신청서를 제출하였다 하여 체험학습이 허가된 것은 아닙니다.</p>
          <div class="inline-block mt-4 font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">접수번호 {{ aDone }}</div>
          <button @click="resetApply" class="block mx-auto mt-5 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold text-gray-600">새 신청서 작성</button>
        </div>

        <form v-else @submit.prevent="submitApply" class="bg-white rounded-3xl shadow-lg border border-gray-100 p-7 space-y-6">
          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">성명 · 학번</label>
            <input v-model="a.name" type="text" placeholder="이름" class="w-full p-3 border border-gray-200 rounded-xl font-bold text-gray-800 mb-2" />
            <div class="flex items-center gap-1.5 flex-wrap">
              <input v-model="a.grade" type="text" inputmode="numeric" maxlength="1" class="w-14 p-3 border border-gray-200 rounded-xl text-center font-bold" />
              <span class="text-xs text-gray-400 mr-2">학년</span>
              <input v-model="a.klass" type="text" inputmode="numeric" maxlength="1" class="w-14 p-3 border border-gray-200 rounded-xl text-center font-bold" />
              <span class="text-xs text-gray-400 mr-2">반</span>
              <input v-model="a.number" type="text" inputmode="numeric" maxlength="2" placeholder="00" class="w-14 p-3 border border-gray-200 rounded-xl text-center font-bold" />
              <span class="text-xs text-gray-400">번</span>
            </div>
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">신청 기간</label>
            <div class="flex gap-2 mb-3">
              <button type="button" @click="a.mode = 'full'" :class="['flex-1 py-2.5 rounded-xl text-sm font-bold border-2', a.mode === 'full' ? 'bg-teal-50 border-teal-600 text-teal-700' : 'border-gray-200 text-gray-500']">1일 기준(종일)</button>
              <button type="button" @click="a.mode = 'half'" :class="['flex-1 py-2.5 rounded-xl text-sm font-bold border-2', a.mode === 'half' ? 'bg-teal-50 border-teal-600 text-teal-700' : 'border-gray-200 text-gray-500']">반일 기준</button>
            </div>

            <div v-if="a.mode === 'full'">
              <div class="flex items-center gap-2 flex-wrap">
                <input v-model="a.start" type="date" class="flex-1 min-w-[140px] p-3 border border-gray-200 rounded-xl font-bold" />
                <span class="text-gray-400">~</span>
                <input v-model="a.end" type="date" class="flex-1 min-w-[140px] p-3 border border-gray-200 rounded-xl font-bold" />
              </div>
              <div class="mt-3 border border-dashed border-gray-300 rounded-xl p-3 bg-gray-50 flex items-center gap-3">
                <div class="text-2xl font-black text-teal-700 leading-none">{{ fullDaycount ? fullDaycount.days : 0 }}<small class="text-xs font-bold text-gray-500">일</small></div>
                <div class="text-xs text-gray-500 flex-1">
                  <template v-if="!fullDaycount">날짜를 선택하면 주말·공휴일·방학을 제외한 등교일수를 자동으로 계산합니다.</template>
                  <template v-else-if="fullDaycount.weekend || fullDaycount.closed">전체 {{ fullDaycount.total }}일 중 {{ [fullDaycount.weekend && (fullDaycount.weekend + '일 주말'), fullDaycount.closed && (fullDaycount.closed + '일 공휴일·방학')].filter(Boolean).join(', ') }} 제외</template>
                  <template v-else>전체 {{ fullDaycount.total }}일 모두 등교일입니다.</template>
                </div>
              </div>
              <div v-if="fullExamHit" class="mt-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-xl p-3">⚠ 선택한 기간이 {{ fullExamHit }} 기간과 겹칩니다. 고사 기간에는 신청할 수 없습니다.</div>
              <div v-else-if="fullDaycount && fullDaycount.days === 0" class="mt-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-xl p-3">⚠ 선택한 기간에 등교일이 없습니다.</div>
            </div>
            <div v-else>
              <div class="flex items-center gap-2 flex-wrap">
                <input v-model="a.halfDate" type="date" class="flex-1 min-w-[140px] p-3 border border-gray-200 rounded-xl font-bold" />
                <select v-model="a.halfAmpm" class="p-3 border border-gray-200 rounded-xl font-bold">
                  <option value="오전">오전 (08:30~12:30)</option>
                  <option value="오후">오후 (12:30~16:30)</option>
                </select>
              </div>
              <div class="mt-3 border border-dashed border-gray-300 rounded-xl p-3 bg-gray-50 text-xs text-gray-500">반일 신청은 0.5일로 계산됩니다.</div>
              <div v-if="halfBlocked" class="mt-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-xl p-3">⚠ {{ halfBlocked }}</div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">학습형태</label>
            <div class="flex flex-wrap gap-2">
              <button v-for="opt in STUDY_TYPES" :key="opt" type="button" @click="a.studyType = opt"
                :class="['py-2 px-3 rounded-xl text-sm font-bold border-2', a.studyType === opt ? 'bg-teal-600 border-teal-600 text-white' : 'border-gray-200 text-gray-500']">{{ opt }}</button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">체험학습 장소</label>
            <input v-model="a.place" type="text" placeholder="예: 제주도, 서울교육대학교 등" class="w-full p-3 border border-gray-200 rounded-xl font-bold text-gray-800" />
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">인솔자</label>
            <div class="flex flex-wrap gap-2">
              <button v-for="opt in ESCORTS" :key="opt" type="button" @click="a.escort = opt"
                :class="['py-2 px-3 rounded-xl text-sm font-bold border-2', a.escort === opt ? 'bg-teal-600 border-teal-600 text-white' : 'border-gray-200 text-gray-500']">{{ opt }}</button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">보호자명</label>
            <div class="flex gap-2">
              <input v-model="a.guardianName" type="text" placeholder="보호자 성명" class="flex-1 p-3 border border-gray-200 rounded-xl font-bold text-gray-800" />
              <input v-model="a.guardianRel" type="text" placeholder="관계 (예: 모)" class="w-28 p-3 border border-gray-200 rounded-xl font-bold text-gray-800" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">인솔자명 <span class="font-normal text-gray-400">(보호자와 다를 경우에만)</span></label>
            <input v-model="a.escortName" type="text" placeholder="보호자와 동행 시 비워 두세요" class="w-full p-3 border border-gray-200 rounded-xl font-bold text-gray-800" />
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">체험학습 계획</label>
            <textarea v-model="a.plan" rows="4" placeholder="구체적인 주요 일정 및 방문 장소에 기반하여 작성해 주세요." class="w-full p-3 border border-gray-200 rounded-xl text-gray-700 resize-none"></textarea>
          </div>

          <div class="space-y-3">
            <label class="flex items-start gap-3">
              <input v-model="a.agreeRule" type="checkbox" class="mt-1 w-5 h-5 accent-teal-600 shrink-0" />
              <span class="text-sm text-gray-600">우리 학교 학교장허가 교외체험학습 관련 학칙 및 불허 기간을 확인하였습니다.</span>
            </label>
            <label class="flex items-start gap-3">
              <input v-model="a.agreeSafety" type="checkbox" class="mt-1 w-5 h-5 accent-teal-600 shrink-0" />
              <span class="text-sm text-gray-600">① 연속 5일 이상 신청 시 주 1회 이상 보호자(혹은 인솔자)가 담임교사와 통화하여 학생의 안전·건강을 확인시키겠습니다. ② 체험학습 기간 학생의 안전한 활동을 책임지고 관리하며, 안전사고 등 돌발상황 발생에 대비해 학교와 연락체계를 유지하고 신속히 대응하겠습니다.</span>
            </label>
            <p class="text-sm text-gray-500">위와 같이 「학교장허가 교외체험학습」을 신청합니다.</p>
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-3">서명</label>
            <div class="space-y-4">
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-sm font-bold text-gray-600">보호자 <span class="text-gray-400 font-normal">(인)</span></span>
                  <button type="button" @click="sigGuardian.clear()" class="text-xs font-bold text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5">지우기</button>
                </div>
                <div class="relative border border-gray-300 rounded-xl bg-gray-50" style="touch-action:none;">
                  <canvas ref="guardianCanvas" class="block w-full rounded-xl cursor-crosshair" style="height:130px;"></canvas>
                  <div v-if="!sigGuardian.has.value" class="absolute inset-0 flex items-center justify-center text-xs text-gray-400 pointer-events-none">여기를 손가락으로 눌러 서명해 주세요</div>
                </div>
              </div>
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-sm font-bold text-gray-600">학생 <span class="text-gray-400 font-normal">(인)</span></span>
                  <button type="button" @click="sigStudent.clear()" class="text-xs font-bold text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5">지우기</button>
                </div>
                <div class="relative border border-gray-300 rounded-xl bg-gray-50" style="touch-action:none;">
                  <canvas ref="studentCanvas" class="block w-full rounded-xl cursor-crosshair" style="height:130px;"></canvas>
                  <div v-if="!sigStudent.has.value" class="absolute inset-0 flex items-center justify-center text-xs text-gray-400 pointer-events-none">여기를 손가락으로 눌러 서명해 주세요</div>
                </div>
              </div>
            </div>
          </div>

          <p v-if="aError" class="text-sm bg-red-50 text-red-700 border border-red-200 rounded-xl p-3">⚠ {{ aError }}</p>
          <button type="submit" :disabled="aSubmitting" class="w-full py-4 bg-teal-600 text-white font-black rounded-xl hover:bg-teal-700 transition-all active:scale-95 disabled:opacity-50 text-base">
            {{ aSubmitting ? '제출 중…' : '신청서 제출' }}
          </button>
        </form>
      </div>

      <!-- ===================== 결과보고서 ===================== -->
      <div v-else>
        <div v-if="rDone" class="bg-white rounded-3xl shadow-lg border border-gray-100 p-8 text-center">
          <div class="text-4xl mb-3">✅</div>
          <h3 class="font-black text-gray-800 text-lg mb-2">결과보고서가 접수되었습니다</h3>
          <p class="text-gray-500 text-sm">담임 선생님이 사진과 내용을 확인합니다.</p>
          <div class="inline-block mt-4 font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">접수번호 {{ rDone }}</div>
          <button @click="resetReport" class="block mx-auto mt-5 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold text-gray-600">새 보고서 작성</button>
        </div>

        <form v-else @submit.prevent="submitReport" class="bg-white rounded-3xl shadow-lg border border-gray-100 p-7 space-y-6">
          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">성명 · 학번</label>
            <input v-model="r.name" type="text" placeholder="이름" class="w-full p-3 border border-gray-200 rounded-xl font-bold text-gray-800 mb-2" />
            <div class="flex items-center gap-1.5 flex-wrap">
              <input v-model="r.grade" type="text" inputmode="numeric" maxlength="1" class="w-14 p-3 border border-gray-200 rounded-xl text-center font-bold" />
              <span class="text-xs text-gray-400 mr-2">학년</span>
              <input v-model="r.klass" type="text" inputmode="numeric" maxlength="1" class="w-14 p-3 border border-gray-200 rounded-xl text-center font-bold" />
              <span class="text-xs text-gray-400 mr-2">반</span>
              <input v-model="r.number" type="text" inputmode="numeric" maxlength="2" placeholder="00" class="w-14 p-3 border border-gray-200 rounded-xl text-center font-bold" />
              <span class="text-xs text-gray-400">번</span>
            </div>
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">체험학습 기간</label>
            <div class="flex items-center gap-2 flex-wrap">
              <input v-model="r.start" type="date" class="flex-1 min-w-[140px] p-3 border border-gray-200 rounded-xl font-bold" />
              <span class="text-gray-400">~</span>
              <input v-model="r.end" type="date" class="flex-1 min-w-[140px] p-3 border border-gray-200 rounded-xl font-bold" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">문서 번호</label>
            <input v-model="r.docNumber" type="text" placeholder="예: 상당고등학교-2322(2026. 3. 16.)" class="w-full p-3 border border-gray-200 rounded-xl font-bold text-gray-800" />
            <p class="text-xs text-gray-400 mt-1">담임 선생님이 신청 건을 기안할 때 받은 문서번호가 있으면 적어 주세요. 모르면 비워 두어도 됩니다.</p>
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">다녀온 장소</label>
            <input v-model="r.place" type="text" placeholder="예: 제주도" class="w-full p-3 border border-gray-200 rounded-xl font-bold text-gray-800" />
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">체험 내용</label>
            <textarea v-model="r.summary" rows="4" placeholder="무엇을 하고 무엇을 느꼈는지 간단히 적어 주세요." class="w-full p-3 border border-gray-200 rounded-xl text-gray-700 resize-none"></textarea>
          </div>

          <div>
            <label class="block text-sm font-black text-gray-600 mb-2">사진 첨부 <span class="text-red-500">*필수 2장</span></label>
            <label class="block border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center bg-gray-50 cursor-pointer">
              <span class="text-2xl block mb-1">📷</span>
              <p class="text-sm text-gray-600">보호자와 학생이 함께 있는 사진 <span class="font-bold text-red-500">2장</span> 첨부<br>탭하여 사진 선택</p>
              <input type="file" accept="image/*" multiple class="hidden" @change="onPhotoInput" />
            </label>
            <div class="grid grid-cols-3 gap-2 mt-3">
              <div v-for="(p, i) in photos" :key="i" class="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                <img :src="p.dataUrl" class="w-full h-full object-cover" />
                <button type="button" @click="removePhoto(i)" class="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white text-base leading-none">×</button>
                <div class="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] text-center py-0.5 font-mono">{{ Math.round(p.bytes/1024) }}KB</div>
              </div>
            </div>
            <p class="text-xs text-gray-400 mt-2">{{ photos.length }} / 2장 선택됨 · 너무 큰 사진은 자동으로 적절한 크기로 줄여 저장합니다.</p>
          </div>

          <label class="flex items-start gap-3">
            <input v-model="r.agreeFinal" type="checkbox" class="mt-1 w-5 h-5 accent-teal-600 shrink-0" />
            <span class="text-sm text-gray-600">위 내용이 사실과 다름없으며, 결과보고서를 제출합니다.</span>
          </label>

          <p v-if="rError" class="text-sm bg-red-50 text-red-700 border border-red-200 rounded-xl p-3">⚠ {{ rError }}</p>
          <button type="submit" :disabled="rSubmitting" class="w-full py-4 bg-teal-600 text-white font-black rounded-xl hover:bg-teal-700 transition-all active:scale-95 disabled:opacity-50 text-base">
            {{ rSubmitting ? '제출 중…' : '결과보고서 제출' }}
          </button>
        </form>
      </div>

      <p class="text-center text-xs text-gray-400 mt-6">사진은 담임 선생님만 확인하는 곳에 저장됩니다.</p>
    </div>
  </div>
</template>
