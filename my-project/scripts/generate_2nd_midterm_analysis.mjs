// 2학기중간고사 성적이 등록된 1학년 5반 학생들을 대상으로, 1학기 중간/기말 → 2학기 중간 내신 추이와
// 2학기 중간고사 정오표(오답 문항) 분석을 반영한 성적 상담자료를 Gemini로 생성해 aiNotes에 저장한다.
//
//  · 시험마다 난이도가 달라 원점수만으로는 비교가 안 되므로, 학급별 일람표의 학과평균(학년 평균)을 함께 넘긴다.
//  · 오답 문항은 학급 정답률을 함께 계산해 "학급 대부분이 맞힌 문항을 틀린 경우"(실수/기본 개념 누락)를 짚게 한다.
//  · 전 과목 전출인 학생은 제외하고, 인정결 과목은 성적 부진으로 해석하지 않도록 사유를 함께 넘긴다.
//
// 기본은 미리보기(dry-run)로, 생성된 노트를 콘솔에 출력하고 --out=<파일>에 JSON으로 저장한다.
// 저장은 --commit. --from=<파일> 을 주면 새로 생성하지 않고 그 JSON의 노트를 그대로 저장한다.
//   node --env-file=.env scripts/generate_2nd_midterm_analysis.mjs --out=notes.json
//   node --env-file=.env scripts/generate_2nd_midterm_analysis.mjs --from=notes.json --commit
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import XLSX from "xlsx";
import fs from "fs";

const EXAM_NAME = "2학기중간고사";
const MODEL_NAME = "gemini-3.8-flash";
const DATA_DIR = "C:\\Users\\user\\Documents\\develop\\2026myweb\\data\\성적\\학교";
// 시기순 정기고사 기록과 각 시험의 학급별 일람표(학과평균 행을 읽는다)
const SCHOOL_EXAMS = [
  { examName: "1학기중간고사", xlsx: `${DATA_DIR}\\2026_1학기_중간고사(1-5).xlsx` },
  { examName: "1학기기말고사", xlsx: `${DATA_DIR}\\2026_1학기_기말고사(1-5).xlsx` },
  { examName: EXAM_NAME, xlsx: `${DATA_DIR}\\2026_2학기_중간고사(1-5).xlsx` },
];
// 참고용으로 함께 넘기는 기록 (1학기 최종 등급)
const CONTEXT_EXAMS = ["1학기학기말"];
// 2학기 중간고사 수학만 서답형이 있다 (정오표 배점: 선택형 82 + 서답형 18).
// 18점짜리 고난도 단일 문항이라(담임 확인) 학급 대부분이 0점이다 → 0점을 개인 약점으로 해석하지 않게 한다
const WRITTEN_MAX = { 수학: 18 };
// 학급 정답률이 이 이상인 문항을 틀렸으면 "놓친 쉬운 문항"으로 본다
const EASY_RATE = 0.7;
// 인정결 과목이 있는 학생에게 붙이는 안내 (공개 저장소라 학생별 결시 사유는 코드에 적지 않는다)
const ABSENCE_NOTE = "출석인정 결시(인정결)";

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

// "국어:공통국어2(4)" → "국어" 처럼 일람표 머리글을 DB의 과목 키로 바꾼다
const ROSTER_LABELS = { 공통국어: "국어", 공통수학: "수학", 공통영어: "영어", 한국사: "한국사", 통합사회: "사회", 통합과학: "과학", 정보: "정보" };
const rosterLabel = (header) => {
  const raw = String(header).split(":").pop().replace(/\s*\([^)]*\)\s*$/, "").replace(/\d+$/, "").trim();
  return ROSTER_LABELS[raw] ?? raw;
};

/** 학급별 일람표의 학과평균(학년 전체 평균) 행 → { 국어: "57.9", ..., 합계: "317.5", 평균: "52.9" } */
function readGradeAverages(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const headers = rows.find((r) => String(r[0]).trim() === "번호").map((h) => String(h).trim());
  const avgRow = rows.find((r) => String(r[0]).replace(/\s+/g, "") === "학과평균");
  const result = {};
  headers.forEach((h, idx) => {
    if (idx <= 2 || !h || avgRow[idx] === "") return;
    result[h.includes(":") ? rosterLabel(h) : h.replace(/\s+/g, "")] = String(avgRow[idx]);
  });
  return result;
}

/** 학급 학생들의 itemAnalysis 로 과목·문항별 정답률을 계산한다 → { 국어: { 1: 0.93, ... } } */
function questionRates(records) {
  const rates = {};
  for (const subject of new Set(records.flatMap((r) => Object.keys(r)))) {
    const takers = records.filter((r) => r[subject]);
    const count = takers[0][subject].문항수;
    rates[subject] = {};
    for (let q = 1; q <= count; q++) {
      const wrong = takers.filter((r) => r[subject].오답.includes(q)).length;
      rates[subject][q] = 1 - wrong / takers.length;
    }
  }
  return rates;
}

const pct = (rate) => `${Math.round(rate * 100)}%`;

/** 서답형 과목별 학급 득점 현황 → { 수학: { scored: 2, takers: 30 } } */
function writtenStats(records) {
  const stats = {};
  for (const subject of Object.keys(WRITTEN_MAX)) {
    const takers = records.filter((r) => r[subject]);
    stats[subject] = { scored: takers.filter((r) => r[subject].서답형 > 0).length, takers: takers.length };
  }
  return stats;
}

