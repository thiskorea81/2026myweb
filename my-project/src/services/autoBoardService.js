import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { aiService } from './aiService'
import { announcementSchema, getBoardPrompt } from './aiPrompts'
import { useStudentStore } from '../stores/studentStore'
import { getThisWeekMealNote, getNextWeekMealNote } from '../utils/mealOrder'

let timerId = null

export const generateBoard = async (grade, cls, isMorning) => {
  try {
    console.log(`[AutoBoardService] ${grade}-${cls} ${isMorning ? '아침' : '오후'} 조종례 생성 시작...`)
    
    const studentStore = useStudentStore()
    if (studentStore.students.length === 0) await studentStore.fetchStudents()
    const allStudents = studentStore.students
    
    const targetStudents = allStudents.filter(s => String(s.grade) === String(grade) && String(s.class) === String(cls))
    const nameCounts = {}
    targetStudents.forEach(s => { nameCounts[s.name] = (nameCounts[s.name] || 0) + 1 })
    const duplicateNames = Object.keys(nameCounts).filter(name => nameCounts[name] > 1)

    const realNow = new Date()
    let targetBoardDate = new Date(realNow)
    
    // 💡 아침 조회 생성을 오후 6시(18:00) 이후에 실행하면 '내일' 아침 조회를 의미함
    if (isMorning && realNow.getHours() >= 17) {
      targetBoardDate.setDate(targetBoardDate.getDate() + 1)
    }

    const currentDay = targetBoardDate.getDay()
    // 💡 StudentBoard.vue/TeacherBoard.vue의 getBoardInfo()와 반드시 같은 키를 써야 화면에 뜬다 (수요일 14:00, 나머지 15:00)
    const epochKey = isMorning ? '0800' : (currentDay === 3 ? '1400' : '1500')
    const dateString = `${targetBoardDate.getFullYear()}-${String(targetBoardDate.getMonth() + 1).padStart(2, '0')}-${String(targetBoardDate.getDate()).padStart(2, '0')}`
    
    const documentId = `${grade}_${cls}_${dateString}_${epochKey}`
    const commonDocId = `COMMON_${dateString}_${epochKey}`
    
    const summaryRef = doc(db, 'boardSummaries', documentId)
    const commonSummaryRef = doc(db, 'boardSummaries', commonDocId)
    
    let logTargetDate = new Date(targetBoardDate)
    if (isMorning) {
        logTargetDate.setDate(logTargetDate.getDate() - 1) // 아침 조회의 경우 전날(즉 '오늘') 기록 기반
    }
    const logYear = logTargetDate.getFullYear()
    const logMonth = logTargetDate.getMonth()
    const logDay = logTargetDate.getDate()

    const q = query(collection(db, 'workLogs'), where('tags', 'array-contains-any', ['#조종례', '#조회', '#종례']))
    const snap = await getDocs(q)
    
    const rawLogs = snap.docs
      .map(d => d.data())
      .filter(log => {
        if (!log.tags) return false
        const isRelevant = isMorning 
          ? (log.tags.includes('#조종례') || log.tags.includes('#조회'))
          : (log.tags.includes('#조종례') || log.tags.includes('#종례'))
        if (!isRelevant) return false
        if (log.tags.includes('#고정') || log.tags.includes('#중요')) return true

        if (!log.createdAt) return false
        const logDate = new Date(log.createdAt)
        return logDate.getFullYear() === logYear && logDate.getMonth() === logMonth && logDate.getDate() === logDay
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    const commonLogs = []
    const myClassLogs = []
    
    rawLogs.forEach(log => {
      let content = log.content
      const mentionedAny = allStudents.filter(s => s.name.length >= 2 && content.includes(s.name))
      
      if (mentionedAny.length > 0) {
        const mentionedTarget = targetStudents.filter(s => s.name.length >= 2 && content.includes(s.name))
        if (mentionedTarget.length > 0) {
          mentionedTarget.forEach(s => {
            if (duplicateNames.includes(s.name)) {
              const regex = new RegExp(`${s.name}(?!\\(동명이인\\))`, 'g')
              content = content.replace(regex, `${s.name}(동명이인)`)
            }
          })
          myClassLogs.push({ ...log, content })
        }
      } else {
        commonLogs.push(log)
      }
    })

    let commonAnnouncementText = ""
    let commonClosingText = ""
    const commonSnap = await getDoc(commonSummaryRef)

    if (commonSnap.exists()) {
       commonAnnouncementText = commonSnap.data().announcement
       commonClosingText = commonSnap.data().closing
    } else {
       if (commonLogs.length > 0) {
          const logTexts = commonLogs.map(l => `- ${l.tags.includes('#고정') ? '[고정] ' : ''}${l.content}`).join('\n')
          const prompt = getBoardPrompt(isMorning, logTexts) + `\n[⚠️ 필수 응답 형식]\n- 반드시 { "announcement": "...", "closing": "..." } 형태의 단일 JSON 객체로 응답하세요. 대괄호([]) 금지.`
          const result = await aiService.askStructured(prompt, announcementSchema)
          commonAnnouncementText = result.announcement
          commonClosingText = result.closing
          await setDoc(commonSummaryRef, { announcement: commonAnnouncementText, closing: commonClosingText, updatedAt: new Date().toISOString() }, { merge: true })
       } else {
          commonAnnouncementText = "전달할 전체 공지사항이 없습니다."
          commonClosingText = isMorning ? "오늘 하루도 화이팅! ☀️" : "안전하게 하교하세요! 👋"
       }
    }

    // 💡 1학년 급식순서 안내: 월요일 조회 때 "이번 주", 금요일 종례 때 "다음 주" 순서를 함께 공지
    let mealNote = null
    if (String(grade) === '1') {
      if (isMorning && currentDay === 1) {
        mealNote = getThisWeekMealNote(dateString, Number(cls))
      } else if (!isMorning && currentDay === 5) {
        mealNote = getNextWeekMealNote(dateString, Number(cls))
      }
    }

    let finalContent = ''
    if (mealNote) {
       finalContent += `${mealNote}\n\n`
    }
    if (myClassLogs.length > 0) {
       finalContent += `🏫 [우리 반 알림]\n`
       myClassLogs.forEach((l, i) => {
          finalContent += `${i + 1}. ${l.content}\n`
       })
       finalContent += `\n`
    }

    if (commonLogs.length > 0) {
       finalContent += `📢 [전체 공지]\n${commonAnnouncementText}\n\n`
    } else if (myClassLogs.length === 0) {
       finalContent += `📢 [전체 공지]\n전달할 공지사항이 없습니다.\n\n`
    }
    
    finalContent += `${commonClosingText}`

    const finalContentTrimmed = finalContent.trim()
    
    // 이전에 생성된 기록이 있는지 확인하고 history 갱신
    let boardHistory = []
    const summarySnap = await getDoc(summaryRef)
    if (summarySnap.exists()) {
        boardHistory = summarySnap.data().history || []
    }

    const newEntry = {
      id: Date.now(),
      content: finalContentTrimmed,
      type: '🤖 스마트 병합 (자동 생성)',
      timestamp: new Date().toISOString()
    }
    boardHistory.push(newEntry)

    await setDoc(summaryRef, { 
      content: finalContentTrimmed, 
      history: boardHistory,
      updatedAt: new Date().toISOString() 
    }, { merge: true })
    
    console.log(`[AutoBoardService] ${isMorning ? '아침' : '오후'} 조종례 자동 생성 및 저장 완료!`)
    return true
  } catch (error) {
    console.error("[AutoBoardService] 데이터 로드 및 생성 에러:", error)
    return false
  }
}

export const startAutoBoardTimer = () => {
  if (timerId) clearInterval(timerId)
  
  console.log('[AutoBoardService] 스케줄러 시작됨.')
  
  // 1분(60초)마다 시간 체크
  timerId = setInterval(async () => {
    const now = new Date()
    const hh = now.getHours()
    const mm = now.getMinutes()
    const currentDay = now.getDay()
    
    // 학급 정보
    const myGrade = localStorage.getItem('myGrade') || '1'
    const myClass = localStorage.getItem('myClass') || '1'
    
    const dateKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`
    
    // 내일 아침 조회를 오늘 오후 6시에 미리 생성
    if (hh === 18 && mm === 0) {
        const morningKey = `autoBoard_${dateKey}_morning`
        if (!localStorage.getItem(morningKey)) {
            localStorage.setItem(morningKey, 'true')
            await generateBoard(myGrade, myClass, true)
        }
    }
    
    // 종례 시각 체크 (수요일은 14시, 나머지는 15시)
    const afternoonHour = currentDay === 3 ? 14 : 15
    if (hh === afternoonHour && mm === 0) {
        const afternoonKey = `autoBoard_${dateKey}_afternoon`
        if (!localStorage.getItem(afternoonKey)) {
            localStorage.setItem(afternoonKey, 'true')
            await generateBoard(myGrade, myClass, false)
        }
    }
    
  }, 60 * 1000)
}

export const stopAutoBoardTimer = () => {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
    console.log('[AutoBoardService] 스케줄러 중지됨.')
  }
}
