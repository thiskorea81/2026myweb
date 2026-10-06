<script setup>
// 시험 안내 슬라이드 한 장을 그린다 (교실 TV 화면에서 읽히도록 큰 글씨).
// slide: { layout: 'cover' | 'content', icon, title, subtitle, points[], warning,
//          images[{ src, caption, tone: 'ok' | 'no' | '' }], table{ headers[], rows[{ cells[] }] }, seats{...} }
// (Firestore가 배열 안의 배열을 못 담아서 표의 행은 { cells }로 감싼다)
// points/warning 안의 **글자**는 강조 표시된다.
import { computed } from 'vue'

const props = defineProps({
  slide: { type: Object, required: true },
  guideTitle: { type: String, default: '' }
})

const splitEmphasis = (text = '') =>
  String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part =>
    part.startsWith('**') && part.endsWith('**')
      ? { text: part.slice(2, -2), strong: true }
      : { text: part, strong: false }
  )

const points = computed(() => (props.slide.points || []).filter(p => String(p).trim()))
const images = computed(() => (props.slide.images || []).filter(img => img?.src))
const hasTable = computed(() => props.slide.table?.headers?.length && props.slide.table?.rows?.length)
const hasSeats = computed(() => props.slide.seats?.columns?.length)
const hasVisual = computed(() => images.value.length || hasTable.value || hasSeats.value)

// 이미지가 1장이면 크게, 여러 장이면 격자로
const imageGridClass = computed(() => {
  const n = images.value.length
  if (n === 1) return 'grid-cols-1'
  if (n <= 4) return 'grid-cols-2'
  return 'grid-cols-3'
})

// 좌석 칸은 번호(숫자), 빈 책상(''), 또는 { no, name }(학급 자리배치표)
const hasSeatNames = computed(() =>
  (props.slide.seats?.columns || []).some(c => (c.seats || []).some(s => s && typeof s === 'object'))
)

const maxSeatRows = computed(() =>
  Math.max(0, ...(props.slide.seats?.columns || []).map(c => c.seats?.length || 0))
)
</script>

