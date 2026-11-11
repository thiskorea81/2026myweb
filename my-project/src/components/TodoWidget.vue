<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTodoStore } from '../stores/todoStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useScheduleStore } from '../stores/scheduleStore'
import { storeToRefs } from 'pinia'

const todoStore = useTodoStore()
const diaryStore = useDiaryStore()
const scheduleStore = useScheduleStore()

const { todos } = storeToRefs(todoStore)
const { todayDiaries } = storeToRefs(diaryStore)
const { scheduleItems } = storeToRefs(scheduleStore)

const RECENT_DAYS = 7 // 이보다 오래된 미완료 항목은 '밀린 할 일'로 접어 둔다

const newTodo = ref('')
const showOverdue = ref(false)

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const openTodos = computed(() => todos.value.filter(t => !t.completed))
const recentCutoff = computed(() => new Date(startOfToday().getTime() - (RECENT_DAYS - 1) * 24 * 60 * 60 * 1000))
const recentTodos = computed(() => openTodos.value.filter(t => !t.createdAt || t.createdAt >= recentCutoff.value))
const overdueTodos = computed(() => openTodos.value.filter(t => t.createdAt && t.createdAt < recentCutoff.value))
// 완료 항목은 오늘 완료한 것만 (완료 시각이 없던 예전 항목은 숨김)
const doneToday = computed(() => todos.value.filter(t => t.completed && t.completedAt && t.completedAt >= startOfToday()))

const todaySchedule = computed(() => scheduleItems.value.filter(i => i.date === todayStr()))

const dateBadge = (d) => {
  if (!d) return ''
  if (d >= startOfToday()) return '오늘'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const handleAddTodo = () => {
  if (newTodo.value.trim() === '') return
  todoStore.addTodo(newTodo.value)
  newTodo.value = ''
}

onMounted(() => {
  todoStore.fetchTodos()
  diaryStore.fetchDiaries()
  scheduleStore.fetchSchedule()
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <h4 class="text-lg font-bold text-gray-800 mb-4">
      ✅ 오늘의 할 일
      <span class="text-sm font-bold text-blue-600 ml-1">{{ recentTodos.length }}</span>
    </h4>

    <div class="flex gap-2 mb-4">
      <input
        v-model="newTodo"
        type="text"
        placeholder="할 일 추가..."
        @keyup.enter="handleAddTodo"
        class="flex-1 border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
      />
      <button @click="handleAddTodo" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-bold transition-colors">
        추가
      </button>
    </div>

    <ul class="space-y-2 overflow-y-auto flex-1 pr-1 custom-scrollbar">
      <!-- 오늘 일정 (달력 + 창체) -->
      <li v-for="diary in todayDiaries" :key="'diary-' + diary.id"
        class="bg-blue-50 border border-blue-100 p-3 rounded text-sm text-blue-800 font-medium">
        📅 {{ diary.text }}
      </li>
      <li v-for="item in todaySchedule" :key="'sch-' + item.id"
        class="bg-purple-50 border border-purple-100 p-3 rounded text-sm text-purple-800 font-medium">
        🗓️ [{{ item.type }}] {{ item.content }}
      </li>

      <!-- 최근 할 일 -->
      <li v-for="todo in recentTodos" :key="todo.id"
        class="border border-gray-200 p-3 rounded flex justify-between items-start text-sm hover:bg-gray-50 transition-colors group cursor-pointer"
        @click="todoStore.toggleComplete(todo)">
        <div class="flex items-start flex-1 gap-3">
          <input type="checkbox" :checked="false" class="mt-0.5 w-4 h-4 rounded cursor-pointer border-gray-300" @click.stop="todoStore.toggleComplete(todo)" />
          <span class="text-gray-700">{{ todo.text }}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0 ml-2">
          <span class="text-[11px] text-gray-400">{{ dateBadge(todo.createdAt) }}</span>
          <button @click.stop="todoStore.deleteTodo(todo.id)" class="text-red-500 hover:text-red-700 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity p-1">삭제</button>
        </div>
      </li>
      <li v-if="recentTodos.length === 0 && todayDiaries.length === 0 && todaySchedule.length === 0"
        class="text-sm text-gray-400 text-center py-6">오늘 할 일이 없습니다. 🎉</li>

      <!-- 오늘 완료 -->
      <li v-for="todo in doneToday" :key="'done-' + todo.id"
        class="border border-gray-100 p-3 rounded flex items-start gap-3 text-sm cursor-pointer bg-gray-50"
        @click="todoStore.toggleComplete(todo)">
        <input type="checkbox" checked class="mt-0.5 w-4 h-4 rounded cursor-pointer" @click.stop="todoStore.toggleComplete(todo)" />
        <span class="line-through text-gray-400">{{ todo.text }}</span>
      </li>

      <!-- 밀린 할 일 (접기) -->
      <li v-if="overdueTodos.length" class="pt-2">
        <button @click="showOverdue = !showOverdue" class="w-full text-left text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-100 rounded p-2">
          ⏰ {{ RECENT_DAYS }}일 넘게 밀린 할 일 {{ overdueTodos.length }}개 {{ showOverdue ? '▲' : '▼' }}
        </button>
      </li>
      <template v-if="showOverdue">
        <li v-for="todo in overdueTodos" :key="'old-' + todo.id"
          class="border border-amber-100 p-2 rounded flex justify-between items-start text-xs group cursor-pointer hover:bg-amber-50"
          @click="todoStore.toggleComplete(todo)">
          <div class="flex items-start flex-1 gap-2">
            <input type="checkbox" :checked="false" class="mt-0.5 w-3.5 h-3.5 rounded cursor-pointer" @click.stop="todoStore.toggleComplete(todo)" />
            <span class="text-gray-600">{{ todo.text }}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0 ml-2">
            <span class="text-[11px] text-gray-400">{{ dateBadge(todo.createdAt) }}</span>
            <button @click.stop="todoStore.deleteTodo(todo.id)" class="text-red-500 hover:text-red-700 font-bold opacity-0 group-hover:opacity-100 p-1">삭제</button>
          </div>
        </li>
      </template>
    </ul>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 4px;
}
</style>
