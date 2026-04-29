# PhotoLevel Product Specification

> **Last Updated:** 2026-04-29 | **Changed:** Implemented hybrid AI pipeline combining client-side Sobel edge detection (Canvas API) with Gemini classification to achieve pixel-perfect platform alignment.

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
4. **Collision Avoidance:** Guidelines strictly forbid placement on reflections, reflections in mirrors, or the underside of surfaces.
5. **Traversability:** AI ensures a reachable path from spawn to exit by adding bridges where gaps exceed threshold values.

## Progressive Difficulty
Replaying a photo increments the difficulty level, applying the following modifiers:
- **Fragile Platforms:** Certain platforms (visually indicated by orange dashes) dissolve shortly after contact and respawn after a delay.
- **Patrolling Enemies:** Red "Astro-Guard" enemies patrol specific platforms. Contact results in immediate respawn.
- **Platform Scaling:** Non-ground platforms become narrower at higher levels to test precision.
- **Speed Multipliers:** Enemies move faster as level increases.

## Rendering Engine
- **Background:** The raw user-uploaded image is used as the level background.
  - **Alignment:** Background is loaded and scaled BEFORE content positioning to ensure 1:1 pixel parity between physics bodies and visual landmarks.
- **Platforms:** Rendered as thin, theme-consistent slabs with depth effects:
  - **Themed Materials:** Stone, wood, metal, rooftop, etc.
  - **Visual Layers:** 3px bright highlight line, 7px semi-transparent body fill, and 5px dark underside depth strip.
- **Fragile State:** Rapid orange flashing for cracking, fade-in for respawning.
- **Enemies:** Capsule-based dark red sprites with glowing yellow eyes.
- **Debug Overlay:** Every platform renders its AI-assigned label and y-coordinate for verification.

## Physics Implementation
- **Rotated Slabs:** All platforms support the `angle` property for realistic sloped movement.
- **Tuned Constants:**
  - Friction: 0.5 (Platforms) / 0.1 (Enemies).
  - Slop: 0.02 for tight contact tolerance.
  - Gravity: 1.25 for a snappy "platformer" feel.
- **Camera Engine:**
  - **Lerp:** 8% damping for smooth character follow.
  - **Look-ahead:** Horizon shifts based on current X-velocity.
  - **Clamping:** Strict boundary checks prevent showing black edges (off-canvas areas).

## Advanced Gameplay Mechanics
- **Coyote Time:** 140ms window to jump after leaving a platform.
- **Jump Buffering:** 150ms window to register a jump input just before landing.
- **Double Jump:** Allows a second, slightly weaker jump in mid-air once per airtime.
- **Jump Indicator:** A visual blue pip above the player's head indicates air jump availability.
- **Edge-Graze Detection:** triple-ray ground check (Centre, Left-Edge, Right-Edge) allows jumping even when only a corner of the character is touching a platform.
- **Wall Interaction:** Wall sliding and wall jumping for vertical traversal.

## Controls & Shortcuts
| Action | Key |
| :--- | :--- |
| Move | WASD / Arrows |
| Jump | Space / W / Up |
| Home | Return to Menu |
| Help | Help & Resources |
