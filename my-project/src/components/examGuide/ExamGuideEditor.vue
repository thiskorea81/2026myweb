<script setup>
// 시험 안내 자료 편집기: 슬라이드 추가/삭제/순서 변경, 문구·낭독 원고·이미지 수정.
// 표(table)와 좌석 배치(seats)는 구조가 복잡해서 JSON으로 직접 고친다.
import { ref, reactive, computed } from 'vue'
import ExamGuideSlide from './ExamGuideSlide.vue'

const props = defineProps({
  guide: { type: Object, required: true },
  isSaving: { type: Boolean, default: false }
})
const emit = defineEmits(['save', 'cancel'])

const FIRESTORE_DOC_LIMIT = 1024 * 1024 // Firestore 문서 1개 최대 1MiB (이미지도 이 안에 들어감)

const newSlideId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const draft = reactive({
  title: props.guide.title || '',
  examDate: props.guide.examDate || '',
  slides: (props.guide.slides || []).map(s => ({
    id: s.id || newSlideId(),
    layout: s.layout || 'content',
    icon: s.icon || '',
    title: s.title || '',
    subtitle: s.subtitle || '',
    points: [...(s.points || [])],
    warning: s.warning || '',
    narration: s.narration || '',
    images: (s.images || []).map(img => ({ ...img })),
    table: s.table ? JSON.parse(JSON.stringify(s.table)) : null,
    seats: s.seats ? JSON.parse(JSON.stringify(s.seats)) : null
  }))
})

const selectedIndex = ref(0)
const selected = computed(() => draft.slides[selectedIndex.value])

const addSlide = () => {
  draft.slides.splice(selectedIndex.value + 1, 0, {
    id: newSlideId(), layout: 'content', icon: '📌', title: '새 슬라이드', subtitle: '',
    points: [], warning: '', narration: '', images: [], table: null, seats: null
  })
  selectedIndex.value += 1
}

const removeSlide = (i) => {
  if (draft.slides.length <= 1) return alert('슬라이드는 최소 1장이 있어야 합니다.')
  if (!confirm(`"${draft.slides[i].title}" 슬라이드를 삭제할까요?`)) return
  draft.slides.splice(i, 1)
  selectedIndex.value = Math.min(selectedIndex.value, draft.slides.length - 1)
}

const moveSlide = (i, dir) => {
  const j = i + dir
  if (j < 0 || j >= draft.slides.length) return
  const [s] = draft.slides.splice(i, 1)
  draft.slides.splice(j, 0, s)
  selectedIndex.value = j
}

// --- 이미지: 업로드 시 캔버스로 줄여서 JPEG data URL로 저장 ---
const resizeImage = (file, maxSize = 800) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff' // 투명 PNG가 검게 나오지 않도록
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = reader.result
  }
  reader.onerror = reject
  reader.readAsDataURL(file)
})

const handleImageUpload = async (event) => {
  const files = [...(event.target.files || [])]
  event.target.value = ''
  for (const file of files) {
    try {
      const src = await resizeImage(file)
      selected.value.images.push({ src, caption: '', tone: '' })
    } catch (error) {
      console.error('이미지 처리 실패:', error)
      alert(`${file.name} 이미지를 불러오지 못했습니다.`)
    }
  }
}

// --- 표/좌석 JSON 편집 ---
const jsonError = ref('')
// 표의 행은 저장할 때 { cells: [...] } 형태지만(Firestore 중첩 배열 불가), 편집은 [[...], [...]]로 한다
const advancedText = (key) => {
  const value = selected.value[key]
  if (!value) return ''
  const shown = key === 'table' ? { ...value, rows: (value.rows || []).map(r => r.cells ?? r) } : value
  return JSON.stringify(shown, null, 2)
}
const applyAdvanced = (key, text) => {
  jsonError.value = ''
  if (!text.trim()) { selected.value[key] = null; return }
  try {
    const parsed = JSON.parse(text)
    if (key === 'table') parsed.rows = (parsed.rows || []).map(r => (Array.isArray(r) ? { cells: r } : r))
    selected.value[key] = parsed
  } catch {
    jsonError.value = `${key === 'table' ? '표' : '좌석 배치'} JSON 형식이 올바르지 않습니다.`
  }
}

