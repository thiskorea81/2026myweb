// 성적 기록(students.grades)을 원본 자료 기준으로 재정리한다.
//
//  [전교] 시험명 "6월모고(점수)" → "6월모의고사" 로 변경 (점수는 그대로 유지)
//  [1학년 5반, 원본 자료가 있는 범위]
//   · 모의고사 3월/6월/9월 → 과목 순서 국어·수학·영어·한국사·사회탐구·과학탐구,
//     점수 표기 "원점수(전국백분위, 등급)" (영어·한국사는 절대평가라 "원점수(등급)", 미응시 과목은 제외)
//   · "1학기중간고사" → "원점수(석차백분율)" + 전과목등수
//     (일람표에는 백분율이 없어, 기존 "1학기중간고사(등급)" 기록의 백분율/등수를 합쳐 한 기록으로 만든다)
//   · "1학기기말고사" → 원점수만 (기말 석차·백분율 자료가 아직 없음)
//   · "1학기학기말" (중간+기말+수행 반영) → "원점수(백분위, 등급)"
//   · "1학기수행평가" → 과목별 "받은점수합/만점합"
//   · 위 기록으로 내용이 통합된 옛 기록은 삭제
//
// 모의고사 PDF는 아래처럼 미리 텍스트로 변환해 두어야 한다 (한글이 깨지므로 -layout 옵션은 쓰지 않는다):
//   pdftotext -enc UTF-8 "<성적통지표 PDF>" "data/성적/모의고사/<N>월.txt"
//
// 기본은 미리보기(dry-run)이며, --commit 옵션을 줘야 실제로 Firestore에 씁니다.
// --sample=<학번> 으로 상세 미리보기를 볼 학생을 지정할 수 있습니다.
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, doc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import XLSX from "xlsx";
import fs from "fs";

const DATA_DIR = "C:\\Users\\user\\Documents\\develop\\2026myweb\\data\\성적";
const MOCK_EXAMS = [
  { examName: "3월모의고사", txt: `${DATA_DIR}\\모의고사\\3월.txt` },
  { examName: "6월모의고사", txt: `${DATA_DIR}\\모의고사\\6월.txt` },
  { examName: "9월모의고사", txt: `${DATA_DIR}\\모의고사\\9월.txt` },
];
const MIDTERM_XLSX = `${DATA_DIR}\\학교\\2026_1학기_중간고사(1-5).xlsx`;
const FINAL_XLSX = `${DATA_DIR}\\학교\\2026_1학기_기말고사(1-5).xlsx`;
const REPORT_XLSX = `${DATA_DIR}\\학교\\2026_1학기_성적통지표(1-5).xlsx`;

const MIDTERM_EXAM = "1학기중간고사";
const FINAL_EXAM = "1학기기말고사";
const SEMESTER_EXAM = "1학기학기말";
const PERFORMANCE_EXAM = "1학기수행평가";

// 전교 대상: 시험명 표기만 통일한다 (다른 반은 원본 자료가 없으므로 점수는 손대지 않음)
const RENAME_EXAMS = { "6월모고(점수)": "6월모의고사" };

// 중간고사 석차백분율/전과목등수가 들어있던 옛 기록 (1학기중간고사로 합친 뒤 삭제)
const MIDTERM_LEGACY_EXAM = "1학기중간고사(등급)";

// 새 기록으로 내용이 통합된 옛 기록 → 그 새 기록이 실제로 기록될 때만 삭제한다
const OBSOLETE_REPLACED_BY = {
  [MIDTERM_LEGACY_EXAM]: MIDTERM_EXAM, // 백분율/전과목등수를 1학기중간고사에 합침
  "2026학년도 1학기 말 원점수": SEMESTER_EXAM,
  "2026학년도 1학기 학기말성적": SEMESTER_EXAM,
};

// 성적 기록을 시기순으로 정렬할 때 쓰는 순서 (여기 없는 시험명은 뒤에 원래 순서대로 붙는다)
const EXAM_TIME_ORDER = [
  "입학석차", "신입생진단평가",
  "3월모의고사", MIDTERM_EXAM, "6월모의고사", FINAL_EXAM,
  PERFORMANCE_EXAM, SEMESTER_EXAM, "9월모의고사",
];

