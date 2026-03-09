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
    // 최신 방식은 생성자 인자로 객체를 받습니다.
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
};

export const aiService = {
  /**
   * 1. 일반 텍스트 응답 (최신 ai.models 방식)
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
   * 2. 구조화된 데이터 응답 (최신 ai.models + Zod 스키마)
   */
  async askStructured(prompt, schema) {
    try {
      const ai = getAiClient();
      
      // 💡 최신 규격: generateContent 호출 시 config 내에 스키마 주입
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: zodToJsonSchema(schema)
        }
      });

      // AI의 응답 텍스트 (JSON 문자열)
      const rawText = response.text;
      console.log("🤖 AI Raw Response:", rawText);

      // JSON 파싱 후 Zod로 최종 검증
      const jsonResponse = JSON.parse(rawText);
      return schema.parse(jsonResponse);
      
    } catch (error) {
      // ZodError 발생 시 상세 내용을 콘솔에 찍어 디버깅을 돕습니다.
      if (error.name === "ZodError") {
        console.error("❌ 데이터 구조 검증 실패 (ZodError):", error.errors);
      }
      console.error("AI 구조화 데이터 요청 실패:", error);
      throw error;
    }
  }
};