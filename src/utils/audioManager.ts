export type SceneType =
  | "nature_outdoor" | "urban_outdoor" | "interior_calm"
  | "interior_busy"  | "industrial"    | "coastal" | "default";

export const SCENE_LABELS: Record<SceneType, string> = {
  nature_outdoor: "Nature / Outdoors",
  urban_outdoor:  "Urban Outdoors",
  interior_calm:  "Calm Interior",
  interior_busy:  "Busy Interior",
  industrial:     "Industrial",
  coastal:        "Coastal / Water",
  default:        "Ambient",
};

export class AudioManager {
  private ctx:     AudioContext | null = null;
  private bgGain:  GainNode    | null = null;
  private sfxGain: GainNode    | null = null;
  private bgNodes: AudioNode[]        = [];
  private lastStepTime = 0;
  public  activeScene: SceneType = "default";
  public  muteBg  = false;
  public  muteSfx = false;

  private ensureCtx() {
    if (!this.ctx) {
      this.ctx    = new AudioContext();
      this.bgGain  = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.bgGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  startAmbient(sceneType: SceneType) {
    this.stopAmbient();
    this.activeScene = sceneType;
    const ctx = this.ensureCtx();
    if (!this.bgGain) return;
    this.bgGain.gain.setValueAtTime(this.muteBg ? 0 : 0.20, ctx.currentTime);
    switch (sceneType) {
      case "nature_outdoor": this.bgNodes.push(...this.makeWind(ctx, 0.14), ...this.makeBirds(ctx)); break;
      case "coastal":        this.bgNodes.push(...this.makeWaves(ctx), ...this.makeWind(ctx, 0.07)); break;
      case "urban_outdoor":  this.bgNodes.push(...this.makeUrbanHum(ctx), ...this.makeWind(ctx, 0.05)); break;
      case "interior_busy":  this.bgNodes.push(...this.makeInteriorHum(ctx, 120)); break;
      case "industrial":     this.bgNodes.push(...this.makeIndustrialDrone(ctx)); break;
      case "interior_calm":
      default:               this.bgNodes.push(...this.makeInteriorHum(ctx, 60)); break;
    }
  }

  stopAmbient() {
    for (const n of this.bgNodes) {
      try { (n as OscillatorNode).stop?.(); n.disconnect(); } catch {}
    }
    this.bgNodes = [];
  }

  setMuteBg(m: boolean) {
    this.muteBg = m;
    if (this.bgGain && this.ctx)
      this.bgGain.gain.setTargetAtTime(m ? 0 : 0.20, this.ctx.currentTime, 0.3);
  }

  setMuteSfx(m: boolean) {
    this.muteSfx = m;
    if (this.sfxGain && this.ctx)
      this.sfxGain.gain.setTargetAtTime(m ? 0 : 1.0, this.ctx.currentTime, 0.1);
  }

  playStep(isRunning: boolean) {
    if (this.muteSfx) return;
    const now = Date.now();
    if (now - this.lastStepTime < (isRunning ? 270 : 380)) return;
    this.lastStepTime = now;
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.07, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.exp(-i/(d.length*0.25));
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 300; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.07);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t+0.07);
  }

  playLand(fallHeight: number) {
    if (this.muteSfx) return;
    const ctx = this.ensureCtx();
    if (!this.sfxGain) return;
    const t = ctx.currentTime;
    const intensity = Math.min(1, fallHeight / 280);
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(85 + intensity*40, t);
    osc.frequency.exponentialRampToValueAtTime(28, t+0.13);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.22 + intensity*0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+0.14);
    osc.connect(g); g.connect(this.sfxGain); osc.start(t); osc.stop(t+0.14);
    if (intensity > 0.3) {
      const nb = ctx.createBuffer(1, ctx.sampleRate*0.04, ctx.sampleRate);
      const nd = nb.getChannelData(0); for (let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const nf = ctx.createBiquadFilter(); nf.type="highpass"; nf.frequency.value=600;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.07*intensity,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.04);
      ns.connect(nf); nf.connect(ng); ng.connect(this.sfxGain); ns.start(t); ns.stop(t+0.04);
    }
  }

  destroy() { this.stopAmbient(); this.ctx?.close(); this.ctx = null; }

  // ── Generators ────────────────────────────────────────────────────────────
  private makeWind(ctx: AudioContext, vol=0.10): AudioNode[] {
    const buf = ctx.createBuffer(1, ctx.sampleRate*3, ctx.sampleRate);
    const d = buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    const src = ctx.createBufferSource(); src.buffer=buf; src.loop=true;
    const lp = ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=380;
    const g = ctx.createGain(); g.gain.value=vol;
    const lfo = ctx.createOscillator(); lfo.frequency.value=0.10;
    const lg = ctx.createGain(); lg.gain.value=vol*0.55;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.bgGain!);
    src.start(); lfo.start(); return [src, lfo];
  }
  private makeBirds(ctx: AudioContext): AudioNode[] {
    const nodes: AudioNode[] = [];
    const chirp = (delay: number) => {
      const o = ctx.createOscillator(); o.type="sine";
      const t = ctx.currentTime+delay;
      o.frequency.setValueAtTime(2200+Math.random()*800,t);
      o.frequency.exponentialRampToValueAtTime(3000+Math.random()*400,t+0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.04,t+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.13);
      o.connect(g); g.connect(this.bgGain!); o.start(t); o.stop(t+0.14); nodes.push(o);
    };
    for (let i=0;i<8;i++) chirp(i*2.4+Math.random()*1.4);
    return nodes;
  }
  private makeWaves(ctx: AudioContext): AudioNode[] {
    const buf = ctx.createBuffer(1, ctx.sampleRate*4, ctx.sampleRate);
    const d = buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    const src = ctx.createBufferSource(); src.buffer=buf; src.loop=true;
    const lp = ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=700;
    const g = ctx.createGain(); g.gain.value=0.22;
    const lfo = ctx.createOscillator(); lfo.frequency.value=0.17;
    const lg = ctx.createGain(); lg.gain.value=0.15;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.bgGain!); src.start(); lfo.start(); return [src,lfo];
  }
  private makeUrbanHum(ctx: AudioContext): AudioNode[] {
    const nodes: AudioNode[] = [];
    [80,120,240].forEach(freq => {
      const o = ctx.createOscillator(); o.type="sawtooth"; o.frequency.value=freq;
      const lp = ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=280;
      const g = ctx.createGain(); g.gain.value=0.016;
      o.connect(lp); lp.connect(g); g.connect(this.bgGain!); o.start(); nodes.push(o);
    }); return nodes;
  }
  private makeInteriorHum(ctx: AudioContext, baseHz: number): AudioNode[] {
    const o = ctx.createOscillator(); o.type="sine"; o.frequency.value=baseHz;
    const lp = ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=180;
    const g = ctx.createGain(); g.gain.value=0.022;
    o.connect(lp); lp.connect(g); g.connect(this.bgGain!); o.start(); return [o];
  }
  private makeIndustrialDrone(ctx: AudioContext): AudioNode[] {
    const nodes: AudioNode[] = [];
    [55,110,165].forEach((freq,i) => {
      const o = ctx.createOscillator(); o.type = i===0?"sawtooth":"square"; o.frequency.value=freq;
      const lp = ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=380;
      const g = ctx.createGain(); g.gain.value=0.020-i*0.004;
      o.connect(lp); lp.connect(g); g.connect(this.bgGain!); o.start(); nodes.push(o);
    }); return nodes;
  }
}
