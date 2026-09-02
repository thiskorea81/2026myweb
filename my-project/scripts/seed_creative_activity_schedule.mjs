// "2026학년도 창체 일정(6.15.).hwpx"에서 추출한 1학년 자율/진로 활동 일정을
// Firestore의 creativeActivitySchedule 컬렉션에 등록합니다.
// 기본은 미리보기(dry-run)이며, --commit 옵션을 줘야 실제로 Firestore에 씁니다.
// 이미 같은 날짜+내용의 일정이 있으면 중복 방지를 위해 건너뜁니다.
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc } from "firebase/firestore";

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

// 2026학년도 창체 일정(6.15.) - 1학년 자율·진로 활동
const SCHEDULE = [
  { date: "2026-03-03", type: "자율", content: "입학식(1학년)" },
  { date: "2026-03-04", type: "진로", content: "[1학년] 진로진학캠프" },
  { date: "2026-03-11", type: "자율", content: "학교폭력예방교육(5·6교시)" },
  { date: "2026-03-25", type: "자율", content: "심폐소생술 등 응급처치 교육(5교시)/감염병 예방 교육(6교시)" },
  { date: "2026-04-15", type: "자율", content: "아동학대 예방교육(5·6교시)" },
  { date: "2026-04-28", type: "자율", content: "학급 자치 활동" },
  { date: "2026-04-29", type: "자율", content: "[1·2학년] 체험학습" },
  { date: "2026-04-30", type: "진로", content: "[1·2학년] 체험학습" },
  { date: "2026-05-01", type: "자율", content: "체험학습" },
  { date: "2026-05-13", type: "자율", content: "청렴 및 교권침해 예방교육(5교시)/마약류·흡연·음주 등 약물 오남용 예방교육(6교시)" },
  { date: "2026-05-15", type: "진로", content: "[1학년] 고교학점제 진로캠프" },
  { date: "2026-05-21", type: "자율", content: "몸활동 어울림 한마당 (~5/22)" },
  { date: "2026-05-28", type: "진로", content: "[1·2학년] 교육과정 박람회" },
  { date: "2026-06-17", type: "자율", content: "장애이해(사회적 장애인식개선)교육(5교시)/동물보호교육(6교시)" },
  { date: "2026-07-03", type: "진로", content: "[1학년] 꿈을 잇는 학과 멘토링 캠프" },
  { date: "2026-07-08", type: "자율", content: "지능정보서비스 과의존 예방교육(5교시)/학생 도박 예방교육(6교시)" },
  { date: "2026-07-15", type: "자율", content: "효행교육(5교시)/생명존중 및 자살예방교육(6교시)" },
  { date: "2026-07-20", type: "자율", content: "[1·2학년] 방학맞이 환경정화활동" },
  { date: "2026-08-19", type: "자율", content: "다문화교육(5교시)/가정폭력 예방교육(6교시)" },
  { date: "2026-09-02", type: "자율", content: "[1·2학년] 전국연합학력평가" },
  { date: "2026-09-16", type: "자율", content: "다문화교육(5교시)/성폭력·성매매 예방교육(6교시)" },
  { date: "2026-10-07", type: "자율", content: "성폭력·성매매 예방교육(5·6교시)" },
  { date: "2026-10-28", type: "자율", content: "장애이해(사회적 장애인식개선)교육(5교시)/학생 도박 예방교육(6교시)" },
  { date: "2026-11-11", type: "자율", content: "지능정보서비스 과의존 예방교육(5교시)/학교폭력예방교육(6교시)" },
  { date: "2026-11-17", type: "자율", content: "[1·2학년] 수능 시험장 환경구성 활동" },
  { date: "2026-11-18", type: "자율", content: "[1·2학년] 수능 시험장 설치" },
  { date: "2026-12-02", type: "자율", content: "아동학대 예방교육(5교시)/생명존중 및 자살예방교육(6교시)" },
  { date: "2026-12-23", type: "자율", content: "[1·2학년] 동아리 학술제 뒷정리" },
  { date: "2026-12-24", type: "자율", content: "[1·2학년] 학교 축제 및 뒷정리" },
  { date: "2026-12-29", type: "자율", content: "[1·2학년] 학년말 환경정화활동" },
  { date: "2027-02-05", type: "자율", content: "[1·2학년] 종업식" },
];

async function main() {
  const existingSnap = await getDocs(collection(db, "creativeActivitySchedule"));
  const existingKeys = new Set(existingSnap.docs.map((d) => `${d.data().date}__${d.data().content}`));

  const toAdd = SCHEDULE.filter((item) => !existingKeys.has(`${item.date}__${item.content}`));
  const skipped = SCHEDULE.length - toAdd.length;

  console.log(`총 ${SCHEDULE.length}건 / 신규 추가 대상 ${toAdd.length}건 / 이미 등록됨(건너뜀) ${skipped}건`);
  console.log("\n--- 미리보기 (최대 5건) ---");
  for (const item of toAdd.slice(0, 5)) {
    console.log(`[${item.date}] (${item.type}) ${item.content}`);
  }

  if (!COMMIT) {
    console.log(`\n(미리보기 모드입니다. 실제로 저장하려면 --commit 옵션을 붙여 다시 실행하세요.)`);
    return;
  }

  for (const item of toAdd) {
    await addDoc(collection(db, "creativeActivitySchedule"), {
      ...item,
      createdAt: new Date().toISOString(),
    });
  }
  console.log(`\n완료: ${toAdd.length}건의 일정을 추가했습니다.`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
