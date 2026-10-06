import { z } from "zod";

/**
 * ==========================================
 * 1. Zod 스키마 (데이터 구조 정의)
 * ==========================================
 */

// 💡 생기부(자율/진로/행특) 구조
export const recordSchema = z.object({
  autonomous: z.string().describe("자율활동 특기사항 (1500바이트 이내)"),
  career: z.string().describe("진로활동 특기사항 (2100바이트 이내)"),
  behavior: z.string().describe("행동특성 및 종합의견 (1500바이트 이내)")
});

// 💡 동아리 활동 구조
export const clubSchema = z.object({
  clubRecord: z.string().describe("동아리 활동 특기사항 (1500바이트 이내)")
});

// 💡 학급 게시판(조종례) 구조
export const announcementSchema = z.object({
  announcement: z.string().describe("번호가 매겨진 간결한 공지사항 본문"),
  closing: z.string().describe("따뜻하고 짧은 격려의 끝인사")
});

// 💡 여러 학생을 한 번에 분석할 때, 학생 한 명당 결과 한 개의 구조 (studentId로 원래 학생과 매칭)
export const gradeAiNoteItemSchema = z.object({
  studentId: z.string().describe("입력에 주어진 studentId를 그대로 반환 (변형 금지)"),
  note: z.string().describe("그 학생에 대한 성적 분석 코멘트 (3문장 내외)")
});

// 💡 정기고사 학급 안내 슬라이드 구조 (첫 슬라이드는 표지로 쓴다)
export const examGuideSchema = z.object({
  slides: z.array(z.object({
    icon: z.string().describe("슬라이드 주제를 나타내는 이모지 1개"),
    title: z.string().describe("슬라이드 제목 (15자 이내)"),
    subtitle: z.string().describe("부제 (없으면 빈 문자열)"),
    points: z.array(z.string()).describe("학생이 꼭 알아야 할 핵심 내용, 한 항목에 한 문장 (표지는 빈 배열 가능)"),
    warning: z.string().describe("가장 강하게 경고할 한 문장 (없으면 빈 문자열)"),
    narration: z.string().describe("교사가 학생들에게 말하듯 읽어 줄 낭독 원고")
  }))
});


/**
 * ==========================================
 * 2. 프롬프트 빌더 (로직 정의)
 * ==========================================
 */

/**
 * 🎓 생기부 초안 생성 프롬프트
 * @param {Object} student - 학생 객체
 * @param {string} counselingText - 상담 기록 요약 텍스트
 * @param {Object} obsRecords - 선생님의 관찰 메모 객체
 */
export const getRecordPrompt = (student, counselingText, obsRecords) => {
  return `
    당신은 대한민국 고등학교 담임 교사 비서입니다. 제공된 데이터를 바탕으로 학교생활기록부 초안을 작성하세요.

    [출력 형식 가이드]
    반드시 제공된 JSON 스키마를 엄격히 준수하여 autonomous, career, behavior 세 개의 키값에 내용을 채워주세요. (키 이름을 절대로 변경하거나 번역하지 마세요)

    [학생 데이터]
    - 이름: ${student.name}
    - 진로: ${student.career || '미정'}
    - 상담/활동 기록: ${counselingText || '기록 없음'}
    - 관찰 메모: 자율(${obsRecords.autonomous || '없음'}), 진로(${obsRecords.career || '없음'}), 행동(${obsRecords.behavior || '없음'})

    [🌟 엄격한 작성 규칙]
    1. 분량: 자율(1500byte), 진로(2100byte), 행동(1500byte) 제한을 절대 넘지 마세요.
    2. 표기: 책 제목은 반드시 '책제목 (저자)' 형식으로 작성하세요. 문장 맨 앞 어포스트로피(') 금지.
    3. 문체: 학생의 성취와 변화가 드러나는 전문적인 교육 용어를 사용하고 명사형 종결 어미를 권장합니다.
  `;
};

/**
 * 📝 생기부 수정 요청 프롬프트
 */