const MOCK_SUBJECTS = ["국어", "수학", "영어", "한국사", "사회탐구", "과학탐구"];
// 국어·수학·사회탐구·과학탐구는 상대평가(전국백분위+등급), 영어·한국사는 절대평가(등급만)
const MOCK_TYPES = ["rel", "rel", "abs", "abs", "rel", "rel"];
// 모의고사를 새로 쓸 때 지워야 할 기존 과목 키(약어/구버전 표기 포함)
const MOCK_SUBJECT_ALIASES = new Set([...MOCK_SUBJECTS, "국", "수", "영", "한", "사탐", "과탐"]);

// 학교 시험 자료의 과목 표기 → 화면 표시용 과목명(gradeUtils의 라벨과 동일)
const SCHOOL_SUBJECT_LABELS = {
  공통국어1: "국어", 공통수학1: "수학", 공통영어1: "영어", 한국사1: "한국사",
  통합사회1: "사회", 통합과학1: "과학", 정보: "정보", 인공지능기초: "인공지능기초",
  체육1: "체육", 음악1: "음악", 미술1: "미술", "진로와 직업": "진로",
  과학탐구실험1: "과학탐구실험",
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
const subjectLabel = (raw) => SCHOOL_SUBJECT_LABELS[stripParen(raw)] ?? stripParen(raw);
const warnings = [];

/** 모의고사 성적통지표 텍스트 → [{ studentId, name, scores }] */
function parseMockExam(txtPath) {
  const text = fs.readFileSync(txtPath, "utf-8");
  // 학년/반/번호 머리글 뒤에 숫자 3개가 오고, 그 다음 줄에 성명이 온다
  const headerRe = /학년\s*\n+\s*반\s*\n+\s*번호\s*\n+\s*(\d+)\s*\n+\s*(\d+)\s*\n+\s*(\d+)\s*\n+\s*성명\s+(\S+)/g;
  const headers = [...text.matchAll(headerRe)];
  const results = [];

  for (let i = 0; i < headers.length; i++) {
    const [, grade, cls, number, name] = headers[i];
    const segment = text.slice(headers[i].index, i + 1 < headers.length ? headers[i + 1].index : text.length);
    const studentId = `${grade}${String(cls).padStart(2, "0")}${String(number).padStart(2, "0")}`;

    // 원점수: "원점수 / 배점 / 득점" 머리글 뒤에 (배점, 득점) 쌍이 과목 순서대로 나온다.
    // 미응시 과목은 득점이 "-" 로 찍히므로 "-" 도 하나의 값으로 읽어야 짝이 맞는다.
    const rawBlock = segment.match(/원점수\s*\n+\s*배점\s*\n+\s*득점\s*\n+([\s\S]*?)표준점수\s*\n+\s*범위\s*\n+\s*득점/);
    const rawScores = [];
    if (rawBlock) {
      const tokens = [...rawBlock[1].matchAll(/-|\d+\.?\d*/g)].map((m) => m[0]);
      for (let j = 1; j < tokens.length; j += 2) rawScores.push(tokens[j]);
    }

    if (rawScores.length !== MOCK_SUBJECTS.length) {
      warnings.push(`${studentId} ${name}: 원점수 ${rawScores.length}개만 인식 — 건너뜀 (${txtPath})`);
      continue;
    }

    const taken = rawScores.map((v) => v !== "-");
    if (!taken.some(Boolean)) {
      warnings.push(`${studentId} ${name}: 전 과목 미응시 — 건너뜀 (${txtPath})`);
      continue;
    }

    // 상대평가 과목: "학급석차 학교석차 전국백분위" 줄 다음에 등급이 단독으로 온다 (응시한 과목만 출력됨)
    const rel = [...segment.matchAll(/\d+\/\d+\s+\d+\/\d+\s+([\d.]+)\s*\n+\s*(\d+)\s*\n/g)]
      .map((m) => ({ percentile: m[1], grade: m[2] }));
    // 절대평가 과목(영어/한국사): "원점수에 의한 등급 ( N )" — 미응시는 ( - )
    const abs = [...segment.matchAll(/원점수에\s*의한\s*등급\s*\(\s*([\d-]+)\s*\)/g)]
      .map((m) => (m[1] === "-" ? null : { grade: m[1] }));

    let relIdx = 0, absIdx = 0;
    const metrics = MOCK_TYPES.map((type, idx) => {
      if (type === "abs") return abs[absIdx++] ?? null;
      return taken[idx] ? (rel[relIdx++] ?? null) : null;
    });

    const scores = {};
    let missing = [];
    MOCK_SUBJECTS.forEach((subject, idx) => {
      if (!taken[idx]) return; // 미응시 과목은 기록하지 않음
      const m = metrics[idx];
      if (!m) return missing.push(subject);
      scores[subject] = m.percentile
        ? `${rawScores[idx]}(${m.percentile}, ${m.grade}등급)`
        : `${rawScores[idx]}(${m.grade}등급)`;
    });

    if (missing.length) warnings.push(`${studentId} ${name}: 등급 정보를 못 읽은 과목 ${missing.join("/")} — 해당 과목 제외 (${txtPath})`);
    results.push({ studentId, name, scores });
  }
  return results;
}

/** 정기시험 학급별 일람표 엑셀(중간/기말) → [{ studentId, name, scores }] (원점수만) */
function parseExamRoster(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });

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
    if (!number || !name) continue;

    const scores = {};
    headers.forEach((header, idx) => {
      if (idx <= 2 || header === "") return;
      const value = row[idx];
      if (value === "" || value === null || value === undefined) return;
      // "국어:공통국어1(4)" → 공통국어1 → 국어 / "합 계" → 합계
      const label = header.includes(":") ? subjectLabel(header.split(":")[1]) : header.replace(/\s+/g, "");
      scores[label] = String(value);
    });

    results.push({
      studentId: `${grade}${String(cls).padStart(2, "0")}${String(number).padStart(2, "0")}`,
      name,
      scores,
    });
  }
  return results;
}

