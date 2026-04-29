import { GoogleGenAI, Type } from "@google/genai";
import { LevelData } from "../types";
import { detectHorizontalEdges, DetectedLine } from "../utils/edgeDetection";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const LEVEL_W = 1280;
const LEVEL_H = 720;
const PLATFORM_HEIGHT_PX = 10;

export function getFallbackLevel(): LevelData {
  console.warn("[Gemini] ⚠ Using FALLBACK level — Gemini API call failed.");
  return {
    width: LEVEL_W, height: LEVEL_H,
    theme: {
      name: "Default", primaryColour: "#64748b", accentColour: "#3b82f6",
      skyTint: "#00000000", description: "A classic platformer level."
    },
    platforms: [
      { id:"f1", x:640,  y:706, width:1280, height:10, theme:"dirt_ground", angle:0, label:"Floor" },
      { id:"f2", x:200,  y:560, width:200,  height:10, theme:"stone_ledge", angle:0, label:"Ledge 1" },
      { id:"f3", x:480,  y:460, width:170,  height:10, theme:"stone_ledge", angle:-4, label:"Ledge 2" },
      { id:"f4", x:800,  y:510, width:180,  height:10, theme:"wooden_plank", angle:0, label:"Plank 1" },
      { id:"f5", x:310,  y:350, width:150,  height:10, theme:"rooftop", angle:3, label:"Roof 1" },
      { id:"f6", x:700,  y:300, width:190,  height:10, theme:"rooftop", angle:0, label:"Roof 2" },
      { id:"f7", x:1050, y:250, width:150,  height:10, theme:"metal_platform", angle:-2, label:"Metal 1" },
    ],
    walls: [],
    spawn: { x: 100, y: 660 },
    exit: { x: 1180, y: 200 }
  };
}

