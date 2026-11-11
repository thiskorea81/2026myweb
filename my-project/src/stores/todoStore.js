// src/stores/todoStore.js

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'

// Firestore Timestamp / ISO 문자열 / Date 어느 것이든 Date로
const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null)

export const useTodoStore = defineStore('todo', () => {
  const todos = ref([])
  const todosCollection = collection(db, 'todos')
  let unsubscribe = null

  // 1. 할 일 불러오기 - 여러 위젯에서 불러도 구독은 하나만 유지
  const fetchTodos = () => {
    if (unsubscribe) return
    const q = query(todosCollection, orderBy('createdAt', 'desc'))
    unsubscribe = onSnapshot(q, (snapshot) => {
      todos.value = snapshot.docs.map(d => {
        const data = d.data()
        return { id: d.id, ...data, createdAt: toDate(data.createdAt), completedAt: toDate(data.completedAt) }
      })
    }, (error) => {
      console.error('할 일 구독 실패:', error)
      unsubscribe = null
    })
  }

  // 2. 할 일 추가하기
  const addTodo = async (text) => {
    if (text.trim() === '') return
    await addDoc(todosCollection, {
      text: text,
      completed: false,
      createdAt: new Date()
    })
  }

  // 3. 완료 상태 변경하기 (완료한 날을 남겨 '오늘 완료'만 보여줄 수 있게 함)
  const toggleComplete = async (todo) => {
    await updateDoc(doc(db, 'todos', todo.id), {
      completed: !todo.completed,
      completedAt: todo.completed ? null : new Date()
    })
  }

  // 4. 할 일 삭제하기
  const deleteTodo = async (id) => {
    await deleteDoc(doc(db, 'todos', id))
  }

  return { todos, fetchTodos, addTodo, toggleComplete, deleteTodo }
})
