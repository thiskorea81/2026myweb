require("dotenv").config();
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { GoogleGenAI } = require("@google/genai");

initializeApp();
const db = getFirestore("my2026web"); // Firestore ID 지정 (frontend와 동일하게 "my2026web" 사용)

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });

const getBoardPrompt = (isMorningMode, logTexts) => {
    return `
      학급 담임 교사로서 ${isMorningMode ? '아침 조회' : '오후 종례'} 공지를 작성합니다.
      학생들이 화면을 보고 3초 만에 이해할 수 있도록 아주 간결하고 직관적으로 요약하세요.
  
      [출력 규칙 - 절대 엄수]
      1. 반드시 단일 JSON 객체 { "announcement": "...", "closing": "..." }로만 응답하세요.
      2. 응답을 대괄호 [ ] 로 감싸거나 리스트(Array) 구조로 만들지 마세요.
      3. announcement 필드 안에 모든 공지 내용을 번호를 매겨 하나의 문자열로 작성하세요.
  
      [작성 조건]
      1. 핵심 행동(Action) 위주로 짧은 문장(명사형 종결 등)으로 작성하세요.
      2. '[고정]' 태그가 있는 항목은 최상단에 배치하고 알맞은 이모지를 추가하세요.
      3. 'announcement' 필드 하나에 모든 공지사항을 번호(1. 2. 3.)를 매겨서 작성하고, 각 항목 사이에는 실제 줄바꿈(Enter)을 적용하여 구분하세요. ('\\n' 이라는 문자를 텍스트로 그대로 출력하지 마세요.)
  
      [메모 내용]
      ${logTexts}
    `;
};

