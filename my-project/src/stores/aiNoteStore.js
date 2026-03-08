import { defineStore } from 'pinia'
import { collection, addDoc, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore'
import { db } from '../firebase'

export const useAiNoteStore = defineStore('aiNote', {
  state: () => ({
    notes: []
  }),
  actions: {
    async fetchNotes(studentId) {
      try {
        const q = query(collection(db, 'aiNotes'), where('studentId', '==', studentId))
        const snap = await getDocs(q)
        let loadedNotes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        // 최신순 정렬
        loadedNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        this.notes = loadedNotes
      } catch (error) {
        console.error("AI 노트 불러오기 실패:", error)
      }
    },
    async addNote(studentId, content) {
      try {
        const newNote = {
          studentId,
          content,
          createdAt: new Date().toISOString()
        }
        const docRef = await addDoc(collection(db, 'aiNotes'), newNote)
        this.notes.unshift({ id: docRef.id, ...newNote })
      } catch (error) {
        console.error("AI 노트 저장 실패:", error)
        throw error
      }
    },
    async deleteNote(id) {
      try {
        await deleteDoc(doc(db, 'aiNotes', id))
        this.notes = this.notes.filter(note => note.id !== id)
      } catch (error) {
        console.error("AI 노트 삭제 실패:", error)
      }
    }
  }
})