/** 성적 통지표 엑셀 → [{ studentId, name, semesterScores, performanceScores }] */
function parseReportCard(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });

  const students = [];
  let current = null;
  let layout = null; // A: 보통교과(원점수/석차등급), B: 체육·예술(합계/성취도), C: 교양교과(이수여부)
  let collecting = false;
  let lastSubject = null;
  const flush = () => { if (current) students.push(current); };

  for (const row of rows) {
    const cells = row.map((c) => String(c).trim());
    const col0 = cells[0] ?? "";

    // "2026학년도 1학기 일반계 1학년 학기말 5반 1번" → 학생이 바뀌는 지점
    // ("2026학년도"의 연도를 학년으로 잡지 않도록 "학년도"는 제외하고 찾는다)
    const idCell = cells.find((c) => /\d+학년(?!도)/.test(c) && /\d+반\s+\d+번/.test(c));
    if (idCell) {
      const m = idCell.match(/(\d+)학년(?!도)[\s\S]*?(\d+)반\s+(\d+)번/);
      const studentId = `${m[1]}${String(m[2]).padStart(2, "0")}${String(m[3]).padStart(2, "0")}`;
      if (!current || current.studentId !== studentId) {
        flush();
        current = { studentId, name: "", semesterScores: {}, performanceScores: {}, performanceRaw: {} };
        layout = null;
        lastSubject = null;
      }
      collecting = true;
      continue;
    }

    if (col0.startsWith("성명 :") && current) {
      current.name = col0.replace("성명 :", "").trim();
      continue;
    }

    // 과목별 성취율 급간/출석 정보 구간부터는 과목 데이터가 아니다
    if (cells.some((c) => c.includes("성취율 급간 정보") || c.includes("출석상황"))) {
      collecting = false;
      continue;
    }

    if (col0 === "과목명") {
      if (cells.includes("원점수")) layout = "A";
      else if (cells.includes("이수여부")) layout = "C";
      else if (cells.includes("성취도")) layout = "B";
      continue;
    }

    if (!current || !collecting) continue;

    // 과목 행은 "공통국어1(4)"처럼 끝에 단위수가 붙어 있다.
    // (체육처럼 과목명과 첫 수행평가 항목이 한 행에 같이 오는 경우가 있어, 과목을 먼저 확정한다)
    if (/\(\d+\)$/.test(col0)) {
      const label = subjectLabel(col0);
      lastSubject = label;

      if (!current.semesterScores[label]) { // 페이지가 넘어가며 반복된 행은 건너뜀
        if (layout === "A" && cells[6]) {
          const [score, grade, rank, takers] = [cells[6], cells[9], cells[10], cells[11]];
          // 석차는 동석차수가 괄호로 붙어 올 수 있다 ("6(5)" = 6등, 동석차 5명)
          const rankNum = Number(String(rank).replace(/\(.*\)$/, "").trim());
          const percentile = rankNum && Number(takers)
            ? ((rankNum / Number(takers)) * 100).toFixed(2)
            : null;
          current.semesterScores[label] =
            percentile && grade ? `${score}(${percentile}, ${grade}등급)`
            : grade ? `${score}(${grade}등급)`
            : `${score}`;
        } else if (layout === "B" && cells[5]) {
          current.semesterScores[label] = cells[6] ? `${cells[5]}(${cells[6]})` : `${cells[5]}`;
        } else if (layout === "C" && cells[2]) {
          current.semesterScores[label] = cells[2];
        }
      }
    }

    // 수행평가 행: 그 시점의 과목에 속한다 (만점/받은점수를 누적)
    if (cells[1] === "수행평가" && lastSubject) {
      const max = Number(cells[3]);
      const got = Number(cells[4]);
      const name = cells[2];
      const acc = (current.performanceRaw[lastSubject] ??= { got: 0, max: 0, seen: new Set() });
      // 페이지가 넘어가며 같은 평가 항목이 반복되면 중복 집계되지 않게 항목명으로 걸러낸다
      if (Number.isFinite(max) && Number.isFinite(got) && !acc.seen.has(name)) {
        acc.seen.add(name);
        acc.got += got;
        acc.max += max;
      }
    }
  }
  flush();

  for (const s of students) {
    for (const [label, { got, max }] of Object.entries(s.performanceRaw)) {
      s.performanceScores[label] = `${Number(got.toFixed(2))}/${Number(max.toFixed(2))}`;
    }
    delete s.performanceRaw;
  }
  return students;
}

