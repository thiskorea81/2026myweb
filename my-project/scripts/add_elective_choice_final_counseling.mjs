// "수강신청통계_202609091528_1-5.xlsx" (선택과목 최종 수강 신청 결과, 1학년 5반)를 읽어
// 각 학생의 상담 기록(counselingLogs)에 추가합니다.
// 기본은 미리보기(dry-run)이며, --commit 옵션을 줘야 실제로 Firestore에 씁니다.
// 이미 같은 태그가 포함된 상담 기록이 있는 학생은 중복 방지를 위해 건너뜁니다.
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import XLSX from "xlsx";

const XLSX_PATH = "C:\\Users\\user\\Desktop\\2026년이태훈\\2026다운로드\\수강신청통계_202609091528_1-5.xlsx";
const TAG = "[2027학년도 선택과목 최종 수강 신청 결과]";
const REPORT_DATE = "2026-09-09"; // 파일명(202609091528)의 생성 시각 기준
const COMMIT = process.argv.includes("--commit");

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

// 병합 셀(그룹 헤더)을 고려해 각 컬럼의 [택 그룹, 과목명]을 읽어온다.
function readColumnMap(sheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const merges = sheet["!merges"] || [];
  function cellValue(r, c) {
    for (const m of merges) {
      if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
        const addr = XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c });
        return sheet[addr] ? sheet[addr].v : undefined;
      }
    }
    const addr = XLSX.utils.encode_cell({ r, c });
    return sheet[addr] ? sheet[addr].v : undefined;
  }
  const cols = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    cols.push({ col: c, group: cellValue(0, c), subject: cellValue(1, c) });
  }
  return { cols, range };
}

function buildContent(subjectCols, row) {
  const byGroup = new Map();
  for (const { col, group, subject } of subjectCols) {
    if (row[col] === 1) {
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push(subject);
    }
  }
  const lines = [TAG];
  for (const [group, subjects] of byGroup) {
    lines.push(`${group}: ${subjects.join(", ")}`);
  }
  return lines.join("\n");
}

async function main() {
  const loginId = process.env.VITE_LOGIN_ID;
  const loginPw = process.env.VITE_LOGIN_PW;
  if (!loginId || !loginPw) {
    throw new Error("VITE_LOGIN_ID / VITE_LOGIN_PW 환경변수가 없습니다 (.env 확인 필요)");
  }
  await signInWithEmailAndPassword(auth, `${loginId}${LOGIN_EMAIL_DOMAIN}`, loginPw);

  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const { cols, range } = readColumnMap(sheet);

  // 순번(A)=0, 학번(B)=1, 이름(C)=2, 성별(D)=3, 과정(E)=4, 메모(F)=5, 과목수(G)=6
  const idCol = 1;
  const nameCol = 2;
  const subjectCols = cols.filter((c) => c.col >= 7);

  const rowsAsArrays = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 3, blankrows: false });

  const studentsSnap = await getDocs(collection(db, "students"));
  const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const byStudentId = new Map(students.map((s) => [String(s.studentId), s]));

  const existingLogsSnap = await getDocs(collection(db, "counselingLogs"));
  const alreadyTagged = new Set();
  existingLogsSnap.forEach((d) => {
    const data = d.data();
    if ((data.content || "").includes(TAG)) alreadyTagged.add(String(data.studentId));
  });

  const toAdd = [];
  const unmatched = [];
  const skippedDup = [];

  for (const arr of rowsAsArrays) {
    const excelStudentId = arr[idCol];
    const name = arr[nameCol];
    if (!excelStudentId || typeof arr[0] !== "number") continue; // 합계 등 요약행 제외

    const student = byStudentId.get(String(excelStudentId));
    if (!student) {
      unmatched.push(`${excelStudentId} ${name}`);
      continue;
    }
    if (alreadyTagged.has(String(student.studentId))) {
      skippedDup.push(`${excelStudentId} ${name}`);
      continue;
    }

    toAdd.push({
      studentId: student.studentId,
      name: student.name,
      date: REPORT_DATE,
      content: buildContent(subjectCols, arr),
    });
  }

  console.log(`총 ${rowsAsArrays.length}행 / 신규 추가 대상 ${toAdd.length}명 / 매칭 실패 ${unmatched.length}명 / 이미 등록됨 ${skippedDup.length}명`);
  if (unmatched.length > 0) console.log("매칭 실패:", unmatched.join(", "));
  if (skippedDup.length > 0) console.log("이미 등록됨(건너뜀):", skippedDup.join(", "));

  console.log("\n--- 미리보기 (최대 3명) ---");
  for (const item of toAdd.slice(0, 3)) {
    console.log(`\n■ ${item.name} (${item.studentId}) / 날짜: ${item.date}`);
    console.log(item.content);
  }

  if (!COMMIT) {
    console.log(`\n(미리보기 모드입니다. 실제로 저장하려면 --commit 옵션을 붙여 다시 실행하세요.)`);
    return;
  }

  for (const item of toAdd) {
    await addDoc(collection(db, "counselingLogs"), {
      studentId: item.studentId,
      date: item.date,
      content: item.content,
      createdAt: new Date(),
    });
  }
  console.log(`\n완료: ${toAdd.length}명의 상담 기록에 추가했습니다.`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
