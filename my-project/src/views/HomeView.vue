<script setup>
import TodoWidget from '../components/TodoWidget.vue'
import CalendarWidget from '../components/CalendarWidget.vue'
</script>

<template>
  <div class="w-full">
    <h1 class="text-2xl font-bold text-gray-800 mb-6">👋 오늘 하루도 힘내세요!</h1>
    
    <div class="grid grid-cols-1 xl:grid-cols-4 gap-6 w-full">

      <section class="xl:col-span-3 bg-white p-6 rounded-lg shadow-sm border border-gray-200 min-h-[750px] flex flex-col w-full">
        <CalendarWidget />
      </section>

      <section class="xl:col-span-1 bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-h-[750px] flex flex-col w-full">
        <TodoWidget />
      </section>

    </div>
  </div>
</template>