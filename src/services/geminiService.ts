import { GoogleGenAI, Type } from "@google/genai";
import { LevelData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export function getFallbackLevel(): LevelData {
  console.warn("Using fallback level data");
  return {
    width: 1280,
    height: 720,
    platforms: [
      { id: "f1", x: 640, y: 700, width: 1200, height: 40 },
      { id: "f2", x: 300, y: 550, width: 200, height: 20 },
      { id: "f3", x: 900, y: 550, width: 200, height: 20 },
      { id: "f4", x: 640, y: 400, width: 300, height: 20 },
      { id: "f5", x: 300, y: 250, width: 200, height: 20 },
      { id: "f6", x: 900, y: 250, width: 200, height: 20 },
    ],
    walls: [],
    spawn: { x: 100, y: 650 },
    exit: { x: 1180, y: 200 }
  };
}

export async function generateLevelFromImage(base64Image: string, mimeType: string): Promise<LevelData> {
  console.log("Gemini: Starting level generation for image...", { mimeType });
  const model = "gemini-3-flash-preview";
  
  const prompt = `Analyze this image as a 2D platformer. 
Identify large structural elements (floors, shelves, ledges). 
Ignore small objects and details.

COORDINATES:
- Scale width to 1280. Calculate height to match aspect ratio.
- (0,0) is TOP LEFT.
- x, y for platforms/walls must be the CENTER of the object.

REQUIREMENTS:
- "platforms": Array of {id, x, y, width, height}. 
- "walls": Vertical obstacles.
- "spawn": A safe spot {x, y} at the bottom of the level, on top of a platform.
- "exit": A destination {x, y} at the top or far side of the level.

The level must be traversable. If gaps are too big ( >300px), add small bridge platforms.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        {
          parts: [
            { inlineData: { data: base64Image, mimeType: mimeType } },
            { text: prompt }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            width: { type: Type.NUMBER },
            height: { type: Type.NUMBER },
            platforms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER }
                },
                required: ["x", "y", "width", "height"]
              }
            },
            walls: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER }
                },
                required: ["x", "y", "width", "height"]
              }
            },
            spawn: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER }
              },
              required: ["x", "y"]
            },
            exit: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER }
              },
              required: ["x", "y"]
            }
          },
          required: ["width", "height", "platforms", "walls", "spawn", "exit"]
        }
      }
    });

    console.log("Gemini: Raw response received.");
    const levelData = JSON.parse(response.text || "{}") as LevelData;
    console.log("Gemini: Parsed level data successfully:", levelData);
    return levelData;
  } catch (error) {
    console.error("Gemini: Error generating level:", error);
    throw error;
  }
}
