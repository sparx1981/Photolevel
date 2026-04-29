# CaptureQuest Product Specification

> **Last Updated:** 2026-04-29 | **Changed:** Upgraded to Gemini 2.5 Flash Preview; added strict AI platform placement guidelines (avoiding reflections/underside); restructured game initialization sequence for pixel-perfect background alignment; renamed product to CaptureQuest.

## Architecture Overview
CaptureQuest is a browser-based 2D platformer where levels are dynamically designed by Gemini AI by identifying real-world surfaces in user-uploaded images and transforming them into playable platforms. Levels feature progressive difficulty scaling on replay.

- **Frontend:** React + Tailwind CSS
- **Game Engine:** PixiJS v8
- **Physics:** Matter.js v0.20 (Rotated slab physics with high-fidelity collision)
- **AI Integration:** Google Gemini SDK (gemini-2.5-flash-preview-05-20) using methodical horizontal banding, normalized coordinates, and perspective correction.

## File Structure
- `src/App.tsx`: Main application container, state management, and difficulty progression.
- `src/GameCore.ts`: Primary game engine handling rotated platforms, fragile states, enemies, camera clamping, and responsive scaling.
- `src/utils/imageCrop.ts`: Image dimension validation.
- `src/services/geminiService.ts`: AI prompt engineering with calibration anchors for reflection avoidance and precise surface alignment.
- `src/types.ts`: Shared TypeScript interfaces including difficulty configurations.
- `src/components/HelpDialog.tsx`: Centralized documentation, release notes, and developer suite.

## Game Logic: Surface Alignment
1. **Calibration Anchors:** AI identifies a primary floor and a mid-level reference point to calibrate vertical depth measurements.
2. **Normalized Coordinates:** AI estimates positions as fractions (0.0–1.0) of image width/height for higher spatial accuracy.
3. **Perspective Correction:** AI logic corrects for focal convergence and camera tilt, ensuring platforms align with the *walkable* top edge of surfaces.
4. **Collision Avoidance:** Prompt guidelines strictly forbid placement on reflections in glass/mirrors, underside of surfaces, or on construction lines.
5. **Traversability:** AI ensures a reachable path from spawn (bottom-left) to exit (top-right) by adding bridge platforms where gaps exceed threshold values.

## Progressive Difficulty
Replaying a photo increments the difficulty level, applying the following modifiers:
- **Lv 2+:** Patrolling enemies added to wider platforms.
- **Lv 3+:** 15% of platforms become "Fragile" (cracking and respawning).
- **Lv 5+:** Overall platform widths reduced (multiplied by 0.75x–0.85x).

## Rendering Engine
- **Background:** The raw user-uploaded image is used as the level background.
  - **Alignment:** Background is loaded and scaled BEFORE content positioning to ensure 1:1 pixel parity between physics bodies and visual landmarks.
- **Platforms:** Rendered as thin, theme-consistent slabs with depth effects:
  - **Themed Materials:** Stone, wood, metal, rooftop, etc.
  - **Visual Layers:** 3px bright highlight line, 7px semi-transparent body fill, and 5px dark underside depth strip.

## Physics & Interaction
- **Character Physics:**
  - Friction: 0.02 (Slidey but controllable).
  - Air Friction: 0.02.
  - Inertia: Infinity (Prevents tumbling).
- **Collision Rules:**
  - All platforms are static bodies.
  - Friction: 0.5 (Platforms) / 0.1 (Enemies).
  - Slop: 0.02 for tight contact tolerance.
  - Gravity: 1.25 for a snappy "platformer" feel.
- **Camera Engine:**
  - **Lerp:** 8% damping for smooth character follow.
  - **Look-ahead:** Horizon shifts based on current X-velocity.
  - **Clamping:** Strict boundary checks prevent showing black edges (off-canvas areas).

## Advanced Gameplay Mechanics
- **Coyote Time:** 140ms window to jump after leaving a platform.
- **Jump Buffer:** 150ms window to pre-input a jump before landing.
- **Wall Sliding:** Reduced gravity on character when adjacent to vertical surfaces.
- **Wall Jumping:** Leaping away from walls reset air-jump capability.

## Firestore Data Models (Blueprints)
*Currently, CaptureQuest uses purely client-side session state for the prototype. Firestore integration is planned for cross-device high scores and social level sharing.*
