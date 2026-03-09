import { z } from "zod";

/**
 * 💡 생기부 공통 데이터 구조 (Zod 스키마)
 */
export const recordSchema = z.object({
  autonomous: z.string().describe("자율활동 특기사항"),
  career: z.string().describe("진로활동 특기사항"),
  behavior: z.string().describe("행동특성 및 종합의견")
});

/**
 * 💡 생기부 생성을 위한 공통 프롬프트 빌더
 */
export const getRecordPrompt = (student, counselingText, obsRecords) => {
  return `
    당신은 대한민국 고등학교 담임 교사 비서입니다. 제공된 학생 정보를 바탕으로 학교생활기록부 초안을 작성하세요.
    [출력 형식 가이드]
    반드시 제공된 JSON 스키마를 엄격히 준수하여 autonomous, career, behavior 세 개의 키값에 내용을 채워주세요. (키 이름을 절대로 변경하거나 번역하지 마세요)

    [학생 데이터]
    이름: ${student.name}
    진로: ${student.career || '미정'}
    특기: ${student.specialty || '없음'}
    장단점: ${student.goodPoint || '미기입'}/${student.badPoint || '미기입'}
    최근 상담/활동 기록: ${counselingText || '기록 없음'}
    선생님 관찰 메모: 자율(${obsRecords.autonomous || '없음'}) / 진로(${obsRecords.career || '없음'}) / 행동(${obsRecords.behavior || '없음'})

    [엄격한 규칙]
    1. 분량: 자율(1500byte), 진로(2100byte), 행동(1500byte) 제한 엄수.
    2. 표기: 책 제목은 반드시 '책제목 (저자)' 형식으로 작성. 문장 맨 앞 어포스트로피(') 금지.
    3. 문체: 학생의 성장이 드러나는 전문적인 교육 용어와 명사형 종결 사용.
  `;
};

/**
 * 💡 수정 요청을 위한 공통 프롬프트 빌더
 */
export const getRevisionPrompt = (prevDraft, requestText) => {
  return `
    생활기록부 작성 전문가로서 아래 '이전 초안'을 교사의 [요청 사항]에 맞게 수정해주세요.
    [출력 형식 가이드]
    반드시 JSON 스키마를 준수하여 autonomous, career, behavior 키에 내용을 채워주세요.

    [이전 초안] 
    자율:${prevDraft.autonomous} / 진로:${prevDraft.career} / 행동:${prevDraft.behavior}

    [수정 요청 사항] 
    ${requestText}
  `;
};