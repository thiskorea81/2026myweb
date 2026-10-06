// 시험 안내 자료(examGuides)에 우리 반 기준 "이동반 / 본반 자리배치표" 슬라이드를 넣습니다.
// 학생 이름은 Firestore students 컬렉션에서 그때그때 읽어오므로 이 파일에는 이름이 들어가지 않습니다.
//
// 좌석(칠판을 바라봤을 때 창가부터): 이동반 5 · 원반 5 · 이동반 6 · 원반 6 · 이동반 5 · 원반 5
// 이동반은 번호 순서대로 이동반 줄 맨 앞부터, 본반은 원반 줄 맨 앞부터 채웁니다.
// 이동반 시험 교실: 1학년→2학년, 2학년→3학년, 3학년→1학년 같은 반 교실.
//
//   node --env-file=.env scripts/set_exam_guide_class_seats.mjs \
//     --guide "2026학년도 2학기 중간고사 안내" --grade 1 --class 5 --move 1-18 [--exclude 4,16] [--commit]
//   --move    : 이동반이 되는 번호 범위 (그 밖의 번호는 본반)
//   --exclude : 추가로 뺄 번호 (선택). students 문서에 enrollmentStatus(전학·자퇴 등)가
//               표시된 학생은 이 옵션 없이도 자동으로 빠진다.
// 기본은 미리보기(dry-run)이며, --commit 옵션을 줘야 실제로 Firestore에 씁니다.
// 다시 실행하면 이전에 넣은 자리배치표 슬라이드를 교체합니다. (일반 좌석 배치 슬라이드 "seats"는 이 두 장으로 대체됨)
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc, query, where } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const COMMIT = process.argv.includes("--commit");
const GUIDE_TITLE = arg("guide");
const GRADE = Number(arg("grade"));
const CLASS = Number(arg("class"));
const [MOVE_FROM, MOVE_TO] = (arg("move") || "").split("-").map(Number);
const EXCLUDE = new Set((arg("exclude") || "").split(",").filter(Boolean).map(Number));
if (!GUIDE_TITLE || !GRADE || !CLASS || !MOVE_FROM || !MOVE_TO) {
  console.error("사용법: --guide <자료 제목> --grade <학년> --class <반> --move <시작-끝> [--exclude 4,16] [--commit]");
  process.exit(1);
}

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
const LOGIN_EMAIL_DOMAIN = "@2026myweb.local"; // src/firebase.js와 동일한 규칙 (아이디를 가짜 이메일로 변환)
const db = getFirestore(app, "my2026web");
const auth = getAuth(app);

// 창가 → 문 쪽 순서의 줄 구성
const COLUMNS = [
  { group: "move", size: 5 },
  { group: "home", size: 5 },
  { group: "move", size: 6 },
  { group: "home", size: 6 },
  { group: "move", size: 5 },
  { group: "home", size: 5 },
];
const SEAT_SLIDE_IDS = ["class-seats-move", "class-seats-home"];
const ORDINAL = ["첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째"];

const destGrade = (g) => (g % 3) + 1; // 1→2, 2→3, 3→1
const srcGrade = (g) => ((g + 1) % 3) + 1; // 우리 교실로 오는 이동반 학년: 1←3, 2←1, 3←2

// group 줄들에 학생을 번호 순서대로 채우고, 나머지 줄은 빈 책상('')으로 둔다
function buildSeats(students, group, ownLabel, otherLabel) {
  const queue = [...students];
  const columns = COLUMNS.map((c) => {
    if (c.group !== group) return { label: otherLabel, seats: Array(c.size).fill("") };
    const seats = Array.from({ length: c.size }, () => {
      const s = queue.shift();
      return s ? { no: s.number, name: s.name } : "";
    });
    return { label: ownLabel, highlight: true, seats };
  });
  if (queue.length) throw new Error(`${ownLabel} 자리가 부족합니다 (${queue.length}명 초과)`);
  return { front: "교탁 (칠판)", left: "창측", right: "문측", columns };
}

