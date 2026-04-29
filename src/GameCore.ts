import * as PIXI from "pixi.js";
import Matter from "matter-js";
import { LevelData, DifficultyConfig, PlatformState } from "./types";

const PLATFORM_THEME_COLOURS: Record<string, { top: number; side: number; highlight: number }> = {
  stone_ledge:    { top: 0x8a8a7a, side: 0x4a4a3a, highlight: 0xb8b8a8 },
  wooden_plank:   { top: 0xb87850, side: 0x6a3820, highlight: 0xd8a878 },
  metal_platform: { top: 0x6888a0, side: 0x384858, highlight: 0x98c0d8 },
  rooftop:        { top: 0x586878, side: 0x303848, highlight: 0x788898 },
  tree_branch:    { top: 0x527038, side: 0x2e4018, highlight: 0x72a050 },
  rock_outcrop:   { top: 0x726050, side: 0x402e20, highlight: 0x988070 },
  ice_shelf:      { top: 0x98c8e0, side: 0x5888a8, highlight: 0xc8eeff },
  dirt_ground:    { top: 0x7a5a2a, side: 0x402e10, highlight: 0xa07840 },
  generic:        { top: 0x587080, side: 0x304050, highlight: 0x789ab0 },
};

export class GameCore {
  private app: PIXI.Application;
  private engine: Matter.Engine;
  private player: Matter.Body | null = null;
  private worldContainer: PIXI.Container;
  private playerSprite: PIXI.Graphics | null = null;
  private spawnArrow: PIXI.Graphics | null = null;
  private exitGraphics: PIXI.Graphics | null = null;
  private jumpIndicator: PIXI.Graphics | null = null;
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
    sprite:     PIXI.Graphics;
    direction:  number;       // 1 = right, -1 = left
    minX:       number;
    maxX:       number;
    speed:      number;
    platformY:  number;
  }> = [];

  constructor(
    container: HTMLDivElement,
    levelData: LevelData,
    imageBase64: string,
    onWin: (time: number) => void,
    onDeath: () => void,
    difficulty: DifficultyConfig
  ) {
    this.levelData = levelData;
    this.imageBase64 = imageBase64;
    this.onWin = onWin;
    this.onDeath = onDeath;
    this.difficulty = difficulty;

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
      this.buildPhysics();
      this.createPlayer();
      this.createExit();
      this.spawnEnemies();

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

      const colours = PLATFORM_THEME_COLOURS[p.theme ?? "generic"];
      const gfx = new PIXI.Graphics();
      this.drawPlatformGfx(gfx, effectiveWidth, p.height, colours, isFragile);
      gfx.x = p.x;
      gfx.y = p.y;
      gfx.rotation = angleRad;
      this.worldContainer.addChild(gfx);

      if (p.label) {
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
      const colours = PLATFORM_THEME_COLOURS[w.theme ?? "generic"];
      gfx.rect(w.x - w.width / 2, w.y - w.height / 2, w.width, w.height);
      gfx.fill({ color: colours.side, alpha: 0.8 });
      this.worldContainer.addChild(gfx);
    });

    Matter.Composite.add(this.engine.world, bodies);
  }

  private drawPlatformGfx(
    gfx: PIXI.Graphics,
    width: number,
    height: number,
    colours: { top: number; side: number; highlight: number },
    isFragile = false
  ) {
    gfx.clear();
    const alpha = isFragile ? 0.65 : 1.0;
    gfx.rect(-width / 2, -2, width, 3);
    gfx.fill({ color: isFragile ? 0xff8844 : colours.highlight, alpha: alpha * 0.95 });
    gfx.rect(-width / 2, 1, width, 6);
    gfx.fill({ color: colours.top, alpha: alpha * 0.70 });
    gfx.rect(-width / 2, 7, width, 5);
    gfx.fill({ color: colours.side, alpha: alpha * 0.85 });
    if (isFragile) {
      const dashW = 12;
      const gapW  = 6;
      let cx = -width / 2;
      while (cx < width / 2) {
        const dw = Math.min(dashW, width / 2 - cx);
        gfx.rect(cx, -3, dw, 2);
        gfx.fill({ color: 0xff6600, alpha: 0.9 });
        cx += dashW + gapW;
      }
    }
  }

  private createPlayer() {
    const spawn = this.levelData.spawn || { x: 100, y: 100 };
    this.player = Matter.Bodies.rectangle(spawn.x, spawn.y, 30, 50, {
      friction: 0.02,
      frictionAir: 0.02,
      restitution: 0,
      inertia: Infinity,
      label: "player",
    });
    Matter.Composite.add(this.engine.world, [this.player]);

    const graphics = new PIXI.Graphics();
    graphics.roundRect(-15, -25, 30, 50, 8);
    graphics.fill({ color: 0xffffff });
    graphics.rect(-10, -18, 20, 12);
    graphics.fill({ color: 0x333333 });
    graphics.rect(-18, -10, 6, 25);
    graphics.fill({ color: 0xcccccc });

    this.playerSprite = graphics;
    this.worldContainer.addChild(this.playerSprite);

    this.jumpIndicator = new PIXI.Graphics();
    this.worldContainer.addChild(this.jumpIndicator);

    this.spawnArrow = new PIXI.Graphics();
    this.spawnArrow.poly([0, -10, 10, 10, -10, 10]);
    this.spawnArrow.fill({ color: 0x60c8ff });
    this.worldContainer.addChild(this.spawnArrow);

    this.playerSpawnTime = Date.now();
  }

  private spawnEnemies() {
    const d = this.difficulty;
    if (d.enemyCount === 0) return;

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

      const sprite = new PIXI.Graphics();
      this.drawEnemySprite(sprite);
      this.worldContainer.addChild(sprite);

      const speed = 1.8 * d.enemySpeedMultiplier;

      this.enemies.push({
        body, sprite,
        direction: 1,
        minX: plat.x - halfW,
        maxX: plat.x + halfW,
        speed,
        platformY: plat.y
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

  private drawEnemySprite(g: PIXI.Graphics) {
    g.clear();
    g.roundRect(-10, -16, 20, 28, 5);
    g.fill({ color: 0x8b1a1a });
    g.circle(0, -20, 9);
    g.fill({ color: 0xa02020 });
    g.circle(-3, -21, 2.5);
    g.fill({ color: 0xffdd00 });
    g.circle( 3, -21, 2.5);
    g.fill({ color: 0xffdd00 });
    g.roundRect(-9, 10, 7, 10, 2);
    g.fill({ color: 0x5a0f0f });
    g.roundRect( 2, 10, 7, 10, 2);
    g.fill({ color: 0x5a0f0f });
  }

  private createExit() {
    const exit = this.levelData.exit || { x: 1200, y: 100 };
    this.exitGraphics = new PIXI.Graphics();
    this.exitGraphics.circle(0, 0, 30);
    this.exitGraphics.fill({ color: 0x00ff00, alpha: 0.3 });
    this.exitGraphics.stroke({ color: 0x00ff00, width: 2 });
    this.exitGraphics.circle(0, 0, 10);
    this.exitGraphics.fill({ color: 0x00ff00 });
    this.exitGraphics.position.set(exit.x, exit.y);
    this.worldContainer.addChild(this.exitGraphics);
  }

  private update(delta: number) {
    if (!this.player || !this.initialized) return;

    const dtMs = (1000 / 60) * delta;

    this.fragilePlatforms.forEach((fp, key) => {
      switch (fp.state) {
        case "solid": {
          if (this.player) {
            const feetY = this.player.position.y + 25;
            const hit = Matter.Query.ray([fp.body], { x: this.player.position.x, y: feetY }, { x: this.player.position.x, y: feetY + 8 });
            if (hit.length > 0 && this.isGrounded) {
              fp.state = "cracking";
              fp.timer = this.difficulty.fragileCrackMs;
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
            const colours = PLATFORM_THEME_COLOURS[fp.themeKey];
            this.drawPlatformGfx(fp.gfx, fp.width, fp.height, colours, true);
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
      enemy.sprite.scale.x = enemy.direction;
    });

    Matter.Engine.update(this.engine, dtMs);
    this.playerSprite.position.set(this.player.position.x, this.player.position.y);

    if (this.jumpIndicator) {
      this.jumpIndicator.clear();
      const hasAirJump = this.airJumpsUsed < this.MAX_AIR_JUMPS && !this.isGrounded;
      if (!this.isGrounded) {
        this.jumpIndicator.circle(this.player.position.x, this.player.position.y - 40, 4);
        this.jumpIndicator.fill({ color: hasAirJump ? 0x60c8ff : 0x334455, alpha: hasAirJump ? 0.9 : 0.4 });
      }
    }

    if (this.doubleJumpFlash > 0) {
      this.doubleJumpFlash -= dtMs;
      const t = this.doubleJumpFlash / 180;
      if (this.playerSprite) {
        this.playerSprite.tint = PIXI.Color.shared.setValue([1, 1, Math.min(1, 0.6 + t * 0.4)]).toNumber();
      }
    } else if (this.playerSprite && this.playerSprite.tint !== 0xffffff) {
      this.playerSprite.tint = 0xffffff;
    }

    if (this.exitGraphics) this.exitGraphics.alpha = 0.8 + Math.sin(Date.now() / 400) * 0.2;

    const allStaticBodies = Matter.Composite.allBodies(this.engine.world).filter(b => b.isStatic);
    const feetY = this.player.position.y + 25;
    const centreHit = Matter.Query.ray(allStaticBodies, { x: this.player.position.x, y: feetY }, { x: this.player.position.x, y: feetY + 6 });
    const leftHit   = Matter.Query.ray(allStaticBodies, { x: this.player.position.x - 10, y: feetY }, { x: this.player.position.x - 10, y: feetY + 6 });
    const rightHit  = Matter.Query.ray(allStaticBodies, { x: this.player.position.x + 10, y: feetY }, { x: this.player.position.x + 10, y: feetY + 6 });

    const prevGrounded = this.isGrounded;
    this.isGrounded = centreHit.length > 0 || leftHit.length > 0 || rightHit.length > 0;
    if (this.isGrounded !== prevGrounded && this.isGrounded) {
      this.airJumpsUsed = 0;
      this.jumpBufferTimer = 0;
    }

    const leftRay = Matter.Query.ray(allStaticBodies, { x: this.player.position.x - 14, y: this.player.position.y }, { x: this.player.position.x - 20, y: this.player.position.y });
    const rightRay = Matter.Query.ray(allStaticBodies, { x: this.player.position.x + 14, y: this.player.position.y }, { x: this.player.position.x + 20, y: this.player.position.y });
    const onLeftWall = leftRay.length > 0;
    const onRightWall = rightRay.length > 0;

    if (Date.now() - this.lastWallJumpTime > 150) {
      const moveForce = 0.007 * delta;
      if (this.keys["ArrowLeft"] || this.keys["KeyA"]) Matter.Body.applyForce(this.player, this.player.position, { x: -moveForce, y: 0 });
      if (this.keys["ArrowRight"] || this.keys["KeyD"]) Matter.Body.applyForce(this.player, this.player.position, { x: moveForce, y: 0 });
      const maxVelX = 4.5;
      if (Math.abs(this.player.velocity.x) > maxVelX) Matter.Body.setVelocity(this.player, { x: Math.sign(this.player.velocity.x) * maxVelX, y: this.player.velocity.y });
    }

    this.isWallSliding = (onLeftWall || onRightWall) && !this.isGrounded && this.player.velocity.y > 0;
    this.wallDirection = onLeftWall ? -1 : (onRightWall ? 1 : 0);
    if (this.isWallSliding && this.player.velocity.y > 2.5) Matter.Body.setVelocity(this.player, { x: this.player.velocity.x, y: 2.5 });

    if (this.isGrounded) this.coyoteTimer = 0; else this.coyoteTimer += dtMs;
    this.jumpBufferTimer -= dtMs;

    const jumpHeld = this.keys["Space"] || this.keys["ArrowUp"] || this.keys["KeyW"];
    const jumpJustPressed = jumpHeld && !this.jumpPressed;
    
    if (jumpJustPressed) {
      if (this.isGrounded || this.coyoteTimer < 140) {
        Matter.Body.setVelocity(this.player, { x: this.player.velocity.x, y: -14 });
        this.coyoteTimer = 999;
        this.jumpPressed = true;
        this.jumpBufferTimer = 0;
      } else if (this.airJumpsUsed < this.MAX_AIR_JUMPS && !this.isWallSliding) {
        Matter.Body.setVelocity(this.player, { x: this.player.velocity.x, y: -12 });
        this.airJumpsUsed++;
        this.jumpPressed = true;
        this.doubleJumpFlash = 180;
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
    if (Math.hypot(this.player.position.x - exitPos.x, this.player.position.y - exitPos.y) < 40) {
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

  private jump() {
    if (!this.player) return;
    Matter.Body.setVelocity(this.player, { x: this.player.velocity.x, y: -14 });
    this.isGrounded = false;
  }

  private wallJump() {
    if (!this.player) return;
    Matter.Body.setVelocity(this.player, { x: -this.wallDirection * 9, y: -13 });
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
    this.engine.world.bodies.forEach(b => Matter.Composite.remove(this.engine.world, b));
    this.enemies.forEach(e => Matter.Composite.remove(this.engine.world, e.body));
    this.enemies = [];
    this.fragilePlatforms.clear();
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup",   this.handleKeyUp);
    window.removeEventListener("resize",  this.handleResize);
  }
}
