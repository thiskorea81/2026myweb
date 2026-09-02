<script setup>
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useScheduleStore } from '../stores/scheduleStore'

const scheduleStore = useScheduleStore()
const { scheduleItems } = storeToRefs(scheduleStore)

onMounted(() => scheduleStore.fetchSchedule())

const filterType = ref('전체')
const filtered = computed(() => {
  if (filterType.value === '전체') return scheduleItems.value
  return scheduleItems.value.filter(i => i.type === filterType.value)
})

const form = ref({ date: '', type: '자율', content: '' })
const isSaving = ref(false)

const handleAdd = async () => {
  if (!form.value.date || !form.value.content.trim()) {
    alert('날짜와 내용을 입력해 주세요.')
    return
  }
  isSaving.value = true
  try {
    await scheduleStore.addScheduleItem({ ...form.value })
    form.value = { date: '', type: '자율', content: '' }
  } finally {
    isSaving.value = false
  }
}

const handleDelete = async (id) => {
  if (confirm('이 일정을 삭제하시겠습니까?')) {
    await scheduleStore.deleteScheduleItem(id)
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto p-4 sm:p-8 font-sans text-gray-900">
    <div class="mb-8 border-b pb-6">
      <h2 class="text-3xl font-black text-gray-900 tracking-tight">🗓️ 창체 일정 (자율·진로)</h2>
      <p class="text-gray-500 font-bold mt-1">자율활동·진로활동 일정을 등록하고 확인합니다.</p>
    </div>

    <div class="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 mb-8">
      <h3 class="text-lg font-black text-gray-900 mb-4">➕ 일정 추가</h3>
      <div class="flex flex-col sm:flex-row gap-3">
        <input v-model="form.date" type="date" class="border border-gray-200 rounded-xl px-3 py-2 font-bold text-sm" />
        <select v-model="form.type" class="border border-gray-200 rounded-xl px-3 py-2 font-bold text-sm">
          <option value="자율">자율</option>
          <option value="진로">진로</option>
        </select>
        <input v-model="form.content" type="text" placeholder="활동 내용" class="flex-1 border border-gray-200 rounded-xl px-3 py-2 font-bold text-sm" />
        <button @click="handleAdd" :disabled="isSaving" class="px-5 py-2 bg-gray-800 text-white font-bold rounded-xl hover:bg-black transition-all disabled:opacity-50">
          {{ isSaving ? '저장 중...' : '추가' }}
        </button>
      </div>
    </div>

    <div class="flex gap-2 mb-4">
      <button
        v-for="t in ['전체', '자율', '진로']" :key="t"
        @click="filterType = t"
        class="px-4 py-1.5 rounded-full text-sm font-bold border transition-colors"
        :class="filterType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'"
      >{{ t }}</button>
    </div>

    <div class="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
      <table class="w-full text-left border-collapse">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-black">
          <tr>
            <th class="p-4 border-b w-32">날짜</th>
            <th class="p-4 border-b w-20">구분</th>
            <th class="p-4 border-b">내용</th>
            <th class="p-4 border-b w-16"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="item in filtered" :key="item.id" class="hover:bg-gray-50 transition-colors">
            <td class="p-4 font-bold text-gray-900 whitespace-nowrap">{{ item.date }}</td>
            <td class="p-4">
              <span
                class="px-2 py-1 rounded-full text-xs font-bold"
                :class="item.type === '진로' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'"
              >{{ item.type }}</span>
            </td>
            <td class="p-4 text-sm text-gray-700">{{ item.content }}</td>
            <td class="p-4 text-right">
              <button @click="handleDelete(item.id)" class="text-gray-300 hover:text-red-500 font-bold">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="filtered.length === 0" class="text-center py-20 text-gray-400 font-bold">
        등록된 일정이 없습니다.
      </div>
    </div>
  </div>
</template>
