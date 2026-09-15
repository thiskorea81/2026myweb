// 교외체험학습 웹 창구(/cheheom)로 들어온 신청서/결과보고서 제출 건을 처리합니다.
// - cheheomApplications / cheheomReports 중 status === '접수' 인 문서를 찾아
// - 학생 폴더(교외체험학습/{학번} {이름})를 만들고
// - 교외체험학습 신청서(학번이름).pdf / 결과보고서(학번이름).pdf 를 생성한 뒤
// - 문서 status를 '처리됨'으로 표시합니다.
// 공문(hwpx)은 이 스크립트가 만들지 않습니다 — Claude가 그때그때 내용을 확인하며 만듭니다
// (긴 문단을 넣을 때 생기는 손상 문제 때문에 자동화하지 않음, hwpx_작성_노하우.md §10-9 참고).
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import path from "path";
import os from "os";
import { readFileSync } from "fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf-8");
const env = Object.fromEntries(
  envText.split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app, "my2026web");

const BASE_DIR = "C:\\Users\\user\\Desktop\\2026년이태훈\\담임\\교외체험학습";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function studentId(grade, klass, number) {
  return `${grade}${String(klass).padStart(2, "0")}${String(number).padStart(2, "0")}`;
}
function studentFolder(sid, name) {
  const dir = path.join(BASE_DIR, `${sid} ${name}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
// tmp html은 ASCII 경로(os 임시폴더)에 써야 한다 -- 한글+괄호가 섞인 경로에서
// Node의 rmSync가 이유 없이 전체 프로세스를 죽이는 현상이 있었음(재현 확인됨).
// 최종 PDF 자체는 msedge가 직접 쓰므로 한글 경로라도 문제 없다.
function htmlToPdf(html, outPath) {
  const tmpHtml = path.join(os.tmpdir(), `cheheom_${Date.now()}_${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(tmpHtml, html, "utf-8");
  const res = spawnSync(EDGE, [
    "--headless", "--disable-gpu", "--no-sandbox",
    `--print-to-pdf=${outPath}`,
    "--print-to-pdf-no-header",
    tmpHtml,
  ], { stdio: "ignore", windowsHide: true });
  rmSync(tmpHtml);
  if (res.status !== 0) throw new Error(`msedge exited with status ${res.status}: ${res.error || ""}`);
}

function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

function applicationHtml(d) {
  const p = d.period || {};
  const period = p.mode === "half"
    ? `${esc(p.date)} (${esc(p.ampm)}, 반일 · 0.5일)`
    : `${esc(p.start)} ~ ${esc(p.end)} (총 ${esc(d.days)}일간)`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:"Malgun Gothic",sans-serif; font-size:13px; padding:20px;}
    h1{font-size:18px; text-align:center; margin-bottom:20px;}
    table{width:100%; border-collapse:collapse;}
    td{border:1px solid #999; padding:8px 10px; vertical-align:top;}
    .label{background:#f2f2f2; font-weight:bold; width:120px;}
    .sig{max-width:220px; max-height:60px;}
  </style></head><body>
    <h1>「학교장허가 교외체험학습」 신청서</h1>
    <table>
      <tr><td class="label">성명 / 학번</td><td>${esc(d.name)} · ${esc(d.grade)}학년 ${esc(d.class)}반 ${esc(d.number)}번</td></tr>
      <tr><td class="label">신청 기간</td><td>${period}</td></tr>
      <tr><td class="label">학습형태</td><td>${esc(d.studyType)}</td></tr>
      <tr><td class="label">체험학습 장소</td><td>${esc(d.place)}</td></tr>
      <tr><td class="label">인솔자</td><td>${esc(d.escort)}${d.escortName ? " (" + esc(d.escortName) + ")" : ""}</td></tr>
      <tr><td class="label">보호자명</td><td>${esc(d.guardianName)} (${esc(d.guardianRel)})</td></tr>
      <tr><td class="label">체험학습 계획</td><td>${esc(d.plan).replace(/\n/g, "<br>")}</td></tr>
      <tr><td class="label">보호자 서명</td><td>${d.guardianSignature ? `<img class="sig" src="${d.guardianSignature}">` : "(없음)"}</td></tr>
      <tr><td class="label">학생 서명</td><td>${d.studentSignature ? `<img class="sig" src="${d.studentSignature}">` : "(없음)"}</td></tr>
      <tr><td class="label">제출일시</td><td>${esc(d.submittedAt)}</td></tr>
    </table>
  </body></html>`;
}
function reportHtml(d) {
  const photos = (d.photos || []).map((p) => `<img src="${p}" style="max-width:45%; margin:4px;">`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:"Malgun Gothic",sans-serif; font-size:13px; padding:20px;}
    h1{font-size:18px; text-align:center; margin-bottom:20px;}
    table{width:100%; border-collapse:collapse;}
    td{border:1px solid #999; padding:8px 10px; vertical-align:top;}
    .label{background:#f2f2f2; font-weight:bold; width:120px;}
  </style></head><body>
    <h1>교외체험학습 결과보고서</h1>
    <table>
      <tr><td class="label">성명 / 학번</td><td>${esc(d.name)} · ${esc(d.grade)}학년 ${esc(d.class)}반 ${esc(d.number)}번</td></tr>
      <tr><td class="label">체험학습 기간</td><td>${esc(d.start)} ~ ${esc(d.end)}</td></tr>
      <tr><td class="label">문서번호</td><td>${esc(d.docNumber) || "(미기재)"}</td></tr>
      <tr><td class="label">다녀온 장소</td><td>${esc(d.place)}</td></tr>
      <tr><td class="label">체험 내용</td><td>${esc(d.summary).replace(/\n/g, "<br>")}</td></tr>
      <tr><td class="label">사진</td><td>${photos}</td></tr>
      <tr><td class="label">제출일시</td><td>${esc(d.submittedAt)}</td></tr>
    </table>
  </body></html>`;
}

async function main() {
  let processed = 0;

  const appSnap = await getDocs(query(collection(db, "cheheomApplications"), where("status", "==", "접수")));
  for (const docSnap of appSnap.docs) {
    const d = docSnap.data();
    const sid = studentId(d.grade, d.class, d.number);
    const dir = studentFolder(sid, d.name);
    const outPath = path.join(dir, `교외체험학습 신청서(${sid}${d.name}).pdf`);
    htmlToPdf(applicationHtml(d), outPath);
    await updateDoc(doc(db, "cheheomApplications", docSnap.id), { status: "처리됨", processedAt: new Date().toISOString() });
    console.log(`[신청서] ${sid} ${d.name} -> ${outPath}`);
    console.log(`  ⚠ 공문(hwpx)은 자동 생성되지 않습니다 — Claude에게 "${sid} ${d.name} 공문 만들어줘"라고 요청하세요.`);
    processed++;
  }

  const repSnap = await getDocs(query(collection(db, "cheheomReports"), where("status", "==", "접수")));
  for (const docSnap of repSnap.docs) {
    const d = docSnap.data();
    const sid = studentId(d.grade, d.class, d.number);
    const dir = studentFolder(sid, d.name);
    const outPath = path.join(dir, `교외체험학습 결과보고서(${sid}${d.name}).pdf`);
    htmlToPdf(reportHtml(d), outPath);
    await updateDoc(doc(db, "cheheomReports", docSnap.id), { status: "처리됨", processedAt: new Date().toISOString() });
    console.log(`[결과보고서] ${sid} ${d.name} -> ${outPath}`);
    console.log(`  ⚠ 공문(hwpx)은 자동 생성되지 않습니다 — Claude에게 "${sid} ${d.name} 결과보고서 공문 만들어줘"라고 요청하세요.`);
    processed++;
  }

  console.log(processed === 0 ? "처리할 새 제출이 없습니다." : `${processed}건 처리 완료.`);
  process.exit(0);
}

main();
