<script setup>
import { ref, onMounted } from 'vue'
import { useTodoStore } from '../stores/todoStore'
import { useDiaryStore } from '../stores/diaryStore'
import { storeToRefs } from 'pinia'

const todoStore = useTodoStore()
const diaryStore = useDiaryStore() 

const { todos } = storeToRefs(todoStore)
const { todayDiaries } = storeToRefs(diaryStore) 

const newTodo = ref('')

const handleAddTodo = () => {
  if (newTodo.value.trim() === '') return
  todoStore.addTodo(newTodo.value)
  newTodo.value = ''
}

onMounted(() => {
  todoStore.fetchTodos()
  diaryStore.fetchDiaries()
})
</script>

<template>
  <div class="flex flex-col h-full">
    <h4 class="text-lg font-bold text-gray-800 mb-4">✅ 오늘의 할 일</h4>
    
    <div class="flex gap-2 mb-4">
      <input 
        v-model="newTodo" 
        type="text" 
        placeholder="수동으로 할 일 추가..." 
        @keyup.enter="handleAddTodo"
        class="flex-1 border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
      />
      <button @click="handleAddTodo" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-bold transition-colors">
        추가
      </button>
    </div>

    <ul class="space-y-2 overflow-y-auto flex-1 pr-1 custom-scrollbar">
      <li 
        v-for="diary in todayDiaries" 
        :key="'diary-'+diary.id" 
        class="bg-blue-50 border border-blue-100 p-3 rounded flex items-center text-sm text-blue-800 font-medium"
      >
        <span>📅 {{ diary.text }} (다이어리)</span>
      </li>

      <li 
        v-for="todo in todos" 
        :key="todo.id" 
        class="border border-gray-200 p-3 rounded flex justify-between items-center text-sm hover:bg-gray-50 transition-colors group cursor-pointer"
      >
        <div class="flex items-center flex-1" @click="todoStore.toggleComplete(todo)">
          <input 
            type="checkbox" 
            :checked="todo.completed" 
            class="w-4 h-4 text-blue-600 rounded cursor-pointer mr-3 border-gray-300 focus:ring-blue-500"
            @click.stop="todoStore.toggleComplete(todo)"
          />
          <span :class="{ 'line-through text-gray-400': todo.completed, 'text-gray-700': !todo.completed }">
            {{ todo.text }}
          </span>
        </div>
        <button 
          @click="todoStore.deleteTodo(todo.id)" 
          class="text-red-500 hover:text-red-700 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity p-1"
        >
          삭제
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 스크롤바 디자인 (선택사항) */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 4px;
}
</style>