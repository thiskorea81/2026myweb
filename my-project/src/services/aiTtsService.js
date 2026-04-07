import { GoogleGenAI } from "@google/genai";

// 💡 선생님께서 제공해주신 API 키 적용 (보안을 위해 추후 .env 파일로 이동을 권장합니다)
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const TTS_MODEL_NAME = "gemini-2.5-flash-preview-tts";

const ai = new GoogleGenAI({ apiKey: API_KEY });

// 브라우저 재생 및 다운로드를 위한 WAV 헤더 포장 함수
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

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); 
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const pcmArray = new Uint8Array(buffer, 44);
  pcmArray.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
}

export const aiTtsService = {
  async generateSpeechBlob(text) {
    try {
      const response = await ai.models.generateContent({
        model: TTS_MODEL_NAME,
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Data) throw new Error("음성 데이터가 없습니다.");

      // Base64 -> Uint8Array
      const byteChars = atob(base64Data);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const pcmByteArray = new Uint8Array(byteNumbers);
      
      // WAV Blob 반환
      return createWavBlob(pcmByteArray);
    } catch (error) {
      console.error("TTS 생성 실패:", error);
      throw error;
    }
  }
};