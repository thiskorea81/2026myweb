// 2026학년도 2학기 중간고사 성적을 students.grades 에 "2학기중간고사" 기록으로 등록한다.
//
//  · scores: 정기시험 학급별 일람표의 과목별 원점수 + 합계/평균
//    ("인정결" 같은 표기는 그대로 기록, 전출생은 전 과목 "전출")
//    + 학년부 "지필고사 성적 정리" 파일의 백분율·예상 등급 → 과목별 "원점수(백분율, 예상 N등급)",
//      전과목 등수 → "전과목등수(N명)", 단위수 반영 5등급 평균 → "평균등급(예상)"
//    (전과목 성적 일람표가 아직 없어 공식 석차 대신 이 예상치를 쓴다. 인정결 과목이 있는 학생의
//     전과목 등수는 응시 과목만의 평균으로 매겨진 값이라 기록하지 않는다)
//  · itemAnalysis: 학생별 학생답정오표에서 과목별 선택형/서답형 점수와 선택형 오답 문항 번호
//    (영어처럼 정오란이 비어 있는 과목은 정답과 학생답을 비교해 판정. 무응답/중복마킹도 오답)
//
// 기본은 미리보기(dry-run)이며, --commit 옵션을 줘야 실제로 Firestore에 씁니다.
// --sample=<학번> 으로 상세 미리보기를 볼 학생을 지정할 수 있습니다.
//   node --env-file=.env scripts/import_2nd_midterm.mjs [--commit] [--sample=10501]
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, doc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import XLSX from "xlsx";

const DATA_DIR = "C:\\Users\\user\\Documents\\develop\\2026myweb\\data\\성적\\학교";
const ROSTER_XLSX = `${DATA_DIR}\\2026_2학기_중간고사(1-5).xlsx`;
const ANSWER_XLSX = `${DATA_DIR}\\2026_2학기_중간고사_학생별학생답정오표.xlsx`;
const SUMMARY_XLSX = `${DATA_DIR}\\1학년 2학기 중간고사 지필고사 성적 정리.xlsx`;
const EXAM_NAME = "2학기중간고사";

// 학교 시험 자료의 과목 표기 → 화면 표시용 과목명(gradeUtils의 라벨과 동일)
const SCHOOL_SUBJECT_LABELS = {
  공통국어2: "국어", 공통수학2: "수학", 공통영어2: "영어", 한국사2: "한국사",
  통합사회2: "사회", 통합과학2: "과학",
};

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

const stripParen = (key) => String(key).replace(/\s*\([^)]*\)\s*$/, "").trim();
// "국어:공통국어2(4)" → 공통국어2 → 국어
const subjectLabel = (header) => {
  const raw = stripParen(String(header).split(":").pop());
  return SCHOOL_SUBJECT_LABELS[raw] ?? raw;
};
// 성적 정리 파일은 머리글이 1학기 양식("공통국어1", "한국사1")으로 남아 있어 끝의 숫자를 떼고 맞춘다
const summaryLabel = (header) => {
  const raw = stripParen(String(header).split(":").pop()).replace(/\d+$/, "");
  return SCHOOL_SUBJECT_LABELS[`${raw}2`] ?? raw;
};
const toStudentId = (grade, cls, number) =>
  `${grade}${String(cls).padStart(2, "0")}${String(number).padStart(2, "0")}`;
const warnings = [];

const readRows = (xlsxPath) => {
  const wb = XLSX.readFile(xlsxPath);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
};

/** 정기시험 학급별 일람표 → [{ studentId, name, scores }] */
function parseExamRoster(xlsxPath) {
  const rows = readRows(xlsxPath);
  const classMatch = rows.map((r) => String(r[0])).join("\n").match(/(\d+)학년\s+(\d+)반/);
  if (!classMatch) throw new Error(`${xlsxPath}: 학년/반 정보를 찾지 못했습니다`);
  const [, grade, cls] = classMatch;

  const headerIdx = rows.findIndex((r) => String(r[0]).trim() === "번호");
  if (headerIdx < 0) throw new Error(`${xlsxPath}: 머리글(번호) 행을 찾지 못했습니다`);
  const headers = rows[headerIdx].map((h) => String(h).trim());

  const results = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const number = row[0];
    const name = String(row[2]).trim();
    if (typeof number !== "number" || !name) continue; // 응시생수/총점/평균 요약 행 제외

    const scores = {};
    headers.forEach((header, idx) => {
      if (idx <= 2 || header === "") return;
      const value = row[idx];
      if (value === "" || value === null || value === undefined) return;
      const label = header.includes(":") ? subjectLabel(header) : header.replace(/\s+/g, "");
      scores[label] = String(value);
    });

    // 전출생은 일부 과목 칸에만 "전출"이 찍혀 있고 나머지는 비어 있다 → 전 과목을 "전출"로 기록한다
    if (Object.values(scores).every((v) => v === "전출")) {
      for (const key of Object.keys(scores)) delete scores[key];
      for (const [idx, header] of headers.entries()) {
        if (idx > 2 && header.includes(":")) scores[subjectLabel(header)] = "전출";
      }
      warnings.push(`${toStudentId(grade, cls, number)} ${name}: 전출 — 전 과목 "전출"로 기록`);
    }
    results.push({ studentId: toStudentId(grade, cls, number), name, scores });
  }
  return results;
}