export const getRevisionPrompt = (prevDraft, requestText) => {
  return `
    생활기록부 작성 전문가로서 아래 '이전 초안'을 교사의 [요청 사항]에 맞게 수정하세요.
    [출력 형식 가이드]
    반드시 JSON 스키마 규격을 유지하여 autonomous, career, behavior 키에 내용을 채워주세요.

    [이전 초안] 
    자율:${prevDraft.autonomous} / 진로:${prevDraft.career} / 행동:${prevDraft.behavior}

    [수정 요청] 
    ${requestText}
  `;
};

/**
 * 🌅 학급 게시판(조종례) 요약 프롬프트
 * @param {boolean} isMorningMode - 오전/오후 모드 구분
 * @param {string} logTexts - 필터링된 업무 로그 텍스트
 */
export const getBoardPrompt = (isMorningMode, logTexts) => {
    return `
      학급 담임 교사로서 ${isMorningMode ? '아침 조회' : '오후 종례'} 공지를 작성합니다.
      학생들이 화면을 보고 3초 만에 이해할 수 있도록 아주 간결하고 직관적으로 요약하세요.
  
      [출력 규칙 - 절대 엄수]
    1. 반드시 단일 JSON 객체 { "announcement": "...", "closing": "..." }로만 응답하세요.
    2. 응답을 대괄호 [ ] 로 감싸거나 리스트(Array) 구조로 만들지 마세요.
    3. announcement 필드 안에 모든 공지 내용을 번호를 매겨 하나의 문자열로 작성하세요.
  
      [작성 조건]
      1. 핵심 행동(Action) 위주로 짧은 문장(명사형 종결 등)으로 작성하세요.
      2. '[고정]' 태그가 있는 항목은 최상단에 배치하고 알맞은 이모지를 추가하세요.
      3. 'announcement' 필드 하나에 모든 공지사항을 번호(1. 2. 3.)를 매겨서 작성하고, 각 항목 사이에는 실제 줄바꿈(Enter)을 적용하여 구분하세요. ('\\n' 이라는 문자를 텍스트로 그대로 출력하지 마세요.)
  
      [메모 내용]
      ${logTexts}
    `;
  };

/**
 * 👨‍🏫 담임 교사용 조종례 요약 프롬프트 (수정됨)
 */
export const getTeacherBoardPrompt = (isMorningMode, logTexts) => {
    return `
      당신은 담임 선생님을 돕는 유능한 AI 비서입니다.
      제공된 메모들을 바탕으로, 담임 선생님이 ${isMorningMode ? '아침 조회' : '오후 종례'} 시간에 학급 상황을 한눈에 파악하고 학생들에게 정확히 전달할 수 있도록 내용을 깔끔하게 정리해 주세요.
  
      [출력 규칙 - 절대 엄수]
      1. 반드시 단일 JSON 객체 { "announcement": "...", "closing": "..." }로만 응답하세요.
      2. 응답을 대괄호 [ ] 로 감싸거나 리스트(Array) 구조로 만들지 마세요.
      3. 담임 선생님이 읽고 바로 학생들에게 안내하거나 지도할 수 있도록, 정중하고 전문적인 문체(~습니다, ~바랍니다)로 요약하세요.
      4. 항목별로 번호(1. 2. 3.)를 매기고, 각 항목 사이에는 실제 줄바꿈(Enter)을 적용하여 가독성을 극대화하세요. ('\\n' 이라는 문자를 텍스트로 그대로 출력하지 마세요.)
      5. 링크가 있으면 링크를 무조건 넣어주세요. 
  
      [메모 내용]
      ${logTexts}
    `;
  };

/**
 * 🏀 동아리 생기부 초안 생성 프롬프트
 */
