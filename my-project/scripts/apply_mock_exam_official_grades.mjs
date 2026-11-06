// KICE "전국연합학력평가 성적일람표(학급별)"의 공식 전국백분위·등급을 모의고사 기록에 반영한다.
//
//  · 일람표에는 원점수가 없고 표준점수/학교석차/전국백분위/등급만 있다. 그래서 원점수는 이미 DB에 들어 있는
//    값(10월은 개인채점표에서 넣은 값)을 그대로 쓰고, 괄호 안을 공식 값으로 바꾼다.
//      국어·수학·사회탐구·과학탐구: "원점수(전국백분위, N등급)" / 영어·한국사(절대평가): "원점수(N등급)"
//    (3월/6월/9월 모의고사와 같은 형식. 10월에 넣어 둔 EBSi "예상 등급"과 평균등급(예상)은 공식 값으로 대체된다)
//  · --check 를 주면 DB에 쓰지 않고, 이미 공식 성적이 들어 있는 회차(9월 등)와 등급이 일치하는지만 대조한다.
//
// PDF는 미리 -layout 텍스트로 변환해 둔다:
//   pdftotext -enc UTF-8 -layout "<성적일람표 PDF>" "data/성적/모의고사/<N>월_일람표.txt"
//
// 기본은 미리보기(dry-run)이며, --commit 옵션을 줘야 실제로 Firestore에 씁니다.
//   node --env-file=.env scripts/apply_mock_exam_official_grades.mjs --exam=10월모의고사 --txt=<일람표.txt> [--commit]
//   node --env-file=.env scripts/apply_mock_exam_official_grades.mjs --exam=9월모의고사 --txt=<일람표.txt> --check
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, doc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import fs from "fs";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const EXAM_NAME = arg("exam");
const TXT_PATH = arg("txt");
const COMMIT = process.argv.includes("--commit");
const CHECK = process.argv.includes("--check");
if (!EXAM_NAME || !TXT_PATH) throw new Error("--exam=<시험명> --txt=<일람표 텍스트> 를 지정하세요");

// 일람표 한 행의 열 순서 (영어·한국사는 등급만 있다)
const COLUMNS = [
  { subject: "국어", fields: ["std", "rank", "pct", "grade"] },
  { subject: "수학", fields: ["std", "rank", "pct", "grade"] },
  { subject: "영어", fields: ["grade"] },
  { subject: "한국사", fields: ["grade"] },
  { subject: "사회탐구", fields: ["std", "rank", "pct", "grade"] },
  { subject: "과학탐구", fields: ["std", "rank", "pct", "grade"] },
];
const TOKEN_COUNT = COLUMNS.reduce((n, c) => n + c.fields.length, 0); // 18

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
const warnings = [];

/**
 * 일람표 텍스트 → [{ studentId, name, subjects: { 국어: { pct, grade }, ... } }]
 * "학년 반" 머리글 아래 줄에서 학년/반("1 5" 처럼 붙어 "15"로 찍힘)을 읽고, "번호 성명 숫자18개" 행을 학생으로 본다.
 * (-layout 변환 시 일부 백분위가 행 위로 밀려 나와 한 행의 숫자가 18개가 아니면 그 학생은 건너뛰고 알린다)
 */
function parseRoster(txtPath) {
  const lines = fs.readFileSync(txtPath, "utf-8").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^학년\s+반/.test(l.trim()));
  const classMatch = lines[headerIdx + 1]?.trim().match(/^(\d)(\d+)/);
  if (!classMatch) throw new Error(`${txtPath}: 학년/반 정보를 찾지 못했습니다`);
  const [, grade, cls] = classMatch;

  const students = [];
  for (const line of lines) {
    const m = line.trim().match(/^(\d+)\s+([가-힣]{2,5})\s+(.+)$/);
    if (!m) continue;
    const tokens = m[3].trim().split(/\s+/);
    if (!tokens.every((t) => /^[\d.]+$/.test(t))) continue;
    const studentId = `${grade}${String(cls).padStart(2, "0")}${String(m[1]).padStart(2, "0")}`;
    // 국어 백분위만 행 밖으로 밀려난 행(값 17개)은 나머지 열 위치가 그대로라 대조(--check)에는 쓸 수 있다
    const koreanPctMissing = CHECK && tokens.length === TOKEN_COUNT - 1;
    if (tokens.length !== TOKEN_COUNT && !koreanPctMissing) {
      warnings.push(`${studentId} ${m[2]}: 일람표 행의 값이 ${tokens.length}개(정상 ${TOKEN_COUNT}개) — 건너뜀`);
      continue;
    }
    if (koreanPctMissing) tokens.splice(2, 0, null);
    const subjects = {};
    let i = 0;
    for (const { subject, fields } of COLUMNS) {
      const values = Object.fromEntries(fields.map((f) => [f, tokens[i++]]));
      subjects[subject] = { pct: values.pct, grade: values.grade };
    }
    students.push({ studentId, name: m[2], subjects });
  }
  return students;
}

