# PhotoLevel Product Specification

> **Last Updated:** 2026-04-29 | **Changed:** Implemented Convolver-based indoor reverb and 12-channel procedural voice synthesis for busy interiors. Fixed audio manager syntax errors.

## Architecture Overview
PhotoLevel is a browser-based 2D platformer where levels are dynamically designed by Gemini AI by identifying real-world surfaces in user-uploaded images and transforming them into playable platforms. Levels feature progressive difficulty scaling on replay.

- **Frontend:** React + Tailwind CSS
- **Game Engine:** PixiJS v8
- **Physics:** Matter.js v0.20 (Rotated slab physics)
- **Audio:** Custom Web Audio API procedural synthesis (Ambient + SFX)
- **AI Integration:** Hybrid pipeline using client-side Edge Detection + Google Gemini SDK.

## File Structure
- `src/App.tsx`: Main application container, state management, and difficulty progression.
- `src/GameCore.ts`: Primary game engine handling rotated platforms, fragile states, enemies, and camera.
- `src/utils/audioManager.ts`: Procedural sound synthesis engine for ambient and SFX.
- `src/services/geminiService.ts`: Hybrid pipeline orchestrator.
- `src/types.ts`: Shared TypeScript interfaces.

## Key Systems

### 1. Gemini Level Designer
- **Hybrid Pipeline:** Combines client-side edge detection with Gemini vision analysis.
- **Classification:** identify surfaces as `wood`, `stone`, `metal`, `concrete`, `tree_branch`, `dirt`, or `glass`.
- **Theming:** Gemini generates `primaryColour`, `accentColour`, `skyTint`, and `sceneType` (audio classification).
- **Platform Constraints:** Code-enforced limits on width (0.14 normalized) to prevent overshooting.

### 2. Physics & Gameplay
- **Player Controller:** Precision movement with analogue velocity-targeting (touch) and force-based movement (keyboard).
- **Difficulty Scaling:** Incremental complexity: Fragile platforms, Patrolling enemies, Narrower surfaces.
- **Environmental Feedback:** Ambient tinting on sprites to match scene lighting.
- **Dynamic Coloring:** Platforms sample actual image pixels at their position for seamless integration.

### 3. Audio System
- **Procedural Synthesis:** Real-time generation of multi-layered environments based on `sceneType`.
  - `urban_outdoor`: Traffic rumbles, car pass-bys, crowd murmur.
  - `interior_busy`: Convolver-based room reverb, 12-channel procedural voice synthesis (babble), room tone, and crockery clinks.
  - `interior_calm`: HVAC/room tone and gentle hums.
- **Dynamic SFX:** Footsteps and landing impacts with intensity scaling based on fall height.

## Controls & Shortcuts
| Action | Key / Control |
| :--- | :--- |
| Move | WASD / Arrows / Virtual Analogue Joystick (Touch) |
| Jump | Space / W / Up / Jump Button (Touch) |
| Home | Return to Menu |
| Help | Help & Resources |
| Settings | Debug, Touch Control, and Audio Toggles (Landing Screen) |
| Audio HUD | Mute BG/SFX buttons during gameplay |

## Implementation Details: Feedback
- **Jump Indicator:** A persistent blue pip above the player's head signals if an air jump is available.
- **Visuals:** Platforms are 62-72% transparent for better background visibility. Exit door scaled to 70% for improved level proportions.
- **Material Sampling:** Platform materials desaturated 45% after pixel sampling for realistic integration.
