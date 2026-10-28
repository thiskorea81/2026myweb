// 10월 전국연합학력평가(10월 20일 시행) 성적을 students.grades 에 "10월모의고사" 기록으로 등록한다.
//
//  · scores: 학년부 "9월vs10월 비교일람표"의 10월 원점수 + EBSi 기준 예상 등급 → "원점수(예상 N등급)",
//    전과목 총점 / 평균 등급(예상). (공식 성적통지표가 나오기 전이라 전국 백분위·공식 등급은 없다)
//  · itemAnalysis: 과목별 개인채점표의 O/X로 오답 문항 번호를 기록한다 (수학은 객관식/주관식 점수도).
//    한국사 채점표는 파일이 손상되어 열리지 않아 한국사 문항 분석은 없다.
//  · 미응시 학생은 기록을 만들지 않는다.
//
// 기본은 미리보기(dry-run)이며, --commit 옵션을 줘야 실제로 Firestore에 씁니다.
//   node --env-file=.env scripts/import_october_mock_exam.mjs [--commit] [--sample=10501]
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, doc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import XLSX from "xlsx";

const DATA_DIR = "C:\\Users\\user\\Documents\\develop\\2026myweb\\data\\성적\\모의고사";
const COMPARE_XLSX = `${DATA_DIR}\\상당고등학교_1학년_9월vs10월_학력평가_성적및등급_비교일람표.xlsx`;
const SCORE_SHEET = (area) => `${DATA_DIR}\\10회 - 10월20일 경기도교육청_상당고등학교_7차일반_1학년_전체반_${area}_개인채점표.xls`;
const EXAM_NAME = "10월모의고사";
const CLASS_PREFIX = "105"; // 1학년 5반만 등록
const SUBJECTS = ["국어", "수학", "영어", "한국사", "사회탐구", "과학탐구"];

const COMMIT = process.argv.includes("--commit");
const SAMPLE_ARG = process.argv.find((a) => a.startsWith("--sample="))?.split("=")[1];

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
const toStudentId = (cls, number) => `1${String(cls).padStart(2, "0")}${String(number).padStart(2, "0")}`;
const readRows = (path, sheet) => {
  const wb = XLSX.readFile(path);
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet ?? wb.SheetNames[0]], { header: 1, defval: "" });
};

/** 비교일람표 "10월 학력평가 성적" 시트 → Map(studentId → { name, scores } | { name, absent: true }) */
function parseCompareSheet() {
  const rows = readRows(COMPARE_XLSX, "10월 학력평가 성적");
  const headerIdx = rows.findIndex((r) => r[0] === "반");
  const headers = rows[headerIdx].map((h) => String(h).trim());
  const col = (label) => headers.indexOf(label);

  const result = new Map();
  for (const row of rows.slice(headerIdx + 1)) {
    if (typeof row[0] !== "number") continue;
    const name = String(row[2]).trim();
    const studentId = toStudentId(row[0], row[1]);
    if (SUBJECTS.every((s) => row[col(`${s} 점수`)] === "미응시")) {
      result.set(studentId, { name, absent: true });
      continue;
    }
    const scores = {};
    for (const s of SUBJECTS) {
      const score = row[col(`${s} 점수`)];
      if (typeof score !== "number") continue; // 해당 과목만 미응시
      const grade = String(row[col(`${s} 등급`)]).replace(/등급$/, "");
      scores[s] = `${score}(예상 ${grade}등급)`;
    }
    const total = row[col("전과목 총점")];
    const avgGrade = row[col("평균 등급")];
    if (typeof total === "number") scores["총점"] = String(total);
    if (typeof avgGrade === "number") scores["평균등급(예상)"] = avgGrade.toFixed(2);
    result.set(studentId, { name, scores, raw: Object.fromEntries(SUBJECTS.map((s) => [s, row[col(`${s} 점수`)]])) });
  }
  return result;
}

/** "OXXOX" 묶음들을 이어 붙여 오답 문항 번호 배열로 바꾼다 (O가 아니면 무응답 포함 모두 오답) */
const wrongFromMarks = (groups) => {
  const marks = groups.map((g) => String(g).trim()).join("").split("");
  return { count: marks.length, wrong: marks.flatMap((m, i) => (m === "O" ? [] : [i + 1])) };
};

/**
 * 과목별 개인채점표 → Map(studentId → { name, subjects: { 과목: { 문항수, 오답, 점수, ... } } })
 * 국어/영어/수학은 학생당 1행, 탐구는 학생당 2행(정답 행 + O/X 행)이다.
 */
