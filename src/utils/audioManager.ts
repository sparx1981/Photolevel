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
      case "urban_outdoor": this.bgNodes.push(
        ...this.makeUrbanSoundscape(ctx),
        ...this.makeBirds(ctx),
        ...this.makeWind(ctx, 0.04)
      ); break;
      case "interior_busy":  this.bgNodes.push(...this.makeBusyCrowd(ctx)); break;
      case "industrial":     this.bgNodes.push(...this.makeIndustrialDrone(ctx)); break;
      case "interior_calm":
      default:               this.bgNodes.push(...this.makeCalmInterior(ctx)); break;
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

  private makeUrbanSoundscape(ctx: AudioContext): AudioNode[] {
    const nodes: AudioNode[] = [];

    // ── Layer 1: Traffic rumble — filtered low noise, continuous ─────────────
    const rumbleBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const rumbleData = rumbleBuf.getChannelData(0);
    for (let i = 0; i < rumbleData.length; i++) rumbleData[i] = Math.random() * 2 - 1;
    const rumbleSrc = ctx.createBufferSource(); rumbleSrc.buffer = rumbleBuf; rumbleSrc.loop = true;
    const rumbleLp  = ctx.createBiquadFilter(); rumbleLp.type = "lowpass"; rumbleLp.frequency.value = 160;
    const rumbleHp  = ctx.createBiquadFilter(); rumbleHp.type = "highpass"; rumbleHp.frequency.value = 40;
    const rumbleG   = ctx.createGain(); rumbleG.gain.value = 0.18;
    // Slow LFO makes the traffic feel like it ebbs slightly
    const rumbleLfo = ctx.createOscillator(); rumbleLfo.frequency.value = 0.07;
    const rumbleLg  = ctx.createGain(); rumbleLg.gain.value = 0.06;
    rumbleLfo.connect(rumbleLg); rumbleLg.connect(rumbleG.gain);
    rumbleSrc.connect(rumbleLp); rumbleLp.connect(rumbleHp); rumbleHp.connect(rumbleG);
    rumbleG.connect(this.bgGain!);
    rumbleSrc.start(); rumbleLfo.start();
    nodes.push(rumbleSrc, rumbleLfo);

    // ── Layer 2: Car pass-bys — Doppler-style bandpass sweeps ────────────────
    const scheduleCarPass = (delay: number) => {
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.4, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const bp  = ctx.createBiquadFilter(); bp.type = "bandpass";
      const t   = ctx.currentTime + delay;
      // Frequency sweeps down like a passing car (high pitch approaching → lower receding)
      bp.frequency.setValueAtTime(900, t);
      bp.frequency.linearRampToValueAtTime(220, t + 1.2);
      bp.Q.value = 1.8;
      const g   = ctx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.11 + Math.random() * 0.06, t + 0.35);
      g.gain.linearRampToValueAtTime(0.0, t + 1.3);
      src.connect(bp); bp.connect(g); g.connect(this.bgGain!);
      src.start(t); src.stop(t + 1.4);
      nodes.push(src);
    };
    // Schedule several cars at staggered intervals
    const carTimes = [1.2, 3.8, 6.1, 9.4, 12.0, 15.7, 18.3];
    for (const t of carTimes) scheduleCarPass(t + Math.random() * 1.5);

    // ── Layer 3: Distant crowd murmur — overlapping formant blobs ────────────
    // Simulate indistinct voices using amplitude-modulated filtered noise bursts
    const scheduleMurmur = (delay: number) => {
      const dur = 0.25 + Math.random() * 0.35;
      const nBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const nData = nBuf.getChannelData(0);
      for (let i = 0; i < nData.length; i++) nData[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = nBuf;
      // Formant filter — centres around speech vowel frequencies (300–800 Hz)
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
      bp.frequency.value = 300 + Math.random() * 500;
      bp.Q.value = 3.5 + Math.random() * 2;
      const g = ctx.createGain(); const t = ctx.currentTime + delay;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.028 + Math.random() * 0.018, t + dur * 0.3);
      g.gain.linearRampToValueAtTime(0, t + dur);
      src.connect(bp); bp.connect(g); g.connect(this.bgGain!);
      src.start(t); src.stop(t + dur + 0.05);
      nodes.push(src);
    };
    // Dense cluster of murmur events across 20s
    for (let i = 0; i < 40; i++) scheduleMurmur(Math.random() * 20);

    return nodes;
  }

  private makeCalmInterior(ctx: AudioContext): AudioNode[] {
    // Gentle HVAC/room tone — very soft filtered noise + low sine hum
    const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp  = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 200;
    const g   = ctx.createGain(); g.gain.value = 0.028;
    src.connect(lp); lp.connect(g); g.connect(this.bgGain!); src.start();

    const hum = ctx.createOscillator(); hum.type = "sine"; hum.frequency.value = 58;
    const hg  = ctx.createGain(); hg.gain.value = 0.012;
    hum.connect(hg); hg.connect(this.bgGain!); hum.start();
    return [src, hum];
  }

  private makeBusyCrowd(ctx: AudioContext): AudioNode[] {
    const nodes: AudioNode[] = [];
    const masterOut = this.bgGain || ctx.destination;

    // ── 1. Room Reverb (Convolver) ──────────────────────────────────────────────
    const revLen = ctx.sampleRate * 1.2;
    const impulse = ctx.createBuffer(2, revLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const channelData = impulse.getChannelData(c);
      for (let i = 0; i < revLen; i++) {
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / revLen, 4);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;

    const revWet = ctx.createGain();
    revWet.gain.value = 0.20;
    convolver.connect(revWet);
    revWet.connect(masterOut);
    nodes.push(convolver);

    // ── 2. Environment "Room Tone" ──────────────────────────────────────────────
    const roomBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const roomData = roomBuf.getChannelData(0);
    for (let i = 0; i < roomData.length; i++) roomData[i] = Math.random() * 2 - 1;
    
    const roomTone = ctx.createBufferSource();
    roomTone.buffer = roomBuf;
    roomTone.loop = true;

    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = "lowpass";
    toneFilter.frequency.value = 350;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.08;

    roomTone.connect(toneFilter); 
    toneFilter.connect(toneGain);
    toneGain.connect(masterOut);
    toneGain.connect(convolver);
    
    roomTone.start();
    nodes.push(roomTone);

    // ── 3. 12 Independent Voice Channels ────────────────────────────────────────
    for (let v = 0; v < 12; v++) {
      const isFemale = v % 2 === 0;
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = nBuf.getChannelData(0);
      let acc = 0;
      for (let i = 0; i < nd.length; i++) {
        acc = acc * 0.98 + (Math.random() * 2 - 1) * 0.02; 
        nd[i] = acc * 40;
      }
      const src = ctx.createBufferSource(); 
      src.buffer = nBuf; 
      src.loop = true;

      const f1 = ctx.createBiquadFilter(); f1.type = "bandpass";
      f1.frequency.value = isFemale ? 500 + Math.random() * 250 : 300 + Math.random() * 200;
      f1.Q.value = 4 + Math.random() * 3;

      const f2 = ctx.createBiquadFilter(); f2.type = "bandpass";
      f2.frequency.value = isFemale ? 1600 + Math.random() * 800 : 1000 + Math.random() * 600;
      f2.Q.value = 6 + Math.random() * 4;

      const driftOsc = ctx.createOscillator();
      driftOsc.frequency.value = 0.3 + Math.random() * 0.8;
      const driftGain = ctx.createGain();
      driftGain.gain.value = 150;
      driftOsc.connect(driftGain);
      driftGain.connect(f1.frequency);
      driftGain.connect(f2.frequency);

      const fMix = ctx.createGain(); fMix.gain.value = 0.8;
      src.connect(f1); src.connect(f2); 
      f1.connect(fMix); f2.connect(fMix);

      const sylGain = ctx.createGain();
      sylGain.gain.value = 0;

      const sylOsc1 = ctx.createOscillator();
      sylOsc1.frequency.value = 2.0 + Math.random() * 2.0;
      const sylOsc2 = ctx.createOscillator();
      sylOsc2.frequency.value = 3.5 + Math.random() * 2.5;

      const modMix = ctx.createGain(); 
      modMix.gain.value = 0.4;
      sylOsc1.connect(modMix);
      sylOsc2.connect(modMix);
      modMix.connect(sylGain.gain);

      const vGain = ctx.createGain();
      vGain.gain.value = 0.025 + Math.random() * 0.02; 

      fMix.connect(sylGain);
      sylGain.connect(vGain);

      vGain.connect(masterOut);
      vGain.connect(convolver);

      const offset = Math.random() * 5;
      src.start(ctx.currentTime + offset);
      driftOsc.start(ctx.currentTime + offset);
      sylOsc1.start(ctx.currentTime + offset);
      sylOsc2.start(ctx.currentTime + offset);

      nodes.push(src, driftOsc, sylOsc1, sylOsc2);
    }

    // ── 4. Occasional hard transients — cups, cutlery, chair scrapes ─────────────
    const scheduleClink = (delay: number) => {
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator(); o.type = "triangle";
      const isGlass = Math.random() > 0.5;
      o.frequency.setValueAtTime(
        isGlass ? 2200 + Math.random() * 1800 : 800 + Math.random() * 800, t
      );
      o.frequency.exponentialRampToValueAtTime(
        isGlass ? 600 : 200, t + (isGlass ? 0.15 : 0.08)
      );
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.022 + Math.random() * 0.018, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (isGlass ? 0.18 : 0.10));
      o.connect(g); g.connect(this.bgGain!);
      o.start(t); o.stop(t + 0.2);
      nodes.push(o);
    };
    const clinkTimes = [1.6, 4.2, 7.8, 10.3, 13.1, 16.4, 19.0];
    for (const t of clinkTimes) scheduleClink(t + Math.random() * 1.8);

    return nodes;
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