/**
 * 중간고사 원점수에 기존 "1학기중간고사(등급)" 기록의 석차백분율/전과목등수를 합쳐
 * "원점수(백분율)" 형태로 만든다. (중간고사 일람표에는 석차·백분율 정보가 없어서,
 *  이미 DB에 들어와 있던 백분율 기록을 끌어와 한 기록으로 합치는 것)
 */
function mergeMidtermPercentiles(rawScores, legacyScores, currentScores) {
  const percentiles = {};
  const summary = {};

  // 옛 기록 형태: { "국어(백분율)": "80.70175439", "전과목등수(285명)": "267" }
  for (const [key, value] of Object.entries(legacyScores || {})) {
    if (/\(백분[율위]\)\s*$/.test(key)) percentiles[stripParen(key)] = value;
    else summary[key] = value;
  }

  // 이미 한 번 합쳐 둔 기록 형태: { "국어": "36.3(80.70)", "전과목등수(285명)": "267" }
  // (옛 기록은 합친 뒤 삭제되므로, 스크립트를 다시 돌려도 백분율이 사라지지 않게 여기서 되읽는다)
  for (const [key, value] of Object.entries(currentScores || {})) {
    const matched = String(value).match(/^[\d.]+\((\d+\.?\d*)\)$/);
    if (matched) percentiles[key] ??= matched[1];
    else if (/등수|석차/.test(key)) summary[key] ??= value;
  }

  const scores = {};
  for (const [subject, raw] of Object.entries(rawScores)) {
    const pct = percentiles[subject];
    scores[subject] = pct !== undefined && Number.isFinite(Number(pct))
      ? `${raw}(${Number(pct).toFixed(2)})`
      : String(raw);
  }
  return { ...scores, ...summary };
}

/** 모의고사는 과목 키만 새로 쓰고, 총점/등수 같은 요약 항목은 기존 값을 유지한다 */
function mergeMockScores(existingScores, newScores) {
  const preserved = {};
  for (const [key, value] of Object.entries(existingScores || {})) {
    if (!MOCK_SUBJECT_ALIASES.has(stripParen(key))) preserved[key] = value;
  }
  return { ...newScores, ...preserved };
}