export const getClubRecordPrompt = (student, actsText, obsRecord) => {
  return `
    동아리 활동 기록 전문가로서 다음 데이터를 바탕으로 특기사항을 작성하세요.
    - 학생명/역할: ${student.name} / ${student.clubRole || '부원'}
    - 진로: ${student.career || '미정'}
    - 활동내역: ${actsText}
    - 관찰메모: ${obsRecord || '없음'}

    [규칙]
    3. 순수 JSON 형식 {"clubRecord": "..."}으로 출력하세요.
  `;
};

/**
 * 📊 성적 입력 시 AI 노트 (분석) 생성 프롬프트
 */
export const getGradeAiNotePrompt = (student, examName, scores) => {
  const scoreStr = Object.entries(scores).map(([k, v]) => `${k}: ${v}`).join(", ");
  return `
    당신은 훌륭한 담임 교사 비서입니다. 이번에 학생의 새로운 성적이 입력되었습니다.
    이 성적 데이터를 바탕으로 성취도를 분석하고, 강점/보완점 및 향후 학습 지도 조언을 3문장 내외로 요약해 주세요.
    
    [성적 분석 특별 규칙]
    - 과목별 성적에 백분율(%) 수치가 포함되어 있다면, 수치가 낮을수록 우수한 성적입니다.
    - 백분율 수치는 반드시 다음 5등급제로 변환하여 분석 및 상담일지에 반영해 주세요.
      * 1등급: 10% 이하
      * 2등급: 10% 초과 ~ 34% 이하
      * 3등급: 34% 초과 ~ 66% 이하
      * 4등급: 66% 초과 ~ 90% 이하
      * 5등급: 90% 초과 ~ 100% 이하

    [학생 정보]
    - 이름: ${student.name}
    - 시험명: ${examName}
    - 과목별 성적: ${scoreStr}
  `;
};

/**
 * 📊 성적 기반 AI 노트를 여러 학생 한 번에 생성하는 프롬프트 (개별 호출 대신 배치 처리용)
 * @param {Array<{studentId: string, name: string, examName: string, scores: object}>} studentsData
 */
export const getBulkGradeAiNotePrompt = (studentsData) => {
  const studentBlocks = studentsData.map(s => {
    const scoreStr = Object.entries(s.scores).map(([k, v]) => `${k}: ${v}`).join(", ");
    return `- studentId: ${s.studentId} | 이름: ${s.name} | 시험명: ${s.examName} | 과목별 성적: ${scoreStr}`;
  }).join('\n');

  return `
    당신은 훌륭한 담임 교사 비서입니다. 여러 학생의 새로운 성적이 한꺼번에 입력되었습니다.
    학생별로 성취도를 분석하고, 강점/보완점 및 향후 학습 지도 조언을 3문장 내외로 요약해 주세요.

    [성적 분석 특별 규칙]
    - 과목별 성적에 백분율(%) 수치가 포함되어 있다면, 수치가 낮을수록 우수한 성적입니다.
    - 백분율 수치는 반드시 다음 5등급제로 변환하여 분석 및 상담일지에 반영해 주세요.
      * 1등급: 10% 이하
      * 2등급: 10% 초과 ~ 34% 이하
      * 3등급: 34% 초과 ~ 66% 이하
      * 4등급: 66% 초과 ~ 90% 이하
      * 5등급: 90% 초과 ~ 100% 이하

    [출력 형식 - 절대 엄수]
    - 아래 [학생 목록]과 정확히 같은 수의 원소를 가진 JSON 배열로만 응답하세요.
    - 각 원소는 { "studentId": "...", "note": "..." } 형태이며, studentId는 입력값을 그대로 사용하세요.

    [학생 목록]
    ${studentBlocks}
  `;
};

/**
 * 📊 학생별 전체 성적 이력(모의고사 여러 회차 + 내신)을 바탕으로
 * 추이(향상/하락) 중심의 상담자료를 생성하는 프롬프트 (배치 처리용)
 * @param {Array<{studentId: string, name: string, examHistory: Array<{examName: string, scores: object}>}>} studentsData
 */
