import { GoogleGenAI, Type } from "@google/genai";
import { LevelData } from "../types";

// NO httpOptions — let SDK use default v1beta
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export function getFallbackLevel(): LevelData {
  console.warn("[Gemini] ⚠ Using FALLBACK level — Gemini API call failed. Check model name and API key.");
  return {
    width: 1280, height: 720,
    theme: {
      name: "Default", primaryColour: "#64748b", accentColour: "#3b82f6",
      skyTint: "#00000000", description: "A classic platformer level."
    },
    platforms: [
      { id:"f1", x:640,  y:706, width:1280, height:10, theme:"dirt_ground", angle:0, label: "Floor" },
      { id:"f2", x:200,  y:560, width:200,  height:10, theme:"stone_ledge", angle:0, label: "Ledge 1" },
      { id:"f3", x:480,  y:460, width:170,  height:10, theme:"stone_ledge", angle:-4, label: "Ledge 2" },
      { id:"f4", x:800,  y:510, width:180,  height:10, theme:"wooden_plank", angle:0, label: "Plank 1" },
      { id:"f5", x:310,  y:350, width:150,  height:10, theme:"rooftop", angle:3, label: "Roof 1" },
      { id:"f6", x:700,  y:300, width:190,  height:10, theme:"rooftop", angle:0, label: "Roof 2" },
      { id:"f7", x:1050, y:250, width:150,  height:10, theme:"metal_platform", angle:-2, label: "Metal 1" },
    ],
    walls: [],
    spawn: { x: 100, y: 660 },
    exit: { x: 1180, y: 200 }
  };
}