/** 학생 한 명의 grades 배열을 새로 만든다 (변경 내역 로그와 함께) */
function buildGrades(student, newScoresByExam) {
  const grades = (student.grades || []).map((g) => ({ ...g }));
  const log = [];
  const now = new Date().toISOString();

  // 1) 시험명 표기 통일 (전교)
  for (const [oldName, newName] of Object.entries(RENAME_EXAMS)) {
    const idx = grades.findIndex((g) => g.examName === oldName);
    if (idx < 0) continue;
    if (newScoresByExam.has(newName) || grades.some((g) => g.examName === newName)) {
      grades.splice(idx, 1);
      log.push(`"${oldName}" 삭제(새 "${newName}" 기록으로 대체)`);
    } else {
      grades[idx] = { ...grades[idx], examName: newName, updatedAt: now };
      log.push(`"${oldName}" → "${newName}" 이름 변경(점수 유지)`);
    }
  }

  // 2) 새 기록으로 통합된 옛 기록 삭제
  for (const [obsolete, replacedBy] of Object.entries(OBSOLETE_REPLACED_BY)) {
    if (!newScoresByExam.has(replacedBy)) continue;
    const idx = grades.findIndex((g) => g.examName === obsolete);
    if (idx < 0) continue;
    grades.splice(idx, 1);
    log.push(`"${obsolete}" 삭제("${replacedBy}"로 통합)`);
  }

  // 3) 새 점수 반영
  for (const [examName, scores] of newScoresByExam) {
    const idx = grades.findIndex((g) => g.examName === examName);
    if (idx > -1) {
      grades[idx] = { ...grades[idx], scores, updatedAt: now };
      log.push(`"${examName}" 점수 갱신`);
    } else {
      grades.push({ id: Date.now() + Math.random(), examName, scores, createdAt: now });
      log.push(`"${examName}" 신규 등록`);
    }
  }

  // 시험 기록을 시기순으로 정렬한다 (화면에서는 이 배열을 뒤집어 최신순으로 보여줌).
  // 목록에 없는 시험명(2학기 시험 등)은 원래 순서를 유지한 채 뒤에 붙는다.
  const sorted = [...grades].sort((a, b) => {
    const rank = (name) => {
      const idx = EXAM_TIME_ORDER.indexOf(name);
      return idx < 0 ? EXAM_TIME_ORDER.length + grades.findIndex((g) => g.examName === name) : idx;
    };
    return rank(a.examName) - rank(b.examName);
  });

  return { grades: sorted, log };
}