export const getGradeTrendAiNotePrompt = (studentsData) => {
  const studentBlocks = studentsData.map(s => {
    const examLines = s.examHistory.map(e => {
      const scoreStr = Object.entries(e.scores).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `    · ${e.examName} → ${scoreStr}`;
    }).join('\n');
    return `- studentId: ${s.studentId} | 이름: ${s.name}\n${examLines}`;
  }).join('\n\n');

  return `
    당신은 훌륭한 담임 교사 비서입니다. 아래는 학생별로 시간순으로 나열된 여러 차례의 성적 기록입니다
    (모의고사 여러 회차 + 학교 내신 시험 포함, 과목명 뒤 "(등급)"이 붙은 값은 전국연합학력평가의 9등급제 등급입니다).

    각 학생마다, 특히 가장 최근 모의고사(9월모의고사)를 중심으로 다음을 반영한 상담자료를 4~6문장으로 작성하세요.
    - 이전 모의고사(3월→6월→9월) 대비 과목별 등급/점수 추이 (향상/하락/유지)를 구체적으로 언급
    - 모의고사 성적과 내신(학교 시험) 성적 사이에 눈에 띄는 차이가 있다면 함께 언급
    - 가장 강한 과목과 보완이 필요한 과목을 지목
    - 다음 시험을 위한 구체적이고 실행 가능한 학습 지도 조언 1~2가지

    [성적 분석 특별 규칙]
    - 과목명 뒤에 "(등급)"이 붙지 않은 순수 숫자는 원점수/백분율이며, 값이 높을수록 우수한 성적입니다.
    - "(등급)"이 붙은 값이나 별도로 백분율(%) 표기가 있는 경우, 수치가 낮을수록(등급 1에 가까울수록) 우수한 성적입니다.
    - 백분율 수치만 있고 등급이 없다면 반드시 다음 5등급제로 변환하여 분석에 반영하세요.
      * 1등급: 10% 이하  * 2등급: 10% 초과~34% 이하  * 3등급: 34% 초과~66% 이하
      * 4등급: 66% 초과~90% 이하  * 5등급: 90% 초과~100% 이하

    [출력 형식 - 절대 엄수]
    - 아래 [학생 목록]과 정확히 같은 수의 원소를 가진 JSON 배열로만 응답하세요.
    - 각 원소는 { "studentId": "...", "note": "..." } 형태이며, studentId는 입력값을 그대로 사용하세요.

    [학생 목록]
    ${studentBlocks}
  `;
};

/**
 * 📚 모의고사 세부영역/오답문항까지 반영한 학생 개인별 학습 조언(강점/약점) 생성 프롬프트
 * @param {Object} student - 학생 객체
 * @param {string} gradesSummaryText - 내신 성적(학기중 시험) 요약 텍스트
 * @param {string} mockExamRawText - 전국연합학력평가 성적통지표 원문(세부영역/오답문항 포함)
 */
export const getStudyAdvicePrompt = (student, gradesSummaryText, mockExamRawText) => {
  return `
    당신은 학생의 성적을 깊이 있게 분석하는 입시 전문 담임 교사입니다.
    아래 제공된 모든 시험 기록(내신 성적 + 전국연합학력평가 성적통지표 원문)을 바탕으로,
    이 학생 본인이 읽을 "과목별 강점/약점 분석 및 학습 조언"을 작성해 주세요.

    [분석 지침]
    1. 성적통지표 원문에는 영역별 원점수/표준점수/백분위/등급뿐 아니라 세부영역별 득점(예: 국어 - 사실적 이해, 추론적 이해 등)과
       오답 문항 번호까지 들어 있습니다. 이 세부 데이터를 근거로 "어떤 유형의 문제에서 약한지" 구체적으로 짚어주세요.
       단순히 등급이나 점수만 나열하지 마세요.
    2. 내신 성적과 모의고사 성적을 비교해 내신형/수능형 중 상대적으로 강한 쪽이 있다면 짚어주세요.
    3. 3월 모의고사 대비 6월 모의고사에서 향상되었거나 하락한 과목이 있다면 반드시 언급하세요. (6월 성적통지표가 없다면 이 항목은 생략)
    4. 과목별로 "강점 → 약점 → 학습 조언" 순서로, 과목명을 소제목처럼 달아 읽기 쉽게 정리하세요.
    5. 학생 본인이 직접 읽는 글이니 존중하는 어조로 작성하되, 문제를 회피하지 말고 솔직하게 짚어주세요.

    [학생 이름]: ${student.name}

    [내신 성적 요약]
    ${gradesSummaryText || '기록 없음'}

    [전국연합학력평가 성적통지표 원문]
    ${mockExamRawText || '자료 없음'}
  `;
};

