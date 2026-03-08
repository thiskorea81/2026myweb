<script setup>
import { ref, computed, onMounted } from 'vue'
import { useWorkStore } from '../stores/workStore'
import { storeToRefs } from 'pinia'

const workStore = useWorkStore()
const { logs, allUniqueTags } = storeToRefs(workStore)

onMounted(() => {
  workStore.fetchLogs()
})

const logContent = ref('')
const isEditMode = ref(false)
const editingId = ref(null)

// 💡 텍스트에서 태그 추출 (URL의 #gid 등은 무시하도록 정규식 개선!)
const extractTags = (text) => {
  if (!text) return []
  // 반드시 문장 시작이거나 공백 뒤에 오는 '#'만 찾습니다.
  const matches = text.match(/(^|\s)#[^\s#]+/g)
  return matches ? [...new Set(matches.map(m => m.trim()))] : []
}

const currentTags = computed(() => extractTags(logContent.value))

const saveLog = async () => {
  if (logContent.value.trim() === '') {
    alert('내용을 입력해주세요.')
    return
  }
  
  const tags = extractTags(logContent.value)
  
  if (isEditMode.value) {
    await workStore.updateLog(editingId.value, logContent.value, tags)
    isEditMode.value = false
    editingId.value = null
  } else {
    await workStore.addLog(logContent.value, tags)
  }
  
  logContent.value = ''
}

const editLog = (log) => {
  isEditMode.value = true
  editingId.value = log.id
  logContent.value = log.content
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const cancelEdit = () => {
  isEditMode.value = false
  editingId.value = null
  logContent.value = ''
}

const deleteLog = async (id) => {
  if (confirm('이 업무 일지를 삭제하시겠습니까?')) {
    await workStore.deleteLog(id)
    if (editingId.value === id) cancelEdit()
  }
}

// === 검색 및 필터링 상태 ===
const selectedTag = ref('')
const searchQuery = ref('') 
const isTagAreaOpen = ref(false) // 💡 태그창 펼침/숨김 상태 (기본은 닫힘)

const toggleTagFilter = (tag) => {
  if (selectedTag.value === tag) {
    selectedTag.value = '' 
  } else {
    selectedTag.value = tag
  }
}

const filteredLogs = computed(() => {
  let result = logs.value

  if (selectedTag.value) {
    result = result.filter(log => log.tags && log.tags.includes(selectedTag.value))
  }

  if (searchQuery.value.trim() !== '') {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(log => log.content.toLowerCase().includes(query))
  }

  return result
})

const formatDate = (isoString) => {
  const date = new Date(isoString)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const formatContentWithLinks = (text) => {
  if (!text) return ''
  const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const urlRegex = /(https?:\/\/[^\s]+)/g
  return safeText.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline hover:text-blue-700 break-all">${url}</a>`
  })
}
</script>

<template>
  <div class="w-full">
    <h2 class="text-2xl font-bold text-gray-800 mb-6">📁 업무 일지</h2>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <div class="lg:col-span-1">
        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 sticky top-6">
          <h3 class="font-bold text-lg mb-4 text-gray-700 flex justify-between items-center">
            <span>{{ isEditMode ? '✏️ 일지 수정' : '📝 새 업무 작성' }}</span>
          </h3>
          
          <textarea 
            v-model="logContent" 
            class="w-full h-48 p-3 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none mb-3 text-sm"
            placeholder="업무 내용이나 링크를 입력하세요. 띄어쓰기 후 #을 붙이면 태그로 인식됩니다."
          ></textarea>

          <div v-if="currentTags.length > 0" class="mb-4 flex flex-wrap gap-2">
            <span v-for="tag in currentTags" :key="tag" class="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-bold">
              {{ tag }}
            </span>
          </div>

          <div class="flex gap-2 justify-end">
            <button v-if="isEditMode" @click="cancelEdit" class="px-4 py-2 bg-gray-200 text-gray-700 font-bold rounded hover:bg-gray-300 transition-colors text-sm">
              취소
            </button>
            <button @click="saveLog" class="px-4 py-2 text-white font-bold rounded transition-colors text-sm w-full" :class="isEditMode ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'">
              {{ isEditMode ? '수정 내용 저장' : '일지 저장' }}
            </button>
          </div>
        </div>
      </div>

      <div class="lg:col-span-2 flex flex-col gap-6">
        
        <div class="bg-white p-5 rounded-lg shadow-sm border border-gray-200 space-y-4">
          
          <div>
            <label class="block text-sm font-bold text-gray-700 mb-2">🔍 내용 검색</label>
            <input 
              v-model="searchQuery" 
              type="text" 
              placeholder="찾고 싶은 업무 내용이나 키워드를 입력하세요..." 
              class="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm bg-gray-50"
            />
          </div>

          <div v-if="allUniqueTags.length > 0" class="pt-2 border-t border-gray-100">
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-3">
                <h4 class="text-sm font-bold text-gray-700">🏷️ 태그 필터</h4>
                <span v-if="selectedTag && !isTagAreaOpen" class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold flex items-center gap-1">
                  {{ selectedTag }}
                  <button @click.stop="selectedTag = ''" class="hover:text-blue-900 font-black ml-1">&times;</button>
                </span>
              </div>
              
              <button @click="isTagAreaOpen = !isTagAreaOpen" class="text-xs text-gray-500 hover:text-gray-800 font-bold bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">
                {{ isTagAreaOpen ? '태그 숨기기 ▲' : '태그 펼치기 ▼' }}
              </button>
            </div>

            <div v-show="isTagAreaOpen" class="flex flex-wrap gap-2 mt-3">
              <button 
                @click="selectedTag = ''"
                class="px-3 py-1.5 rounded-full text-sm font-bold transition-colors border"
                :class="selectedTag === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'"
              >
                전체 보기
              </button>
              <button 
                v-for="tag in allUniqueTags" 
                :key="tag"
                @click="toggleTagFilter(tag)"
                class="px-3 py-1.5 rounded-full text-sm font-bold transition-colors border"
                :class="selectedTag === tag ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'"
              >
                {{ tag }}
              </button>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <div v-if="filteredLogs.length === 0" class="bg-white p-10 rounded-lg border border-gray-200 text-center text-gray-500">
            <span v-if="searchQuery || selectedTag">검색 조건에 맞는 일지가 없습니다.</span>
            <span v-else>작성된 업무 일지가 없습니다.</span>
          </div>

          <div 
            v-for="log in filteredLogs" 
            :key="log.id" 
            class="bg-white p-5 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow group"
            :class="{ 'border-green-400 bg-green-50': editingId === log.id }"
          >
            <div class="flex justify-between items-start mb-2">
              <span class="text-xs text-gray-400 font-medium">{{ formatDate(log.createdAt) }} <span v-if="log.updatedAt" class="ml-1 italic">(수정됨)</span></span>
              
              <div class="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button @click="editLog(log)" class="text-xs font-bold text-green-600 hover:text-green-800 bg-green-100 px-2 py-1 rounded">수정</button>
                <button @click="deleteLog(log.id)" class="text-xs font-bold text-red-600 hover:text-red-800 bg-red-100 px-2 py-1 rounded">삭제</button>
              </div>
            </div>
            
            <p 
              class="text-gray-800 whitespace-pre-line leading-relaxed text-sm mb-3" 
              v-html="formatContentWithLinks(log.content)"
            ></p>
            
            <div v-if="log.tags && log.tags.length > 0" class="flex flex-wrap gap-1.5 mt-2">
              <span 
                v-for="tag in log.tags" 
                :key="tag" 
                @click="toggleTagFilter(tag)"
                class="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-600 text-xs rounded cursor-pointer hover:bg-blue-100 font-medium"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>