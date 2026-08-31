// 2027학년도 선택과목 1차 수강 신청 결과.xlsx 를 읽어 각 학생의 상담 기록(counselingLogs)에 추가합니다.
// 기본은 미리보기(dry-run)이며, --commit 옵션을 줘야 실제로 Firestore에 씁니다.
// 이미 같은 태그가 포함된 상담 기록이 있는 학생은 중복 방지를 위해 건너뜁니다.
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc } from "firebase/firestore";
import XLSX from "xlsx";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XLSX_PATH = path.resolve(__dirname, "../../2027학년도 선택과목 1차 수강 신청 결과.xlsx");
const TAG = "[2027학년도 선택과목 1차 수강 신청 결과]";
const COMMIT = process.argv.includes("--commit");

const firebaseConfig = {
  apiKey: "AIzaSyCYSwpXQ5MZ-PGqIJ46arywkTSgww8mQ1c",
  authDomain: "myproject-3e80a.firebaseapp.com",
  projectId: "myproject-3e80a",
  storageBucket: "myproject-3e80a.firebasestorage.app",
  messagingSenderId: "784524925931",
  appId: "1:784524925931:web:d7d81c0b15a0344af357ae",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "my2026web");

const COLS = [
  "1학기 사회·과학",
  "1학기 제2외국어·한문",
  "2학기 국어·수학·영어",
  "2학기 사회·과학",
  "2학기 정보·제2외국어·한문",
];

function buildContent(row) {
  const lines = [TAG];
  for (let i = 0; i < COLS.length; i++) {
    const val = (row[8 + i] || "").toString().trim().replace(/\n/g, ", ");
    lines.push(`${COLS[i]}: ${val || "(미응답)"}`);
  }
  return lines.join("\n");
}

function pickDate(row) {
  // 수정시간이 있으면 그것을(최종 선택), 없으면 제출시간을 사용
  const raw = row[5] || row[4] || "";
  const m = String(raw).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : new Date().toISOString().split("T")[0];
}

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets["제출내역_텍스트"];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1 }); // 헤더 제외, 0-indexed 배열

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

  for (const row of rows) {
    const excelStudentId = row[1];
    const name = row[2];
    if (!excelStudentId || typeof row[0] !== "number") continue; // 합계 등 요약행 제외

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
      date: pickDate(row),
      content: buildContent(row),
    });
  }

  console.log(`총 ${rows.length}행 / 신규 추가 대상 ${toAdd.length}명 / 매칭 실패 ${unmatched.length}명 / 이미 등록됨 ${skippedDup.length}명`);
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
