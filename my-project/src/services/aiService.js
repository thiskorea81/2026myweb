import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

let aiClient = null;
const MODEL_NAME = "gemini-3-flash-preview"; 
const TTS_MODEL_NAME = "gemini-2.5-flash-preview-tts"; 

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

// 💡 [추가] 날것의 소리 데이터(PCM)를 브라우저가 재생할 수 있는 WAV 파일로 포장해주는 함수
function createWavBlob(pcmData) {
  const numChannels = 1;
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // WAV 헤더(머리말) 작성 (44 Bytes)
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // 헤더 뒤에 실제 소리 데이터 이어붙이기
  const pcmArray = new Uint8Array(buffer, 44);
  pcmArray.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
}

export const aiService = {
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

  // 💡 스키마를 실제 JSON Schema로 바꿀 때는 zod v4에 내장된 z.toJSONSchema()를 쓴다.
  // (구버전에 쓰던 zod-to-json-schema 패키지는 zod v4 스키마 내부 구조를 이해하지 못해서
  //  껍데기만 있는 빈 스키마를 만들어냈다 - Gemini에게 필드 제약을 사실상 전달 못 하고
  //  있었던 셈. 프롬프트 문구로만 형식을 강제하던 것에서 실제 스키마 제약을 받게 됨.)
  async askStructured(prompt, schema) {
    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(schema)
        }
      });

      const rawText = response.text.trim();
      let jsonData = JSON.parse(rawText);

      if (Array.isArray(jsonData)) {
        jsonData = jsonData[0]; 
      }
      return schema.parse(jsonData);
      
    } catch (error) {
      if (error.name === "ZodError") {
        console.error("❌ 데이터 구조 검증 실패 (ZodError):", error.errors);
      }
      console.error("AI 구조화 데이터 요청 실패:", error);
      throw error;
    }
  },

  // 💡 여러 항목(예: 학생 여러 명)을 한 번의 요청으로 처리해 JSON 배열로 돌려받음.
  // askStructured는 응답이 배열이면 첫 원소만 취하는 단일 객체용이라, 배열 자체가
  // 결과인 배치 처리에는 이 함수를 쓴다 (학생 수만큼 순차 호출하는 것을 피하기 위함).
  async askStructuredArray(prompt, itemSchema) {
    const arraySchema = z.array(itemSchema);
    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(arraySchema)
        }
      });

      const rawText = response.text.trim();
      const jsonData = JSON.parse(rawText);
      const arrayData = Array.isArray(jsonData) ? jsonData : [jsonData];
      return arraySchema.parse(arrayData);

    } catch (error) {
      if (error.name === "ZodError") {
        console.error("❌ 데이터 구조 검증 실패 (ZodError):", error.errors);
      }
      console.error("AI 배치 구조화 데이터 요청 실패:", error);
      throw error;
    }
  },

  async generateSpeech(text) {
    try {
      const ai = getAiClient();
      
      console.log("🎙️ AI 낭독 요청 시작...");

      const response = await ai.models.generateContent({
        model: TTS_MODEL_NAME,
        contents: `다음 공지사항을 밝고 명확한 아나운서 톤으로 읽어주세요:\n${text}`,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' }, 
            },
          },
        },
      });

      const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      
      if (!inlineData || !inlineData.data) {
        throw new Error("API에서 음성 데이터를 반환하지 않았습니다.");
      }

      // Base64 문자열을 디코딩하여 Uint8Array(바이트 배열)로 변환
      const byteChars = atob(inlineData.data);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const pcmByteArray = new Uint8Array(byteNumbers);
      
      // 💡 [핵심 해결] 날것의 PCM 데이터에 WAV 헤더를 씌워서 재생 가능한 Blob 생성
      const audioBlob = createWavBlob(pcmByteArray);
      
      console.log("✅ AI 낭독 오디오 파일(WAV) 생성 및 헤더 포장 완료!");
      
      return URL.createObjectURL(audioBlob);

    } catch (error) {
      console.error("❌ TTS 음성 생성 에러 상세내용:", error);
      throw error;
    }
  }
};