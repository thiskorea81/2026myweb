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

    [작성 조건]
    1. 핵심 행동(Action) 위주로 짧은 문장(명사형 종결 등)으로 작성하세요.
    2. '[고정]' 태그가 있는 항목은 최상단에 배치하고 알맞은 이모지를 추가하세요.
    3. 전체 내용은 가독성을 위해 번호를 매겨서 정리하세요.

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
    1. 1500바이트 이내, 명사형 종결 사용.
    2. 책 제목은 '책제목 (저자)' 형식 준수. 맨 앞 어포스트로피 금지.
    3. 순수 JSON 형식 {"clubRecord": "..."}으로 출력하세요.
  `;
};