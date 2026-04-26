// src/stores/todoStore.js

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'

// 'todo'라는 이름의 스토어를 만듭니다.
export const useTodoStore = defineStore('todo', () => {
  // 상태(데이터) 저장소
  const todos = ref([])
  const todosCollection = collection(db, 'todos')

  // 1. 할 일 불러오기
  const fetchTodos = () => {
    const q = query(todosCollection, orderBy('createdAt', 'desc'))
    onSnapshot(q, (snapshot) => {
      todos.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
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

  // 3. 완료 상태 변경하기
  const toggleComplete = async (todo) => {
    await updateDoc(doc(db, 'todos', todo.id), {
      completed: !todo.completed
    })
  }

  // 4. 할 일 삭제하기
  const deleteTodo = async (id) => {
    await deleteDoc(doc(db, 'todos', id))
  }

  // 컴포넌트(화면)에서 쓸 수 있도록 내보내기
  return { todos, fetchTodos, addTodo, toggleComplete, deleteTodo }
})