function parseScoreSheets() {
  const result = new Map();
  const entry = (studentId, name) => {
    if (!result.has(studentId)) result.set(studentId, { name, subjects: {} });
    return result.get(studentId).subjects;
  };

  for (const area of ["국어영역", "영어영역", "수학영역"]) {
    const rows = readRows(SCORE_SHEET(area));
    const headers = rows[0].map((h) => String(h).replace(/\s+/g, ""));
    const markCols = headers.flatMap((h, i) => (/^\d+~\d+$/.test(h) ? [i] : []));
    const subject = area.replace("영역", "");
    for (const row of rows) {
      if (typeof row[0] !== "number" || row[3] !== "응시") continue;
      const { count, wrong } = wrongFromMarks(markCols.map((c) => row[c]));
      const info = { 문항수: count, 오답: wrong };
      if (subject === "수학") {
        info.객관식 = Number(row[headers.indexOf("객관식")]);
        info.주관식 = Number(row[headers.indexOf("주관식")]);
        info.점수 = Number(row[headers.indexOf("총점")]);
      } else {
        info.점수 = Number(row[headers.indexOf("점수")]);
      }
      entry(toStudentId(row[0], row[1]), String(row[2]).trim())[subject] = info;
    }
  }

  // 탐구: 첫 행에 정답(5문항씩 묶인 숫자)과 선택 과목명, 다음 행에 O/X와 과목별 점수가 온다
  const rows = readRows(SCORE_SHEET("탐구영역"));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (typeof row[0] !== "number" || row[3] !== "응시") continue;
    const marks = rows[i + 1];
    const subjects = entry(toStudentId(row[0], row[1]), String(row[2]).trim());
    [[4, 14], [9, 15]].forEach(([from, scoreCol]) => {
      const subject = String(row[scoreCol]).trim(); // "사회탐구" / "과학탐구"
      if (!subject) return;
      const { count, wrong } = wrongFromMarks(marks.slice(from, from + 5));
      subjects[subject] = { 문항수: count, 오답: wrong, 점수: Number(marks[scoreCol]) };
    });
    i++;
  }
  return result;
}

async function main() {
  const loginId = process.env.VITE_LOGIN_ID;
  const loginPw = process.env.VITE_LOGIN_PW;
  if (!loginId || !loginPw) throw new Error("VITE_LOGIN_ID / VITE_LOGIN_PW 환경변수가 없습니다");
  await signInWithEmailAndPassword(auth, `${loginId}${LOGIN_EMAIL_DOMAIN}`, loginPw);

  const snap = await getDocs(collection(db, "students"));
  const byId = new Map(snap.docs.map((d) => [String(d.data().studentId ?? d.id), { docId: d.id, ...d.data() }]));

  const compare = parseCompareSheet();
  const sheets = parseScoreSheets();
  console.log(`${EXAM_NAME}: 비교일람표 ${compare.size}명 / 채점표 ${sheets.size}명(응시자)`);

  const updates = [];
  const now = new Date().toISOString();
  for (const [studentId, c] of compare) {
    if (!studentId.startsWith(CLASS_PREFIX)) continue;
    if (c.absent) { warnings.push(`${studentId} ${c.name}: 미응시 — 건너뜀`); continue; }
    const student = byId.get(studentId);
    if (!student) { warnings.push(`DB에 없는 학번: ${studentId} ${c.name}`); continue; }
    if (student.name !== c.name) {
      warnings.push(`이름 불일치로 건너뜀: ${studentId} 자료="${c.name}" DB="${student.name}"`);
      continue;
    }

    const sheet = sheets.get(studentId);
    const analysis = sheet?.subjects ?? {};
    if (!sheet) warnings.push(`${studentId} ${c.name}: 채점표 없음 — 점수만 기록`);
    for (const [subject, a] of Object.entries(analysis)) {
      if (c.raw[subject] !== a.점수) warnings.push(`${studentId} ${c.name} ${subject}: 비교일람표 ${c.raw[subject]} ≠ 채점표 ${a.점수}`);
    }

    const grades = (student.grades || []).map((g) => ({ ...g }));
    const idx = grades.findIndex((g) => g.examName === EXAM_NAME);
    const record = { examName: EXAM_NAME, scores: c.scores, itemAnalysis: analysis };
    let action;
    if (idx > -1) {
      grades[idx] = { ...grades[idx], ...record, updatedAt: now };
      action = "갱신";
    } else {
      grades.push({ id: Date.now() + Math.random(), ...record, createdAt: now });
      action = "신규 등록";
    }
    updates.push({ studentId, student, grades, record, action });
  }

  const counts = updates.reduce((acc, u) => ({ ...acc, [u.action]: (acc[u.action] || 0) + 1 }), {});
  console.log(`\n변경 대상 학생: ${updates.length}명`, counts);

  const sample = updates.find((u) => u.studentId === (SAMPLE_ARG ?? updates[0]?.studentId));
  if (sample) {
    console.log(`\n--- 상세 미리보기: [${sample.studentId}] ${sample.student.name} ---`);
    console.log(`  scores: ${Object.entries(sample.record.scores).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    for (const [subject, a] of Object.entries(sample.record.itemAnalysis)) {
      const extra = subject === "수학" ? ` (객관식 ${a.객관식} + 주관식 ${a.주관식})` : "";
      console.log(`  ${subject}: ${a.점수}점${extra}, 오답 ${a.오답.length}/${a.문항수} [${a.오답.join(",")}]`);
    }
  }
  if (warnings.length) console.log(`\n⚠️ 경고 ${warnings.length}건:\n` + warnings.join("\n"));

  if (!COMMIT) {
    console.log("\n(미리보기 모드입니다. 실제로 저장하려면 --commit 옵션을 붙여 다시 실행하세요.)");
    return;
  }

  const batch = writeBatch(db);
  for (const u of updates) batch.update(doc(db, "students", u.student.docId), { grades: u.grades });
  await batch.commit();
  console.log(`\n완료: ${updates.length}명의 ${EXAM_NAME} 성적을 저장했습니다.`);
}

// Firestore 클라이언트가 연결을 붙잡고 있어 작업이 끝나도 프로세스가 종료되지 않으므로 직접 종료한다
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("실패:", err);
    process.exit(1);
  });