export async function generateLevelFromImage(base64Image: string, mimeType: string): Promise<LevelData> {
  console.log("[Gemini] Starting level generation...");

  const LEVEL_W = 1280;
  const LEVEL_H = 720;

  const prompt = `You are analysing a photograph to place platforms for a 2D platformer game.
Return NORMALISED coordinates (0.0–1.0). (0,0) = top-left. (1,1) = bottom-right.

══════════════════════════════════════════════
CRITICAL: HOW TO MEASURE SURFACE Y POSITION
══════════════════════════════════════════════
For every surface you find, you must report TWO y values:
  normY_top    = the y coordinate of the TOPMOST visible pixel of this surface
  normY_bottom = the y coordinate of the BOTTOMMOST visible pixel of this surface face

EXAMPLE — A kitchen countertop:
  The top edge of the counter (where objects sit) is at normY_top = 0.64
  The bottom edge of the counter face (where it meets the cabinets below) is at normY_bottom = 0.71
  The platform goes at normY_top = 0.64, NOT at the midpoint (0.675)

EXAMPLE — An overhead structural beam:
  Top edge visible at normY_top = 0.28
  Bottom edge of beam face at normY_bottom = 0.33
  Platform goes at normY_top = 0.28

SELF-CHECK before submitting each surface:
  Ask: "Is normY_top truly the highest pixel row of this object's visible face?"
  Ask: "Is normY_bottom truly the lowest pixel row of this object's visible face?"
  If normY_bottom - normY_top < 0.02, the surface is likely too thin to be real — reconsider.
  If normY_bottom - normY_top > 0.15, you may have included background — narrow the measurement.

══════════════════════════════════════════════
PERSPECTIVE CORRECTION
══════════════════════════════════════════════
Interior and architectural photos have strong perspective:
- Most real horizontal surfaces are within ±6° angle.
- Reduce apparent angle by 50–60% to correct for perspective distortion.
- Hard cap: ±18°. Foreground objects (normX < 0.15 or > 0.85): assign angle = 0°.
- DO NOT create platforms on perspective construction lines — only on real physical surfaces.
- DO NOT create platforms on reflections in glass, mirrors, or polished floors.

══════════════════════════════════════════════
SURFACE DETECTION — SCAN 4 BANDS
══════════════════════════════════════════════
BAND A (normY 0.00–0.25): Overhead beams, skylights, high ledges, roof edges, upper balconies.
BAND B (normY 0.25–0.50): Wall ledges, upper railings, window sills, beams, high shelves.
BAND C (normY 0.50–0.75): Countertops, tabletops, islands, stair treads, sofa backs.
  KEY: In kitchen/interior images, countertop top-edges are typically normY 0.60–0.72.
  The visual face of a counter extends BELOW the top edge — do not report the face midpoint.
BAND D (normY 0.75–1.00): Floor level, low elements.
  MANDATORY: normX=0.5, normY_top=0.97, normY_bottom=0.99, normWidth=1.0,
              angle=0, theme="dirt_ground", label="floor".

══════════════════════════════════════════════
OUTPUT RULES
══════════════════════════════════════════════
For each surface:
- normX: horizontal centre of the walkable portion
- normY_top: topmost pixel row of the surface face (THIS is used for platform position)
- normY_bottom: bottommost pixel row of the surface face (used for validation only)
- normWidth: length of walkable portion only — exclude occluded sections
- angle: perspective-corrected. Most interior surfaces: 0–6°. Ramps only: up to 18°.
- theme: stone_ledge | wooden_plank | metal_platform | rooftop | tree_branch | rock_outcrop | ice_shelf | dirt_ground | generic
- label: precise name, e.g. "kitchen island top", "left countertop section", "upper duct beam"

PRIORITY ORDER:
1. Real surfaces visible in the image (measure carefully with dual-edge method above)
2. Bridge platforms ONLY if a genuine traversal gap exists (normY gap > 0.22 OR normX gap > 0.21)
3. DO NOT add bridges if the level is completable without them

Spawn: normX=0.12, normY_top=0.93. Exit: normX>0.75, normY_top<0.38 on a real surface.
Total platforms: 6–12.

Return ONLY valid JSON. No explanation.`;

  const platformThemeEnum = [
    "stone_ledge","wooden_plank","metal_platform","rooftop",
    "tree_branch","rock_outcrop","ice_shelf","dirt_ground","generic"
  ];

  const normPlatformSchema = {
    type: Type.OBJECT,
    required: ["id", "normX", "normY_top", "normY_bottom", "normWidth", "angle", "theme", "label"],
    properties: {
      id:           { type: Type.STRING },
      normX:        { type: Type.NUMBER },
      normY_top:    { type: Type.NUMBER },
      normY_bottom: { type: Type.NUMBER },
      normWidth:    { type: Type.NUMBER },
      angle:        { type: Type.NUMBER },
      theme:        { type: Type.STRING, enum: platformThemeEnum },
      label:        { type: Type.STRING }
    }
  };

  const responseSchema = {
    type: Type.OBJECT,
    required: ["platforms","spawn","exit","theme"],
    properties: {
      theme: {
        type: Type.OBJECT,
        required: ["name","primaryColour","accentColour","skyTint","description"],
        properties: {
          name:          { type: Type.STRING },
          primaryColour: { type: Type.STRING },
          accentColour:  { type: Type.STRING },
          skyTint:       { type: Type.STRING },
          description:   { type: Type.STRING }
        }
      },
      platforms: { type: Type.ARRAY, items: normPlatformSchema },
      spawn: {
        type: Type.OBJECT, 
        required: ["normX","normY_top"],
        properties: { normX: { type: Type.NUMBER }, normY_top: { type: Type.NUMBER } }
      },
      exit: {
        type: Type.OBJECT, 
        required: ["normX","normY_top"],
        properties: { normX: { type: Type.NUMBER }, normY_top: { type: Type.NUMBER } }
      }
    }
  };

  const MODELS_TO_TRY = [
    "gemini-2.5-flash",          // stable alias, no date suffix
    "gemini-2.0-flash",          // previous working model
    "gemini-1.5-flash",          // reliable fallback
  ];

  let lastError: any;
  for (const modelName of MODELS_TO_TRY) {
    try {
      console.log(`[Gemini] Trying model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ inlineData: { data: base64Image, mimeType } }, { text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema
        }
      });

      const raw = JSON.parse(response.text || "{}");
      console.log(`[Gemini] Success with model: ${modelName}. Raw response:`, raw);

      const PLATFORM_HEIGHT_PX = 10;

      const platforms = (raw.platforms ?? []).map((p: any, i: number) => {
        const normYTop    = p.normY_top    ?? p.normY ?? 0.5;
        const normYBottom = p.normY_bottom ?? (normYTop + 0.05);

        // Validation: if bottom is above top (Gemini confused them), swap
        const validTop    = Math.min(normYTop, normYBottom);
        const validBottom = Math.max(normYTop, normYBottom);

        // Sanity-clamp: top edge must be the platform position
        const finalNormY = Math.min(Math.max(validTop, 0), 0.99);

        console.log(`  [${p.label ?? "?"}] normY_top=${normYTop.toFixed(3)} normY_bottom=${normYBottom.toFixed(3)} → y=${Math.round(finalNormY * LEVEL_H)}px`);

        return {
          id:        p.id ?? `p${i}`,
          x:         Math.round(p.normX     * LEVEL_W),
          y:         Math.round(finalNormY  * LEVEL_H),
          width:     Math.round(p.normWidth * LEVEL_W),
          height:    PLATFORM_HEIGHT_PX,
          angle:     p.angle ?? 0,
          theme:     p.theme ?? "generic",
          label:     p.label ?? "",
          normX:     p.normX,
          normY:     finalNormY,
          normWidth: p.normWidth,
        };
      });

      const levelData: LevelData = {
        width:  LEVEL_W,
        height: LEVEL_H,
        theme:  raw.theme,
        platforms,
        walls: [],
        spawn: {
          x: Math.round((raw.spawn?.normX     ?? 0.12) * LEVEL_W),
          y: Math.round((raw.spawn?.normY_top ?? 0.93) * LEVEL_H)
        },
        exit: {
          x: Math.round((raw.exit?.normX     ?? 0.88) * LEVEL_W),
          y: Math.round((raw.exit?.normY_top ?? 0.25) * LEVEL_H)
        }
      };

      return levelData;
    } catch (e: any) {
      console.warn(`[Gemini] Model ${modelName} failed:`, e?.message ?? e);
      lastError = e;
    }
  }

  console.error("[Gemini] All models failed:", lastError);
  throw lastError;
}
