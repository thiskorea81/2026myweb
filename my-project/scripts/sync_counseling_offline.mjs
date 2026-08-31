// 진학상담 폴더에 상담/동아리 데이터를 오프라인 파일로 동기화합니다.
// 매일 08:00에 cron으로 자동 실행됩니다 (crontab -l 로 확인 가능).
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../진학상담/오프라인동기화");
mkdirSync(OUT_DIR, { recursive: true });

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

function nowStamp() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

async function main() {
  const studentsSnap = await getDocs(collection(db, "students"));
  const allStudents = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const homeroom = allStudents
    .filter((s) => Number(s.grade) === 1 && Number(s.class) === 5)
    .sort((a, b) => Number(a.number) - Number(b.number));
  const homeroomIds = new Set(homeroom.map((s) => s.studentId));
  const nameById = new Map(homeroom.map((s) => [s.studentId, `${s.number}번 ${s.name}`]));

  const counselingSnap = await getDocs(collection(db, "counselingLogs"));
  const counselingByStudent = new Map();
  counselingSnap.forEach((d) => {
    const data = d.data();
    if (!homeroomIds.has(data.studentId)) return;
    if (!counselingByStudent.has(data.studentId)) counselingByStudent.set(data.studentId, []);
    counselingByStudent.get(data.studentId).push({ date: data.date, content: data.content || "" });
  });

  const aiNotesSnap = await getDocs(collection(db, "aiNotes"));
  const aiNotesByStudent = new Map();
  aiNotesSnap.forEach((d) => {
    const data = d.data();
    if (!homeroomIds.has(data.studentId)) return;
    if (!aiNotesByStudent.has(data.studentId)) aiNotesByStudent.set(data.studentId, []);
    aiNotesByStudent.get(data.studentId).push(data);
  });

  // ---- 학급 상담기록 ----
  const lines = [];
  lines.push(`1학년 5반 상담기록 오프라인 동기화본`);
  lines.push(`마지막 동기화: ${nowStamp()}`);
  lines.push(`(counselingLogs + aiNotes, Firestore 원본 기준)`);
  lines.push("=".repeat(60));

  for (const s of homeroom) {
    lines.push("");
    lines.push(`■ ${s.number}번 ${s.name} (${s.studentId})`);
    const logs = (counselingByStudent.get(s.studentId) || []).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (logs.length === 0) {
      lines.push("  [상담기록 없음]");
    } else {
      for (const l of logs) {
        const content = (l.content || "").replace(/\n/g, " / ");
        lines.push(`  [${l.date}] ${content}`);
      }
    }
    const notes = aiNotesByStudent.get(s.studentId) || [];
    for (const n of notes) {
      const dateStr = n.createdAt ? String(n.createdAt).slice(0, 10) : "";
      const content = (n.content || "").replace(/\n/g, " ");
      lines.push(`  [AI메모 ${dateStr}] ${content.slice(0, 300)}${content.length > 300 ? "…" : ""}`);
    }
  }
  writeFileSync(path.join(OUT_DIR, "학급상담기록_1학년5반.txt"), lines.join("\n"), "utf-8");

  // ---- 동아리 기록 (학교 전체) ----
  const clubSnap = await getDocs(collection(db, "clubStudents"));
  const clubLines = [];
  clubLines.push(`동아리 기록 오프라인 동기화본 (전체 학년)`);
  clubLines.push(`마지막 동기화: ${nowStamp()}`);
  clubLines.push("=".repeat(60));
  clubSnap.forEach((d) => {
    const c = d.data();
    clubLines.push("");
    clubLines.push(`■ ${c.grade}학년 ${c.class}반 ${c.number}번 ${c.name} (${c.studentId})`);
    if (c.clubRole) clubLines.push(`  역할: ${c.clubRole}`);
    if (c.career) clubLines.push(`  진로: ${c.career}`);
    if (c.motivation) clubLines.push(`  지원동기: ${c.motivation}`);
    if (c.specialty) clubLines.push(`  특기/실적: ${c.specialty}`);
    if (Array.isArray(c.clubActivities) && c.clubActivities.length > 0) {
      clubLines.push(`  활동내역: ${JSON.stringify(c.clubActivities)}`);
    }
  });
  writeFileSync(path.join(OUT_DIR, "동아리기록_전체.txt"), clubLines.join("\n"), "utf-8");

  console.log(`[${nowStamp()}] 동기화 완료: 학생 ${homeroom.length}명, 동아리 기록 ${clubSnap.size}건 -> ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(`[${nowStamp()}] 동기화 실패:`, err);
  process.exit(1);
});
