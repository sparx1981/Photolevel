import * as PIXI from "pixi.js";
import Matter from "matter-js";
import { LevelData, DifficultyConfig, PlatformState } from "./types";
import { AudioManager, SceneType } from "./utils/audioManager";

export class GameCore {
  private app: PIXI.Application;
  private engine: Matter.Engine;
  private player: Matter.Body | null = null;
  private worldContainer: PIXI.Container;
  private playerSprite: PIXI.Sprite | null = null;
  private spawnArrow: PIXI.Graphics | null = null;
  private exitGraphics: PIXI.Graphics | null = null;
  private jumpIndicator: PIXI.Graphics | null = null;

  // Player animation frames — keyed by state
  private playerFrames: Record<string, PIXI.Texture[]> = {};
  private playerAnimState = 'idle_r';
  private playerAnimTick  = 0;
  private playerAnimIndex = 0;
  private readonly PLAYER_FRAME_MS = 160;

  // Enemy animation frames (shared across all enemy instances)
  private enemyFrames: Record<string, PIXI.Texture[]> = {};

  private playerSheetDataUrl = '';
  private enemySheetDataUrl  = '';
  private levelData: LevelData;
  private imageBase64: string;
  private keys: Record<string, boolean> = {};

  private isGrounded = false;
  private jumpPressed = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private airJumpsUsed = 0;
  private readonly MAX_AIR_JUMPS = 1;  // 1 = standard double jump
  private doubleJumpFlash = 0;          // countdown for visual feedback (ms)
  private isWallSliding = false;
  private wallDirection = 0; // -1 = left, 1 = right
  private lastWallJumpTime = 0;

  private camX = 0;
  private camY = 0;
  private playerSpawnTime = 0;

  private squashTimer = 0;
  private prevGroundedForSquash = false;
  private shadowSprite: PIXI.Graphics | null = null;
  private ambientTint = 0xffffff;
  private showDebugLabels: boolean;
  private analogueX = 0;
  private audio: AudioManager = new AudioManager();
  private prevPosX = 0;
  private airborneStartY = 0;

  private sampledPlatformColours: Map<string, { r: number; g: number; b: number }> = new Map();

  private exitLightsGraphics: PIXI.Graphics | null = null;
  private exitLightPositions: Array<{ x: number; y: number; blinking: boolean }> = [];
  private exitLightTimer  = 0;
  private exitLightOn     = true;

  private onWin: (time: number) => void;
  private onDeath: () => void;

  private difficulty: DifficultyConfig;

  // New fields for restructured init/resize
  private initialized = false;
  private worldScale = 1;
  private startTime = 0;

  // Fragile platform tracking
  private fragilePlatforms: Map<string, {
    body:      Matter.Body;
    gfx:       PIXI.Graphics;
    state:     PlatformState;
    timer:     number;      // ms countdown for current state
    originX:   number;
    originY:   number;
    width:     number;
    height:    number;
    angle:     number;
    themeKey:  string;
    platformIndex: number;
  }> = new Map();

  // Enemy tracking
  private enemies: Array<{
    body:       Matter.Body;
    sprite:     PIXI.Sprite;
    direction:  number;       // 1 = right, -1 = left
    minX:       number;
    maxX:       number;
    speed:      number;
    platformY:  number;
    animTick:   number;
    animIndex:  number;
  }> = [];

  constructor(
    container: HTMLDivElement,
    levelData: LevelData,
    imageBase64: string,
    onWin: (time: number) => void,
    onDeath: () => void,
    difficulty: DifficultyConfig,
    showDebugLabels: boolean = false,
    muteBg:  boolean = false,
    muteSfx: boolean = false
  ) {
    this.levelData = levelData;
    this.imageBase64 = imageBase64;
    this.onWin = onWin;
    this.onDeath = onDeath;
    this.difficulty = difficulty;
    this.showDebugLabels = showDebugLabels;

    this.audio.muteBg = muteBg;
    this.audio.muteSfx = muteSfx;

    this.app = new PIXI.Application();
    this.engine = Matter.Engine.create({ gravity: { y: 1.25 } });

    this.worldContainer = new PIXI.Container();

    this.init(container);
  }