export async function generateLevelFromImage(
  base64Image: string,
  mimeType: string,
  imageDataUrl: string
): Promise<LevelData> {
  console.log("[Gemini] Starting hybrid edge-detect + classify pipeline...");

  // ── Stage 1: Client-side edge detection (pixel-accurate) ────────────────
  let detectedLines: DetectedLine[] = [];
  try {
    detectedLines = await detectHorizontalEdges(imageDataUrl);
    console.log(`[EdgeDetect] ${detectedLines.length} candidate lines found`);
  } catch (e) {
    console.warn("[EdgeDetect] Failed, will fall back to Gemini-only mode:", e);
  }

  // ── Stage 2: Ask Gemini to classify the detected lines ───────────────────
  const lineListForPrompt = detectedLines
    .slice(0, 25) 
    .map((l, i) => ({
      id: `line_${i}`,
      normX: +l.normX.toFixed(3),
      normY: +l.normY.toFixed(3),
      normWidth: +l.normWidth.toFixed(3),
      strength: +l.strength.toFixed(2)
    }));

  const prompt = `You are analysing a photograph to extract platform positions for a 2D platformer.
Return NORMALISED coordinates (0.0–1.0 fractions of image dimensions).

══════════════════════════════════════════════
ANGLES ARE CRITICAL — READ THIS CAREFULLY
══════════════════════════════════════════════
Every platform MUST have an accurate angle. Do not default to 0 unless the surface is
genuinely perfectly horizontal.

How to calculate angle:
- A surface rising from left to right (left side lower): negative angle, e.g. -8°
- A surface falling from left to right (right side lower): positive angle, e.g. +8°
- A perfectly flat horizontal surface: 0°

Real-world examples:
- A sloped roof angling upward left-to-right: angle = -15° to -25°
- A staircase handrail: angle = -20° to -35°
- A countertop with slight perspective tilt: angle = -2° to +2°
- A table seen from slight angle: angle = 0° to -4°
- A diagonal architectural beam: angle = -10° to -20°

After perspective correction (reduce apparent angle by 40%), typical surface angles:
- Flat countertops, desks, shelves: ±0–3°
- Sloped roofs: ±8–18°
- Ramps and stair treads: ±10–25°
- Slight perspective tilt on foreground surfaces: ±2–5°

══════════════════════════════════════════════
PLATFORM WIDTH RULES
══════════════════════════════════════════════
normWidth represents ONE SECTION of a surface, not the full length.
- Typical platform section: 0.08 to 0.16 (100–200px)
- Maximum for any single platform: 0.18 (230px)
- A long surface spanning half the image MUST be split into 2–3 sections
- Each section has its own normX centre and normWidth
- Small isolated surfaces (sofa arm, lamp hood, single step): 0.05–0.09

══════════════════════════════════════════════
PERSPECTIVE CORRECTION
══════════════════════════════════════════════
- normY = TOP EDGE of the surface (where an object rests), not the visual midpoint
- Reduce apparent angle by 40% for perspective correction
- Foreground surfaces (normX < 0.15 or > 0.85): typically ±0–3° after correction

══════════════════════════════════════════════
SURFACE DETECTION — SCAN 4 BANDS
══════════════════════════════════════════════
BAND A — normY 0.00–0.25:
ONLY structural ledges or balcony floors with a flat top a person can stand on.
EXCLUDE ALL: ceilings, skylight frames, light fittings, overhead beams, glass, partitions.

BAND B — normY 0.25–0.50:
Ledges, upper railings, balcony floors, beams with a clear flat TOP, mid-level shelves.
EXCLUDE: glass partition frames, mirror reflections, vertical window mullions.

BAND C — normY 0.50–0.75:
Countertops, tabletops, islands, stair treads, sofa/chair tops, desks.

BAND D — normY 0.75–1.00:
Floor level elements. ALWAYS include:
normX=0.5, normY=0.97, normWidth=1.0, angle=0, theme="dirt_ground", label="floor".

══════════════════════════════════════════════
EXCLUSION RULES
══════════════════════════════════════════════
NEVER create platforms on:
- Glass, windows, transparent partitions or their frames
- Reflections or mirror images of surfaces
- Vertical surfaces (walls, columns) — these have no flat top
- The human body or clothing (arms, shoulders, heads)
- Ceiling surfaces of any kind
- Drawn/rendered construction lines that are not physical objects
- X-shaped cross-beams, diagonal structural bracing, scissor trusses — these form
  crosses or X patterns and have no flat walkable top. Exclude entirely.
- Any surface with an apparent angle steeper than ±30° is not walkable. Exclude it.
- Decorative timber beams or steel rods that are clearly ornamental, not floor-level.

If the image is a close-up (person's face fills frame, food fills frame, object fills frame):
- Focus on the actual physical edges visible: table rim, tray edge, desk surface
- Always include the floor at normY=0.97

══════════════════════════════════════════════
TRAVERSABILITY CHECK (do this carefully)
══════════════════════════════════════════════
Spawn: normX=0.12, normY=0.93. Exit: normX>0.70, normY<0.42, on a real surface.

Simulate a player jumping from spawn toward the exit. Check BOTH conditions for each jump:
1. Vertical gap: normY difference between consecutive platforms must be ≤ 0.17
2. Horizontal gap: normX distance between platform EDGES (not centres) must be ≤ 0.19
   Platform edge = normX ± normWidth/2

If either condition fails for any step in the path, insert a bridge at:
  normX = midpoint between the two platforms
  normY = midpoint normY minus 0.05 (slightly above the gap midpoint)
  normWidth = 0.08, theme="generic", label="bridge"

Also ensure platforms are NOT all at the same normY. The path from spawn to exit must
include at least 3 distinct height levels. If all detected surfaces are within 0.08 normY
of each other, add bridge platforms at intermediate heights to create a stepping-stone path.

DO NOT add more than 2 bridge platforms total. If the level needs more than 2 bridges
to be completable, re-examine your surface selection and pick better-spaced platforms.

Return ONLY valid JSON. No explanation.`;

  const platformThemeEnum = [
    "stone_ledge","wooden_plank","metal_platform","rooftop",
    "tree_branch","rock_outcrop","ice_shelf","dirt_ground","generic"
  ];

  const normPlatformSchema = {
    type: Type.OBJECT,
    required: ["id", "normX", "normY", "normWidth", "theme", "label"],
    properties: {
      id: { type: Type.STRING },
      normX: { type: Type.NUMBER },
      normY: { type: Type.NUMBER },
      normWidth: { type: Type.NUMBER },
      angle: { type: Type.NUMBER, description: "Degrees, e.g. -15 or 5.5" },
      theme: { 
        type: Type.STRING,
        description: "The visual theme of the platform: stone_ledge, wooden_plank, metal_platform, rooftop, tree_branch, rock_outcrop, ice_shelf, dirt_ground, or generic."
      },
      label: { type: Type.STRING }
    }
  };

  const responseSchema = {
    type: Type.OBJECT,
    required: ["platforms", "spawn", "exit", "theme"],
    properties: {
      theme: {
        type: Type.OBJECT,
        required: ["name", "primaryColour", "accentColour", "skyTint", "description"],
        properties: {
          name: { type: Type.STRING },
          primaryColour: { type: Type.STRING },
          accentColour: { type: Type.STRING },
          skyTint: { type: Type.STRING },
          description: { type: Type.STRING }
        }
      },
      platforms: { type: Type.ARRAY, items: normPlatformSchema },
      spawn: {
        type: Type.OBJECT,
        required: ["normX", "normY"],
        properties: { normX: { type: Type.NUMBER }, normY: { type: Type.NUMBER } }
      },
      exit: {
        type: Type.OBJECT,
        required: ["normX", "normY"],
        properties: { normX: { type: Type.NUMBER }, normY: { type: Type.NUMBER } }
      }
    }
  };

  const MODELS_TO_TRY = [
    "gemini-3-flash-preview",
    "gemini-flash-latest",
    "gemini-2.0-flash", // Adding back as fallback
  ];

  let raw: any = null;
  for (const modelName of MODELS_TO_TRY) {
    try {
      console.log(`[Gemini] Trying model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            { inlineData: { data: base64Image, mimeType } },
            { text: prompt }
          ]
        },
        config: { 
          // @ts-ignore
          responseMimeType: "application/json", 
          responseSchema 
        }
      });

      if (!response.text) {
        throw new Error("Empty response text");
      }

      raw = JSON.parse(response.text);
      console.log(`[Gemini] ✓ Success with model: ${modelName}`);
      break;
    } catch (e: any) {
      console.warn(`[Gemini] Model ${modelName} failed:`, e?.message ?? String(e));
      // Continue to next model
    }
  }

  if (!raw) {
    const errorMsg = "[Gemini] All models failed to generate valid content. This might be due to API key issues, model availability, or safety filters.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // ── Stage 3: Convert to pixel coords + enforce hard limits in code ───────
  const MAX_PLATFORM_PX = Math.round(0.18 * LEVEL_W); // 230px max — enforced in code

  const platforms = (raw.platforms ?? []).map((p: any, i: number) => {
    const isGround = p.theme === "dirt_ground";
    return {
      id:        p.id ?? `p${i}`,
      x:         Math.round((p.normX     ?? 0.5)  * LEVEL_W),
      y:         Math.round((p.normY     ?? 0.5)  * LEVEL_H),
      width:     isGround 
                   ? LEVEL_W 
                   : Math.min(Math.round((p.normWidth ?? 0.15) * LEVEL_W), MAX_PLATFORM_PX),
      height:    PLATFORM_HEIGHT_PX,
      angle:     typeof p.angle === "number" ? parseFloat(p.angle.toFixed(1)) : 0,
      theme:     p.theme  ?? "generic",
      label:     p.label  ?? "",
      normX:     p.normX,
      normY:     p.normY,
      normWidth: p.normWidth,
    };
  });

  // Deduplicate platforms that overlap >50% at the same elevation
  const deduped: typeof platforms = [];
  for (const p of platforms) {
    const pL = p.x - p.width / 2, pR = p.x + p.width / 2;
    const conflict = deduped.find(e => {
      if (Math.abs(e.y - p.y) > 18) return false;
      const overlap = Math.max(0, Math.min(pR, e.x + e.width/2) - Math.max(pL, e.x - e.width/2));
      return overlap / Math.min(p.width, e.width) > 0.5;
    });
    if (!conflict) {
      deduped.push(p);
    }
  }

  // ── Enforce minimum horizontal gap between same-height platforms ─────────
  // Player physics body is 30px wide — gap must be larger than this
  const MIN_GAP_PX = 48;

  for (let i = 0; i < deduped.length; i++) {
    for (let j = i + 1; j < deduped.length; j++) {
      const a = deduped[i];
      const b = deduped[j];
      // Skip floor and platforms at clearly different heights
      if (a.theme === "dirt_ground" || b.theme === "dirt_ground") continue;
      if (Math.abs(a.y - b.y) > 30) continue;

      // Identify left and right platform by centre x
      const left  = a.x <= b.x ? a : b;
      const right = a.x <= b.x ? b : a;

      const leftRightEdge  = left.x  + left.width  / 2;  // right edge of left platform
      const rightLeftEdge  = right.x - right.width / 2;  // left edge of right platform
      const gap = rightLeftEdge - leftRightEdge;

      if (gap < MIN_GAP_PX) {
        const deficit  = MIN_GAP_PX - gap;
        const trimEach = Math.ceil(deficit / 2) + 2;  // extra 2px buffer

        // Trim left platform's right edge — keep left edge fixed
        const leftFixedL  = left.x - left.width / 2;
        left.width  = Math.max(20, left.width - trimEach);
        left.x      = leftFixedL + left.width / 2;

        // Trim right platform's left edge — keep right edge fixed
        const rightFixedR = right.x + right.width / 2;
        right.width = Math.max(20, right.width - trimEach);
        right.x     = rightFixedR - right.width / 2;

        console.log(
          `[Gemini] Gap enforced: "${left.label}" ↔ "${right.label}" ` +
          `(was ${gap.toFixed(0)}px → ${MIN_GAP_PX}px)`
        );
      }
    }
  }

  // ── Unconditional floor guarantee ────────────────────────────────────────
  // Always ensure a ground platform exists.
  const hasFloor = deduped.some(p => p.theme === "dirt_ground");
  if (!hasFloor) {
    console.warn("[Gemini] No floor found — injecting guaranteed ground platform");
    deduped.push({
      id: "guaranteed_floor",
      x: LEVEL_W / 2,
      y: Math.round(0.97 * LEVEL_H),
      width: LEVEL_W,
      height: PLATFORM_HEIGHT_PX,
      angle: 0,
      theme: "dirt_ground",
      label: "floor",
      normX: 0.5,
      normY: 0.97,
      normWidth: 1.0,
    });
  }

  console.log(`[Gemini] Final platforms: ${deduped.length}`);
  deduped.forEach(p => console.log(`  [${p.label}] x=${p.x} y=${p.y} w=${p.width} angle=${p.angle}`));

  return {
    width: LEVEL_W, height: LEVEL_H,
    theme: raw.theme,
    platforms: deduped,
    walls: [],
    spawn: {
      x: Math.round((raw.spawn?.normX ?? 0.12) * LEVEL_W),
      y: Math.round((raw.spawn?.normY ?? 0.93) * LEVEL_H)
    },
    exit: {
      x: Math.round((raw.exit?.normX ?? 0.88) * LEVEL_W),
      y: Math.round((raw.exit?.normY ?? 0.25) * LEVEL_H)
    }
  };
}
