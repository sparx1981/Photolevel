export interface LevelData {
  width: number;
  height: number;
  platforms: Platform[];
  walls: Wall[];
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
}

export interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Wall {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