  private async init(container: HTMLDivElement) {
    if (this.initialized) return;
    try {
      console.log("[GameCore] init() starting");

      // ── 1. Initialise PixiJS renderer ──────────────────────────────────────
      await this.app.init({
        width:       container.clientWidth  || 1280,
        height:      container.clientHeight || 720,
        background:  0x050505,
        antialias:   true,
        autoDensity: true,
        resolution:  window.devicePixelRatio || 1,
        resizeTo:    container
      });
      this.app.canvas.style.cssText =
        "display:block;position:absolute;top:0;left:0;width:100%;height:100%;";
      container.appendChild(this.app.canvas);
      this.app.stage.addChild(this.worldContainer);
      console.log("[GameCore] PixiJS ready —", this.app.screen.width, "×", this.app.screen.height);

      // ── 2. Load background texture — MUST complete before anything else ────
      console.log("[GameCore] Loading background texture...");
      const bgTexture = await PIXI.Assets.load(this.imageBase64);
      const bgSprite  = new PIXI.Sprite(bgTexture);
      bgSprite.width  = this.levelData.width;
      bgSprite.height = this.levelData.height;
      bgSprite.x = 0;
      bgSprite.y = 0;
      this.worldContainer.addChild(bgSprite);
      console.log("[GameCore] Background loaded — texture:", bgTexture.width, "×", bgTexture.height,
                  "| sprite:", bgSprite.width, "×", bgSprite.height);

      // ── 3. Sky tint overlay ────────────────────────────────────────────────
      const skyTintStr = this.levelData.theme?.skyTint ?? "#00000000";
      const skyColour  = parseInt(skyTintStr.slice(1, 7), 16);
      const skyAlpha   = parseInt(skyTintStr.slice(7, 9) || "00", 16) / 255;
      if (skyAlpha > 0.01) {
        const tint = new PIXI.Graphics();
        tint.rect(0, 0, this.levelData.width, this.levelData.height);
        tint.fill({ color: skyColour, alpha: skyAlpha });
        this.worldContainer.addChild(tint);
      }

      // ── 4. Build all game content ──────────────────────────────────────────
      // Load sprite sheets as data URLs
      const loadSheet = (path: string): Promise<string> =>
        fetch(path)
          .then(r => {
            if (!r.ok) throw new Error(`[GameCore] Sprite sheet not found: ${path} (${r.status})`);
            return r.blob();
          })
          .then(blob => new Promise<string>((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result as string);
            fr.onerror = rej;
            fr.readAsDataURL(blob);
          }));

      [this.playerSheetDataUrl, this.enemySheetDataUrl] = await Promise.all([
        loadSheet('/sprites/player.png'),
        loadSheet('/sprites/enemy.png'),
      ]);

      await this.createPlayer();

      // ── Apply scene ambient lighting tint to player ──────────────────────────
      const primHex = (this.levelData.theme?.primaryColour ?? "#ffffff").replace('#', '');
      const pc = parseInt(primHex, 16) || 0xffffff;
      const pr = (pc >> 16) & 0xff;
      const pg = (pc >> 8)  & 0xff;
      const pb =  pc        & 0xff;
      // 30% white base + 70% scene colour — visible but not overwhelming
      const tr = Math.min(255, Math.round(255 * 0.30 + pr * 0.70));
      const tg = Math.min(255, Math.round(255 * 0.30 + pg * 0.70));
      const tb = Math.min(255, Math.round(255 * 0.30 + pb * 0.70));
      this.ambientTint = (tr << 16) | (tg << 8) | tb;
      if (this.playerSprite) {
        this.playerSprite.tint = this.ambientTint;
        console.log(`[GameCore] Ambient tint applied: #${this.ambientTint.toString(16).padStart(6,'0')}`);
      }

      await this.samplePlatformColoursFromImage();
      this.buildPhysics();

      this.createExit();
      this.spawnEnemies();

      const sceneType = (this.levelData.theme?.sceneType ?? "default") as SceneType;
      this.audio.startAmbient(sceneType);
      console.log(`[GameCore] Ambient audio started: ${sceneType}`);

      // ── 5. NOW compute scale and set initial camera — content is all present
      //       This must happen AFTER all addChild calls above.              ───
      const screenW = this.app.screen.width;
      const screenH = this.app.screen.height;
      this.worldScale = Math.max(
        screenW / this.levelData.width,
        screenH / this.levelData.height
      );
      this.worldContainer.scale.set(this.worldScale);

      // Anchor bottom-left: level's bottom-left corner touches screen's bottom-left
      const initX = this.clampCameraX(0);
      const initY = this.clampCameraY(screenH - this.levelData.height * this.worldScale);
      this.worldContainer.position.set(initX, initY);
      console.log("[GameCore] Initial scale:", this.worldScale.toFixed(3),
                  "| camera:", initX.toFixed(0), initY.toFixed(0));

      // ── 6. Input and ticker ───────────────────────────────────────────────
      window.addEventListener("keydown", this.handleKeyDown);
      window.addEventListener("keyup",   this.handleKeyUp);
      window.addEventListener("resize",  this.handleResize);

      this.app.ticker.add((ticker) => {
        try { this.update(ticker.deltaTime); }
        catch(e) { console.error("[GameCore] Update crash:", e); }
      });

      this.startTime   = Date.now();
      this.initialized = true;
      console.log("[GameCore] Init complete — worldContainer children:", this.worldContainer.children.length);

    } catch(e) {
      console.error("[GameCore] Init error:", e);
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private handleResize = () => {
    if (!this.app || !this.initialized) return;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    this.worldScale = Math.max(
      screenW / this.levelData.width,
      screenH / this.levelData.height
    );
    this.worldContainer.scale.set(this.worldScale);
    // Re-clamp existing position so black edges don't appear after resize
    this.worldContainer.position.set(
      this.clampCameraX(this.worldContainer.position.x),
      this.clampCameraY(this.worldContainer.position.y)
    );
    console.log("[GameCore] Resized — scale:", this.worldScale.toFixed(3));
  };

  private clampCameraX(x: number): number {
    const screenW = this.app.screen.width;
    const levelW = this.levelData.width * this.worldScale;
    if (levelW <= screenW) return (screenW - levelW) / 2;
    return Math.max(screenW - levelW, Math.min(0, x));
  }

  private clampCameraY(y: number): number {
    const screenH = this.app.screen.height;
    const levelH = this.levelData.height * this.worldScale;
    if (levelH <= screenH) return (screenH - levelH) / 2;
    return Math.max(screenH - levelH, Math.min(0, y));
  }

  private buildPhysics() {
    const bodies: Matter.Body[] = [];
    const d = this.difficulty;

    // Identify fragile candidates
    const fragileCandidates = this.levelData.platforms
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.theme !== "dirt_ground" && p.y < this.levelData.height - 80)
      .slice(2);

    const fragileIndices = new Set<number>();
    if (d.fragilePlatformCount > 0 && fragileCandidates.length > 0) {
      const step = Math.max(1, Math.floor(fragileCandidates.length / d.fragilePlatformCount));
      for (let i = 0; i < d.fragilePlatformCount && i * step < fragileCandidates.length; i++) {
        fragileIndices.add(fragileCandidates[i * step].i);
      }
    }

    this.levelData.platforms.forEach((p, index) => {
      const angleRad = ((p.angle ?? 0) * Math.PI) / 180;
      const isFragile = fragileIndices.has(index);
      const effectiveWidth = p.theme === "dirt_ground"
        ? p.width
        : Math.round(p.width * d.platformWidthMultiplier);

      const body = Matter.Bodies.rectangle(p.x, p.y, effectiveWidth, p.height, {
        isStatic: true,
        angle: angleRad,
        label: isFragile ? `fragile_${index}` : `platform_${index}`,
        friction: 0.5, restitution: 0, slop: 0.02
      });
      bodies.push(body);

      const colours = this.getPlatformColours(p.id, p.theme ?? "generic");

      if (p.theme !== "dirt_ground") {
        const shadowGfx = new PIXI.Graphics();
        shadowGfx.roundRect(-effectiveWidth / 2 + 5, 6, effectiveWidth - 4, 10, 4);
        shadowGfx.fill({ color: 0x000000, alpha: 0.12 });
        shadowGfx.x = p.x;
        shadowGfx.y = p.y;
        shadowGfx.rotation = angleRad;
        this.worldContainer.addChild(shadowGfx);  // added first = renders behind platform
      }

      const gfx = new PIXI.Graphics();
      this.drawPlatformGfx(gfx, effectiveWidth, p.height, colours, false); // always false — no visual difference
      gfx.x = p.x;
      gfx.y = p.y;
      gfx.rotation = angleRad;
      this.worldContainer.addChild(gfx);

      if (this.showDebugLabels && p.label) {
        const shortLabel = p.label.length > 22 ? p.label.slice(0, 22) + "…" : p.label;
        const labelText = new PIXI.Text({
          text: `${shortLabel}  y=${p.y}`,
          style: { fontSize: 9, fill: 0xffffff, fontFamily: "monospace",
            dropShadow: { color: 0x000000, blur: 2, distance: 1, alpha: 1 } }
        });
        labelText.x = p.x - effectiveWidth / 2 + 2;
        labelText.y = p.y - 16;
        labelText.rotation = angleRad;
        labelText.alpha = 0.75;
        this.worldContainer.addChild(labelText);
      }

      if (isFragile) {
        this.fragilePlatforms.set(`fragile_${index}`, {
          body, gfx,
          state: "solid",
          timer: 0,
          originX: p.x, originY: p.y,
          width: effectiveWidth, height: p.height,
          angle: p.angle ?? 0,
          themeKey: p.theme ?? "generic",
          platformIndex: index
        });
      }
    });

    this.levelData.walls.forEach((w) => {
      const angleRad = ((w.angle ?? 0) * Math.PI) / 180;
      const body = Matter.Bodies.rectangle(w.x, w.y, w.width, w.height, { isStatic: true, angle: angleRad, label: `wall_${w.id}` });
      bodies.push(body);
      
      const gfx = new PIXI.Graphics();
      const colours = this.getPlatformColours(w.id || "wall", w.theme ?? "generic");
      gfx.rect(w.x - w.width / 2, w.y - w.height / 2, w.width, w.height);
      gfx.fill({ color: colours.side, alpha: 0.8 });
      this.worldContainer.addChild(gfx);
    });

    Matter.Composite.add(this.engine.world, bodies);
  }

