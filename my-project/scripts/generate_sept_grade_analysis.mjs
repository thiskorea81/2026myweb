// 9월모의고사 성적이 새로 등록된 1학년 5반 학생들을 대상으로, 3월→6월→9월 모의고사와
// 내신(중간/기말) 이력을 모두 반영한 성적 추이 상담자료를 Gemini로 생성해 aiNotes에 저장한다.
// 기본은 미리보기(dry-run, 생성된 노트를 콘솔에만 출력)이며, --commit 옵션을 줘야 실제로 Firestore에 씁니다.
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const EXAM_NAME = "9월모의고사";
const MODEL_NAME = "gemini-3.8-flash";
const COMMIT = process.argv.includes("--commit");

const firebaseConfig = {
  apiKey: "AIzaSyCYSwpXQ5MZ-PGqIJ46arywkTSgww8mQ1c",
  authDomain: "myproject-3e80a.firebaseapp.com",
  projectId: "myproject-3e80a",
  storageBucket: "myproject-3e80a.firebasestorage.app",
  messagingSenderId: "784524925931",
  appId: "1:784524925931:web:d7d81c0b15a0344af357ae",
};
const LOGIN_EMAIL_DOMAIN = "@2026myweb.local";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "my2026web");
const auth = getAuth(app);

const gradeAiNoteItemSchema = z.object({
  studentId: z.string().describe("입력에 주어진 studentId를 그대로 반환 (변형 금지)"),
  note: z.string().describe("그 학생에 대한 성적 분석 코멘트 (4~6문장)"),
});

// src/services/aiPrompts.js의 getGradeTrendAiNotePrompt와 동일 (Vite 프론트엔드 모듈을 Node 스크립트가
// 직접 import할 수 없어, 이 저장소의 다른 scripts/*.mjs와 같은 방식으로 자체 내장한다).
const getGradeTrendAiNotePrompt = (studentsData) => {
  const studentBlocks = studentsData.map(s => {
    const examLines = s.examHistory.map(e => {
      const scoreStr = Object.entries(e.scores).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `    · ${e.examName} → ${scoreStr}`;
    }).join('\n');
    return `- studentId: ${s.studentId} | 이름: ${s.name}\n${examLines}`;
  }).join('\n\n');

  return `
    당신은 훌륭한 담임 교사 비서입니다. 아래는 학생별로 시간순으로 나열된 여러 차례의 성적 기록입니다
    (모의고사 여러 회차 + 학교 내신 시험 포함, 과목명 뒤 "(등급)"이 붙은 값은 전국연합학력평가의 9등급제 등급입니다).

    각 학생마다, 특히 가장 최근 모의고사(9월모의고사)를 중심으로 다음을 반영한 상담자료를 4~6문장으로 작성하세요.
    - 이전 모의고사(3월→6월→9월) 대비 과목별 등급/점수 추이 (향상/하락/유지)를 구체적으로 언급
    - 모의고사 성적과 내신(학교 시험) 성적 사이에 눈에 띄는 차이가 있다면 함께 언급
    - 가장 강한 과목과 보완이 필요한 과목을 지목
    - 다음 시험을 위한 구체적이고 실행 가능한 학습 지도 조언 1~2가지

    [성적 분석 특별 규칙]
    - 과목명 뒤에 "(등급)"이 붙지 않은 순수 숫자는 원점수/백분율이며, 값이 높을수록 우수한 성적입니다.
    - "(등급)"이 붙은 값이나 별도로 백분율(%) 표기가 있는 경우, 수치가 낮을수록(등급 1에 가까울수록) 우수한 성적입니다.
    - 백분율 수치만 있고 등급이 없다면 반드시 다음 5등급제로 변환하여 분석에 반영하세요.
      * 1등급: 10% 이하  * 2등급: 10% 초과~34% 이하  * 3등급: 34% 초과~66% 이하
      * 4등급: 66% 초과~90% 이하  * 5등급: 90% 초과~100% 이하

    [출력 형식 - 절대 엄수]
    - 아래 [학생 목록]과 정확히 같은 수의 원소를 가진 JSON 배열로만 응답하세요.
    - 각 원소는 { "studentId": "...", "note": "..." } 형태이며, studentId는 입력값을 그대로 사용하세요.

    [학생 목록]
    ${studentBlocks}
  `;
};

async function askStructuredArray(ai, prompt, itemSchema) {
  const arraySchema = z.array(itemSchema);
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(arraySchema),
    },
  });
  const rawText = response.text.trim();
  const jsonData = JSON.parse(rawText);
  const arrayData = Array.isArray(jsonData) ? jsonData : [jsonData];
  return arraySchema.parse(arrayData);
}

async function main() {
  const loginId = process.env.VITE_LOGIN_ID;
  const loginPw = process.env.VITE_LOGIN_PW;
  const geminiKey = process.env.VITE_GEMINI_API_KEY;
  if (!loginId || !loginPw) throw new Error("VITE_LOGIN_ID / VITE_LOGIN_PW 환경변수가 없습니다");
  if (!geminiKey) throw new Error("VITE_GEMINI_API_KEY 환경변수가 없습니다");
  await signInWithEmailAndPassword(auth, `${loginId}${LOGIN_EMAIL_DOMAIN}`, loginPw);

  const snap = await getDocs(collection(db, "students"));
  const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const targets = students
    .filter(s => (s.grades || []).some(g => g.examName === EXAM_NAME))
    .map(s => {
      const grades = [...(s.grades || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return {
        studentId: s.studentId,
        name: s.name,
        examHistory: grades.map(g => ({ examName: g.examName, scores: g.scores })),
      };
    });

  console.log(`분석 대상(9월모의고사 보유): ${targets.length}명\n`);

  const ai = new GoogleGenAI({ apiKey: geminiKey });

  // Gemini 호출 1회당 처리 인원이 너무 많으면 응답이 잘릴 수 있어 8명씩 나눠 호출한다.
  const CHUNK = 8;
  const allResults = [];
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    console.log(`--- ${i + 1}~${i + chunk.length}번째 학생 분석 요청 중... ---`);
    const prompt = getGradeTrendAiNotePrompt(chunk);
    const results = await askStructuredArray(ai, prompt, gradeAiNoteItemSchema);
    allResults.push(...results);
  }

  for (const r of allResults) {
    const target = targets.find(t => String(t.studentId) === String(r.studentId));
    console.log(`\n[${r.studentId}] ${target?.name ?? "?"}\n${r.note}`);
  }

  if (!COMMIT) {
    console.log("\n(미리보기 모드입니다. 실제로 AI 노트를 저장하려면 --commit 옵션을 붙여 다시 실행하세요.)");
    return;
  }

  let saved = 0;
  for (const r of allResults) {
    const content = `📊 [성적 기반 자동 분석] - ${EXAM_NAME} (누적 추이)\n${r.note}`;
    await addDoc(collection(db, "aiNotes"), {
      studentId: String(r.studentId),
      content,
      createdAt: new Date().toISOString(),
    });
    saved++;
  }
  console.log(`\n완료: ${saved}명의 AI 노트를 저장했습니다.`);
}

main().catch(err => {
  console.error("실패:", err);
  process.exit(1);
});
