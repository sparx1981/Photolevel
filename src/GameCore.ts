import * as PIXI from "pixi.js";
import Matter from "matter-js";
import { LevelData } from "./types";

export class GameCore {
  private app: PIXI.Application;
  private engine: Matter.Engine;
  private worldContainer: PIXI.Container;
  private player: Matter.Body | null = null;
  private playerSprite: PIXI.Graphics | null = null;
  private levelData: LevelData;
  private imageBase64: string;
  private keys: Record<string, boolean> = {};
  
  private isGrounded = false;
  private onWin: () => void;
  private onDeath: () => void;
  private initialized = false;
  
  private handleKeyDown = (e: KeyboardEvent) => { this.keys[e.code] = true; };
  private handleKeyUp = (e: KeyboardEvent) => { this.keys[e.code] = false; };

  constructor(container: HTMLDivElement, levelData: LevelData, imageBase64: string, onWin: () => void, onDeath: () => void) {
    console.log("GameCore: Constructor started");
    this.levelData = levelData;
    this.imageBase64 = imageBase64;
    this.onWin = onWin;
    this.onDeath = onDeath;

    // Matter.js setup
    this.engine = Matter.Engine.create();
    this.engine.gravity.y = 1.2;

    // PixiJS setup
    this.app = new PIXI.Application();
    this.worldContainer = new PIXI.Container();
    
    this.init(container);
  }

  private async init(container: HTMLDivElement) {
    if (this.initialized) return;
    try {
      console.log("GameCore: init() beginning", { 
        levelWidth: this.levelData.width, 
        levelHeight: this.levelData.height,
        containerSize: { w: container.clientWidth, h: container.clientHeight }
      });

      await this.app.init({
        width: container.clientWidth || 1280,
        height: container.clientHeight || 720,
        background: 0x050505,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        resizeTo: container
      });
      
      console.log("GameCore: PixiJS app.init successful. Screen:", this.app.screen.width, "x", this.app.screen.height);

      this.app.canvas.style.display = "block";
      this.app.canvas.style.position = "absolute";
      this.app.canvas.style.top = "0";
      this.app.canvas.style.left = "0";
      this.app.canvas.style.width = "100%";
      this.app.canvas.style.height = "100%";
      
      container.appendChild(this.app.canvas);
      this.app.stage.addChild(this.worldContainer);

      // Loading background
      console.log("GameCore: Creating background sprite from image...");
      const bgTexture = PIXI.Texture.from(this.imageBase64);
      const bgSprite = new PIXI.Sprite(bgTexture);
      bgSprite.width = this.levelData.width;
      bgSprite.height = this.levelData.height;
      this.worldContainer.addChild(bgSprite);

      // Dark overlay
      const overlay = new PIXI.Graphics();
      overlay.rect(0, 0, this.levelData.width, this.levelData.height);
      overlay.fill({ color: 0x000000, alpha: 0.4 });
      this.worldContainer.addChild(overlay);

      // Build objects
      console.log("GameCore: Building physics bodies...");
      this.buildPhysics();
      this.createPlayer();
      this.createExit();

      // Start camera
      if (this.player) {
        const startX = -this.player.position.x + this.app.screen.width / 2;
        const startY = -this.player.position.y + this.app.screen.height / 2;
        this.worldContainer.position.set(startX, startY);
        console.log("GameCore: Camera set to initial pos:", { startX, startY });
      }

      window.addEventListener("keydown", this.handleKeyDown);
      window.addEventListener("keyup", this.handleKeyUp);

      this.app.ticker.add((ticker) => {
        try {
          this.update(ticker.deltaTime);
        } catch (e) {
          console.error("GameCore: Update crash", e);
        }
      });
      
      this.initialized = true;
      console.log("GameCore: Init complete. Child count:", this.worldContainer.children.length);
    } catch (error) {
      console.error("GameCore: Init Error:", error);
    }
  }

  private buildPhysics() {
    const bodies: Matter.Body[] = [];

    this.levelData.platforms.forEach((p, index) => {
      const body = Matter.Bodies.rectangle(p.x, p.y, p.width, p.height, { isStatic: true, label: `platform_${index}` });
      bodies.push(body);

      const graphics = new PIXI.Graphics();
      graphics.roundRect(p.x - p.width / 2, p.y - p.height / 2, p.width, p.height, 4);
      graphics.fill({ color: 0x3b82f6, alpha: 0.6 });
      graphics.stroke({ color: 0x60a5fa, width: 2, alpha: 0.9 });
      this.worldContainer.addChild(graphics);
    });

    this.levelData.walls.forEach((w, index) => {
      const body = Matter.Bodies.rectangle(w.x, w.y, w.width, w.height, { isStatic: true, label: `wall_${index}` });
      bodies.push(body);

      const graphics = new PIXI.Graphics();
      graphics.roundRect(w.x - w.width / 2, w.y - w.height / 2, w.width, w.height, 2);
      graphics.fill({ color: 0x475569, alpha: 0.6 });
      this.worldContainer.addChild(graphics);
    });

    Matter.World.add(this.engine.world, bodies);
  }

