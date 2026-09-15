// 평일 오전 10시, Windows 작업 스케줄러("상당고 오늘의 할일 생성")로 자동 실행됩니다.
// 최근 분류/도착한 소통메신저 문서 + 최근 업무일지(workLogs)를 Gemini로 함께 분석해
// 오늘 챙겨야 할 일을 todos 컬렉션에 추가합니다.
//
// 실행: node --env-file=.env scripts/generate_daily_todos.mjs
// (VITE_GEMINI_API_KEY는 .env에서 읽어옵니다. Firebase 설정은 sync_counseling_offline.mjs와 동일하게 코드에 둡니다.)

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, query, where } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { GoogleGenAI } from "@google/genai";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";

const RECEIVE_ROOT = "C:\\Users\\user\\Desktop\\2026년이태훈\\소통메신저받은파일";
const REVIEW_DIR = `${RECEIVE_ROOT}\\00_분류검토`;
const LOG_PATH = `${REVIEW_DIR}\\자동분류.log`;
const STATE_PATH = `${REVIEW_DIR}\\.todo_last_run.json`;
const UNZIP_CANDIDATES = ["unzip", "C:\\Program Files\\Git\\usr\\bin\\unzip.exe"];
const REVIEW_SKIP = new Set(["자동분류.log", "자동분류.ps1", ".todo_last_run.json"]);

const firebaseConfig = {
  apiKey: "AIzaSyCYSwpXQ5MZ-PGqIJ46arywkTSgww8mQ1c",
  authDomain: "myproject-3e80a.firebaseapp.com",
  projectId: "myproject-3e80a",
  storageBucket: "myproject-3e80a.firebasestorage.app",
  messagingSenderId: "784524925931",
  appId: "1:784524925931:web:d7d81c0b15a0344af357ae",
};

const LOGIN_EMAIL_DOMAIN = "@2026myweb.local"; // src/firebase.js와 동일한 규칙 (아이디를 가짜 이메일로 변환)

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "my2026web");
const auth = getAuth(app);
const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });

function nowStamp() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function readLastRun() {
  if (existsSync(STATE_PATH)) {
    try {
      const saved = JSON.parse(readFileSync(STATE_PATH, "utf-8")).lastRun;
      if (saved) return new Date(saved);
    } catch {
      // 상태 파일이 손상된 경우 기본값(24시간 전)으로 진행
    }
  }
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function writeLastRun(date) {
  writeFileSync(STATE_PATH, JSON.stringify({ lastRun: date.toISOString() }), "utf-8");
}

// 자동분류.log에서 since 이후 "이동:" 된 파일만 뽑는다 (주말 낀 월요일도 자동으로 커버됨)
function parseRecentlyMovedFiles(since) {
  if (!existsSync(LOG_PATH)) return [];
  const lines = readFileSync(LOG_PATH, "utf-8").split("\n").filter(Boolean);
  const results = [];
  for (const line of lines) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) 이동: (.+?) -> (\S+)/);
    if (!m) continue;
    const ts = new Date(m[1].replace(" ", "T"));
    if (ts >= since) {
      results.push({ name: m[2], folder: m[3], fullPath: `${RECEIVE_ROOT}\\${m[3]}\\${m[2]}` });
    }
  }
  return results;
}

// 00_분류검토에 아직 남아있는(자동분류 실패/보류) 파일은 항상 포함
function listReviewPending() {
  if (!existsSync(REVIEW_DIR)) return [];
  return readdirSync(REVIEW_DIR)
    .filter((f) => !REVIEW_SKIP.has(f) && !f.startsWith("."))
    .filter((f) => statSync(`${REVIEW_DIR}\\${f}`).isFile())
    .map((f) => ({ name: f, folder: "00_분류검토", fullPath: `${REVIEW_DIR}\\${f}` }));
}

function extractHwpxPreview(fullPath) {
  for (const bin of UNZIP_CANDIDATES) {
    try {
      const out = execFileSync(bin, ["-p", fullPath, "Preview/PrvText.txt"], { encoding: "utf-8" });
      return out
        .replace(/[<>]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500);
    } catch {
      continue;
    }
  }
  return null;
}

function buildDocContext(files) {
  const seen = new Set();
  const items = [];
  for (const f of files) {
    if (seen.has(f.fullPath) || !existsSync(f.fullPath)) continue;
    seen.add(f.fullPath);
    const preview = f.name.toLowerCase().endsWith(".hwpx") ? extractHwpxPreview(f.fullPath) : null;
    items.push({ name: f.name, folder: f.folder, preview });
  }
  return items;
}