// 낭독용: "창가 첫째 줄에는 1번, 2번, ... 학생이"
function seatNarration(seats) {
  return seats.columns
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.highlight)
    .map(({ c, i }) => {
      const nums = c.seats.filter((s) => s && typeof s === "object").map((s) => `${s.no}번`);
      return `${i === 0 ? "창가 " : "창가에서 "}${ORDINAL[i]} 줄에는 ${nums.join(", ")}`;
    })
    .join(", ");
}

async function main() {
  const loginId = process.env.VITE_LOGIN_ID;
  const loginPw = process.env.VITE_LOGIN_PW;
  if (!loginId || !loginPw) {
    throw new Error("VITE_LOGIN_ID / VITE_LOGIN_PW 환경변수가 없습니다 (.env 확인 필요)");
  }
  await signInWithEmailAndPassword(auth, `${loginId}${LOGIN_EMAIL_DOMAIN}`, loginPw);

  const rosterSnap = await getDocs(
    query(collection(db, "students"), where("grade", "in", [GRADE, String(GRADE)]))
  );
  const roster = rosterSnap.docs
    .map((d) => d.data())
    // enrollmentStatus(전학·자퇴 등)가 있는 학생은 학적 변동으로 보고 자동 제외
    .filter((s) => Number(s.class) === CLASS && !s.enrollmentStatus && !EXCLUDE.has(Number(s.number)))
    .map((s) => ({ number: Number(s.number), name: s.name }))
    .sort((a, b) => a.number - b.number);
  if (!roster.length) throw new Error(`${GRADE}학년 ${CLASS}반 명단을 찾지 못했습니다.`);

  const movers = roster.filter((s) => s.number >= MOVE_FROM && s.number <= MOVE_TO);
  const homers = roster.filter((s) => s.number < MOVE_FROM || s.number > MOVE_TO);
  const lastNo = roster[roster.length - 1].number;
  const myRoom = `${GRADE}-${CLASS}`;
  const moveRoom = `${destGrade(GRADE)}-${CLASS}`;
  const incomingRoom = `${srcGrade(GRADE)}-${CLASS}`;
  const statusExcluded = rosterSnap.docs.map((d) => d.data())
    .filter((s) => Number(s.class) === CLASS && s.enrollmentStatus)
    .map((s) => Number(s.number));
  const excludedText = [...new Set([...EXCLUDE, ...statusExcluded])].sort((a, b) => a - b).map((n) => `${n}번`).join("·");

  const moveSeats = buildSeats(movers, "move", "우리 반", `${moveRoom} 학생`);
  const homeSeats = buildSeats(homers, "home", "우리 반", `${incomingRoom} 이동반`);

  const moveSlide = {
    id: SEAT_SLIDE_IDS[0],
    layout: "content",
    icon: "🚶",
    title: `이동반 자리배치표`,
    subtitle: `${MOVE_FROM}~${MOVE_TO}번 ${movers.length}명 → ${moveRoom} 교실`,
    points: [],
    warning: "이동반은 **반드시 번호 순서**대로 앉기",
    images: [],
    table: null,
    seats: moveSeats,
    narration: `시험 교실 책상은 6줄이고, 칠판을 바라봤을 때 창가부터 첫째, 셋째, 다섯째 줄이 이동반 자리입니다. 이동반은 반드시 번호 순서대로 앉아야 합니다. 먼저 우리 반 이동반 자리입니다. 우리 반 ${MOVE_FROM}번부터 ${MOVE_TO}번까지 ${movers.length}명은 ${moveRoom} 교실로 이동해서 시험을 봅니다. 칠판을 바라봤을 때 ${seatNarration(moveSeats)} 학생이 맨 앞부터 번호 순서대로 앉습니다. 화면에서 노란 칸이 우리 반 자리입니다. 내 자리를 꼭 확인해 두세요.`,
  };
  const homeSlide = {
    id: SEAT_SLIDE_IDS[1],
    layout: "content",
    icon: "🏠",
    title: `본반 자리배치표`,
    subtitle: `${homers[0]?.number}~${lastNo}번 ${homers.length}명 → 우리 교실(${myRoom})`,
    points: [],
    warning: "",
    images: [],
    table: null,
    seats: homeSeats,
    narration: `다음은 본반 자리입니다. ${homers[0]?.number}번부터 ${lastNo}번까지 ${homers.length}명은 우리 교실에서 그대로 시험을 봅니다. 칠판을 바라봤을 때 ${seatNarration(homeSeats)} 학생이 맨 앞부터 번호 순서대로 앉습니다. 나머지 줄에는 ${incomingRoom} 이동반 학생들이 앉습니다.`,
  };

  const guideSnap = await getDocs(query(collection(db, "examGuides"), where("title", "==", GUIDE_TITLE)));
  if (guideSnap.empty) throw new Error(`"${GUIDE_TITLE}" 자료를 찾지 못했습니다.`);
  const guideDoc = guideSnap.docs[0];
  let slides = guideDoc.data().slides.filter((s) => !SEAT_SLIDE_IDS.includes(s.id));

  // 시험 당일 이동 슬라이드의 "앞번호부터 16명" 문구를 우리 반 기준으로 바꾼다
  slides = slides.map((s) =>
    s.id !== "move"
      ? s
      : {
          ...s,
          points: [
            "**8시 40분** 정기고사 안내 멘트가 끝나면 이동 시작",
            "**8시 45분**(시험 시작 15분 전)까지 시험 교실 도착",
            `**${MOVE_FROM}~${MOVE_TO}번 ${movers.length}명**은 이동반 → **${moveRoom} 교실**`,
            `**${homers[0]?.number}~${lastNo}번**은 우리 교실(${myRoom})에서 시험`,
            "안내 멘트가 끝나기 전에는 움직이지 않기",
          ],
          narration: `이번 시험은 1학년, 2학년, 3학년이 섞여서 시험을 보는 혼반으로 진행됩니다. 시험 당일 8시 40분에 정기고사 안내 멘트가 나오는데, 이 멘트가 끝난 뒤에 이동을 시작하고, 시험 시작 15분 전인 8시 45분까지 시험 교실에 도착해야 합니다. 우리 반은 ${MOVE_FROM}번부터 ${MOVE_TO}번까지 ${movers.length}명이 이동반으로 ${moveRoom} 교실에 가서 시험을 봅니다. ${homers[0]?.number}번부터 ${lastNo}번까지는 우리 교실에서 그대로 시험을 봅니다.`,
        }
  );

  // 일반 좌석 배치 슬라이드(번호 예시가 우리 반 실제 번호와 다름)를 우리 반 자리배치표 두 장으로 대체한다
  const generic = slides.findIndex((s) => s.id === "seats");
  if (generic >= 0) slides.splice(generic, 1, moveSlide, homeSlide);
  else slides.splice(slides.findIndex((s) => s.id === "rooms") + 1, 0, moveSlide, homeSlide);

  console.log(`${GRADE}학년 ${CLASS}반 / 제외: ${excludedText || "없음"}`);
  console.log(`이동반 ${movers.length}명 → ${moveRoom}: ${movers.map((s) => s.number).join(", ")}`);
  console.log(`본반 ${homers.length}명 (${myRoom}): ${homers.map((s) => s.number).join(", ")}`);
  for (const [label, seats] of [["이동반", moveSeats], ["본반", homeSeats]]) {
    console.log(`\n[${label}] 창가 → 문 쪽`);
    seats.columns.forEach((c, i) =>
      console.log(`  ${i + 1}열 ${c.label}: ${c.seats.map((s) => (s && typeof s === "object" ? s.no : "·")).join(" ")}`)
    );
  }
  console.log(`\n슬라이드 순서: ${slides.map((s) => s.id).join(" → ")}`);

  if (!COMMIT) {
    console.log(`\n(미리보기 모드입니다. 실제로 저장하려면 --commit 옵션을 붙여 다시 실행하세요.)`);
    return;
  }
  await updateDoc(doc(db, "examGuides", guideDoc.id), { slides, updatedAt: new Date().toISOString() });
  console.log(`\n완료: examGuides/${guideDoc.id} 의 슬라이드를 갱신했습니다.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("실패:", err);
    process.exit(1);
  });
