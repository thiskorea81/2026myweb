import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";

// 💡 전역 변수 선언
let aiClient = null;
const MODEL_NAME = "gemini-3-flash-preview"; 

/**
 * 💡 최신 용법에 맞게 AI 클라이언트를 생성하는 함수
 */
const getAiClient = () => {
  if (!aiClient) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
      const errorMsg = "🚨 [에러] .env 파일에 VITE_GEMINI_API_KEY가 없습니다. 서버를 재시작하세요.";
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    // 최신 용법: API 키를 객체에 담아 전달
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
};

export const aiService = {
  /**
   * 1. 일반 텍스트 응답 (최신 용법 적용)
   */
  async askText(prompt) {
    try {
      const ai = getAiClient();
      // 💡 최신 방식: ai.models.generateContent 사용
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
      });
      
      return response.text;
    } catch (error) {
      console.error("AI 텍스트 요청 실패:", error);
      throw error;
    }
  },

  /**
   * 2. 구조화된 데이터 응답 (최신 용법 + JSON 스키마)
   */
  async askStructured(prompt, schema) {
    try {
      const ai = getAiClient();
      // 💡 최신 방식의 구조화된 데이터 요청
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: zodToJsonSchema(schema),
        },
      });

      // Zod 파싱 및 검증
      return schema.parse(JSON.parse(response.text));
    } catch (error) {
      console.error("AI 구조화 데이터 요청 실패:", error);
      throw error;
    }
  }
};