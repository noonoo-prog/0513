import { GoogleGenAI, Type } from "@google/genai";

// API key is injected via vite.config.ts define block or env
const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

export interface AnalysisResult {
  features: string[];
  suggestedPrompt: string;
  explanation: string;
}

export async function analyzeImage(base64Image: string, mimeType: string, colorPreference?: string): Promise<AnalysisResult> {
  // Use gemini-2.0-flash for multimodal analysis as it's very reliable
  const model = "gemini-2.0-flash";
  
  const prompt = `
    Analyze this image and extract its core characteristics for creating a minimalist symbol.
    Focus on:
    1. Key visual elements (shapes, subjects).
    2. Dominant colors (if colorPreference is 'original').
    3. Mood or vibe.
    
    Color Requirement: ${colorPreference && colorPreference !== 'original' ? `Use ${colorPreference} color palette strictly.` : 'Extract and use dominant colors from the original image.'}
    
    Then, suggest a specific, detailed image generation prompt to create a "minimalist, vector-style flat design symbol" based on these traits.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { data: base64Image.split(",")[1], mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            features: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of key visual characteristics"
            },
            suggestedPrompt: {
              type: Type.STRING,
              description: "The prompt for image generation"
            },
            explanation: {
              type: Type.STRING,
              description: "Explanation of the symbol design concept"
            }
          },
          required: ["features", "suggestedPrompt", "explanation"]
        }
      }
    });

    const text = response.text || "";
    return JSON.parse(text);
  } catch (error) {
    console.error("Analysis Error:", error);
    if (error instanceof Error && error.message.includes("API_KEY_INVALID")) {
      throw new Error("API 키가 올바르지 않습니다. 설정에서 API 키를 확인해주세요.");
    }
    throw new Error(`이미지 분석 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
  }
}

export async function generateSymbol(prompt: string): Promise<string> {
  const model = "gemini-2.5-flash-image";
  
  const finalPrompt = `${prompt}. Minimalist flat vector symbol, solid white background, clean lines, professional logo style, high quality, centered composition.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [{ text: finalPrompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    let imageUrl = "";
    if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageUrl) {
      throw new Error("이미지 데이터를 생성하지 못했습니다.");
    }

    return imageUrl;
  } catch (error) {
    console.error("Generation Error:", error);
    throw new Error(`심볼 생성 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
  }
}
