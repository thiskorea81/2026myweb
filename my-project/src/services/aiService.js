import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";

// 💡 전역 변수로 선언하되 초기화는 하지 않습니다.
let genAI = null;
const MODEL_NAME = "gemini-3-flash-preview"; 

/**
 * API 키를 확인하고 인스턴스를 반환하는 내부 함수
 */
const getGenAI = () => {
  if (!genAI) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("VITE_GEMINI_API_KEY is not defined in .env file");
    }
    genAI = new GoogleGenAI(apiKey);
  }
  return genAI;
};

export const aiService = {
  /**
   * 1. 일반 텍스트 응답
   */
  async askText(prompt) {
    try {
      const model = getGenAI().getGenerativeModel({ model: MODEL_NAME });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error("AI 텍스트 요청 실패:", error);
      throw error;
    }
  },

  /**
   * 2. 구조화된 데이터 응답 (최신 방식)
   */
  async askStructured(prompt, schema) {
    try {
      const model = getGenAI().getGenerativeModel({ 
        model: MODEL_NAME,
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: zodToJsonSchema(schema),
        }
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      
      // JSON 파싱 전 AI 응답 확인 및 Zod 검증
      return schema.parse(JSON.parse(text));
    } catch (error) {
      console.error("AI 구조화 데이터 요청 실패:", error);
      throw error;
    }
  }
};