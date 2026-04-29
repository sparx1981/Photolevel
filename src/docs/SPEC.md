# PhotoLevel Product Specification

> **Last Updated:** 2026-04-29 | **Changed:** Implemented portal device redesign, ambient tinting system, mobile touch controls, and persistent debug/control toggles. Removed two-pass refinement remnants for a leaner single-pass pipeline.

## Architecture Overview
PhotoLevel is a browser-based 2D platformer where levels are dynamically designed by Gemini AI by identifying real-world surfaces in user-uploaded images and transforming them into playable platforms. Levels feature progressive difficulty scaling on replay.

- **Frontend:** React + Tailwind CSS
- **Game Engine:** PixiJS v8
- **Physics:** Matter.js v0.20 (Rotated slab physics with high-fidelity collision)
- **AI Integration:** Hybrid pipeline using client-side Edge Detection + Google Gemini SDK (gemini-2.0-flash-exp). Coordinates are pixel-measured before being sent to AI for logical classification.

## File Structure
- `src/App.tsx`: Main application container, state management, and difficulty progression.
- `src/GameCore.ts`: Primary game engine handling rotated platforms, fragile states, enemies, camera clamping, and responsive scaling.
- `src/utils/imageCrop.ts`: Image dimension validation.
- `src/utils/edgeDetection.ts`: Client-side Sobel/Hough horizontal edge extractor.
- `src/services/geminiService.ts`: Hybrid pipeline orchestrator that passes pixel-accurate edges to Gemini for classification.
- `src/types.ts`: Shared TypeScript interfaces including difficulty configurations.

## Game Logic: Surface Alignment
1. **Edge Detection (Pixel-Level):** A Sobel horizontal gradient filter runs on a hidden canvas to extract high-contrast horizontal line segments. This provides the *exact* physical location of potential platforms.
2. **AI Classification:** The detected line data (normX, normY, normWidth) is sent to Gemini alongside the image. Gemini's role is narrowed to *classification*: deciding if a line is a real walkable surface, assigning themes/labels, and adding bridges.
3. **Accuracy Enforcement:** Gemini is forbidden from modifying detected coordinates (±0.02 tolerance max), virtually eliminating coordinate "drift" and floating platforms.
4. **Traversability:** AI ensures a reachable path from spawn to exit by adding bridges where gaps exceed threshold values.

## Progressive Difficulty
Replaying a photo increments the difficulty level, applying the following modifiers:
- **Fragile Platforms:** Certain platforms dissolve shortly after contact and respawn after a delay. Visually indistinguishable from normal platforms until they begin to break.
- **Patrolling Enemies:** Red "Astro-Guard" enemies patrol specific platforms. Contact results in immediate respawn.
- **Platform Scaling:** Platforms are 25% shorter (height 10) for a cleaner look. Non-ground platforms also become narrower at higher levels to test precision.
- **Speed Multipliers:** Enemies move faster as level increases.

## Rendering Engine
- **Background:** The raw user-uploaded image is used as the level background.
  - **Alignment:** Background is loaded and scaled BEFORE content positioning to ensure 1:1 pixel parity.
- **Ambient Tinting:** Player and enemies are tinted with (30% white + 70% primary theme colour) to blend naturally into the scene's lighting.
- **Portal Device:** The exit is a vertical charging station with a dark navy casing, dual green-glass windows, and blinking indicator lights at the base.
- **Platforms:** Rendered as clean pill-shaped slabs with depth effects:
  - **Visual Layers:** 3px top highlight, 10px semi-transparent body fill, and 4px underside depth strip.
- **Debug Labels:** Optional text overlay (y-coordinate and label) toggled via settings.

## Controls & Shortcuts
| Action | Key / Control |
| :--- | :--- |
| Move | WASD / Arrows / Mobile Left-Right Buttons |
| Jump | Space / W / Up / Mobile Jump Button |
| Home | Return to Menu |
| Help | Help & Resources |
| Settings | Debug & Touch Control Toggles (Landing Screen) |

## Implementation Details: Air Jump Feedback
- **Flash Effect:** When the player performs an air jump, a blue flash effect is applied to the sprite. The sprite's tint is restored to the scene's `ambientTint` dynamically after the flash fades, ensuring the lighting remains consistent.
- **Indicator:** A persistent blue pip above the player's head signals if an air jump is currently available.