/**
 * 학생별 학생답정오표 → Map(studentId → { name, analysis })
 *
 * 학생 한 명이 한 페이지이고, 과목마다 [배점, 정답, 학생답, 정오] 4행이 이어진다.
 * 응시 과목 수에 따라 문항 열 개수가 달라져 "선택형점수" 등 점수 열 위치가 페이지마다 바뀌므로
 * 페이지별 머리글 행에서 열 위치를 다시 찾는다.
 */
function parseAnswerSheets(xlsxPath) {
  const rows = readRows(xlsxPath);
  const result = new Map();

  for (let i = 0; i < rows.length; i++) {
    const m = String(rows[i][0]).match(/(\d+)학년\s+(\d+)반\s+(\d+)번\s+(\S+)/);
    if (!m) continue;
    const [, grade, cls, number, name] = m;
    const studentId = toStudentId(grade, cls, number);

    const headerIdx = rows.findIndex((r, k) => k > i && String(r[0]).trim() === "과목");
    const header = rows[headerIdx].map((c) => String(c).trim());
    const col = {
      choice: header.indexOf("선택형점수"),
      written: header.indexOf("서답형점수"),
      total: header.indexOf("과목점수"),
    };
    const analysis = {};

    // 결시/전출 등 "조회된 데이터가 없습니다" 페이지는 선택형점수 머리글이 없다
    if (col.choice >= 0) {
      for (let r = headerIdx + 2; r + 3 < rows.length && rows[r][1] === "배점"; r += 4) {
        const [pointsRow, keyRow, answerRow, markRow] = rows.slice(r, r + 4);
        const subject = subjectLabel(pointsRow[0]);
        const wrong = [];
        let correctPoints = 0;
        for (let c = 2; c < col.choice; c++) {
          if (pointsRow[c] === "") continue;
          const q = c - 1;
          const mark = String(markRow[c]).trim();
          const isWrong = mark ? mark === "X" : String(answerRow[c]).trim() !== String(keyRow[c]).trim();
          if (isWrong) wrong.push(q);
          else correctPoints += Number(pointsRow[c]);
        }
        // 정답 처리한 문항의 배점 합이 선택형 점수와 같아야 오답 판정이 맞는 것
        if (Math.abs(correctPoints - (Number(answerRow[col.choice]) || 0)) > 0.05) {
          warnings.push(`${studentId} ${name} ${subject}: 정답 문항 배점 합 ${correctPoints.toFixed(1)} ≠ 선택형점수 ${answerRow[col.choice]}`);
        }
        analysis[subject] = {
          선택형: Number(answerRow[col.choice]) || 0,
          서답형: Number(answerRow[col.written]) || 0,
          과목점수: Number(answerRow[col.total]) || 0,
          문항수: pointsRow.slice(2, col.choice).filter((v) => v !== "").length,
          오답: wrong,
        };
      }
    }
    result.set(studentId, { name, analysis });
  }
  return result;
}

/**
 * 학년부 "지필고사 성적 정리" 파일 → { students: Map(studentId → { name, subjects, rank, avgGrade, complete }), fullTakers }
 * 과목마다 [원점수, 예상 등급, 백분율] 세 열이 이어지고, 뒤에 평균/전과목 등수/평균등급 열이 온다.
 */
function parseSummary(xlsxPath) {
  const rows = readRows(xlsxPath);
  const headers = rows[0].map((h) => String(h).trim());
  const subjectCols = headers
    .map((h, idx) => ({ h, idx }))
    .filter(({ h, idx }) => idx > 2 && headers[idx + 1] === "예상 등급")
    .map(({ h, idx }) => ({ subject: summaryLabel(h), idx }));
  const rankCol = headers.findIndex((h) => h.startsWith("전과목 등수"));
  const avgGradeCol = headers.findIndex((h) => h.startsWith("평균등급(5등급"));

  const students = new Map();
  for (const row of rows.slice(1)) {
    if (typeof row[0] !== "number") continue;
    const subjects = {};
    for (const { subject, idx } of subjectCols) {
      if (typeof row[idx] !== "number") continue; // 인정결/전출
      subjects[subject] = { score: row[idx], grade: row[idx + 1], pct: Number(row[idx + 2]) };
    }
    students.set(toStudentId(1, row[0], row[1]), {
      name: String(row[2]).trim(),
      subjects,
      rank: row[rankCol],
      avgGrade: row[avgGradeCol],
      complete: Object.keys(subjects).length === subjectCols.length,
    });
  }
  const fullTakers = [...students.values()].filter((s) => s.complete).length;
  return { students, fullTakers };
}

