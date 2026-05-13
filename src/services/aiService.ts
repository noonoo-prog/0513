import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AnalysisResult {
  features: string[];
  suggestedPrompt: string;
  explanation: string;
}

export async function analyzeImage(base64Image: string, mimeType: string): Promise<AnalysisResult> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze this image and extract its core characteristics for creating a minimalist symbol.
    Focus on:
    1. Key visual elements (shapes, subjects).
    2. Dominant colors.
    3. Mood or vibe.
    
    Then, suggest a specific, detailed image generation prompt to create a "minimalist, vector-style flat design symbol" based on these traits.
    
    Return the response in JSON format with:
    {
      "features": ["feature 1", "feature 2"],
      "suggestedPrompt": "The prompt for generation",
      "explanation": "Why this symbol represents the image"
    }
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { inlineData: { data: base64Image.split(",")[1], mimeType } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function generateSymbol(prompt: string): Promise<string> {
  const model = "gemini-2.5-flash-image";
  
  const finalPrompt = `${prompt}. Minimalist flat vector symbol, solid background, clean lines, professional logo style, high quality, 1k resolution.`;

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
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      imageUrl = `data:image/png;base64,${part.inlineData.data}`;
      break;
    }
  }

  if (!imageUrl) {
    throw new Error("Failed to generate image part");
  }

  return imageUrl;
}