const rawScoreOf = (value) => String(value ?? "").match(/^[\d.]+/)?.[0];
const gradeOf = (value) => String(value ?? "").match(/(\d)등급/)?.[1];

async function main() {
  const loginId = process.env.VITE_LOGIN_ID;
  const loginPw = process.env.VITE_LOGIN_PW;
  if (!loginId || !loginPw) throw new Error("VITE_LOGIN_ID / VITE_LOGIN_PW 환경변수가 없습니다");
  await signInWithEmailAndPassword(auth, `${loginId}${LOGIN_EMAIL_DOMAIN}`, loginPw);

  const snap = await getDocs(collection(db, "students"));
  const byId = new Map(snap.docs.map((d) => [String(d.data().studentId ?? d.id), { docId: d.id, ...d.data() }]));

  const roster = parseRoster(TXT_PATH);
  console.log(`${EXAM_NAME}: 일람표 ${roster.length}명 인식`);

  const updates = [];
  const changes = [];
  let matched = 0;
  const now = new Date().toISOString();
  for (const r of roster) {
    const student = byId.get(r.studentId);
    if (!student) { warnings.push(`DB에 없는 학번: ${r.studentId} ${r.name}`); continue; }
    if (student.name !== r.name) {
      warnings.push(`이름 불일치로 건너뜀: ${r.studentId} 자료="${r.name}" DB="${student.name}"`);
      continue;
    }
    const grades = (student.grades || []).map((g) => ({ ...g }));
    const idx = grades.findIndex((g) => g.examName === EXAM_NAME);
    if (idx < 0) { warnings.push(`${r.studentId} ${r.name}: DB에 ${EXAM_NAME} 기록이 없어 원점수를 알 수 없음 — 건너뜀`); continue; }
    const oldScores = grades[idx].scores || {};

    const diffs = [];
    const scores = {};
    for (const { subject } of COLUMNS) {
      const official = r.subjects[subject];
      const raw = rawScoreOf(oldScores[subject]);
      if (!raw) { warnings.push(`${r.studentId} ${r.name} ${subject}: DB에 원점수 없음 — 과목 제외`); continue; }
      const before = gradeOf(oldScores[subject]);
      if (before !== official.grade) diffs.push(`${subject} ${before ?? "-"}→${official.grade}`);
      scores[subject] = official.pct ? `${raw}(${official.pct}, ${official.grade}등급)` : `${raw}(${official.grade}등급)`;
    }
    if (diffs.length) changes.push(`${r.studentId} ${r.name}: ${diffs.join(", ")}`);
    else matched++;
    // 과목 외 요약 항목(총점 등)은 유지하되, 공식 성적으로 대체되는 "평균등급(예상)"은 뺀다
    for (const [key, value] of Object.entries(oldScores)) {
      if (!(key in scores) && !COLUMNS.some((c) => c.subject === key) && key !== "평균등급(예상)") scores[key] = value;
    }
    grades[idx] = { ...grades[idx], scores, updatedAt: now };
    updates.push({ studentId: r.studentId, student, grades, scores });
  }

  console.log(`\n등급이 DB와 모두 같은 학생: ${matched}명 / 등급이 달라지는 학생: ${changes.length}명`);
  if (changes.length) console.log(changes.map((c) => `  · ${c}`).join("\n"));
  const sample = updates[0];
  if (sample) console.log(`\n--- 미리보기: [${sample.studentId}] ${sample.student.name} ---\n  ${Object.entries(sample.scores).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (warnings.length) console.log(`\n⚠️ 경고 ${warnings.length}건:\n` + warnings.join("\n"));

  if (CHECK || !COMMIT) {
    console.log(CHECK ? "\n(대조 모드라 저장하지 않았습니다.)" : "\n(미리보기 모드입니다. 실제로 저장하려면 --commit 옵션을 붙여 다시 실행하세요.)");
    return;
  }
  const batch = writeBatch(db);
  for (const u of updates) batch.update(doc(db, "students", u.student.docId), { grades: u.grades });
  await batch.commit();
  console.log(`\n완료: ${updates.length}명의 ${EXAM_NAME} 기록을 공식 성적으로 갱신했습니다.`);
}

// Firestore 클라이언트가 연결을 붙잡고 있어 작업이 끝나도 프로세스가 종료되지 않으므로 직접 종료한다
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("실패:", err);
    process.exit(1);
  });
