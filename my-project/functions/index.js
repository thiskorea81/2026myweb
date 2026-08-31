require("dotenv").config();
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { GoogleGenAI } = require("@google/genai");
const { getThisWeekMealNote, getNextWeekMealNote } = require("./mealOrder");

initializeApp();
const db = getFirestore("my2026web"); // Firestore ID 지정 (frontend와 동일하게 "my2026web" 사용)

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });

// 💡 src/services/aiPrompts.js의 getBoardPrompt와 동일 (Cloud Functions는 별도 런타임이라 복제해 둠)
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

// 💡 src/services/aiPrompts.js의 getTeacherBoardPrompt와 동일 (Cloud Functions는 별도 런타임이라 복제해 둠)
const getTeacherBoardPrompt = (isMorningMode, logTexts) => {
    return `
      당신은 담임 선생님을 돕는 유능한 AI 비서입니다.
      제공된 메모들을 바탕으로, 담임 선생님이 ${isMorningMode ? '아침 조회' : '오후 종례'} 시간에 학급 상황을 한눈에 파악하고 학생들에게 정확히 전달할 수 있도록 내용을 깔끔하게 정리해 주세요.

      [출력 규칙 - 절대 엄수]
      1. 반드시 단일 JSON 객체 { "announcement": "...", "closing": "..." }로만 응답하세요.
      2. 응답을 대괄호 [ ] 로 감싸거나 리스트(Array) 구조로 만들지 마세요.
      3. 담임 선생님이 읽고 바로 학생들에게 안내하거나 지도할 수 있도록, 정중하고 전문적인 문체(~습니다, ~바랍니다)로 요약하세요.
      4. 항목별로 번호(1. 2. 3.)를 매기고, 각 항목 사이에는 실제 줄바꿈(Enter)을 적용하여 가독성을 극대화하세요. ('\\n' 이라는 문자를 텍스트로 그대로 출력하지 마세요.)
      5. 링크가 있으면 링크를 무조건 넣어주세요.

      [메모 내용]
      ${logTexts}
    `;
};