  private async samplePlatformColoursFromImage(): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Downsample to 128×72 for fast sampling — enough colour fidelity
        const W = 128, H = 72;
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, W, H);

        for (const p of this.levelData.platforms) {
          if (p.normX == null || p.normY == null) continue;
          // Sample a 5×3 patch centred on the platform position and average
          let tr = 0, tg = 0, tb = 0, count = 0;
          for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const px = Math.min(W-1, Math.max(0, Math.round(p.normX * W) + dx));
              const py = Math.min(H-1, Math.max(0, Math.round(p.normY * H) + dy));
              const d = ctx.getImageData(px, py, 1, 1).data;
              tr += d[0]; tg += d[1]; tb += d[2]; count++;
            }
          }
          this.sampledPlatformColours.set(p.id, {
            r: Math.round(tr / count),
            g: Math.round(tg / count),
            b: Math.round(tb / count),
          });
        }
        console.log(`[GameCore] Sampled colours for ${this.sampledPlatformColours.size} platforms`);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = this.imageBase64;
    });
  }

  private getPlatformColours(platformId: string, theme: string): { top: number; side: number; highlight: number } {
    const sampled = this.sampledPlatformColours.get(platformId);

    let r: number, g: number, b: number;
    if (sampled) {
      // Use the image pixel colour directly
      r = sampled.r; g = sampled.g; b = sampled.b;
    } else {
      // Fallback to primaryColour
      const hex = (this.levelData.theme?.primaryColour ?? "#7a6a5a").replace('#','');
      const c = parseInt(hex, 16) || 0x7a6a5a;
      r = (c >> 16) & 0xff; g = (c >> 8) & 0xff; b = c & 0xff;
    }

    // Desaturate 45% to keep platforms legible without overpowering the image
    const grey = 0.299*r + 0.587*g + 0.114*b;
    const DS = 0.45;
    r = Math.round(r*(1-DS) + grey*DS);
    g = Math.round(g*(1-DS) + grey*DS);
    b = Math.round(b*(1-DS) + grey*DS);

    // Small per-type hue nudge so different material types feel distinct
    const shifts: Record<string, [number,number,number]> = {
      stone_ledge:    [  4,  4,  4],
      wooden_plank:   [ 16,  5,-14],
      metal_platform: [ -6,  3, 14],
      rooftop:        [  0,  0,  0],
      tree_branch:    [ -8, 10, -6],
      rock_outcrop:   [  8,  4,  0],
      ice_shelf:      [ -8,  4, 18],
      dirt_ground:    [ 12,  7, -8],
      generic:        [  0,  0,  0],
    };
    const [dr,dg,db] = shifts[theme] ?? [0,0,0];
    r = Math.max(0, Math.min(255, r+dr));
    g = Math.max(0, Math.min(255, g+dg));
    b = Math.max(0, Math.min(255, b+db));

    const lim = (v:number) => Math.max(0, Math.min(255, Math.round(v)));
    const col  = (r:number,g:number,b:number) => (lim(r)<<16)|(lim(g)<<8)|lim(b);
    return {
      highlight: col(r+55, g+50, b+42),
      top:       col(r+18, g+15, b+10),
      side:      col(r-36, g-30, b-22),
    };
  }

  private drawPlatformGfx(
    gfx: PIXI.Graphics,
    width: number,
    height: number,
    colours: { top: number; side: number; highlight: number },
    isFragile = false // kept in signature but no longer changes visuals
  ) {
    gfx.clear();

    // Main pill body — 25% shorter: height 10 (was 14)
    gfx.roundRect(-width / 2, -2, width, 10, 5);
    gfx.fill({ color: colours.top, alpha: 0.62 });

    // Top highlight strip
    gfx.roundRect(-width / 2, -2, width, 3, 5);
    gfx.fill({ color: colours.highlight, alpha: 0.72 });

    // Underside depth strip
    gfx.roundRect(-width / 2 + 2, 6, width - 4, 4, 3);
    gfx.fill({ color: colours.side, alpha: 0.68 });
  }

  private async createPlayer() {
    const spawn = this.levelData.spawn || { x: 100, y: 100 };
    this.player = Matter.Bodies.rectangle(spawn.x, spawn.y, 30, 50, {
      friction: 0.02, frictionAir: 0.02, restitution: 0,
      inertia: Infinity, label: 'player'
    });
    Matter.Composite.add(this.engine.world, [this.player]);

    const SH = 741; // section height
    const sheet = this.playerSheetDataUrl;

    const [idleL, idleR,
      wL1, wL2, wL3,
      jLup, jLpk,
      wR1, wR2, wR3,
      jRup, jRpk
    ] = await Promise.all([
      this.cropFrameFromSheet(sheet,   0,    0, 576, SH),
      this.cropFrameFromSheet(sheet, 576,    0, 576, SH),
      this.cropFrameFromSheet(sheet,   0,  741, 384, SH),
      this.cropFrameFromSheet(sheet, 384,  741, 384, SH),
      this.cropFrameFromSheet(sheet, 768,  741, 384, SH),
      this.cropFrameFromSheet(sheet,   0, 1482, 576, SH),
      this.cropFrameFromSheet(sheet, 576, 1482, 576, SH),
      this.cropFrameFromSheet(sheet,   0, 2223, 384, SH),
      this.cropFrameFromSheet(sheet, 384, 2223, 384, SH),
      this.cropFrameFromSheet(sheet, 768, 2223, 384, SH),
      this.cropFrameFromSheet(sheet,   0, 2964, 576, SH),
      this.cropFrameFromSheet(sheet, 576, 2964, 576, SH),
    ]);

    this.playerFrames = {
      idle_r:   [idleR],
      idle_l:   [idleL],
      walk_r:   [wR1, wR2, wR3],
      walk_l:   [wL1, wL2, wL3],
      jump_r_up:   [jRup],
      jump_r_peak: [jRpk],
      jump_l_up:   [jLup],
      jump_l_peak: [jLpk],
    };

    // Create sprite from idle_r as default frame
    this.playerSprite = new PIXI.Sprite(this.playerFrames.idle_r[0]);
    // Anchor at horizontal centre, feet at bottom
    this.playerSprite.anchor.set(0.5, 1.0);
    // Scale to match physics body — body is 30×50, sprite is 576×741
    // We want the character height (~85% of frame) to be ~50px
    const targetH = 54;
    this.playerSprite.scale.set(targetH / SH);
    this.playerSprite.tint = this.ambientTint;

    // Shadow
    this.shadowSprite = new PIXI.Graphics();
    this.shadowSprite.ellipse(0, 0, 16, 5);
    this.shadowSprite.fill({ color: 0x000000 });
    this.worldContainer.addChild(this.shadowSprite);
    this.worldContainer.addChild(this.playerSprite);

    this.jumpIndicator = new PIXI.Graphics();
    this.worldContainer.addChild(this.jumpIndicator);

    this.spawnArrow = new PIXI.Graphics();
    this.spawnArrow.poly([0, -10, 10, 10, -10, 10]);
    this.spawnArrow.fill({ color: 0x60c8ff });
    this.worldContainer.addChild(this.spawnArrow);

    this.playerSpawnTime = Date.now();
    console.log(`[GameCore] Player spawned at x=${spawn.x} y=${spawn.y}`);
  }

  private async spawnEnemies() {
    const d = this.difficulty;
    if (d.enemyCount === 0) return;

    // Load enemy frames (only once — shared by all enemies)
    if (Object.keys(this.enemyFrames).length === 0) {
      const SH = 741;
      const sheet = this.enemySheetDataUrl;
      const [idleL, idleR, wL1, wL2, wL3, wR1, wR2, wR3] = await Promise.all([
        this.cropFrameFromSheet(sheet,   0,    0, 576, SH),
        this.cropFrameFromSheet(sheet, 576,    0, 576, SH),
        this.cropFrameFromSheet(sheet,   0,  741, 384, SH),
        this.cropFrameFromSheet(sheet, 384,  741, 384, SH),
        this.cropFrameFromSheet(sheet, 768,  741, 384, SH),
        this.cropFrameFromSheet(sheet,   0, 2223, 384, SH),
        this.cropFrameFromSheet(sheet, 384, 2223, 384, SH),
        this.cropFrameFromSheet(sheet, 768, 2223, 384, SH),
      ]);
      this.enemyFrames = {
        walk_r: [wR1, wR2, wR3],
        walk_l: [wL1, wL2, wL3],
        idle_r: [idleR],
        idle_l: [idleL],
      };
    }

    const candidates = this.levelData.platforms.filter(p =>
      p.theme !== "dirt_ground" &&
      p.width * d.platformWidthMultiplier > 140 &&
      p.x > 200 && p.x < this.levelData.width - 200
    );

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const chosen   = shuffled.slice(0, d.enemyCount);

    chosen.forEach((plat, i) => {
      const effectiveWidth = plat.width * d.platformWidthMultiplier;
      const halfW  = effectiveWidth / 2 - 20;
      const spawnX = plat.x;
      const spawnY = plat.y - 30;

      const body = Matter.Bodies.rectangle(spawnX, spawnY, 22, 36, {
        isStatic: false,
        inertia: Infinity,
        friction: 0.1,
        frictionAir: 0.05,
        restitution: 0,
        label: `enemy_${i}`
      });
      Matter.Composite.add(this.engine.world, [body]);

      const sprite = new PIXI.Sprite(this.enemyFrames.idle_r[0]);
      sprite.anchor.set(0.5, 1.0);
      const targetH = 50;
      sprite.scale.set(targetH / 741);
      sprite.tint = this.ambientTint;
      this.worldContainer.addChild(sprite);

      const speed = 1.8 * d.enemySpeedMultiplier;

      this.enemies.push({
        body, sprite,
        direction: 1,
        minX: plat.x - halfW,
        maxX: plat.x + halfW,
        speed,
        platformY: plat.y,
        animTick: 0,
        animIndex: 0
      });
    });

    Matter.Events.on(this.engine, "collisionStart", (event) => {
      event.pairs.forEach(pair => {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        if (labels.includes("player") && labels.some(l => l.startsWith("enemy_"))) {
          this.onDeath();
          this.respawn();
        }
      });
    });
  }

  private createExit() {
    const exit = this.levelData.exit || { x: 1200, y: 100 };
    this.exitGraphics = new PIXI.Graphics();
    const g = this.exitGraphics;

    // Dimensions — device sits with base at y=0 and extends upward
    const W = 46, H = 72, CR = 11; // 70% of original

    // ── Drop shadow ────────────────────────────────────────────────────
    g.roundRect(-20, -67, 43, 67, CR);
    g.fill({ color: 0x000000, alpha: 0.25 });

    // ── Outer casing body ──────────────────────────────────────────────
    g.roundRect(-23, -H, W, H, CR);
    g.fill({ color: 0x1A2540 });
    // Top-left rim highlight
    g.roundRect(-23, -H, 7, H, CR);
    g.fill({ color: 0x2A3A5A, alpha: 0.55 });
    g.roundRect(-23, -H, W, 7, CR);
    g.fill({ color: 0x2A3A5A, alpha: 0.45 });
    // Bottom-right shadow edge
    g.roundRect(15, -H, 8, H, CR);
    g.fill({ color: 0x0C1428, alpha: 0.5 });

    // ── Inner recessed panel ───────────────────────────────────────────
    g.roundRect(-19, -67, 38, 63, 7);
    g.fill({ color: 0x0C1422 });

    // ── Window helper: draws a glass slot at given top-y, given height ─
    const drawWindow = (topY: number, wH: number) => {
      const wW = 32, wX = -16;
      // Outer ring
      g.roundRect(wX - 2, topY - 2, wW + 4, wH + 4, 6);
      g.fill({ color: 0x07101C });
      // Glass base (dark green)
      g.roundRect(wX, topY, wW, wH, 6);
      g.fill({ color: 0x0B2E1A });
      // Mid fill
      g.roundRect(wX + 1.5, topY + 1.5, wW - 3, wH - 3, 4);
      g.fill({ color: 0x1A6040 });
      // Upper highlight (glass thickness illusion)
      g.roundRect(wX + 2, topY + 2, wW - 5, Math.round(wH * 0.42), 3);
      g.fill({ color: 0x2D8F56, alpha: 0.65 });
      // Gloss shine top-left
      g.roundRect(wX + 3, topY + 3, Math.round(wW * 0.40), 5, 2);
      g.fill({ color: 0xFFFFFF, alpha: 0.13 });
    };

    drawWindow(-63, 22);  // top window    (was -90, 32)
    drawWindow(-37, 20);  // bottom window (was -52, 28)

    // ── Centre divider strip ───────────────────────────────────────────
    g.roundRect(-19, -41, 38, 4, 2);
    g.fill({ color: 0x0C1422 });

    // ── Base indicator panel ───────────────────────────────────────────
    g.roundRect(-19, -14, 38, 11, 4);
    g.fill({ color: 0x07101C });

    g.position.set(exit.x, exit.y);
    this.worldContainer.addChild(g);

    // ── Lights (separate Graphics so they can blink independently) ─────
    this.exitLightPositions = [
      { x: -10, y: -8, blinking: true  },
      { x:  -4, y: -8, blinking: false },
      { x:   4, y: -8, blinking: false },
      { x:  10, y: -8, blinking: true  },
    ];
    this.exitLightsGraphics = new PIXI.Graphics();
    this.exitLightsGraphics.position.set(exit.x, exit.y);
    this.worldContainer.addChild(this.exitLightsGraphics);
    this.redrawExitLights(); // draw initial state

    console.log(`[GameCore] Exit portal placed at x=${exit.x} y=${exit.y}`);
  }

  private redrawExitLights() {
    if (!this.exitLightsGraphics) return;
    this.exitLightsGraphics.clear();
    for (const pos of this.exitLightPositions) {
      if (pos.blinking) {
        this.exitLightsGraphics.circle(pos.x, pos.y, 3);
        this.exitLightsGraphics.fill({
          color:  this.exitLightOn ? 0x00E0A8 : 0x003828,
          alpha:  this.exitLightOn ? 1.0 : 0.55
        });
        // Glow halo when lit
        if (this.exitLightOn) {
          this.exitLightsGraphics.circle(pos.x, pos.y, 5.5);
          this.exitLightsGraphics.fill({ color: 0x00E0A8, alpha: 0.20 });
        }
      } else {
        // Static dim dot
        this.exitLightsGraphics.circle(pos.x, pos.y, 2);
        this.exitLightsGraphics.fill({ color: 0x1A3040, alpha: 0.75 });
      }
    }
  }

  private update(delta: number) {
    if (!this.player || !this.initialized) return;

    // Cap delta to prevent physics instability on slow frames and suppress Matter.js warning
    const dtMs = Math.min((1000 / 60) * delta, 16.667);

    this.fragilePlatforms.forEach((fp, key) => {
      switch (fp.state) {
        case "solid": {
          if (this.player) {
            const px = this.player.position.x;
            const feetY = this.player.position.y + 25;
            // Fan of 5 rays to catch angled platform contact
            const rayXOffsets = [-12, -6, 0, 6, 12];
            const hit = rayXOffsets.some(dx =>
              Matter.Query.ray([fp.body],
                { x: px + dx, y: feetY },
                { x: px + dx, y: feetY + 10 }
              ).length > 0
            );
            if (hit && this.isGrounded) {
              fp.state = "cracking";
              fp.timer = this.difficulty.fragileCrackMs;
              console.log(`[GameCore] Fragile platform "${key}" cracking`);
            }
          }
          break;
        }
        case "cracking": {
          fp.timer -= dtMs;
          const flashRate = Math.sin(Date.now() / 60) * 0.5 + 0.5;
          fp.gfx.alpha = 0.4 + flashRate * 0.6;
          if (fp.timer <= 0) {
            Matter.Composite.remove(this.engine.world, fp.body);
            fp.gfx.visible = false;
            fp.state = "broken";
            fp.timer = this.difficulty.fragileRespawnMs;
          }
          break;
        }
        case "broken": {
          fp.timer -= dtMs;
          if (fp.timer <= 0) {
            fp.state = "respawning";
            fp.timer = 400;
            const angleRad = (fp.angle * Math.PI) / 180;
            const newBody = Matter.Bodies.rectangle(fp.originX, fp.originY, fp.width, fp.height, { isStatic: true, angle: angleRad, label: key, friction: 0.5, restitution: 0, slop: 0.02 });
            fp.body = newBody;
            Matter.Composite.add(this.engine.world, [newBody]);
            fp.gfx.visible = true;
            fp.gfx.alpha = 0.3;
          }
          break;
        }
        case "respawning": {
          fp.timer -= dtMs;
          fp.gfx.alpha = 0.3 + (1 - fp.timer / 400) * 0.7;
          if (fp.timer <= 0) {
            fp.gfx.alpha = 1;
            fp.state = "solid";
            const colours = this.getPlatformColours(key, fp.themeKey);
            this.drawPlatformGfx(fp.gfx, fp.width, fp.height, colours, false);
          }
          break;
        }
      }
    });

    this.enemies.forEach(enemy => {
      const vx = enemy.direction * enemy.speed;
      Matter.Body.setVelocity(enemy.body, { x: vx, y: enemy.body.velocity.y });
      if (enemy.body.position.x >= enemy.maxX) enemy.direction = -1;
      else if (enemy.body.position.x <= enemy.minX) enemy.direction = 1;
      enemy.sprite.position.set(enemy.body.position.x, enemy.body.position.y);
      
      // Animate enemy walk cycle
      if (Object.keys(this.enemyFrames).length > 0) {
        enemy.animTick = (enemy.animTick || 0) + dtMs;
        if (enemy.animTick >= 200) {
          enemy.animTick = 0;
          const seq = enemy.direction > 0
            ? this.enemyFrames.walk_r
            : this.enemyFrames.walk_l;
          enemy.animIndex = ((enemy.animIndex || 0) + 1) % seq.length;
          enemy.sprite.texture = seq[enemy.animIndex];
        }
      }
    });

    Matter.Engine.update(this.engine, dtMs);
    this.playerSprite.position.set(this.player.position.x, this.player.position.y);

    // ── Player sprite animation ──────────────────────────────────────────────
    if (this.playerSprite && Object.keys(this.playerFrames).length > 0) {
      const vx = this.player.velocity.x;
      const vy = this.player.velocity.y;
      const facingRight = vx >= 0;
      let newState: string;

      if (!this.isGrounded) {
        // Airborne: up phase vs peak/falling phase
        const side = facingRight ? 'r' : 'l';
        newState = vy < -1 ? `jump_${side}_up` : `jump_${side}_peak`;
      } else if (Math.abs(vx) > 0.5) {
        newState = facingRight ? 'walk_r' : 'walk_l';
      } else {
        newState = facingRight ? 'idle_r' : 'idle_l';
      }

      // Advance frame timer
      this.playerAnimTick += dtMs;
      if (newState !== this.playerAnimState) {
        this.playerAnimState = newState;
        this.playerAnimIndex = 0;
        this.playerAnimTick  = 0;
      } else if (this.playerAnimTick >= this.PLAYER_FRAME_MS) {
        this.playerAnimTick = 0;
        const frames = this.playerFrames[this.playerAnimState] ?? this.playerFrames.idle_r;
        this.playerAnimIndex = (this.playerAnimIndex + 1) % frames.length;
      }

      const frames = this.playerFrames[this.playerAnimState] ?? this.playerFrames.idle_r;
      this.playerSprite.texture = frames[this.playerAnimIndex];
    }

    // ── Step sounds ──────────────────────────────────────────────────────────
    if (this.isGrounded && this.player) {
      const dx = Math.abs(this.player.position.x - this.prevPosX);
      if (dx > 1.8) this.audio.playStep(dx > 3.0);
    }
    this.prevPosX = this.player?.position.x ?? this.prevPosX;

    // ── Dynamic cast shadow ───────────────────────────────────────────────────
    if (this.shadowSprite && this.player) {
      const px  = this.player.position.x;
      const pBottomY = this.player.position.y + 25;
      const allStatic = Matter.Composite.allBodies(this.engine.world).filter(b => b.isStatic);

      // Find the closest static surface directly below the player's feet
      const surfacesBelow = allStatic
        .filter(b =>
          b.bounds.min.y >= pBottomY - 4 &&
          b.bounds.min.y <= pBottomY + 420 &&
          b.bounds.max.x > px - 18 &&
          b.bounds.min.x < px + 18
        )
        .sort((a, b) => a.bounds.min.y - b.bounds.min.y);

      if (surfacesBelow.length > 0) {
        const surfY  = surfacesBelow[0].bounds.min.y;
        const dist   = surfY - pBottomY;
        const maxDist = 380;
        const t = Math.max(0, 1 - dist / maxDist);   // 1 = on ground, 0 = far away

        this.shadowSprite.visible = true;
        this.shadowSprite.position.set(px, surfY);
        this.shadowSprite.scale.set(t * 0.85 + 0.15, 1.0);
        this.shadowSprite.alpha = t * 0.38;
      } else {
        this.shadowSprite.visible = false;
      }
    }

    // ── Squash & stretch ─────────────────────────────────────────────────────
    const justLanded = this.isGrounded && !this.prevGroundedForSquash;
    this.prevGroundedForSquash = this.isGrounded;

    const baseScale = 54 / 741;
    if (justLanded) {
      this.squashTimer = 160;
    }
    if (this.squashTimer > 0) {
      this.squashTimer -= dtMs;
      const t = Math.max(0, this.squashTimer / 160);
      this.playerSprite!.scale.set(baseScale * (1.0 + 0.22 * t), baseScale * (1.0 - 0.18 * t));
    } else if (!this.isGrounded && this.player.velocity.y < -1) {
      const s = Math.min(0.18, Math.abs(this.player.velocity.y) * 0.015);
      this.playerSprite!.scale.set(baseScale * (1 - s * 0.6), baseScale * (1 + s));
    } else if (!this.isGrounded && this.player.velocity.y > 3) {
      const s = Math.min(0.14, this.player.velocity.y * 0.012);
      this.playerSprite!.scale.set(baseScale * (1 - s * 0.5), baseScale * (1 + s));
    } else {
      const sx = this.playerSprite!.scale.x, sy = this.playerSprite!.scale.y;
      this.playerSprite!.scale.set(sx + (baseScale - sx) * 0.25, sy + (baseScale - sy) * 0.25);
    }

    if (this.jumpIndicator) {
      this.jumpIndicator.clear();
      const hasAirJump = this.airJumpsUsed < this.MAX_AIR_JUMPS && !this.isGrounded;
      if (!this.isGrounded) {
        this.jumpIndicator.circle(this.player.position.x, this.player.position.y - 40, 4);
        this.jumpIndicator.fill({ color: hasAirJump ? 0x60c8ff : 0x334455, alpha: hasAirJump ? 0.9 : 0.4 });
      }
    }

    // Always maintain ambient tint — no flash
    if (this.playerSprite && this.playerSprite.tint !== this.ambientTint) {
      this.playerSprite.tint = this.ambientTint;
    }

    // ── Exit light blink ────────────────────────────────────────────────
    this.exitLightTimer += dtMs;
    if (this.exitLightTimer >= 520) {
      this.exitLightTimer = 0;
      this.exitLightOn = !this.exitLightOn;
      this.redrawExitLights();
    }

    if (this.exitLightsGraphics) this.exitLightsGraphics.alpha = 1;

    const allStaticBodies = Matter.Composite.allBodies(this.engine.world).filter(b => b.isStatic);
    const feetY = this.player.position.y + 25;
    const centreHit = Matter.Query.ray(allStaticBodies, { x: this.player.position.x, y: feetY }, { x: this.player.position.x, y: feetY + 6 });
    const leftHit   = Matter.Query.ray(allStaticBodies, { x: this.player.position.x - 10, y: feetY }, { x: this.player.position.x - 10, y: feetY + 6 });
    const rightHit  = Matter.Query.ray(allStaticBodies, { x: this.player.position.x + 10, y: feetY }, { x: this.player.position.x + 10, y: feetY + 6 });

    const prevGrounded = this.isGrounded;
    this.isGrounded = centreHit.length > 0 || leftHit.length > 0 || rightHit.length > 0;
    
    // Landing sounds
    if (this.isGrounded && !prevGrounded) {
      this.audio.playLand(Math.max(0, this.player.position.y - this.airborneStartY));
    }

    if (this.isGrounded !== prevGrounded && this.isGrounded) {
      this.airJumpsUsed = 0;
      this.jumpBufferTimer = 0;
    }

    // Track airborne start position for landing impact calculation
    if (!this.isGrounded && prevGrounded) {
      this.airborneStartY = this.player.position.y;
    }

    const leftRay = Matter.Query.ray(allStaticBodies, { x: this.player.position.x - 14, y: this.player.position.y }, { x: this.player.position.x - 20, y: this.player.position.y });
    const rightRay = Matter.Query.ray(allStaticBodies, { x: this.player.position.x + 14, y: this.player.position.y }, { x: this.player.position.x + 20, y: this.player.position.y });
    const onLeftWall = leftRay.length > 0;
    const onRightWall = rightRay.length > 0;

    if (Date.now() - this.lastWallJumpTime > 150) {
      const moveForce = 0.007 * delta;
      const maxVelX   = 4.5;

      if (Math.abs(this.analogueX) > 0.06) {
        // Analogue stick: velocity-targeting for immediate, proportional response
        const targetVx = this.analogueX * maxVelX;
        const curVx    = this.player.velocity.x;
        Matter.Body.setVelocity(this.player, {
          x: curVx + (targetVx - curVx) * 0.30,
          y: this.player.velocity.y
        });
      } else {
        // Keyboard: force-based (unchanged)
        if (this.keys["ArrowLeft"] || this.keys["KeyA"]) Matter.Body.applyForce(this.player, this.player.position, { x: -moveForce, y: 0 });
        if (this.keys["ArrowRight"] || this.keys["KeyD"]) Matter.Body.applyForce(this.player, this.player.position, { x: moveForce, y: 0 });
      }

      if (Math.abs(this.player.velocity.x) > maxVelX) {
        Matter.Body.setVelocity(this.player, {
          x: Math.sign(this.player.velocity.x) * maxVelX,
          y: this.player.velocity.y
        });
      }
    }

    this.isWallSliding = (onLeftWall || onRightWall) && !this.isGrounded && this.player.velocity.y > 0;
    this.wallDirection = onLeftWall ? -1 : (onRightWall ? 1 : 0);
    if (this.isWallSliding && this.player.velocity.y > 2.2) Matter.Body.setVelocity(this.player, { x: this.player.velocity.x, y: 2.2 });

    if (this.isGrounded) this.coyoteTimer = 0; else this.coyoteTimer += dtMs;
    this.jumpBufferTimer -= dtMs;

    const jumpHeld = this.keys["Space"] || this.keys["ArrowUp"] || this.keys["KeyW"];
    const jumpJustPressed = jumpHeld && !this.jumpPressed;
    
    if (jumpJustPressed) {
      if (this.isGrounded || this.coyoteTimer < 140) {
        Matter.Body.setVelocity(this.player, { x: this.player.velocity.x, y: -11 });
        this.coyoteTimer = 999;
        this.jumpPressed = true;
        this.jumpBufferTimer = 0;
      } else if (this.airJumpsUsed < this.MAX_AIR_JUMPS && !this.isWallSliding) {
        Matter.Body.setVelocity(this.player, { x: this.player.velocity.x, y: -9 });
        this.airJumpsUsed++;
        this.jumpPressed = true;
      } else if (this.isWallSliding) {
        this.wallJump();
        this.jumpPressed = true;
      } else {
        this.jumpBufferTimer = 150;
        this.jumpPressed = true;
      }
    }
    if (!jumpHeld) this.jumpPressed = false;
    if (this.isGrounded && this.jumpBufferTimer > 0 && !this.jumpPressed) {
      this.jump();
      this.jumpBufferTimer = 0;
      this.airJumpsUsed = 0;
    }

    // Camera
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    
    const centerX = screenW / 2 / this.worldScale;
    const centerY = screenH / 2 / this.worldScale;
    const lookAheadX = this.player.velocity.x * 20;

    const rawCamX = this.player.position.x - centerX + lookAheadX;
    const rawCamY = this.player.position.y - centerY;

    const targetX = -rawCamX * this.worldScale;
    const targetY = -rawCamY * this.worldScale;

    const curX = this.worldContainer.position.x;
    const curY = this.worldContainer.position.y;

    this.worldContainer.position.set(
      this.clampCameraX(curX + (targetX - curX) * 0.08),
      this.clampCameraY(curY + (targetY - curY) * 0.08)
    );

    if (this.player.position.y > this.levelData.height + 200) {
      this.onDeath();
      this.respawn();
    }

    const exitPos = this.levelData.exit || { x: 1200, y: 100 };
    if (Math.hypot(this.player.position.x - exitPos.x, this.player.position.y - exitPos.y) < 50) {
      this.onWin(this.getElapsedSeconds());
    }

    if (this.spawnArrow) {
      const shown = Date.now() - this.playerSpawnTime < 3000;
      this.spawnArrow.visible = shown;
      if (shown) {
        this.spawnArrow.position.set(this.player.position.x, this.player.position.y - 70);
        this.spawnArrow.alpha = Math.sin(Date.now() / 200) * 0.3 + 0.7;
      }
    }
  }

  public getElapsedSeconds() {
    return Math.floor((Date.now() - this.playerSpawnTime) / 1000);
  }

  public refreshLevel(newLevelData: LevelData): void {
    console.log("[GameCore] Refreshing level with refined data...");

    // Remove all existing static physics bodies (platforms/walls)
    const bodiesToRemove = Matter.Composite.allBodies(this.engine.world)
      .filter(b => b.isStatic && b.label !== "hard_floor");
    bodiesToRemove.forEach(b => Matter.Composite.remove(this.engine.world, b));

    // Remove all PIXI children except background (index 0), player, exit, spawn arrow
    // Keep indices 0 (bg) and rebuild the rest
    const childrenToKeep = [
      this.playerSprite,
      this.exitGraphics,
      this.spawnArrow,
      this.jumpIndicator
    ].filter(Boolean);

    this.worldContainer.children
      .filter(c => !childrenToKeep.includes(c as any))
      .slice(1) // keep bg at index 0
      .forEach(c => this.worldContainer.removeChild(c));

    // Clear fragile tracking and enemies
    this.fragilePlatforms.clear();
    this.enemies.forEach(e => Matter.Composite.remove(this.engine.world, e.body));
    this.enemies = [];

    // Rebuild with new level data
    this.levelData = newLevelData;
    this.buildPhysics();
    this.spawnEnemies();

    // Move player back to spawn
    this.respawn();
    console.log("[GameCore] Level refresh complete");
  }

  private jump() {
    if (!this.player) return;
    Matter.Body.setVelocity(this.player, { x: this.player.velocity.x, y: -11 });
    this.isGrounded = false;
  }

  private wallJump() {
    if (!this.player) return;
    Matter.Body.setVelocity(this.player, { x: -this.wallDirection * 9, y: -10 });
    this.lastWallJumpTime = Date.now();
    this.airJumpsUsed = 0;
  }

  private respawn() {
    if (!this.player) return;
    const spawn = this.levelData.spawn || { x: 100, y: 100 };
    Matter.Body.setPosition(this.player, spawn);
    Matter.Body.setVelocity(this.player, { x: 0, y: 0 });
    this.playerSpawnTime = Date.now();
    this.airJumpsUsed = 0;
  }

  public destroy() {
    this.app.destroy(true, { children: true });
    Matter.Engine.clear(this.engine);
    this.audio.destroy();
    this.enemies.forEach(e => Matter.Composite.remove(this.engine.world, e.body));
    this.enemies = [];
    this.fragilePlatforms.clear();
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup",   this.handleKeyUp);
    window.removeEventListener("resize",  this.handleResize);
  }

  public setKey(code: string, value: boolean): void {
    this.keys[code] = value;
  }

  public setAnalogueX(value: number): void {
    this.analogueX = Math.max(-1, Math.min(1, value));
  }

  public setMuteBg(m: boolean)  { this.audio.setMuteBg(m); }
  public setMuteSfx(m: boolean) { this.audio.setMuteSfx(m); }

  private async cropFrameFromSheet(
    sheetDataUrl: string,
    sx: number, sy: number, sw: number, sh: number
  ): Promise<PIXI.Texture> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const dataUrl = canvas.toDataURL('image/png');
        PIXI.Assets.load(dataUrl)
          .then(tex => resolve(tex))
          .catch(reject);
      };
      img.onerror = reject;
      img.src = sheetDataUrl;
    });
  }
}