const docSize = computed(() => new Blob([JSON.stringify(draft)]).size)
const isTooLarge = computed(() => docSize.value > FIRESTORE_DOC_LIMIT * 0.95)

const handleSave = () => {
  if (!draft.title.trim()) return alert('자료 제목을 입력해주세요.')
  if (isTooLarge.value) return alert('이미지가 너무 많거나 커서 저장할 수 없습니다. 이미지를 줄여주세요.')
  emit('save', {
    title: draft.title.trim(),
    examDate: draft.examDate,
    slides: draft.slides.map(s => ({
      ...s,
      points: s.points.map(p => p.trim()).filter(Boolean),
      images: s.images.filter(img => img.src)
    }))
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col md:flex-row gap-3 md:items-end">
      <label class="flex-1">
        <span class="block text-xs font-bold text-gray-500 mb-1">자료 제목</span>
        <input v-model="draft.title" class="w-full border border-gray-300 rounded-lg px-3 py-2 font-bold" placeholder="예: 2026학년도 2학기 중간고사 안내" />
      </label>
      <label>
        <span class="block text-xs font-bold text-gray-500 mb-1">시험 시작일</span>
        <input v-model="draft.examDate" type="date" class="border border-gray-300 rounded-lg px-3 py-2 font-bold" />
      </label>
      <div class="flex gap-2">
        <button @click="emit('cancel')" class="px-4 py-2 rounded-lg font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">취소</button>
        <button @click="handleSave" :disabled="isSaving" class="px-5 py-2 rounded-lg font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400">
          {{ isSaving ? '저장 중...' : '💾 저장' }}
        </button>
      </div>
    </div>
    <p class="text-xs font-bold -mt-2 px-1" :class="isTooLarge ? 'text-red-600' : 'text-gray-400'">
      저장 용량 {{ Math.round(docSize / 1024) }}KB / 약 {{ Math.round(FIRESTORE_DOC_LIMIT / 1024) }}KB
    </p>

    <div class="grid lg:grid-cols-[220px_1fr] gap-4">
      <!-- 슬라이드 목록 -->
      <aside class="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 flex flex-col gap-1 max-h-[75vh] overflow-y-auto">
        <div
          v-for="(s, i) in draft.slides"
          :key="s.id"
          @click="selectedIndex = i"
          class="group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer text-sm font-bold"
          :class="i === selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'"
        >
          <span class="w-5 text-xs text-gray-400 text-right shrink-0">{{ i + 1 }}</span>
          <span class="shrink-0">{{ s.icon }}</span>
          <span class="flex-1 truncate">{{ s.title }}</span>
          <span class="flex gap-0.5 opacity-60 group-hover:opacity-100">
            <button @click.stop="moveSlide(i, -1)" class="px-1 hover:text-blue-600" title="위로">▲</button>
            <button @click.stop="moveSlide(i, 1)" class="px-1 hover:text-blue-600" title="아래로">▼</button>
            <button @click.stop="removeSlide(i)" class="px-1 hover:text-red-600" title="삭제">✕</button>
          </span>
        </div>
        <button @click="addSlide" class="mt-1 px-2 py-2 rounded-lg text-sm font-bold text-blue-600 border border-dashed border-blue-300 hover:bg-blue-50">+ 슬라이드 추가</button>
      </aside>

      <!-- 선택한 슬라이드 편집 + 미리보기 -->
      <section v-if="selected" class="grid xl:grid-cols-2 gap-4 min-w-0">
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3 text-sm">
          <div class="flex gap-2">
            <label class="w-20">
              <span class="block text-xs font-bold text-gray-500 mb-1">아이콘</span>
              <input v-model="selected.icon" class="w-full border border-gray-300 rounded-lg px-2 py-2 text-center text-xl" />
            </label>
            <label class="flex-1">
              <span class="block text-xs font-bold text-gray-500 mb-1">제목</span>
              <input v-model="selected.title" class="w-full border border-gray-300 rounded-lg px-3 py-2 font-bold" />
            </label>
            <label class="w-28">
              <span class="block text-xs font-bold text-gray-500 mb-1">모양</span>
              <select v-model="selected.layout" class="w-full border border-gray-300 rounded-lg px-2 py-2 font-bold">
                <option value="content">본문</option>
                <option value="cover">표지</option>
              </select>
            </label>
          </div>
          <label>
            <span class="block text-xs font-bold text-gray-500 mb-1">부제</span>
            <input v-model="selected.subtitle" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </label>
          <label>
            <span class="block text-xs font-bold text-gray-500 mb-1">핵심 내용 (한 줄에 하나, **강조**)</span>
            <textarea
              :value="selected.points.join('\n')"
              @input="selected.points = $event.target.value.split('\n')"
              rows="6"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 leading-relaxed"
            ></textarea>
          </label>
          <label>
            <span class="block text-xs font-bold text-gray-500 mb-1">경고 문구 (빨간 상자)</span>
            <input v-model="selected.warning" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </label>
          <label>
            <span class="block text-xs font-bold text-gray-500 mb-1">🔊 낭독 원고 (학생들에게 읽어 줄 문장)</span>
            <textarea v-model="selected.narration" rows="5" class="w-full border border-gray-300 rounded-lg px-3 py-2 leading-relaxed"></textarea>
          </label>

          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-bold text-gray-500">이미지</span>
              <label class="text-xs font-bold text-blue-600 cursor-pointer hover:underline">
                + 이미지 추가
                <input type="file" accept="image/*" multiple class="hidden" @change="handleImageUpload" />
              </label>
            </div>
            <div v-if="selected.images.length" class="flex flex-col gap-2">
              <div v-for="(img, ii) in selected.images" :key="ii" class="flex items-center gap-2 border border-gray-200 rounded-lg p-2">
                <img :src="img.src" class="w-14 h-14 object-contain bg-gray-50 rounded" />
                <input v-model="img.caption" placeholder="설명" class="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1" />
                <select v-model="img.tone" class="border border-gray-300 rounded px-1 py-1 font-bold">
                  <option value="">표시 없음</option>
                  <option value="ok">⭕ 가능</option>
                  <option value="no">❌ 금지</option>
                </select>
                <button @click="selected.images.splice(ii, 1)" class="px-2 text-gray-400 hover:text-red-600">✕</button>
              </div>
            </div>
          </div>

          <details class="border-t border-gray-100 pt-2">
            <summary class="text-xs font-bold text-gray-500 cursor-pointer">고급: 표 / 좌석 배치 (JSON)</summary>
            <p class="mt-2 text-xs text-gray-400">표: {"headers": ["구분", ...], "rows": [["...", ...]]} · 비우면 삭제</p>
            <textarea
              :key="`table-${selected.id}`"
              :value="advancedText('table')"
              @change="applyAdvanced('table', $event.target.value)"
              rows="5"
              class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-xs"
            ></textarea>
            <p class="mt-2 text-xs text-gray-400">좌석: {"front": "교탁", "left": "창측", "right": "문측", "columns": [{"label": "이동반", "highlight": true, "seats": [1, 2]}]}</p>
            <textarea
              :key="`seats-${selected.id}`"
              :value="advancedText('seats')"
              @change="applyAdvanced('seats', $event.target.value)"
              rows="5"
              class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-xs"
            ></textarea>
            <p v-if="jsonError" class="mt-1 text-xs font-bold text-red-600">{{ jsonError }}</p>
          </details>
        </div>

        <div class="min-w-0">
          <p class="text-xs font-bold text-gray-500 mb-1">미리보기</p>
          <div class="aspect-video rounded-2xl overflow-hidden border border-gray-300 shadow-sm">
            <div class="w-[200%] h-[200%] origin-top-left scale-50">
              <ExamGuideSlide :slide="selected" :guide-title="draft.title" />
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
