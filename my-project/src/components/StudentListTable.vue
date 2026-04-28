<script setup>
import { computed } from 'vue'

const props = defineProps({
  students: {
    type: Array,
    required: true
  },
  modelValue: { // 부모(Homeroom)와 연결될 selectedIds (체크박스 선택 목록)
    type: Array,
    required: true
  }
})

const emit = defineEmits(['update:modelValue', 'open-modal'])

// 체크된 항목 상태 관리 (부모 컴포넌트와 동기화)
const selectedIds = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const isAllSelected = computed({
  get: () => props.students.length > 0 && selectedIds.value.length === props.students.length,
  set: (val) => { selectedIds.value = val ? props.students.map(s => s.id) : [] }
})
</script>

<template>
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200 text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left">
              <input type="checkbox" v-model="isAllSelected" class="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
            </th>
            <th scope="col" class="px-6 py-3 text-left font-bold text-gray-500">학번</th>
            <th scope="col" class="px-6 py-3 text-left font-bold text-gray-500">성명</th>
            <th scope="col" class="px-6 py-3 text-left font-bold text-gray-500">성별</th>
            <th scope="col" class="px-6 py-3 text-left font-bold text-gray-500">연락처</th>
            <th scope="col" class="px-6 py-3 text-center font-bold text-gray-500">관리</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="student in students" :key="student.id" class="hover:bg-blue-50 transition-colors" :class="{ 'bg-blue-50': selectedIds.includes(student.id) }">
            <td class="px-6 py-4 whitespace-nowrap">
              <input type="checkbox" :value="student.id" v-model="selectedIds" class="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
            </td>
            <td @click="$emit('open-modal', student)" class="px-6 py-4 whitespace-nowrap text-gray-900 font-medium cursor-pointer hover:text-blue-600 hover:underline transition-colors">
              {{ student.studentId }}
            </td>
            <td @click="$emit('open-modal', student)" class="px-6 py-4 whitespace-nowrap text-gray-900 font-bold cursor-pointer hover:text-blue-600 hover:underline transition-colors">
              {{ student.name }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-600">
              <a v-if="student.phone" :href="`tel:${student.phone.replace(/-/g, '')}`" class="hover:text-blue-600 hover:underline">{{ student.phone }}</a>
              <span v-else>-</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
              <button @click="$emit('open-modal', student)" class="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-blue-700 transition-colors">자세히</button>
            </td>
          </tr>
          <tr v-if="students.length === 0">
            <td colspan="6" class="px-6 py-10 text-center text-gray-500">등록된 학생 데이터가 없거나 모두 보관되었습니다.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>