function describeItemAnalysis(analysis, rates, written) {
  return Object.entries(analysis).map(([subject, a]) => {
    const easyMissed = a.오답.filter((q) => rates[subject][q] >= EASY_RATE);
    const ws = written[subject];
    const writtenText = ws
      ? `, 서답형(고난도 단일 문항, 학급 ${ws.takers}명 중 ${ws.scored}명만 득점) ${a.서답형}/${WRITTEN_MAX[subject]}점`
      : "";
    const easy = easyMissed.length
      ? ` | 학급 정답률 ${pct(EASY_RATE)} 이상인데 틀린 문항: ${easyMissed.map((q) => `${q}번(${pct(rates[subject][q])})`).join(", ")}`
      : "";
    return `      - ${subject}: 선택형 ${a.문항수}문항 중 ${a.오답.length}개 오답${writtenText}${easy}`;
  }).join("\n");
}

const getMidtermAiNotePrompt = (studentsData) => {
  const studentBlocks = studentsData.map((s) => {
    const examLines = s.examHistory.map((e) => {
      const scoreStr = Object.entries(e.scores).map(([k, v]) => `${k}: ${v}`).join(", ");
      const avgStr = e.averages ? `\n      (학년 평균: ${Object.entries(e.averages).map(([k, v]) => `${k} ${v}`).join(", ")})` : "";
      return `    · ${e.examName} → ${scoreStr}${avgStr}`;
    }).join("\n");
    const absence = s.absenceReason ? `\n    · 참고: "인정결" 과목은 ${s.absenceReason}입니다.` : "";
    return `- studentId: ${s.studentId} | 이름: ${s.name}\n${examLines}\n    · ${EXAM_NAME} 문항 분석:\n${s.itemText}${absence}`;
  }).join("\n\n");

  return `
    당신은 훌륭한 담임 교사 비서입니다. 아래는 학생별로 시간순으로 나열된 학교 정기고사 기록과,
    가장 최근 시험인 ${EXAM_NAME}의 과목별 문항 분석입니다.

    각 학생마다 ${EXAM_NAME}을 중심으로 다음을 반영한 담임 상담자료를 5~7문장으로 작성하세요.
    - 1학기중간고사 → 1학기기말고사 → ${EXAM_NAME} 과목별 추이 (향상/하락/유지)를 구체적으로 언급
    - 시험마다 난이도가 다르므로 원점수 자체가 아니라 "학년 평균 대비" 위치 변화로 판단하세요
      (예: 평균보다 10점 낮던 과목이 평균보다 5점 높아졌다면 향상).
    - 가장 강한 과목과 보완이 필요한 과목을 지목
    - 문항 분석에서 "학급 정답률이 높은데 틀린 문항"이 몰린 과목이 있으면 실수·기본 개념 누락 가능성으로 짚고,
      오답이 대부분인 과목은 기초부터 다시 잡아야 함을 언급
    - 2학기 기말고사를 위한 구체적이고 실행 가능한 학습 지도 조언 1~2가지

    [성적 분석 특별 규칙]
    - 1학기 정기고사 값 "원점수(숫자)"의 괄호 안 숫자는 석차백분율(%)로, 낮을수록 우수합니다.
      ${EXAM_NAME}은 아직 석차가 나오지 않아 원점수만 있습니다.
    - 1학기학기말의 "원점수(백분율, N등급)"은 1학기 최종 성적이며 등급은 5등급제(1등급이 최상위)입니다.
    - "인정결"은 결시이지만 출석으로 인정되는 사유가 있는 것으로, 성적 부진으로 해석하지 마세요.
      인정결 과목이 있는 학생의 합계/평균은 응시한 과목만의 값이므로 다른 시험과 비교하지 마세요.
    - 수학 서답형은 학급 대부분이 풀지 못한 고난도 단일 문항(18점)입니다. 0점을 개인의 약점·미응답·채점 누락으로
      해석하거나 서답형 연습을 조언하지 말고, 득점한 학생만 강점(고난도 문항 해결)으로 언급하세요.
    - 자료에 없는 사실(백지 제출, 시험 중 긴장, 집중력 저하 등)을 단정하지 마세요.
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

  const averages = new Map(SCHOOL_EXAMS.map((e) => [e.examName, readGradeAverages(e.xlsx)]));
  const withExam = students
    .map((s) => ({ s, record: (s.grades || []).find((g) => g.examName === EXAM_NAME) }))
    .filter(({ record }) => record && !Object.values(record.scores).every((v) => v === "전출"));
  const analyses = withExam.map(({ record }) => record.itemAnalysis || {});
  const rates = questionRates(analyses);
  const written = writtenStats(analyses);

  const targets = withExam.map(({ s, record }) => {
    const examHistory = [...SCHOOL_EXAMS.map((e) => e.examName), ...CONTEXT_EXAMS]
      .map((name) => (s.grades || []).find((g) => g.examName === name))
      .filter(Boolean)
      .map((g) => ({ examName: g.examName, scores: g.scores, averages: averages.get(g.examName) }));
    return {
      studentId: String(s.studentId),
      name: s.name,
      examHistory,
      itemText: describeItemAnalysis(record.itemAnalysis || {}, rates, written),
      absenceReason: Object.values(record.scores).includes("인정결") ? ABSENCE_NOTE : undefined,
    };
  });
  console.log(`분석 대상(${EXAM_NAME} 보유, 전출 제외): ${targets.length}명\n`);

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  // Gemini 호출 1회당 처리 인원이 너무 많으면 응답이 잘릴 수 있어 8명씩 나눠 호출한다.
  const CHUNK = 8;
  const results = [];
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    console.log(`--- ${i + 1}~${i + chunk.length}번째 학생 분석 요청 중... ---`);
    const chunkResults = await askStructuredArray(ai, getMidtermAiNotePrompt(chunk), gradeAiNoteItemSchema);
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
      content: `📊 [성적 기반 자동 분석] - ${EXAM_NAME} (내신 추이 + 문항 분석)\n${r.note}`,
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