/**
 * 👨‍🏫 학급관리 전체 선택 시 AI 노트 일괄 생성 프롬프트
 */
export const getGeneralAiNotePrompt = (student, allRecordsText) => {
  return `
    당신은 훌륭한 담임 교사 비서입니다. 아래 학생의 모든 기록(성적, 상담, 출결, 행동특성 등)을 종합하여,
    현재 학생의 전반적인 학교 생활 상태와 담임 교사로서 집중해야 할 지도 포인트를 3문장 내외로 요약해 주세요.

    [성적 분석 특별 규칙]
    - 기록 중 성적 데이터에 백분율(%) 수치가 포함되어 있다면, 수치가 낮을수록 우수한 성적입니다.
    - 백분율 수치는 반드시 다음 5등급제로 변환하여 종합 분석 및 조언에 반영해 주세요.
      * 1등급: 10% 이하
      * 2등급: 10% 초과 ~ 34% 이하
      * 3등급: 34% 초과 ~ 66% 이하
      * 4등급: 66% 초과 ~ 90% 이하
      * 5등급: 90% 초과 ~ 100% 이하

    [학생 정보]
    - 이름: ${student.name}
    - 진로: ${student.career || '미정'}
    
    [종합 기록 내용]
    ${allRecordsText}
  `;
};
/**
 * 📝 정기고사 학급 안내문(교사용 원문) → 학생에게 보여주고 들려줄 슬라이드
 * @param {string} title - 안내 자료 제목 (예: 2026학년도 2학기 중간고사 안내)
 * @param {string} sourceText - 연구부 안내문 원문
 */
export const getExamGuidePrompt = (title, sourceText) => {
  return `
    당신은 고등학교 담임 교사입니다. 아래 [안내문 원문]은 연구부가 담임 교사에게 보낸 정기고사 학급 안내사항입니다.
    이 내용을 교실 TV에 띄워 학생들에게 보여주고 음성으로 들려줄 슬라이드로 다시 구성해 주세요.

    [구성 규칙]
    1. 첫 슬라이드는 표지입니다. title은 "${title}", points는 이번 안내 순서(3~6개 짧은 키워드)로 작성하세요.
    2. 학생이 알아야 할 내용만 남기세요. 출결 기록 송부, 응시현황표 부착, 결시생 칠판 기재 방법 등 교사만 하는 업무는 빼세요.
    3. 주제별로 슬라이드를 나누세요 (예: 시험 당일 이동, 답안지 작성, 반입 금지 물품, 시험 직전·시험 중 행동, 모자, 부정행위 유형, 결시 안내).
       한 슬라이드의 points는 3~7개, 학생 눈높이의 짧은 문장으로 쓰고, 꼭 기억할 낱말은 **이렇게** 감싸 강조하세요.
    4. 원문에 없는 규정이나 숫자를 지어내지 마세요. 시각·인원·비율 등 숫자는 원문 그대로 옮기세요.
    5. 마지막 슬라이드는 응원과 당부로 마무리하세요.
    6. narration은 선생님이 학생들 앞에서 말하듯 자연스러운 존댓말 구어체로, 슬라이드 내용을 빠짐없이 풀어서 설명하세요.
       기호(★, →, ·, **)는 쓰지 말고, 소리 내어 읽기 좋은 문장으로만 작성하세요.

    [안내문 원문]
    ${sourceText}
  `;
};
