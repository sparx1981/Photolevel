export type PlatformTheme =
  | "stone_ledge" | "wooden_plank" | "metal_platform" | "rooftop"
  | "tree_branch" | "rock_outcrop" | "ice_shelf" | "dirt_ground" | "generic";

export type PlatformState = "solid" | "cracking" | "broken" | "respawning";

export interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  theme: PlatformTheme;
  angle?: number;
  label?: string;
  normX?: number;
  normY?: number;
  normWidth?: number;
}

export interface Wall {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  theme: PlatformTheme;
  angle?: number;
}

export interface LevelTheme {
  name: string;
  primaryColour: string;
  accentColour: string;
  skyTint: string;
  description: string;
}

export interface LevelData {
  width: number;
  height: number;
  platforms: Platform[];
  walls: Wall[];
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
  theme: LevelTheme;
}

export interface DifficultyConfig {
  level: number;                  // 1 = base, increments each replay
  fragilePlatformCount: number;   // how many platforms dissolve on touch
  fragileRespawnMs: number;       // ms before a broken platform comes back
  fragileCrackMs: number;         // ms of cracking animation before it breaks
  platformWidthMultiplier: number;// 1.0 = full width, 0.7 = 30% shorter
  enemyCount: number;             // number of patrolling enemy characters
  enemySpeedMultiplier: number;   // 1.0 = normal, higher = faster
}

export function getDifficultyConfig(level: number): DifficultyConfig {
  const l = Math.max(1, level);
  return {
    level: l,
    fragilePlatformCount: l <= 1 ? 0 : l <= 2 ? 1 : l <= 3 ? 2 : Math.min(l - 1, 5),
    fragileRespawnMs:     Math.max(2500, 5000 - (l - 2) * 400),
    fragileCrackMs:       Math.max(400,  900  - (l - 2) * 80),
    platformWidthMultiplier: l <= 2 ? 1.0 : Math.max(0.60, 1.0 - (l - 2) * 0.08),
    enemyCount:           l <= 2 ? 0 : Math.min(l - 2, 4),
    enemySpeedMultiplier: 1.0 + (l - 1) * 0.15,
  };
}
