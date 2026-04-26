import { defineStore } from 'pinia'
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc, query, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'

export const useStudentStore = defineStore('student', {
  state: () => ({
    students: []
  }),
  actions: {
    async fetchStudents() {
      try {
        const snap = await getDocs(collection(db, 'students'))
        this.students = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        
        this.students.sort((a, b) => {
          const idA = String(a.studentId || '99999') 
          const idB = String(b.studentId || '99999')
          return idA.localeCompare(idB, undefined, { numeric: true })
        })
      } catch (error) {
        console.error("학생 목록 불러오기 실패:", error)
      }
    },

    async addStudent(studentData) {
      try {
        if (!studentData.studentId) {
          alert("학번이 없습니다. 학번을 반드시 입력해주세요.")
          return
        }
        const q = query(collection(db, 'students'), where('studentId', '==', studentData.studentId))
        const snapshot = await getDocs(q)

        if (!snapshot.empty) {
          const existingDocId = snapshot.docs[0].id
          await setDoc(doc(db, 'students', existingDocId), studentData, { merge: true })
        } else {
          await setDoc(doc(db, 'students', String(studentData.studentId)), studentData)
        }
        await this.fetchStudents()
      } catch (error) {
        console.error('학생 저장 실패:', error)
      }
    },

    async updateStudent(id, studentData) {
      try {
        await updateDoc(doc(db, 'students', id), studentData)
        await this.fetchStudents()
      } catch (error) {
        console.error('학생 업데이트 실패:', error)
      }
    },

    async deleteStudent(id) {
      try {
        await deleteDoc(doc(db, 'students', id))
        await this.fetchStudents()
      } catch (error) {
        console.error('학생 삭제 실패:', error)
      }
    },

    async bulkDelete(ids) {
      try {
        const batch = writeBatch(db)
        ids.forEach(id => {
          const docRef = doc(db, 'students', id)
          batch.delete(docRef)
        })
        await batch.commit()
        await this.fetchStudents()
      } catch (error) {
        console.error('일괄 삭제 실패:', error)
      }
    },

    async bulkArchive(ids) {
      try {
        const batch = writeBatch(db)
        ids.forEach(id => {
          const docRef = doc(db, 'students', id)
          batch.update(docRef, { isArchived: true })
        })
        await batch.commit()
        await this.fetchStudents()
      } catch (error) {
        console.error('일괄 보관 실패:', error)
      }
    },

    // 💡 새롭게 추가된 성적 일괄 업로드 기능
    async bulkUploadGrades(gradeDataList) {
      try {
        const batch = writeBatch(db)
        let successCount = 0

        for (const data of gradeDataList) {
          const { studentId, examName, scores } = data
          if (!studentId || !examName) continue

          const studentRef = doc(db, 'students', String(studentId))
          const studentSnap = await getDoc(studentRef)

          if (studentSnap.exists()) {
            const studentData = studentSnap.data()
            let grades = studentData.grades || []

            // 동일한 시험명이 있으면 덮어쓰기, 없으면 새로 추가
            const existingIndex = grades.findIndex(g => g.examName === examName)
            if (existingIndex > -1) {
              grades[existingIndex] = { ...grades[existingIndex], scores, updatedAt: new Date().toISOString() }
            } else {
              grades.push({ id: Date.now() + Math.random(), examName, scores, createdAt: new Date().toISOString() })
            }

            batch.update(studentRef, { grades })
            successCount++
          }
        }
        await batch.commit()
        await this.fetchStudents()
        return successCount
      } catch (error) {
        console.error("성적 일괄 업로드 실패:", error)
        throw error
      }
    },

    // 💡 개별 성적 기록 삭제 기능
    async deleteGrade(studentId, gradeId) {
      try {
        const studentRef = doc(db, 'students', String(studentId))
        const studentSnap = await getDoc(studentRef)
        if (studentSnap.exists()) {
          const studentData = studentSnap.data()
          const newGrades = (studentData.grades || []).filter(g => g.id !== gradeId)
          await updateDoc(studentRef, { grades: newGrades })
          await this.fetchStudents()
        }
      } catch (error) {
        console.error("성적 삭제 실패:", error)
      }
    }
  }
})