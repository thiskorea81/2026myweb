import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";

let aiClient = null;
const MODEL_NAME = "gemini-3-flash-preview"; 

/**
 * 최신 SDK 규격에 맞는 클라이언트 초기화
 */
const getAiClient = () => {
  if (!aiClient) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      const errorMsg = "🚨 [에러] .env 파일의 VITE_GEMINI_API_KEY를 확인하세요.";
      alert(errorMsg);
      throw new Error(errorMsg);
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
};

export const aiService = {
  /**
   * 1. 일반 텍스트 응답
   */
  async askText(prompt) {
    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt
      });
      
      return response.text;
    } catch (error) {
      console.error("AI 텍스트 요청 실패:", error);
      throw error;
    }
  },

  /**
   * 2. 구조화된 데이터 응답 (에러 방어 로직 추가)
   */
  async askStructured(prompt, schema) {
    try {
      const ai = getAiClient();
      
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: zodToJsonSchema(schema)
        }
      });

      // 💡 [수정] trim()을 추가하여 앞뒤 공백으로 인한 파싱 에러 방지
      const rawText = response.text.trim();
      console.log("🤖 AI Raw Response:", rawText);

      // 💡 [추가] 1차 파싱 실행
      let jsonData = JSON.parse(rawText);

      /**
       * 💡 [핵심 추가: 배열 응답 방어 로직]
       * AI가 가끔 응답을 [{...}] 처럼 배열로 감싸서 보낼 때가 있습니다.
       * Zod는 단일 객체({})를 기다리므로, 배열일 경우 첫 번째 항목만 꺼내줍니다.
       */
      if (Array.isArray(jsonData)) {
        console.warn("⚠️ AI가 리스트(Array) 형태로 응답하여 첫 번째 항목을 추출합니다.");
        jsonData = jsonData[0]; // 배열의 첫 번째 객체만 선택
      }

      // 💡 [수정] 가공된 jsonData를 Zod 스키마로 최종 검증
      return schema.parse(jsonData);
      
    } catch (error) {
      // 💡 [추가] 디버깅을 위해 ZodError 상세 내용 출력
      if (error.name === "ZodError") {
        console.error("❌ 데이터 구조 검증 실패 (ZodError):", error.errors);
      }
      console.error("AI 구조화 데이터 요청 실패:", error);
      throw error;
    }
  }
};