// 공통(전체) 공지사항 AI 요약을 생성하거나, 이미 생성되어 있으면 캐시를 그대로 재사용
async function getOrCreateCommonSummary({ collectionName, commonDocId, commonLogs, isMorning, promptBuilder, noLogsAnnouncement, noLogsClosing }) {
  const ref = db.collection(collectionName).doc(commonDocId);
  const snap = await ref.get();
  if (snap.exists) {
    return { announcement: snap.data().announcement, closing: snap.data().closing };
  }

  let announcement;
  let closing;

  if (commonLogs.length > 0) {
    const logTexts = commonLogs.map(l => `- ${l.tags.includes('#고정') ? '[고정] ' : ''}${l.content}`).join('\n');
    const prompt = promptBuilder(isMorning, logTexts) + `\n[⚠️ 필수 응답 형식]\n- 반드시 { "announcement": "...", "closing": "..." } 형태의 단일 JSON 객체로 응답하세요. 대괄호([]) 금지.`;

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
      announcement = result.announcement || "공지 요약 오류";
      closing = result.closing || noLogsClosing;
    } catch (e) {
      console.error("Gemini API 호출 에러:", e);
      announcement = "전달할 전체 공지사항 요약을 실패했습니다.";
      closing = noLogsClosing;
    }
  } else {
    announcement = noLogsAnnouncement;
    closing = noLogsClosing;
  }

  await ref.set({ announcement, closing, updatedAt: new Date().toISOString() }, { merge: true });
  return { announcement, closing };
}

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
    // 💡 이 함수는 항상 정해진 시각(아침 8시 / 종례 시각)에 그날 것을 바로 생성하도록 스케줄되어 있으므로
    //    '내일 것을 미리' 만드는 날짜 보정이 필요 없음 (예전에는 전날 저녁 18시에 실행되어 +1일 보정을 했음)
    const targetBoardDate = new Date(kstNow.getTime());

    const currentDay = targetBoardDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    // 💡 종례 시각: 수요일은 14:00, 나머지 요일은 15:00 — 프론트엔드(StudentBoard.vue/TeacherBoard.vue)의
    //    getBoardInfo()가 찾는 문서 키와 반드시 동일해야 자동 생성된 내용이 화면에 뜬다.
    const epochKey = isMorning ? '0800' : (currentDay === 3 ? '1400' : '1500');

    const year = targetBoardDate.getUTCFullYear();
    const month = String(targetBoardDate.getUTCMonth() + 1).padStart(2, '0');
    const date = String(targetBoardDate.getUTCDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${date}`;

    // 아침 조회는 담임이 전날 남겨둔 메모(#조종례/#조회)를 기반으로 함
    let logTargetKst = new Date(targetBoardDate.getTime());
    if (isMorning) {
        logTargetKst.setTime(logTargetKst.getTime() - 24 * 60 * 60 * 1000);
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

    // 3. 학생 이름이 언급되지 않은, 전체 학급 공통 로그만 추려냄
    const commonLogs = [];
    rawLogs.forEach(log => {
        const content = log.content;
        const mentionedAny = allStudents.filter(s => s.name.length >= 2 && content.includes(s.name));
        if (mentionedAny.length === 0) {
            commonLogs.push(log);
        }
    });

    // 4. 공통 공지 AI 요약 (학생용 보드 / 담임 브리핑 각각 별도 캐시)
    const studentCommon = await getOrCreateCommonSummary({
        collectionName: 'boardSummaries',
        commonDocId: `COMMON_${dateString}_${epochKey}`,
        commonLogs,
        isMorning,
        promptBuilder: getBoardPrompt,
        noLogsAnnouncement: "전달할 전체 공지사항이 없습니다.",
        noLogsClosing: isMorning ? "오늘 하루도 화이팅! ☀️" : "안전하게 하교하세요! 👋",
    });

    const teacherCommon = await getOrCreateCommonSummary({
        collectionName: 'teacherBoardSummaries',
        commonDocId: `COMMON_TEACHER_${dateString}_${epochKey}`,
        commonLogs,
        isMorning,
        promptBuilder: getTeacherBoardPrompt,
        noLogsAnnouncement: "선생님, 오늘 전달할 전체 공지사항이 없습니다.",
        noLogsClosing: "오늘 하루도 수고 많으셨습니다! 😊",
    });

    // 5. 각 반별 최종 내용 조립 및 저장 (학생용 보드 + 담임 브리핑)
    for (const classKey of classSet) {
        const [grade, cls] = classKey.split('_');
        const documentId = `${grade}_${cls}_${dateString}_${epochKey}`;

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

        // 💡 1학년 급식순서 안내: 월요일 조회 때 "이번 주", 금요일 종례 때 "다음 주" 순서를 함께 공지
        //    (AI가 숫자/시각을 잘못 지어내지 않도록 별도 계산 후 문구를 그대로 삽입)
        let mealNote = null;
        if (String(grade) === '1') {
            if (isMorning && currentDay === 1) {
                mealNote = getThisWeekMealNote(dateString, Number(cls));
            } else if (!isMorning && currentDay === 5) {
                mealNote = getNextWeekMealNote(dateString, Number(cls));
            }
        }

        const buildFinalContent = (commonText, noCommonMsg) => {
            let content = '';
            if (mealNote) {
                content += `${mealNote}\n\n`;
            }
            if (myClassLogs.length > 0) {
                content += `🏫 [우리 반 알림]\n`;
                myClassLogs.forEach((l, i) => {
                    content += `${i + 1}. ${l.content}\n`;
                });
                content += `\n`;
            }
            if (commonLogs.length > 0) {
                content += `📢 [전체 공지]\n${commonText.announcement}\n\n`;
            } else if (myClassLogs.length === 0) {
                content += `📢 [전체 공지]\n${noCommonMsg}\n\n`;
            }
            content += `${commonText.closing}`;
            return content.trim();
        };

        // 학생용 게시판 (boardSummaries) - 버전 기록 유지
        const studentRef = db.collection('boardSummaries').doc(documentId);
        const studentFinalContent = buildFinalContent(studentCommon, "전달할 공지사항이 없습니다.");

        let boardHistory = [];
        const studentSnap = await studentRef.get();
        if (studentSnap.exists) {
            boardHistory = studentSnap.data().history || [];
        }
        boardHistory.push({
            id: Date.now(),
            content: studentFinalContent,
            type: '🤖 스마트 병합 (자동 생성)',
            timestamp: new Date().toISOString()
        });

        await studentRef.set({
            content: studentFinalContent,
            history: boardHistory,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        // 담임 교사용 브리핑 (teacherBoardSummaries) - TeacherBoard.vue와 동일한 스키마(history 없음)
        const teacherRef = db.collection('teacherBoardSummaries').doc(documentId);
        const teacherFinalContent = buildFinalContent(teacherCommon, "전달할 공지사항이 없습니다.");

        await teacherRef.set({
            content: teacherFinalContent,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    }

    console.log(`[AutoBoardService] ${isMorning ? '아침' : '오후'} 조종례 자동 생성 완료!`);
}

// 매일(평일) 아침 8시, 오늘 아침 조회 보드를 자동 생성
exports.generateMorningBoard = onSchedule({
    schedule: "0 8 * * 1-5",
    timeZone: "Asia/Seoul",
    retryCount: 3,
}, async (event) => {
    await generateBoardForAllClasses(true);
});

// 수요일 오후 2시, 종례 보드를 자동 생성 (수요일은 하교가 이르므로 별도 스케줄)
exports.generateAfternoonBoardWednesday = onSchedule({
    schedule: "0 14 * * 3",
    timeZone: "Asia/Seoul",
    retryCount: 3,
}, async (event) => {
    await generateBoardForAllClasses(false);
});

// 월/화/목/금 오후 3시, 종례 보드를 자동 생성
exports.generateAfternoonBoardRegular = onSchedule({
    schedule: "0 15 * * 1,2,4,5",
    timeZone: "Asia/Seoul",
    retryCount: 3,
}, async (event) => {
    await generateBoardForAllClasses(false);
});