async function fetchRecentWorkLogs(days = 7) {
  const snap = await getDocs(collection(db, "workLogs"));
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return snap.docs
    .map((d) => d.data())
    .filter((l) => l.createdAt && new Date(l.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function fetchOpenTodoTexts() {
  const snap = await getDocs(query(collection(db, "todos"), where("completed", "==", false)));
  return snap.docs.map((d) => (d.data().text || "").trim()).filter(Boolean);
}

function buildPrompt(docItems, workLogs, openTodos) {
  const docBlock = docItems.length
    ? docItems
        .map((d) => `- [${d.folder}] ${d.name}${d.preview ? `\n  내용 미리보기: ${d.preview}` : ""}`)
        .join("\n\n")
    : "(최근 새로 도착/분류된 문서 없음)";

  const logBlock = workLogs.length
    ? workLogs.map((l) => `- (${(l.createdAt || "").slice(0, 10)}) ${(l.tags || []).join(" ")} ${l.content}`).join("\n")
    : "(최근 7일 업무일지 없음)";

  const todoBlock = openTodos.length ? openTodos.map((t) => `- ${t}`).join("\n") : "(없음)";

  return `
당신은 고등학교 1학년 담임교사의 업무를 돕는 AI 비서입니다.
아래 [최근 도착/분류된 문서]와 [최근 업무일지]를 함께 보고, 오늘(평일) 담임교사가 챙겨야 할 구체적인 할 일을 뽑아주세요.

[출력 규칙 - 절대 엄수]
1. 반드시 { "todos": ["...", "..."] } 형태의 단일 JSON 객체로만 응답하세요. 다른 텍스트를 덧붙이지 마세요.
2. 각 항목은 실행 가능한 짧은 문장 하나로 작성하세요 (예: "OO 신청서 담임 확인 후 교무부 제출").
3. 문서에 마감일/기한이 명시되어 있으면 항목에 반드시 포함하세요.
4. 아래 [기존 할 일] 목록과 의미가 겹치는 항목은 만들지 마세요.
5. 담임이 별도로 할 일이 없는 단순 참고 공문이면 항목을 만들지 마세요. 할 일이 전혀 없으면 { "todos": [] } 로 응답하세요.
6. 최대 8개까지만 작성하세요.

[최근 도착/분류된 문서]
${docBlock}

[최근 7일 업무일지]
${logBlock}

[기존 할 일 (중복 금지)]
${todoBlock}
`;
}

async function main() {
  const loginId = process.env.VITE_LOGIN_ID;
  const loginPw = process.env.VITE_LOGIN_PW;
  if (!loginId || !loginPw) {
    throw new Error("VITE_LOGIN_ID / VITE_LOGIN_PW 환경변수가 없습니다 (.env 확인 필요)");
  }
  await signInWithEmailAndPassword(auth, `${loginId}${LOGIN_EMAIL_DOMAIN}`, loginPw);

  const since = readLastRun();
  const moved = parseRecentlyMovedFiles(since);
  const pending = listReviewPending();
  const docItems = buildDocContext([...moved, ...pending]);

  const [workLogs, openTodos] = await Promise.all([fetchRecentWorkLogs(), fetchOpenTodoTexts()]);

  if (docItems.length === 0 && workLogs.length === 0) {
    console.log(`[${nowStamp()}] 분석할 새 문서/업무일지가 없어 종료합니다.`);
    writeLastRun(new Date());
    return;
  }

  const prompt = buildPrompt(docItems, workLogs, openTodos);

  let todos = [];
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    const rawText = typeof response.text === "function" ? response.text() : response.text;
    const parsed = JSON.parse(rawText);
    todos = Array.isArray(parsed.todos) ? parsed.todos.filter((t) => typeof t === "string" && t.trim()) : [];
  } catch (e) {
    // Gemini 호출/파싱 실패 시 last-run을 진행시키지 않아 다음 실행에서 재시도한다
    console.error(`[${nowStamp()}] Gemini 호출/파싱 실패:`, e);
    return;
  }

  const existing = new Set(openTodos);
  let added = 0;
  for (const raw of todos) {
    const text = raw.trim();
    if (!text || existing.has(text)) continue;
    await addDoc(collection(db, "todos"), { text, completed: false, createdAt: new Date() });
    existing.add(text);
    added++;
  }

  writeLastRun(new Date());
  console.log(
    `[${nowStamp()}] 완료: 문서 ${docItems.length}건 / 업무일지 ${workLogs.length}건 분석 -> 할일 ${added}건 추가`
  );
}

// Firebase SDK가 내부적으로 네트워크 핸들을 열어두어 그냥 두면 프로세스가 종료되지 않으므로
// 모든 경로에서 명시적으로 process.exit()를 호출한다 (작업 스케줄러가 무한 대기하는 것을 방지).
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`[${nowStamp()}] 실행 실패:`, e);
    process.exit(1);
  });