<template>
  <!-- 표지 -->
  <div
    v-if="slide.layout === 'cover'"
    class="h-full w-full flex flex-col items-center justify-center text-center px-8 bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 text-white"
  >
    <div class="text-7xl md:text-8xl mb-6">{{ slide.icon || '📝' }}</div>
    <h1 class="text-4xl md:text-6xl font-black leading-tight break-keep">{{ slide.title }}</h1>
    <p v-if="slide.subtitle" class="mt-5 text-xl md:text-3xl font-bold text-blue-100 break-keep">{{ slide.subtitle }}</p>
    <ul v-if="points.length" class="mt-8 flex flex-wrap justify-center gap-3">
      <li
        v-for="(p, i) in points"
        :key="i"
        class="px-4 py-2 rounded-full bg-white/15 border border-white/30 text-base md:text-xl font-bold"
      >
        {{ p.replace(/\*\*/g, '') }}
      </li>
    </ul>
  </div>

  <!-- 본문 -->
  <div v-else class="h-full w-full flex flex-col bg-white px-5 py-5 md:px-10 md:py-8 overflow-y-auto">
    <header class="flex items-start gap-4 pb-4 mb-5 border-b-4 border-blue-500">
      <span class="text-5xl md:text-6xl leading-none shrink-0">{{ slide.icon }}</span>
      <div class="min-w-0">
        <h2 class="text-3xl md:text-5xl font-black text-gray-900 leading-tight break-keep">{{ slide.title }}</h2>
        <p v-if="slide.subtitle" class="mt-1 text-lg md:text-2xl font-bold text-gray-500 break-keep">{{ slide.subtitle }}</p>
      </div>
    </header>

    <div class="flex-1 grid gap-6 md:gap-8" :class="hasVisual && points.length ? 'lg:grid-cols-2' : 'grid-cols-1'">
      <!-- 시각 자료 -->
      <div v-if="hasVisual" class="flex flex-col gap-5 min-w-0" :class="!points.length ? 'max-w-5xl w-full mx-auto' : ''">
        <div v-if="images.length" class="grid gap-4" :class="imageGridClass">
          <figure
            v-for="(img, i) in images"
            :key="i"
            class="relative rounded-2xl border-4 bg-white p-3 flex flex-col items-center"
            :class="img.tone === 'ok' ? 'border-green-500' : img.tone === 'no' ? 'border-red-500' : 'border-gray-200'"
          >
            <span
              v-if="img.tone"
              class="absolute -top-4 -left-3 text-3xl md:text-4xl drop-shadow"
            >{{ img.tone === 'ok' ? '⭕' : '❌' }}</span>
            <img :src="img.src" :alt="img.caption || ''" class="w-full object-contain" :class="images.length === 1 ? 'max-h-[42vh]' : 'max-h-[22vh]'" />
            <figcaption
              v-if="img.caption"
              class="mt-2 text-base md:text-xl font-black text-center break-keep"
              :class="img.tone === 'ok' ? 'text-green-700' : img.tone === 'no' ? 'text-red-600' : 'text-gray-700'"
            >{{ img.caption }}</figcaption>
          </figure>
        </div>

        <div v-if="hasTable" class="overflow-x-auto rounded-2xl border-2 border-gray-300">
          <table class="w-full text-left">
            <thead class="bg-blue-600 text-white">
              <tr>
                <th v-for="(h, i) in slide.table.headers" :key="i" class="px-4 py-3 text-lg md:text-2xl font-black whitespace-nowrap">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in slide.table.rows" :key="ri" class="border-t-2 border-gray-200" :class="ri % 2 ? 'bg-gray-50' : 'bg-white'">
                <td
                  v-for="(cell, ci) in (row.cells || row)"
                  :key="ci"
                  class="px-4 py-3 text-lg md:text-2xl break-keep align-top"
                  :class="ci === 0 ? 'font-black text-gray-900' : 'font-bold text-gray-700'"
                >{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 고사실 좌석 배치도 (학생이 칠판을 바라보는 방향 기준: 교탁이 위) -->
        <div v-if="hasSeats" class="rounded-2xl border-2 border-gray-300 p-4 bg-slate-50">
          <div class="mx-auto mb-4 w-1/2 rounded-lg bg-gray-800 text-white text-center py-2 text-lg md:text-2xl font-black">
            {{ slide.seats.front || '교탁 (칠판)' }}
          </div>
          <div class="flex items-stretch gap-2">
            <div class="flex items-center text-sm md:text-lg font-black text-gray-500 [writing-mode:vertical-rl]">{{ slide.seats.left }}</div>
            <div class="flex-1 grid gap-2" :style="{ gridTemplateColumns: `repeat(${slide.seats.columns.length}, minmax(0, 1fr))` }">
              <div v-for="(col, ci) in slide.seats.columns" :key="ci" class="flex flex-col gap-2">
                <div
                  v-for="r in maxSeatRows"
                  :key="r"
                  class="rounded-lg flex flex-col items-center justify-center font-black leading-tight"
                  :class="[
                    hasSeatNames ? 'h-12 md:h-16' : 'h-9 md:h-12',
                    col.seats?.[r - 1] == null
                      ? 'bg-transparent'
                      : col.highlight ? 'bg-amber-400 text-gray-900 shadow' : 'bg-white border-2 border-gray-300 text-gray-500'
                  ]"
                >
                  <template v-if="typeof col.seats?.[r - 1] === 'object' && col.seats[r - 1]">
                    <span class="text-xs md:text-base">{{ col.seats[r - 1].no }}번</span>
                    <span class="text-sm md:text-xl whitespace-nowrap">{{ col.seats[r - 1].name }}</span>
                  </template>
                  <span v-else class="text-lg md:text-2xl">{{ col.seats?.[r - 1] ?? '' }}</span>
                </div>
                <div
                  class="mt-1 text-center text-sm md:text-lg font-black"
                  :class="col.highlight ? 'text-amber-600' : 'text-gray-500'"
                >{{ col.label }}</div>
              </div>
            </div>
            <div class="flex items-center text-sm md:text-lg font-black text-gray-500 [writing-mode:vertical-rl]">{{ slide.seats.right }}</div>
          </div>
        </div>
      </div>

      <!-- 핵심 내용 -->
      <ul v-if="points.length" class="flex flex-col gap-3 md:gap-4 min-w-0" :class="!hasVisual ? 'max-w-5xl w-full mx-auto' : ''">
        <li v-for="(p, i) in points" :key="i" class="flex items-start gap-3 text-xl md:text-3xl leading-snug text-gray-800 font-bold break-keep">
          <span class="mt-1.5 md:mt-2 shrink-0 w-3 h-3 md:w-4 md:h-4 rounded-full bg-blue-500"></span>
          <span>
            <template v-for="(seg, si) in splitEmphasis(p)" :key="si">
              <strong v-if="seg.strong" class="text-red-600 font-black bg-yellow-100 px-1 rounded">{{ seg.text }}</strong>
              <template v-else>{{ seg.text }}</template>
            </template>
          </span>
        </li>
      </ul>
    </div>

    <div v-if="slide.warning" class="mt-6 rounded-2xl bg-red-50 border-4 border-red-500 px-5 py-4 flex items-start gap-3">
      <span class="text-3xl md:text-4xl shrink-0">⚠️</span>
      <p class="text-xl md:text-3xl font-black text-red-700 leading-snug break-keep">
        <template v-for="(seg, si) in splitEmphasis(slide.warning)" :key="si">
          <span v-if="seg.strong" class="underline decoration-4 underline-offset-4">{{ seg.text }}</span>
          <template v-else>{{ seg.text }}</template>
        </template>
      </p>
    </div>

    <footer v-if="guideTitle" class="mt-4 text-right text-sm md:text-base font-bold text-gray-400">{{ guideTitle }}</footer>
  </div>
</template>
