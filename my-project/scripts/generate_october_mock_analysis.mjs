// 10월모의고사 성적이 등록된 1학년 5반 학생들을 대상으로, 3월→6월→9월→10월 모의고사 추이(특히 9월 대비 변화)와
// 10월 개인채점표 오답 문항 분석, 2학기 중간고사 내신을 함께 반영한 상담자료를 Gemini로 생성해 aiNotes에 저장한다.
//
//  · 10월은 공식 성적통지표 전이라 EBSi 기준 예상 등급만 있다 (전국 백분위 없음).
//  · 오답 문항은 학급 정답률을 함께 계산해 "학급 대부분이 맞힌 문항을 틀린 경우"를 짚게 한다.
//
// 기본은 미리보기(dry-run)로, 생성된 노트를 콘솔에 출력하고 --out=<파일>에 JSON으로 저장한다.
// 저장은 --commit. --from=<파일> 을 주면 새로 생성하지 않고 그 JSON의 노트를 그대로 저장한다.
//   node --env-file=.env scripts/generate_october_mock_analysis.mjs --out=notes.json
//   node --env-file=.env scripts/generate_october_mock_analysis.mjs --from=notes.json --commit
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import fs from "fs";

const EXAM_NAME = "10월모의고사";
const MODEL_NAME = "gemini-3.8-flash";
// 시기순으로 넘길 기록: 모의고사 전 회차 + 비교용 최근 내신
const MOCK_EXAMS = ["3월모의고사", "6월모의고사", "9월모의고사", EXAM_NAME];
const CONTEXT_EXAMS = ["2학기중간고사"];
// 학급 정답률이 이 이상인 문항을 틀렸으면 "놓친 쉬운 문항"으로 본다
const EASY_RATE = 0.7;

const COMMIT = process.argv.includes("--commit");
const OUT_ARG = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1];
const FROM_ARG = process.argv.find((a) => a.startsWith("--from="))?.split("=")[1];

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
  note: z.string().describe("그 학생에 대한 성적 분석 코멘트 (5~7문장)"),
});

/** 학급 학생들의 itemAnalysis 로 과목·문항별 정답률을 계산한다 → { 국어: { 1: 0.93, ... } } */
function questionRates(records) {
  const rates = {};
  for (const subject of new Set(records.flatMap((r) => Object.keys(r)))) {
    const takers = records.filter((r) => r[subject]);
    rates[subject] = {};
    for (let q = 1; q <= takers[0][subject].문항수; q++) {
      const wrong = takers.filter((r) => r[subject].오답.includes(q)).length;
      rates[subject][q] = 1 - wrong / takers.length;
    }
  }
  return rates;
}

const pct = (rate) => `${Math.round(rate * 100)}%`;

function describeItemAnalysis(analysis, rates) {
  return Object.entries(analysis).map(([subject, a]) => {
    const easyMissed = a.오답.filter((q) => rates[subject][q] >= EASY_RATE);
    const math = subject === "수학" ? ` (객관식 ${a.객관식}점 + 주관식 ${a.주관식}점)` : "";
    const easy = easyMissed.length
      ? ` | 학급 정답률 ${pct(EASY_RATE)} 이상인데 틀린 문항: ${easyMissed.map((q) => `${q}번(${pct(rates[subject][q])})`).join(", ")}`
      : "";
    return `      - ${subject}: ${a.문항수}문항 중 ${a.오답.length}개 오답${math}${easy}`;
  }).join("\n");
}

/**
 * 9월 → 10월 과목별 등급 변화를 미리 계산한 문장 (AI가 등급 비교를 직접 하다 빠뜨리지 않도록)
 * 예: "국어 1→2등급(1등급 하락), 영어 1→3등급(2등급 하락), 한국사 1→1등급(유지)"
 */
