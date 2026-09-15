// "2026학년도_커밋  _특기사항_20260915130950.xlsx" (동아리 '커밋' 명단)를 읽어
// clubStudents 컬렉션에 아직 없는 학생을 새로 등록합니다.
// 기본은 미리보기(dry-run)이며, --commit 옵션을 줘야 실제로 Firestore에 씁니다.
// 이미 등록된 학번은 건너뜁니다.
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, doc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import XLSX from "xlsx";

const XLSX_PATH = "C:\\Users\\user\\Documents\\develop\\2026myweb\\data\\2026학년도_커밋  _특기사항_20260915130950.xlsx";
const CLUB_ROLE = "부원";
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

async function main() {
  const loginId = process.env.VITE_LOGIN_ID;
  const loginPw = process.env.VITE_LOGIN_PW;
  if (!loginId || !loginPw) {
    throw new Error("VITE_LOGIN_ID / VITE_LOGIN_PW 환경변수가 없습니다 (.env 확인 필요)");
  }
  await signInWithEmailAndPassword(auth, `${loginId}${LOGIN_EMAIL_DOMAIN}`, loginPw);

  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }).slice(1);

  const studentsSnap = await getDocs(collection(db, "students"));
  const byStudentId = new Map(
    studentsSnap.docs.map((d) => [String(d.data().studentId ?? d.id), d.data()])
  );

  const clubSnap = await getDocs(collection(db, "clubStudents"));
  const alreadyInClub = new Set(clubSnap.docs.map((d) => d.id));

  const toAdd = [];
  const unmatched = [];
  const skippedDup = [];

  for (const row of rows) {
    const [, grade, , cls, number, , , name] = row;
    if (!grade || !cls || !number || !name) continue;

    const studentId = `${grade}${String(cls).padStart(2, "0")}${String(number).padStart(2, "0")}`;

    if (alreadyInClub.has(studentId)) {
      skippedDup.push(`${studentId} ${name}`);
      continue;
    }

    const globalData = byStudentId.get(studentId);
    if (!globalData) {
      unmatched.push(`${studentId} ${name} (전체 학생 DB에 없음 — 이름/학번만으로 등록)`);
    }

    toAdd.push({
      studentId,
      name,
      gender: globalData?.gender || "",
      grade: Number(grade),
      class: Number(cls),
      number: Number(number),
      clubRole: CLUB_ROLE,
      createdAt: new Date().toISOString(),
    });
  }

  console.log(`총 ${rows.length}명 / 신규 추가 대상 ${toAdd.length}명 / 이미 등록됨(건너뜀) ${skippedDup.length}명`);
  if (unmatched.length > 0) {
    console.log(`\n⚠️ 전체 학생 DB에서 못 찾음 (${unmatched.length}명, 그래도 등록은 진행):`);
    console.log(unmatched.join("\n"));
  }

  console.log("\n--- 추가 대상 미리보기 ---");
  for (const item of toAdd) {
    console.log(`[${item.studentId}] ${item.name} (${item.grade}학년 ${item.class}반 ${item.number}번)`);
  }

  if (!COMMIT) {
    console.log(`\n(미리보기 모드입니다. 실제로 저장하려면 --commit 옵션을 붙여 다시 실행하세요.)`);
    return;
  }

  const batch = writeBatch(db);
  for (const item of toAdd) {
    batch.set(doc(db, "clubStudents", item.studentId), item, { merge: true });
  }
  await batch.commit();
  console.log(`\n완료: ${toAdd.length}명을 동아리 부원으로 등록했습니다.`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
