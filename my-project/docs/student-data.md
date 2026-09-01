# 학생 데이터 읽고 쓰는 방법

이 문서는 `students` Firestore 컬렉션(학급/홈룸 학생)을 어떻게 읽고 쓰는지 정리한 참고 문서입니다.
새 기능을 추가할 때 이 패턴을 그대로 따르면 기존 코드와 어긋나지 않습니다.

## 0. 먼저 알아둘 것

- Firestore 프로젝트는 **이름이 붙은 데이터베이스**를 씁니다: `"my2026web"` (기본 `(default)` 데이터베이스가 아님).
  `src/firebase.js`에서 `getFirestore(app, "my2026web")`로 지정되어 있습니다.
- 학생 문서의 **ID는 Firestore가 자동 생성한 값이 아니라 학번(studentId) 문자열**입니다 (예: `"10501"`).
- **`students`(학급 관리)와 `clubStudents`(동아리 관리)는 완전히 별개의 컬렉션/문서**입니다.
  같은 학번이어도 서로 다른 문서이고, 한쪽에서 등록해도 다른 쪽에는 나타나지 않습니다.
  이 문서는 `students`(학급) 기준으로 설명합니다. 동아리 쪽은 6번 항목 참고.

## 1. 학생 목록 읽기

```js
import { useStudentStore } from '@/stores/studentStore'
import { storeToRefs } from 'pinia'

const studentStore = useStudentStore()
const { students } = storeToRefs(studentStore) // 반응형으로 쓰려면 storeToRefs 필수

onMounted(() => studentStore.fetchStudents()) // 전체 학생을 studentStore.students에 채움 (학번순 정렬)
```

- `fetchStudents()`는 **전체 학생**을 한 번에 불러옵니다. 학급/학년별 전용 쿼리는 없고,
  화면에서 필요한 범위는 항상 클라이언트에서 `filter`로 좁힙니다:

```js
const myClassStudents = computed(() =>
  students.value.filter(s =>
    !s.isArchived &&
    String(s.grade) === String(myGrade.value) &&
    String(s.class) === String(myClass.value)
  )
)
```

## 2. 학생 데이터 쓰기 (`studentStore`의 액션들)

| 동작 | 함수 | 비고 |
|---|---|---|
| 추가 / upsert | `addStudent(studentData)` | `studentData.studentId` 필수. `studentId` **필드**로 기존 문서를 찾아서, 있으면 그 문서에 merge, 없으면 `students/{String(studentId)}`에 새로 생성 |
| 수정 | `updateStudent(id, partialData)` | `id`는 Firestore 문서 ID(=학번 문자열). 부분 필드만 넘기면 됨 (`updateDoc`) |
| 삭제 | `deleteStudent(id)` | |
| 일괄 삭제 | `bulkDelete(ids)` | `writeBatch` 사용 |
| 보관 처리 | `bulkArchive(ids)` | 실제 삭제 아님, `isArchived: true`만 세팅 |
| 성적 일괄 업로드 | `bulkUploadGrades(list)` | 3번 항목 참고 |
| 성적 개별 삭제 | `deleteGrade(studentId, gradeId)` | |

⚠️ **관례**: 위 액션들은 전부 마지막에 `await this.fetchStudents()`를 다시 호출해서 로컬 상태를 새로고침합니다
(낙관적 업데이트가 아니라 "쓰고 → 전체 다시 읽기" 방식). 새 액션을 추가할 때도 이 패턴을 유지하세요.

호출 예시:

```js
// 학생 한 명 추가/수정 (studentId 기준으로 upsert)
await studentStore.addStudent({ studentId: '10501', name: '홍길동', grade: '1', class: '3' })

// 특정 필드만 수정
await studentStore.updateStudent('10501', { career: '소프트웨어 엔지니어' })

// 여러 명 보관 처리
await studentStore.bulkArchive(['10501', '10502'])
```

## 3. 성적(`grades`) 필드 구조

학생 문서 안에 배열로 들어있습니다 (별도 컬렉션이 아님):

```js
student.grades = [
  {
    id: 1735599999999.123,        // Date.now() + Math.random()
    examName: '1학기 중간고사',
    scores: { 국어: '90', 수학: '85' }, // 자유 형식 - 업로드 시 입력한 열 이름을 그대로 키로 사용
    createdAt: '2026-07-16T...',
    updatedAt: '2026-07-16T...'   // 같은 examName으로 덮어쓴 경우에만 존재
  }
]
```

`bulkUploadGrades`는 같은 `examName`이 이미 있으면 그 항목을 덮어쓰고, 없으면 새로 추가합니다.

