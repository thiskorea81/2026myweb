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
const MODEL_NAME = "gemini-3.8-flash";

// 조종례 게시판은 평소에는 업무일지를 저장하는 순간 프론트엔드(src/services/boardSync.js)가 만든다.
// 이 정시 실행은 그날 아무도 업무일지를 쓰거나 화면을 열지 않아도 날짜가 지난 메모가 내려가고
// 새 회차(아침 조회 / 종례) 문서가 만들어지도록 하는 안전망이다. 규칙은 프론트와 같은 functions/boardShared.mjs 를 쓴다.
async function runBoardSync() {
    const { syncBoards, BOARD_TAGS } = await import("./boardShared.mjs");

    const [logSnap, studentSnap] = await Promise.all([
        db.collection("workLogs").where("tags", "array-contains-any", BOARD_TAGS).get(),
        db.collection("students").get(),
    ]);

    const result = await syncBoards({
        logs: logSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        students: studentSnap.docs.map((d) => d.data()),
        readDoc: async (col, id) => {
            const snap = await db.collection(col).doc(id).get();
            return snap.exists ? snap.data() : null;
        },
        writeDoc: (col, id, data) => db.collection(col).doc(id).set(data, { merge: true }),
        summarize: async (prompt) => {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: prompt,
                config: { responseMimeType: "application/json" },
            });
            // @google/genai 의 text 는 메서드가 아니라 getter 다
            let parsed = JSON.parse(typeof response.text === "function" ? response.text() : response.text);
            if (Array.isArray(parsed)) parsed = parsed[0];
            return parsed;
        },
        mealNotes: { thisWeek: getThisWeekMealNote, nextWeek: getNextWeekMealNote },
        source: "정시 자동 생성",
    });
    console.log(`[AutoBoard] 회차 ${result.slots.join(", ")} / 갱신 문서 ${result.written}건`);
}

// 평일 아침 7시: 오늘 아침 조회 (학생들이 등교 전에 볼 수 있도록)
exports.generateMorningBoard = onSchedule({
    schedule: "0 7 * * 1-5",
    timeZone: "Asia/Seoul",
    retryCount: 3,
}, runBoardSync);

// 수요일 오후 2시: 종례 (수요일은 하교가 이르므로 별도 스케줄)
exports.generateAfternoonBoardWednesday = onSchedule({
    schedule: "0 14 * * 3",
    timeZone: "Asia/Seoul",
    retryCount: 3,
}, runBoardSync);

// 월/화/목/금 오후 3시: 종례
exports.generateAfternoonBoardRegular = onSchedule({
    schedule: "0 15 * * 1,2,4,5",
    timeZone: "Asia/Seoul",
    retryCount: 3,
}, runBoardSync);