async function main() {
  const loginId = process.env.VITE_LOGIN_ID;
  const loginPw = process.env.VITE_LOGIN_PW;
  if (!loginId || !loginPw) throw new Error("VITE_LOGIN_ID / VITE_LOGIN_PW 환경변수가 없습니다");
  await signInWithEmailAndPassword(auth, `${loginId}${LOGIN_EMAIL_DOMAIN}`, loginPw);

  const snap = await getDocs(collection(db, "students"));
  const byId = new Map(snap.docs.map((d) => [String(d.data().studentId ?? d.id), { docId: d.id, ...d.data() }]));

  // 자료에서 읽어온 새 점수: studentId → Map(examName → scores)
  const newScores = new Map();
  const addScores = (studentId, name, examName, scores) => {
    const student = byId.get(studentId);
    if (!student) return warnings.push(`DB에 없는 학번: ${studentId} ${name ?? ""} (${examName})`);
    if (name && student.name !== name) {
      return warnings.push(`이름 불일치로 건너뜀: ${studentId} 자료="${name}" DB="${student.name}" (${examName})`);
    }
    // 전입생처럼 해당 학기 성적이 아예 없는 경우("조회된 데이터가 없습니다") 빈 기록을 만들지 않는다
    if (Object.keys(scores).length === 0) return;
    if (!newScores.has(studentId)) newScores.set(studentId, new Map());
    newScores.get(studentId).set(examName, scores);
  };

  for (const { examName, txt } of MOCK_EXAMS) {
    const parsed = parseMockExam(txt);
    console.log(`${examName}: ${parsed.length}명 파싱`);
    for (const p of parsed) {
      const existing = (byId.get(p.studentId)?.grades || []).find((g) => g.examName === examName);
      addScores(p.studentId, p.name, examName, mergeMockScores(existing?.scores, p.scores));
    }
  }

  const midterms = parseExamRoster(MIDTERM_XLSX);
  console.log(`${MIDTERM_EXAM}: ${midterms.length}명 파싱`);
  for (const p of midterms) {
    const grades = byId.get(p.studentId)?.grades || [];
    const legacy = grades.find((g) => g.examName === MIDTERM_LEGACY_EXAM);
    const current = grades.find((g) => g.examName === MIDTERM_EXAM);
    const merged = mergeMidtermPercentiles(p.scores, legacy?.scores, current?.scores);
    if (!Object.values(merged).some((v) => /\(/.test(String(v)))) {
      warnings.push(`${p.studentId} ${p.name}: 중간고사 백분율 자료가 없어 원점수만 기록`);
    }
    addScores(p.studentId, p.name, MIDTERM_EXAM, merged);
  }

  // 기말고사 일람표에는 석차·백분율이 없어 원점수만 기록된다 (자료가 생기면 중간고사처럼 합칠 수 있음)
  const finals = parseExamRoster(FINAL_XLSX);
  console.log(`${FINAL_EXAM}: ${finals.length}명 파싱 (석차·백분율 자료 없음 → 원점수만)`);
  for (const p of finals) {
    addScores(p.studentId, p.name, FINAL_EXAM, p.scores);
  }

  const reportCards = parseReportCard(REPORT_XLSX);
  console.log(`${SEMESTER_EXAM}/${PERFORMANCE_EXAM}: ${reportCards.length}명 파싱`);
  for (const r of reportCards) {
    addScores(r.studentId, r.name, SEMESTER_EXAM, r.semesterScores);
    if (Object.keys(r.performanceScores).length > 0) {
      addScores(r.studentId, r.name, PERFORMANCE_EXAM, r.performanceScores);
    }
  }

  // 학생별 최종 grades 계산
  const updates = [];
  const opCounts = new Map();
  for (const [studentId, student] of byId) {
    const mine = newScores.get(studentId) ?? new Map();
    const hasRename = Object.keys(RENAME_EXAMS).some((old) => (student.grades || []).some((g) => g.examName === old));
    if (mine.size === 0 && !hasRename) continue;

    const { grades, log } = buildGrades(student, mine);
    updates.push({ studentId, student, grades, log });
    for (const entry of log) {
      const key = entry.replace(/^"[^"]*"/, (m) => m); // 로그 문구 그대로 집계
      opCounts.set(key, (opCounts.get(key) || 0) + 1);
    }
  }

  console.log("\n--- 변경 내역 집계 ---");
  for (const [entry, count] of [...opCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`${count}명: ${entry}`);
  }

  const sampleId = SAMPLE_ARG ?? updates.find((u) => u.studentId.startsWith("105"))?.studentId;
  const sample = updates.find((u) => u.studentId === sampleId);
  if (sample) {
    console.log(`\n--- 상세 미리보기: [${sample.studentId}] ${sample.student.name} ---`);
    for (const g of sample.grades) {
      console.log(`  · ${g.examName}: ${Object.entries(g.scores).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    }
  }

  console.log(`\n변경 대상 학생: ${updates.length}명`);
  if (warnings.length) console.log(`\n⚠️ 경고 ${warnings.length}건:\n` + warnings.join("\n"));

  if (!COMMIT) {
    console.log("\n(미리보기 모드입니다. 실제로 저장하려면 --commit 옵션을 붙여 다시 실행하세요.)");
    return;
  }

  // Firestore 배치는 1회 500건 제한이 있어 400건씩 나눠 커밋한다
  const CHUNK = 400;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const u of updates.slice(i, i + CHUNK)) {
      batch.update(doc(db, "students", u.student.docId), { grades: u.grades });
    }
    await batch.commit();
    console.log(`저장 ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
  }
  console.log(`\n완료: ${updates.length}명의 성적 기록을 재정리했습니다.`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
