// "2026학년도 9월 고1 전국연합학력평가" 성적통지표(PDF, pdftotext -enc UTF-8 로 미리 텍스트 추출)를
// 파싱하여 1학년 5반 학생들의 grades 배열에 "9월모의고사" 항목으로 등록한다.
// 기존 studentStore.bulkUploadGrades()와 동일하게 examName이 같으면 덮어쓰고, 없으면 추가한다.
// 원점수(과목별 득점)와 등급을 함께 저장해 "국어(등급)"처럼 괄호 접미사로 붙인다
// (gradeUtils.stripParen이 "국어" 별칭으로 인식하되, 원점수 키가 먼저 매칭되어 두 값이 나란히 표시됨).
//
// 기본은 미리보기(dry-run)이며, --commit 옵션을 줘야 실제로 Firestore에 씁니다.
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, writeBatch } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import fs from "fs";

const TXT_PATH = "C:\\Users\\user\\AppData\\Local\\Temp\\claude\\C--Users-user-Documents-develop-2026myweb\\1b62ad6b-51a8-477e-83dd-384cab352a88\\scratchpad\\sept_mock.txt";
const EXAM_NAME = "9월모의고사";
const SUBJECTS = ["국어", "수학", "영어", "한국사", "사회탐구", "과학탐구"];
const TYPES = ["rel", "rel", "abs", "abs", "rel", "rel"];
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

function parse(text) {
  const studentHeaderRe = /학년\s*\n+\s*반\s*\n+\s*번호\s*\n+\s*(\d+)\s*\n+\s*(\d+)\s*\n+\s*(\d+)\s*\n+\s*성명\s+(\S+)/g;
  const headers = [...text.matchAll(studentHeaderRe)];
  const results = [];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const [grade, cls, number, name] = [h[1], h[2], h[3], h[4]];
    const start = h.index;
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    const segment = text.slice(start, end);
    const studentId = `${grade}${String(cls).padStart(2, "0")}${String(number).padStart(2, "0")}`;

    const rawBlockMatch = segment.match(/원점수\s*\n+\s*배점\s*\n+\s*득점\s*\n+([\s\S]*?)표준점수\s*\n+\s*범위\s*\n+\s*득점/);
    let rawScores = [];
    if (rawBlockMatch) {
      const nums = [...rawBlockMatch[1].matchAll(/[\d]+\.?\d*/g)].map(m => m[0]);
      for (let j = 1; j < nums.length; j += 2) rawScores.push(nums[j]);
    }

    const relRe = /\d+\/\d+\s+\d+\/\d+\s+[\d.]+\s*\n+\s*(\d+)\s*\n/g;
    const absRe = /원점수에\s*의한\s*등급\s*\(\s*(\d+)\s*\)/g;
    const relMatches = [...segment.matchAll(relRe)].map(m => m[1]);
    const absMatches = [...segment.matchAll(absRe)].map(m => m[1]);
    let relIdx = 0, absIdx = 0;
    const grades = TYPES.map(t => (t === "rel" ? relMatches[relIdx++] : absMatches[absIdx++]) ?? null);

    if (rawScores.length !== 6 || grades.some(g => g === null)) {
      console.warn(`⚠️ [${studentId}] ${name} 파싱 불완전 (raw=${rawScores.length}개, grades=${JSON.stringify(grades)}) - 건너뜀`);
      continue;
    }

    const scores = {};
    SUBJECTS.forEach((s, idx) => {
      scores[s] = rawScores[idx];
      scores[`${s}(등급)`] = grades[idx];
    });

    results.push({ studentId, name, scores });
  }
  return results;
}

async function main() {
  const loginId = process.env.VITE_LOGIN_ID;
  const loginPw = process.env.VITE_LOGIN_PW;
  if (!loginId || !loginPw) throw new Error("VITE_LOGIN_ID / VITE_LOGIN_PW 환경변수가 없습니다");
  await signInWithEmailAndPassword(auth, `${loginId}${LOGIN_EMAIL_DOMAIN}`, loginPw);

  const text = fs.readFileSync(TXT_PATH, "utf-8");
  const parsed = parse(text);
  console.log(`파싱된 학생: ${parsed.length}명\n`);

  const batch = writeBatch(db);
  let writeCount = 0;
  const nameMismatches = [];
  const notFound = [];

  for (const p of parsed) {
    const studentRef = doc(db, "students", p.studentId);
    const snap = await getDoc(studentRef);
    if (!snap.exists()) {
      notFound.push(`${p.studentId} ${p.name}`);
      continue;
    }
    const dbData = snap.data();
    if (dbData.name !== p.name) {
      nameMismatches.push(`${p.studentId}: PDF="${p.name}" DB="${dbData.name}"`);
      continue;
    }

    let grades = dbData.grades || [];
    const existingIndex = grades.findIndex(g => g.examName === EXAM_NAME);
    if (existingIndex > -1) {
      grades[existingIndex] = { ...grades[existingIndex], scores: p.scores, updatedAt: new Date().toISOString() };
    } else {
      grades.push({ id: Date.now() + Math.random(), examName: EXAM_NAME, scores: p.scores, createdAt: new Date().toISOString() });
    }
    batch.update(studentRef, { grades });
    writeCount++;

    console.log(`[${p.studentId}] ${p.name}: ${Object.entries(p.scores).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }

  console.log(`\n등록 대상: ${writeCount}명`);
  if (notFound.length) console.log(`⚠️ DB에 없는 학번: ${notFound.join(", ")}`);
  if (nameMismatches.length) console.log(`⚠️ 이름 불일치(건너뜀): ${nameMismatches.join(", ")}`);

  if (!COMMIT) {
    console.log("\n(미리보기 모드입니다. 실제로 저장하려면 --commit 옵션을 붙여 다시 실행하세요.)");
    return;
  }

  await batch.commit();
  console.log(`\n완료: ${writeCount}명의 "${EXAM_NAME}" 성적을 저장했습니다.`);
}

main().catch(err => {
  console.error("실패:", err);
  process.exit(1);
});