async function generateBoardForAllClasses(isMorning) {
    console.log(`[AutoBoardService] ${isMorning ? '아침' : '오후'} 조종례 생성 시작...`);
    
    // 1. 등록된 모든 학생 정보를 가져와 존재하는 학년-반 목록 추출
    const studentsSnap = await db.collection('students').get();
    const allStudents = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const classSet = new Set();
    allStudents.forEach(s => {
        if (s.grade && s.class) {
            classSet.add(`${s.grade}_${s.class}`);
        }
    });
    
    const realNow = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(realNow.getTime() + kstOffset);
    let targetBoardDate = new Date(kstNow.getTime());

    // 💡 아침 조회 생성을 오후 6시(18:00) 이후에 실행하면 '내일' 아침 조회를 의미함
    if (isMorning && kstNow.getUTCHours() >= 17) {
      targetBoardDate.setTime(targetBoardDate.getTime() + 24 * 60 * 60 * 1000);
    }
    
    const currentDay = targetBoardDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const epochKey = isMorning ? '0800' : (currentDay === 3 ? '1500' : '1600');
    
    const year = targetBoardDate.getUTCFullYear();
    const month = String(targetBoardDate.getUTCMonth() + 1).padStart(2, '0');
    const date = String(targetBoardDate.getUTCDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${date}`;
    
    const commonDocId = `COMMON_${dateString}_${epochKey}`;
    
    // 타겟 날짜 계산 (아침 조회의 경우 전날 기록 기반)
    let logTargetKst = new Date(targetBoardDate.getTime());
    if (isMorning) {
        logTargetKst.setTime(logTargetKst.getTime() - 24 * 60 * 60 * 1000); // 내일 기준 전날 -> 즉 '오늘'
    }
    const logYear = logTargetKst.getUTCFullYear();
    const logMonth = logTargetKst.getUTCMonth();
    const logDay = logTargetKst.getUTCDate();

    // 2. 업무 일지 쿼리
    const q = db.collection('workLogs').where('tags', 'array-contains-any', ['#조종례', '#조회', '#종례']);
    const snap = await q.get();
    
    const rawLogs = snap.docs
      .map(d => d.data())
      .filter(log => {
        if (!log.tags) return false;
        const isRelevant = isMorning 
          ? (log.tags.includes('#조종례') || log.tags.includes('#조회'))
          : (log.tags.includes('#조종례') || log.tags.includes('#종례'));
        if (!isRelevant) return false;
        if (log.tags.includes('#고정') || log.tags.includes('#중요')) return true;

        if (!log.createdAt) return false;
        const logDateKst = new Date(new Date(log.createdAt).getTime() + kstOffset);
        return logDateKst.getUTCFullYear() === logYear && logDateKst.getUTCMonth() === logMonth && logDateKst.getUTCDate() === logDay;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 3. COMMON 요약 생성
    const commonLogs = [];
    rawLogs.forEach(log => {
        const content = log.content;
        const mentionedAny = allStudents.filter(s => s.name.length >= 2 && content.includes(s.name));
        if (mentionedAny.length === 0) {
            commonLogs.push(log);
        }
    });

    let commonAnnouncementText = "";
    let commonClosingText = "";
    
    const commonSummaryRef = db.collection('boardSummaries').doc(commonDocId);
    const commonSnap = await commonSummaryRef.get();

    if (commonSnap.exists) {
       commonAnnouncementText = commonSnap.data().announcement;
       commonClosingText = commonSnap.data().closing;
    } else {
       if (commonLogs.length > 0) {
          const logTexts = commonLogs.map(l => `- ${l.tags.includes('#고정') ? '[고정] ' : ''}${l.content}`).join('\n');
          const prompt = getBoardPrompt(isMorning, logTexts) + `\n[⚠️ 필수 응답 형식]\n- 반드시 { "announcement": "...", "closing": "..." } 형태의 단일 JSON 객체로 응답하세요. 대괄호([]) 금지.`;
          
          try {
              const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                }
              });
              const text = response.text();
              const result = JSON.parse(text);
              commonAnnouncementText = result.announcement || "공지 요약 오류";
              commonClosingText = result.closing || "안전하게 하교하세요! 👋";
          } catch(e) {
              console.error("Gemini API 호출 에러:", e);
              commonAnnouncementText = "전달할 전체 공지사항 요약을 실패했습니다.";
              commonClosingText = isMorning ? "오늘 하루도 화이팅! ☀️" : "안전하게 하교하세요! 👋";
          }
          await commonSummaryRef.set({ announcement: commonAnnouncementText, closing: commonClosingText, updatedAt: new Date().toISOString() }, { merge: true });
       } else {
          commonAnnouncementText = "전달할 전체 공지사항이 없습니다.";
          commonClosingText = isMorning ? "오늘 하루도 화이팅! ☀️" : "안전하게 하교하세요! 👋";
       }
    }

    // 4. 각 반별 요약 생성
    for (const classKey of classSet) {
        const [grade, cls] = classKey.split('_');
        const documentId = `${grade}_${cls}_${dateString}_${epochKey}`;
        const summaryRef = db.collection('boardSummaries').doc(documentId);

        const targetStudents = allStudents.filter(s => String(s.grade) === String(grade) && String(s.class) === String(cls));
        const nameCounts = {};
        targetStudents.forEach(s => { nameCounts[s.name] = (nameCounts[s.name] || 0) + 1; });
        const duplicateNames = Object.keys(nameCounts).filter(name => nameCounts[name] > 1);

        const myClassLogs = [];
        rawLogs.forEach(log => {
            let content = log.content;
            const mentionedAny = allStudents.filter(s => s.name.length >= 2 && content.includes(s.name));
            if (mentionedAny.length > 0) {
                const mentionedTarget = targetStudents.filter(s => s.name.length >= 2 && content.includes(s.name));
                if (mentionedTarget.length > 0) {
                    mentionedTarget.forEach(s => {
                        if (duplicateNames.includes(s.name)) {
                            const regex = new RegExp(`${s.name}(?!\\(동명이인\\))`, 'g');
                            content = content.replace(regex, `${s.name}(동명이인)`);
                        }
                    });
                    myClassLogs.push({ ...log, content });
                }
            }
        });

        let finalContent = '';
        if (myClassLogs.length > 0) {
           finalContent += `🏫 [우리 반 알림]\n`;
           myClassLogs.forEach((l, i) => {
              finalContent += `${i + 1}. ${l.content}\n`;
           });
           finalContent += `\n`;
        }

        if (commonLogs.length > 0) {
           finalContent += `📢 [전체 공지]\n${commonAnnouncementText}\n\n`;
        } else if (myClassLogs.length === 0) {
           finalContent += `📢 [전체 공지]\n전달할 공지사항이 없습니다.\n\n`;
        }
        
        finalContent += `${commonClosingText}`;
        const finalContentTrimmed = finalContent.trim();
        
        let boardHistory = [];
        const snap = await summaryRef.get();
        if (snap.exists) {
            boardHistory = snap.data().history || [];
        }

        const newEntry = {
          id: Date.now(),
          content: finalContentTrimmed,
          type: '🤖 스마트 병합 (자동 생성)',
          timestamp: new Date().toISOString()
        };
        boardHistory.push(newEntry);

        await summaryRef.set({ 
          content: finalContentTrimmed, 
          history: boardHistory,
          updatedAt: new Date().toISOString() 
        }, { merge: true });
    }
    
    console.log(`[AutoBoardService] ${isMorning ? '아침' : '오후'} 조종례 자동 생성 완료!`);
}

// '내일' 아침 조회를 오늘 오후 6시에 미리 생성
exports.generateMorningBoard = onSchedule({
    schedule: "0 18 * * *",
    timeZone: "Asia/Seoul",
    retryCount: 3,
}, async (event) => {
    await generateBoardForAllClasses(true);
});

// 매일 오후 3시 오후 종례 자동 생성
exports.generateAfternoonBoard = onSchedule({
    schedule: "0 15 * * *",
    timeZone: "Asia/Seoul",
    retryCount: 3,
}, async (event) => {
    await generateBoardForAllClasses(false);
});