성적을 화면에 보여줄 때는 **`Object.entries(scores)`를 바로 쓰지 말고** 반드시
`src/utils/gradeUtils.js`의 `getOrderedScores(scores)`를 거치세요. 시험마다 열 이름 표기가
달라도(`한국사` / `한국사1` / `한국사(백분율)`) 항상 같은 순서로 정렬되고, 성적에 실수로
섞여 들어온 `성명`/`이름` 같은 개인정보 열도 걸러줍니다.

## 4. 학생 문서의 주요 필드

코드 전반에서 실제로 쓰이는 필드들입니다 (스키마 강제는 없고, 화면에서 쓰는 필드가 곧 스키마입니다):

- 기본 정보: `studentId`, `name`, `gender`, `grade`, `class`, `number`
- 연락처: `phone`, `parent1Phone`, `parent2Phone`, `address`, `birthDate`
- 진로/특기: `career`, `university`, `specialty`, `hobby`, `favoriteSubject`, `dislikeSubject`
- 담임 메모: `goodPoint`, `badPoint`, `family`, `memo`
- 사진: `photoUrl`
- 동아리(학급 문서 쪽 참고용 필드): `clubRole`
- 생기부 관찰 메모(수시 기록): `obsAutonomous`, `obsCareer`, `obsBehavior`
- 생기부 최종 확정 내용: `finalAutonomous`, `finalCareer`, `finalBehavior`
- 생기부 AI 초안 이력: `recordAiDraftHistory` (⚠️ **JSON 문자열**로 저장됨 - 읽을 때 `JSON.parse`, 쓸 때 `JSON.stringify` 필요)
- 성적: `grades[]` (3번 항목)
- 모의고사 성적통지표 원문: `mockExamRaw` (`{ [시험명]: 원문텍스트 }` 형태 객체)
- 학습 조언: `studyAdviceAi`, `studyAdviceUpdatedAt`
- 보관 여부: `isArchived`

## 5. 학생과 연결되지만 별도 컬렉션인 것들

아래는 학생 문서 **안에 들어있지 않고**, `studentId`(=학생 문서 ID)로 따로 필터링해서 조회해야 합니다:

| 컬렉션 | 스토어 | 조회 방식 | 추가 |
|---|---|---|---|
| `counselingLogs` | `counselingStore` | `fetchLogs(studentId)` - 실시간 구독(`onSnapshot`) | `addLog(studentId, date, content)` |
| `attendanceLogs` | `attendanceStore` | `fetchLogs(studentId)` - 실시간 구독(`onSnapshot`) | `addLog({ studentId, ... })` |
| `aiNotes` | `aiNoteStore` | `fetchNotes(studentId)` - 1회성 조회(`getDocs`) | `addNote(studentId, content)` |

상담/출결은 `onSnapshot`이라 구독을 걸어두면 자동 갱신되고, AI 노트는 필요할 때마다 다시 `fetchNotes`를 불러야 합니다.

한 학생의 전체 기록을 모을 때(생기부 초안 생성, 일괄 인쇄 등)는 이 세 컬렉션 + 학생 문서 자체를
각각 조회해서 합칩니다. `Homeroom.vue`의 `handleBulkPrint`, `handleBulkRecordAi`가 좋은 예시입니다.

## 6. 동아리 학생(`clubStudents`)은 다른 컬렉션

`src/stores/clubStore.js`가 관리하며, `students`와 완전히 분리되어 있습니다:

- 컬렉션명: `clubStudents` (문서 ID는 마찬가지로 학번 문자열)
- 필드도 따로 관리됨: `clubRole`, `clubActivities[]`(동아리 활동 로그, 학생 문서 안 배열), `specialty`, `motivation` 등
- 액션: `fetchClubStudents()`, `updateStudent(id, data)`, `deleteStudent(id)`, `bulkDelete(ids)`, `bulkUpload(list)`, `bulkUploadActivities(list)`

학급 관리 화면에서 학생을 등록해도 동아리 화면에는 나타나지 않으니, "학생이 안 보인다"는
버그 리포트를 받으면 어느 컬렉션 얘기인지부터 확인하세요.

## 7. AI에게 학생 데이터를 넘길 때

`src/services/aiPrompts.js`의 프롬프트 빌더는 순수 문자열 템플릿이라, 필요한 필드
(`student.name`, `student.career` 등)를 호출하는 쪽에서 직접 조립해 넘겨야 합니다.

여러 학생을 한 번에 처리해야 한다면(예: 성적 일괄 분석) **학생 수만큼 Gemini를 순차 호출하지 마세요**.
`aiService.askStructuredArray(prompt, itemSchema)`로 여러 학생을 한 프롬프트에 묶어
JSON 배열로 한 번에 받아오는 패턴을 쓰세요 (`Homeroom.vue`의 `handleBulkGradeAiNote` +
`aiPrompts.js`의 `getBulkGradeAiNotePrompt`가 참고 예시입니다). 응답의 `studentId`로
원래 학생과 다시 매칭하면 됩니다.