/** 일람표 원점수에 성적 정리 파일의 백분율·예상 등급과 전과목 등수/평균등급을 덧붙인다 */
function withSummary(studentId, name, scores, summary) {
  const s = summary.students.get(studentId);
  if (!s) {
    warnings.push(`${studentId} ${name}: 성적 정리 파일에 없음 — 원점수만 기록`);
    return scores;
  }
  if (s.name !== name) {
    warnings.push(`${studentId}: 성적 정리 파일 이름 "${s.name}" ≠ 일람표 "${name}" — 원점수만 기록`);
    return scores;
  }

  const result = {};
  for (const [key, value] of Object.entries(scores)) {
    const sub = s.subjects[key];
    if (!sub) { result[key] = value; continue; }
    if (Number(value) !== sub.score) {
      warnings.push(`${studentId} ${name} ${key}: 일람표 ${value} ≠ 성적 정리 ${sub.score}`);
    }
    result[key] = `${value}(${sub.pct.toFixed(2)}, 예상 ${sub.grade}등급)`;
  }
  if (s.complete && typeof s.rank === "number") {
    if (s.rank > summary.fullTakers) warnings.push(`${studentId} ${name}: 전과목 등수 ${s.rank} > 전 과목 응시자 ${summary.fullTakers}명`);
    result[`전과목등수(${summary.fullTakers}명)`] = String(s.rank);
    if (typeof s.avgGrade === "number") result["평균등급(예상)"] = s.avgGrade.toFixed(2);
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

  const roster = parseExamRoster(ROSTER_XLSX);
  const sheets = parseAnswerSheets(ANSWER_XLSX);
  const summary = parseSummary(SUMMARY_XLSX);
  console.log(`${EXAM_NAME}: 학급별 일람표 ${roster.length}명 / 정오표 ${sheets.size}명 / 성적 정리 ${summary.students.size}명(전 과목 응시 ${summary.fullTakers}명)`);

  const updates = [];
  const now = new Date().toISOString();
  for (const p of roster) {
    const student = byId.get(p.studentId);
    if (!student) { warnings.push(`DB에 없는 학번: ${p.studentId} ${p.name}`); continue; }
    if (student.name !== p.name) {
      warnings.push(`이름 불일치로 건너뜀: ${p.studentId} 자료="${p.name}" DB="${student.name}"`);
      continue;
    }

    const sheet = sheets.get(p.studentId);
    const analysis = sheet?.analysis ?? {};
    if (!sheet) warnings.push(`${p.studentId} ${p.name}: 정오표 없음 — 점수만 기록`);
    // 정오표의 과목점수가 일람표 점수와 다르면 알려준다 (자료 간 불일치 확인용)
    for (const [subject, a] of Object.entries(analysis)) {
      if (p.scores[subject] !== undefined && Number(p.scores[subject]) !== a.과목점수) {
        warnings.push(`${p.studentId} ${p.name} ${subject}: 일람표 ${p.scores[subject]} ≠ 정오표 ${a.과목점수}`);
      }
    }

    const grades = (student.grades || []).map((g) => ({ ...g }));
    const idx = grades.findIndex((g) => g.examName === EXAM_NAME);
    const scores = withSummary(p.studentId, p.name, p.scores, summary);
    const record = { examName: EXAM_NAME, scores, itemAnalysis: analysis };
    let action;
    if (idx > -1) {
      grades[idx] = { ...grades[idx], ...record, updatedAt: now };
      action = "갱신";
    } else {
      grades.push({ id: Date.now() + Math.random(), ...record, createdAt: now });
      action = "신규 등록";
    }
    updates.push({ studentId: p.studentId, student, grades, record, action });
  }

  const counts = updates.reduce((acc, u) => ({ ...acc, [u.action]: (acc[u.action] || 0) + 1 }), {});
  console.log(`\n변경 대상 학생: ${updates.length}명`, counts);

  const sample = updates.find((u) => u.studentId === (SAMPLE_ARG ?? updates[0]?.studentId));
  if (sample) {
    console.log(`\n--- 상세 미리보기: [${sample.studentId}] ${sample.student.name} ---`);
    console.log(`  scores: ${Object.entries(sample.record.scores).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    for (const [subject, a] of Object.entries(sample.record.itemAnalysis)) {
      console.log(`  ${subject}: 선택형 ${a.선택형} / 서답형 ${a.서답형} = ${a.과목점수}, 오답 ${a.오답.length}/${a.문항수} [${a.오답.join(",")}]`);
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