function describeGradeChange(prevScores, currScores) {
  const gradeOf = (v) => Number(String(v ?? "").match(/(\d)등급/)?.[1]) || null;
  return Object.keys(currScores)
    .map((subject) => {
      const [before, after] = [gradeOf(prevScores?.[subject]), gradeOf(currScores[subject])];
      if (!before || !after) return null;
      const diff = before - after;
      const label = diff > 0 ? `${diff}등급 향상` : diff < 0 ? `${-diff}등급 하락` : "유지";
      return `${subject} ${before}→${after}등급(${label})`;
    })
    .filter(Boolean)
    .join(", ");
}

const getOctoberAiNotePrompt = (studentsData) => {
  const studentBlocks = studentsData.map((s) => {
    const examLines = s.examHistory.map((e) => {
      const scoreStr = Object.entries(e.scores).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `    · ${e.examName} → ${scoreStr}`;
    }).join("\n");
    const change = s.gradeChange ? `\n    · 9월 → 10월 등급 변화(계산값): ${s.gradeChange}` : "";
    return `- studentId: ${s.studentId} | 이름: ${s.name}\n${examLines}${change}\n    · ${EXAM_NAME} 문항 분석 (한국사는 채점표 없음):\n${s.itemText}`;
  }).join("\n\n");

  return `
    당신은 훌륭한 담임 교사 비서입니다. 아래는 학생별로 시간순으로 나열된 전국연합학력평가(모의고사) 기록과
    최근 학교 내신(2학기중간고사), 그리고 가장 최근 시험인 ${EXAM_NAME}의 과목별 문항 분석입니다.

    각 학생마다 ${EXAM_NAME}을 중심으로 다음을 반영한 담임 상담자료를 5~7문장으로 작성하세요.
    - 9월모의고사 대비 10월의 과목별 등급 변화(향상/하락/유지)를 구체적으로 언급하고
      (등급 변화는 "9월 → 10월 등급 변화(계산값)"을 그대로 따르고, 1등급 이상 하락한 과목을 "유지/안정"으로 표현하지 마세요),
      3월·6월 기록이 있으면 그 흐름 속에서 이번 변화가 일시적인지 추세인지 판단
    - 가장 강한 과목과 보완이 필요한 과목을 지목
    - 모의고사와 2학기중간고사(내신) 사이에 눈에 띄는 차이가 있다면 함께 언급
    - 문항 분석에서 "학급 정답률이 높은데 틀린 문항"이 몰린 과목은 실수·기본 개념 누락 가능성으로 짚고,
      오답이 대부분인 과목은 기초부터 다시 잡아야 함을 언급
    - 다음 학력평가와 기말고사를 위한 구체적이고 실행 가능한 학습 지도 조언 1~2가지

    [성적 분석 특별 규칙]
    - 모의고사 등급은 9등급제(1등급이 최상위)입니다. 회차마다 난이도가 달라 원점수보다 등급 변화로 비교하세요.
    - 3월·6월·9월 모의고사 "원점수(숫자, N등급)"의 괄호 안 숫자는 전국 백분위로, 높을수록 우수합니다.
      영어·한국사는 절대평가라 "원점수(N등급)"만 있습니다.
    - ${EXAM_NAME}의 "원점수(예상 N등급)"은 공식 성적 발표 전 EBSi 기준 예상 등급입니다.
      "예상 등급"임을 감안해 단정적인 표현은 피하세요.
    - 2학기중간고사(내신) "원점수(숫자, 예상 N등급)"의 괄호 안 숫자는 석차백분율로, 낮을수록 우수하며 등급은 5등급제입니다.
      "인정결"은 출석인정 결시이므로 성적 부진으로 해석하지 마세요.
    - 기록에 없는 회차(미응시 등)는 언급하지 말고, 자료에 없는 사실(시험 중 긴장, 집중력 저하, 컨디션 등)을 단정하지 마세요.
    - 문항 번호는 학생이 시험지를 다시 확인할 수 있도록 필요할 때만 언급하고, 번호를 길게 나열하지 마세요.

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
  const jsonData = JSON.parse(response.text.trim());
  return arraySchema.parse(Array.isArray(jsonData) ? jsonData : [jsonData]);
}

async function generateNotes(students) {
  const geminiKey = process.env.VITE_GEMINI_API_KEY;
  if (!geminiKey) throw new Error("VITE_GEMINI_API_KEY 환경변수가 없습니다");

  const withExam = students
    .map((s) => ({ s, record: (s.grades || []).find((g) => g.examName === EXAM_NAME) }))
    .filter(({ record }) => record);
  const rates = questionRates(withExam.map(({ record }) => record.itemAnalysis || {}));

  const targets = withExam.map(({ s, record }) => ({
    studentId: String(s.studentId),
    name: s.name,
    examHistory: [...MOCK_EXAMS, ...CONTEXT_EXAMS]
      .map((name) => (s.grades || []).find((g) => g.examName === name))
      .filter((g) => g && Object.keys(g.scores || {}).length > 0)
      .map((g) => ({ examName: g.examName, scores: g.scores })),
    itemText: describeItemAnalysis(record.itemAnalysis || {}, rates),
    gradeChange: describeGradeChange((s.grades || []).find((g) => g.examName === "9월모의고사")?.scores, record.scores),
  }));
  console.log(`분석 대상(${EXAM_NAME} 보유): ${targets.length}명\n`);

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  // Gemini 호출 1회당 처리 인원이 너무 많으면 응답이 잘릴 수 있어 8명씩 나눠 호출한다.
  const CHUNK = 8;
  const results = [];
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    console.log(`--- ${i + 1}~${i + chunk.length}번째 학생 분석 요청 중... ---`);
    const chunkResults = await askStructuredArray(ai, getOctoberAiNotePrompt(chunk), gradeAiNoteItemSchema);
    const ids = new Set(chunk.map((t) => t.studentId));
    const returned = chunkResults.filter((r) => ids.has(String(r.studentId)));
    if (returned.length !== chunk.length) {
      throw new Error(`응답 인원 불일치: 요청 ${chunk.length}명, 유효 응답 ${returned.length}명 (${[...ids].join(",")})`);
    }
    results.push(...returned.map((r) => ({ ...r, name: chunk.find((t) => t.studentId === String(r.studentId)).name })));
  }
  return results;
}

async function main() {
  const loginId = process.env.VITE_LOGIN_ID;
  const loginPw = process.env.VITE_LOGIN_PW;
  if (!loginId || !loginPw) throw new Error("VITE_LOGIN_ID / VITE_LOGIN_PW 환경변수가 없습니다");
  await signInWithEmailAndPassword(auth, `${loginId}${LOGIN_EMAIL_DOMAIN}`, loginPw);

  let notes;
  if (FROM_ARG) {
    notes = JSON.parse(fs.readFileSync(FROM_ARG, "utf-8"));
    console.log(`${FROM_ARG}에서 노트 ${notes.length}건을 불러왔습니다.`);
  } else {
    const snap = await getDocs(collection(db, "students"));
    notes = await generateNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    for (const r of notes) console.log(`\n[${r.studentId}] ${r.name}\n${r.note}`);
    if (OUT_ARG) {
      fs.writeFileSync(OUT_ARG, JSON.stringify(notes, null, 2), "utf-8");
      console.log(`\n노트를 ${OUT_ARG}에 저장했습니다.`);
    }
  }

  if (!COMMIT) {
    console.log("\n(미리보기 모드입니다. 실제로 AI 노트를 저장하려면 --commit 옵션을 붙여 다시 실행하세요.)");
    return;
  }

  const now = new Date().toISOString();
  for (const r of notes) {
    await addDoc(collection(db, "aiNotes"), {
      studentId: String(r.studentId),
      content: `📊 [성적 기반 자동 분석] - ${EXAM_NAME} (9월 대비 추이 + 문항 분석)\n${r.note}`,
      createdAt: now,
    });
  }
  console.log(`\n완료: ${notes.length}명의 AI 노트를 저장했습니다.`);
}

// Firestore 클라이언트가 연결을 붙잡고 있어 작업이 끝나도 프로세스가 종료되지 않으므로 직접 종료한다
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("실패:", err);
    process.exit(1);
  });
