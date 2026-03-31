import { defineStore } from 'pinia'
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'

export const useClubStore = defineStore('club', {
  state: () => ({
    clubStudents: []
  }),
  actions: {
    async fetchClubStudents() {
      try {
        const snap = await getDocs(collection(db, 'clubStudents'))
        const students = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        
        // 💡 직책별 가중치 부여 (낮을수록 상단)
        const getRoleWeight = (role) => {
          if (!role) return 3
          if (role.includes('회장') || role.includes('부장')) return 1
          if (role.includes('부회장') || role.includes('차장')) return 2
          return 3
        }

        // 💡 정렬: 1순위 직책 가중치, 2순위 학번
        students.sort((a, b) => {
          const weightA = getRoleWeight(a.clubRole)
          const weightB = getRoleWeight(b.clubRole)

          if (weightA !== weightB) {
            return weightA - weightB
          }

          const idA = String(a.studentId || '99999') 
          const idB = String(b.studentId || '99999')
          return idA.localeCompare(idB, undefined, { numeric: true })
        })

        this.clubStudents = students
      } catch (error) {
        console.error("동아리 학생 목록 불러오기 실패:", error)
      }
    },

    async updateStudent(id, studentData) {
      try {
        await updateDoc(doc(db, 'clubStudents', id), studentData)
        await this.fetchClubStudents()
      } catch (error) {
        console.error('동아리 학생 업데이트 실패:', error)
      }
    },

    async deleteStudent(id) {
      try {
        await deleteDoc(doc(db, 'clubStudents', id))
        await this.fetchClubStudents()
      } catch (error) {
        console.error('동아리 학생 삭제 실패:', error)
      }
    },

    async bulkDelete(ids) {
      try {
        const batch = writeBatch(db)
        ids.forEach(id => {
          const docRef = doc(db, 'clubStudents', id)
          batch.delete(docRef)
        })
        await batch.commit()
        await this.fetchClubStudents()
      } catch (error) {
        console.error('동아리 일괄 삭제 실패:', error)
      }
    },

    async bulkUpload(studentDataList) {
      try {
        const batch = writeBatch(db)
        studentDataList.forEach(data => {
          const docRef = doc(db, 'clubStudents', String(data.studentId))
          batch.set(docRef, data, { merge: true }) 
        })
        await batch.commit()
        await this.fetchClubStudents()
      } catch (error) {
        console.error('동아리 학생 일괄 등록 실패:', error)
        throw error
      }
    },

    async bulkUploadActivities(activityDataList) {
      try {
        const batch = writeBatch(db)
        let successCount = 0

        for (const data of activityDataList) {
          const { studentId, date, title, content } = data
          if (!studentId || !title) continue

          const studentRef = doc(db, 'clubStudents', String(studentId))
          const studentSnap = await getDoc(studentRef)

          if (studentSnap.exists()) {
            const studentData = studentSnap.data()
            let activities = studentData.clubActivities || []

            activities.push({
              id: Date.now() + Math.random(),
              date: date || new Date().toISOString().split('T')[0],
              title,
              content,
              createdAt: new Date().toISOString()
            })

            batch.update(studentRef, { clubActivities: activities })
            successCount++
          }
        }
        await batch.commit()
        await this.fetchClubStudents()
        return successCount
      } catch (error) {
        console.error('동아리 활동 일괄 등록 실패:', error)
        throw error
      }
    }
  }
})