  private createPlayer() {
    if (!this.levelData.spawn) {
       this.levelData.spawn = { x: 100, y: 100 };
    }
    this.player = Matter.Bodies.rectangle(this.levelData.spawn.x, this.levelData.spawn.y, 32, 48, {
      friction: 0.1,
      frictionAir: 0.05,
      inertia: Infinity,
      label: "player",
      restitution: 0
    });
    Matter.World.add(this.engine.world, this.player);

    const graphics = new PIXI.Graphics();
    graphics.roundRect(-16, -24, 32, 48, 8);
    graphics.fill({ color: 0xffffff });
    graphics.circle(0, 0, 40);
    graphics.fill({ color: 0x3b82f6, alpha: 0.2 });
    graphics.circle(-6, -10, 3);
    graphics.fill({ color: 0x000000 });
    graphics.circle(6, -10, 3);
    graphics.fill({ color: 0x000000 });
    
    this.playerSprite = graphics;
    this.worldContainer.addChild(this.playerSprite);
  }

  private createExit() {
    if (!this.levelData.exit) return;
    const exitSensor = Matter.Bodies.rectangle(this.levelData.exit.x, this.levelData.exit.y, 80, 80, {
      isSensor: true,
      isStatic: true,
      label: "exit"
    });
    Matter.World.add(this.engine.world, exitSensor);

    const graphics = new PIXI.Graphics();
    graphics.circle(this.levelData.exit.x, this.levelData.exit.y, 40);
    graphics.stroke({ color: 0x22c55e, width: 4, alpha: 0.8 });
    graphics.fill({ color: 0x22c55e, alpha: 0.3 });
    this.worldContainer.addChild(graphics);

    Matter.Events.on(this.engine, "collisionStart", (event) => {
      event.pairs.forEach(pair => {
        if ((pair.bodyA.label === "player" && pair.bodyB.label === "exit") ||
            (pair.bodyB.label === "player" && pair.bodyA.label === "exit")) {
          this.onWin();
        }
      });
    });
  }

  private update(delta: number) {
    if (!this.player || !this.playerSprite || !this.initialized) return;

    Matter.Engine.update(this.engine, (1000 / 60) * delta);
    this.playerSprite.position.set(this.player.position.x, this.player.position.y);

    const moveSpeed = 0.008 * delta;
    if (this.keys["ArrowLeft"] || this.keys["KeyA"]) Matter.Body.applyForce(this.player, this.player.position, { x: -moveSpeed, y: 0 });
    if (this.keys["ArrowRight"] || this.keys["KeyD"]) Matter.Body.applyForce(this.player, this.player.position, { x: moveSpeed, y: 0 });

    const maxVelocity = 8;
    if (Math.abs(this.player.velocity.x) > maxVelocity) {
      Matter.Body.setVelocity(this.player, { x: Math.sign(this.player.velocity.x) * maxVelocity, y: this.player.velocity.y });
    }

    const bodies = Matter.Composite.allBodies(this.engine.world).filter(b => b.isStatic);
    const collisions = Matter.Query.ray(bodies, { x: this.player.position.x, y: this.player.position.y }, { x: this.player.position.x, y: this.player.position.y + 35 });
    this.isGrounded = collisions.length > 0;

    if ((this.keys["Space"] || this.keys["ArrowUp"] || this.keys["KeyW"]) && this.isGrounded) {
      Matter.Body.setVelocity(this.player, { x: this.player.velocity.x, y: -14 });
    }

    const targetX = -this.player.position.x + this.app.screen.width / 2;
    const targetY = -this.player.position.y + this.app.screen.height / 2;
    if (!isNaN(targetX) && !isNaN(targetY)) {
      const lerp = 0.1 * delta;
      this.worldContainer.position.x += (targetX - this.worldContainer.position.x) * lerp;
      this.worldContainer.position.y += (targetY - this.worldContainer.position.y) * lerp;
    }

    if (this.player.position.y > this.levelData.height + 600 || this.player.position.y < -2000) {
      this.onDeath();
      this.respawn();
    }
  }

  private respawn() {
    if (this.player) {
      Matter.Body.setPosition(this.player, { x: this.levelData.spawn.x, y: this.levelData.spawn.y });
      Matter.Body.setVelocity(this.player, { x: 0, y: 0 });
    }
  }

  public destroy() {
    console.log("GameCore: destroy() called");
    this.app.ticker.stop();
    this.app.destroy(true, { children: true, texture: true });
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    Matter.Engine.clear(this.engine);
  }
}
