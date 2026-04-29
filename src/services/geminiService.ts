import { GoogleGenAI, Type } from "@google/genai";
import { LevelData } from "../types";

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

  // Gemini returns normalised 0–1 coordinates; we convert to pixels after
  const LEVEL_W = 1280;
  const LEVEL_H = 720;

  const prompt = `You are analysing a photograph to extract platform positions for a 2D platformer.
Return NORMALISED coordinates (0.0–1.0 fractions of image dimensions).

══════════════════════════════════════════════
PERSPECTIVE CORRECTION — READ THIS FIRST
══════════════════════════════════════════════
Many photos have perspective distortion — surfaces that are actually horizontal appear to angle
upward or downward because of the camera viewpoint. You must correct for this:

- If a surface appears to slope upward toward the centre of the image (converging perspective),
  its TRUE angle is closer to 0° than it appears. Reduce your angle estimate by 30–50%.
- The normY of a surface is the position of its TOP EDGE, not its visual midpoint.
  For a countertop, normY is where a glass sitting on it would touch — not the middle of the
  counter's visible face.
- Interior photos (rooms, lobbies) almost always have strong perspective. Be conservative with
  angle values — most real horizontal surfaces are within ±8° even if they look more tilted.
- For surfaces in the FOREGROUND (normX near 0.0 or 1.0, or normY > 0.6), perspective
  distortion is strongest. These surfaces tend to appear much steeper than they are.

══════════════════════════════════════════════
SURFACE DETECTION — SCAN IN 4 BANDS
══════════════════════════════════════════════

Work through the image band by band. For each band, list every flat/near-flat surface visible.

BAND A — normY 0.00–0.25 (top quarter):
Ceilings, overhead beams, skylights, high ledges, roof edges, upper balconies.

BAND B — normY 0.25–0.50 (upper-mid):
Wall ledges, upper railings, window sills, structural beams, upper balcony floors, mid-level shelves.

BAND C — normY 0.50–0.75 (lower-mid):
Countertops, worktops, tabletops, islands, stair treads, sofa backs, desk surfaces.
IMPORTANT: For perspective-heavy interior shots, countertops that appear to angle sharply
toward the vanishing point should be assigned angle = 0 or ±3°, not ±15°.

BAND D — normY 0.75–1.00 (bottom quarter):
Floor level, low platforms, ground elements.
ALWAYS include: normX=0.5, normY=0.98, normWidth=1.0, angle=0, theme="dirt_ground", label="floor".

══════════════════════════════════════════════
COMMON MISTAKES TO AVOID
══════════════════════════════════════════════
- DO NOT place platforms on reflections in glass or mirrors — only on the real physical surface.
- DO NOT place platforms on perspective construction lines or drawn lines that aren't real edges.
- DO NOT place platforms on the underside of a surface — only on the TOP where something could rest.
- If a surface is partially obscured by another object, estimate only the visible walkable portion.
- Ceiling surfaces are NOT platforms (player can't stand on them) unless the game specifically supports it.
- When in doubt about whether a surface is real vs reflected/drawn, omit it rather than guess.
- normY must be the TOP EDGE of the surface — not its visual centre, not its bottom edge.
  A countertop at 74% down the image has normY ≈ 0.74, not 0.77 or 0.70.

══════════════════════════════════════════════
PER-SURFACE OUTPUT
══════════════════════════════════════════════
For each surface provide:
- normX: horizontal centre (0=left, 1=right)
- normY: TOP EDGE of the walkable surface (the contact point, not visual midpoint)
- normWidth: length of walkable portion only (exclude parts hidden behind other objects)
- angle: corrected tilt in degrees. Positive = right side lower. APPLY PERSPECTIVE CORRECTION.
  Hard cap: ±20°. Typical interior surface: ±5°. Only use >10° for genuinely steep ramps.
- theme: stone_ledge | wooden_plank | metal_platform | rooftop | tree_branch | rock_outcrop | ice_shelf | dirt_ground | generic
- label: concise description, e.g. "left countertop section", "upper mezzanine floor", "stair tread mid"

══════════════════════════════════════════════
TRAVERSABILITY (check after listing all surfaces)
══════════════════════════════════════════════
Verify a path exists from spawn (normX=0.12, normY=0.93) to exit (normX>0.75, normY<0.38).
Max vertical gap between consecutive platforms: normY difference > 0.22 needs a bridge.
Max horizontal gap: normX gap > 0.21 needs a bridge.
Add bridge platforms ONLY where gaps exist. Use theme="generic", label="bridge", normWidth=0.09.
DO NOT add bridges if the level is already completable without them.

Return ONLY valid JSON. No explanation text.`;

  const platformThemeEnum = [
    "stone_ledge","wooden_plank","metal_platform","rooftop",
    "tree_branch","rock_outcrop","ice_shelf","dirt_ground","generic"
  ];

  // Schema uses normalised fields
  const normPlatformSchema = {
    type: Type.OBJECT,
    required: ["id","normX","normY","normWidth","angle","theme","label"],
    properties: {
      id:        { type: Type.STRING },
      normX:     { type: Type.NUMBER },
      normY:     { type: Type.NUMBER },
      normWidth: { type: Type.NUMBER },
      angle:     { type: Type.NUMBER },
      theme:     { type: Type.STRING, enum: platformThemeEnum },
      label:     { type: Type.STRING }
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: [{ parts: [{ inlineData: { data: base64Image, mimeType } }, { text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
              type: Type.OBJECT, required: ["normX","normY"],
              properties: { normX: { type: Type.NUMBER }, normY: { type: Type.NUMBER } }
            },
            exit: {
              type: Type.OBJECT, required: ["normX","normY"],
              properties: { normX: { type: Type.NUMBER }, normY: { type: Type.NUMBER } }
            }
          }
        }
      }
    });

    // ── Convert normalised coords to pixel coords ──────────────────────────
    const raw = JSON.parse(response.text || "{}");
    console.log("[Gemini] Raw normalised response:", raw);

    const PLATFORM_HEIGHT_PX = 10;

    const platforms = (raw.platforms ?? []).map((p: any, i: number) => ({
      id:       p.id ?? `p${i}`,
      x:        Math.round(p.normX     * LEVEL_W),
      y:        Math.round(p.normY     * LEVEL_H),
      width:    Math.round(p.normWidth * LEVEL_W),
      height:   PLATFORM_HEIGHT_PX,
      angle:    p.angle ?? 0,
      theme:    p.theme ?? "generic",
      label:    p.label ?? "",
      // Preserve normalised values for debug overlay
      normX:    p.normX,
      normY:    p.normY,
      normWidth:p.normWidth,
    }));

    const levelData: LevelData = {
      width:  LEVEL_W,
      height: LEVEL_H,
      theme:  raw.theme,
      platforms,
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

    console.log("[Gemini] Converted level — platforms:", levelData.platforms.length);
    levelData.platforms.forEach(p =>
      console.log(`  [${p.label}] x=${p.x} y=${p.y} w=${p.width} angle=${p.angle}°`)
    );

    return levelData;
  } catch(e) {
    console.error("[Gemini] Error:", e);
    throw e;
  }
}
