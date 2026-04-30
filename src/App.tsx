import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GameCore } from "./GameCore";
import { LevelData, DifficultyConfig, getDifficultyConfig } from "./types";
import { SCENE_LABELS } from "./utils/audioManager";
import { 
  generateLevelFromImage, 
  getFallbackLevel 
} from "./services/geminiService";
import LandingScreen from "./components/LandingScreen";
import HelpDialog from "./components/HelpDialog";
import LoadingScreen from "./components/LoadingScreen";
import { Home, Trophy, Skull, HelpCircle, RotateCcw, Flame } from "lucide-react";

type AppState = "landing" | "loading" | "playing" | "won";

// ── Virtual Analogue Joystick ──────────────────────────────────────────────
function VirtualJoystick({ onMove }: { onMove: (x: number) => void }) {
  const baseRef  = useRef<HTMLDivElement>(null);
  const knobRef  = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const KNOB_TRAVEL = 30; // max px the knob moves from centre

  const computeFromEvent = (e: React.PointerEvent) => {
    if (!baseRef.current || !knobRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const dx   = e.clientX - (rect.left + rect.width  / 2);
    const dy   = e.clientY - (rect.top  + rect.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamp = Math.min(dist, KNOB_TRAVEL);
    const angle = Math.atan2(dy, dx);
    const kx = clamp * Math.cos(angle);
    const ky = clamp * Math.sin(angle);
    // Update knob position directly via style — no re-render, no lag
    knobRef.current.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    onMove(kx / KNOB_TRAVEL);  // normalised -1..+1
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    computeFromEvent(e);
  };

  const onMove_ = (e: React.PointerEvent) => {
    if (dragging.current) computeFromEvent(e);
  };

  const onRelease = () => {
    dragging.current = false;
    if (knobRef.current)
      knobRef.current.style.transform = 'translate(-50%, -50%)';
    onMove(0);
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={onDown}
      onPointerMove={onMove_}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      className="w-24 h-24 rounded-full border border-white/20 backdrop-blur-sm relative"
      style={{
        background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 100%)',
        touchAction: 'none',
      }}
    >
      {/* Crosshair guides */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
        <div className="w-full h-px bg-white/40" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
        <div className="h-full w-px bg-white/40" />
      </div>
      {/* Knob */}
      <div
        ref={knobRef}
        className="w-10 h-10 rounded-full absolute left-1/2 top-1/2 pointer-events-none"
        style={{
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.55), rgba(255,255,255,0.20))',
          border: '1.5px solid rgba(255,255,255,0.50)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  );
}

// Standard Game View Component
function GameView({ levelData, imagePreview, onWin, onDeath, onBack, deathCount, difficulty, showDebugLabels, showMobileControls, muteBg, muteSfx, onToggleMuteBg, onToggleMuteSfx }: { 
  levelData: LevelData; 
  imagePreview: string; 
  onWin: (time: number) => void; 
  onDeath: () => void; 
  onBack: () => void; 
  deathCount: number;
  difficulty: DifficultyConfig;
  showDebugLabels: boolean;
  showMobileControls: boolean;
  muteBg: boolean;
  muteSfx: boolean;
  onToggleMuteBg: () => void;
  onToggleMuteSfx: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameCoreRef = useRef<GameCore | null>(null);

  // Sync mute state changes to game core
  useEffect(() => {
    gameCoreRef.current?.setMuteBg(muteBg);
  }, [muteBg]);

  useEffect(() => {
    gameCoreRef.current?.setMuteSfx(muteSfx);
  }, [muteSfx]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current && levelData) {
        gameCoreRef.current = new GameCore(
          containerRef.current,
          levelData,
          imagePreview,
          onWin,
          onDeath,
          difficulty,
          showDebugLabels,
          muteBg,
          muteSfx
        );
      }
    }, 100);
    return () => {
      clearTimeout(timer);
      gameCoreRef.current?.destroy();
    };
  }, [levelData, imagePreview, difficulty, showDebugLabels]);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="w-full h-full relative"
    >
      <div 
        ref={containerRef} 
        className="flex-1 bg-[#050505] relative w-full h-full" 
        style={{ touchAction: 'none' }}
      />

      {showMobileControls && (
        <div className="absolute bottom-0 left-0 right-0 z-30 flex justify-between items-end px-5 pb-8 pointer-events-none select-none">
          {/* Analogue joystick — left side */}
          <div className="pointer-events-auto">
            <VirtualJoystick onMove={(x) => gameCoreRef.current?.setAnalogueX(x)} />
          </div>
          {/* Jump button — right side */}
          <div className="pointer-events-auto">
            <button
              onPointerDown={() => gameCoreRef.current?.setKey('Space', true)}
              onPointerUp={() => gameCoreRef.current?.setKey('Space', false)}
              onPointerLeave={() => gameCoreRef.current?.setKey('Space', false)}
              onPointerCancel={() => gameCoreRef.current?.setKey('Space', false)}
              className="w-20 h-20 rounded-full border border-blue-400/30 backdrop-blur-sm
                        flex items-center justify-center text-blue-300 text-xs font-bold uppercase
                        tracking-widest active:scale-95 transition-all"
              style={{
                background: 'radial-gradient(circle, rgba(59,130,246,0.20) 0%, rgba(59,130,246,0.08) 100%)',
                touchAction: 'none',
              }}
            >Jump</button>
          </div>
        </div>
      )}

      {levelData.theme && (
        <div className="absolute bottom-6 left-6 z-20">
          <div className="px-4 py-2 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md text-left">
            <p className="text-[10px] uppercase tracking-widest text-white/40">{levelData.theme.name}</p>
            <p className="text-xs text-white/60 italic">{levelData.theme.description}</p>
          </div>
        </div>
      )}

      <div className="absolute top-6 left-6 z-20 flex gap-2">
        <button onClick={onBack} className="p-3 rounded-xl bg-black/40 hover:bg-white/20 border border-white/10 backdrop-blur-md text-white transition-all">
          <Home className="w-5 h-5" />
        </button>
        <div className="px-4 py-2 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md text-white font-bold flex items-center gap-3">
          <Skull className="w-4 h-4 text-red-400" />
          <span className="text-sm font-mono">{deathCount}</span>
        </div>
        <div className="px-4 py-2 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md text-white font-bold flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-mono">Lv.{difficulty.level}</span>
        </div>
      </div>

    </motion.div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>("landing");
  const [levelData, setLevelData] = useState<LevelData | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [deathCount, setDeathCount] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [difficultyLevel, setDifficultyLevel] = useState(1);
  const [autoPlayTimer, setAutoPlayTimer] = useState(5);
  const [showDebugLabels, setShowDebugLabels] = useState<boolean>(() =>
    localStorage.getItem('cq_debug') === 'true'
  );
  const [showMobileControls, setShowMobileControls] = useState<boolean>(() =>
    localStorage.getItem('cq_mobile') === 'true'
  );
  const [muteBg, setMuteBg]   = useState<boolean>(() => localStorage.getItem('cq_mute_bg')  === 'true');
  const [muteSfx, setMuteSfx] = useState<boolean>(() => localStorage.getItem('cq_mute_sfx') === 'true');
  const [activeScene, setActiveScene] = useState<string>("—");

  const toggleDebug = () => setShowDebugLabels(prev => {
    localStorage.setItem('cq_debug', String(!prev)); return !prev;
  });
  const toggleMobile = () => setShowMobileControls(prev => {
    localStorage.setItem('cq_mobile', String(!prev)); return !prev;
  });

  const toggleMuteBg = () => setMuteBg(prev => {
    const next = !prev;
    localStorage.setItem('cq_mute_bg', String(next));
    return next;
  });
  const toggleMuteSfx = () => setMuteSfx(prev => {
    const next = !prev;
    localStorage.setItem('cq_mute_sfx', String(next));
    return next;
  });

  useEffect(() => {
    const tryFullscreen = () => {
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        el.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
      }
    };

    // Attempt immediately (works if already in PWA/standalone mode)
    tryFullscreen();

    // Re-attempt on every pointer down — these are confirmed user gestures
    window.addEventListener('pointerdown', tryFullscreen);

    // Force scroll-to-top on resize to collapse the browser's address bar
    const onResize = () => { window.scrollTo(0, 1); };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('pointerdown', tryFullscreen);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (state !== "won") return;
    setAutoPlayTimer(5);
    const interval = setInterval(() => {
      setAutoPlayTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setDeathCount(0);
          setState("playing");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    (window as any).toggleHelp = () => setHelpOpen(prev => !prev);
    return () => { delete (window as any).toggleHelp; };
  }, []);

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  };

  const getImageDimensions = (dataUrl: string): Promise<{ w: number; h: number }> =>
    new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = dataUrl;
    });

  const startLevel = async (file: File) => {
    setState("loading");
    setDeathCount(0);
    setElapsedTime(0);
    setDifficultyLevel(1);
    
    try {
      const preview = await readFileAsDataUrl(file);
      setImagePreview(preview);
      const base64 = preview.split(",")[1];
      const { w: imgW, h: imgH } = await getImageDimensions(preview);

      try {
        const data = await generateLevelFromImage(base64, file.type, imgW, imgH);
        setLevelData(data);
        const sceneKey = data?.theme?.sceneType ?? "default";
        setActiveScene(SCENE_LABELS[sceneKey as keyof typeof SCENE_LABELS] ?? sceneKey);
      } catch (error) {
        console.error("[App] Level generation failed, using fallback:", error);
        const fallback = getFallbackLevel();
        setLevelData(fallback);
        setActiveScene(SCENE_LABELS[fallback.theme.sceneType as keyof typeof SCENE_LABELS] ?? fallback.theme.sceneType);
      }
      
      setState("playing");

    } catch (error) {
      console.error("[App] Critical failure starting level:", error);
      setState("landing");
    }
  };

  const handleWin = (time: number) => {
    setElapsedTime(time);
    setDifficultyLevel(prev => prev + 1);
    setState("won");
  };

  const handleDeath = () => {
    setDeathCount(prev => prev + 1);
  };

  return (
    <div className="w-full h-screen bg-[#050505] text-white overflow-hidden select-none font-sans text-center">
      <AnimatePresence mode="wait">
        {state === "landing" && (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
             <div className="fixed top-6 right-6 z-[150]">
              <button 
                onClick={() => setHelpOpen(true)}
                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-md transition-all active:scale-95"
              >
                <HelpCircle className="w-5 h-5 text-white/60" />
              </button>
            </div>
            <LandingScreen 
              onUpload={startLevel} 
              showDebugLabels={showDebugLabels}
              onToggleDebug={toggleDebug}
              showMobileControls={showMobileControls}
              onToggleMobile={toggleMobile}
              muteBg={muteBg}
              onToggleMuteBg={toggleMuteBg}
              muteSfx={muteSfx}
              onToggleMuteSfx={toggleMuteSfx}
            />
          </motion.div>
        )}

        {state === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full"
          >
            <LoadingScreen imagePreview={imagePreview} />
          </motion.div>
        )}

        {state === "playing" && imagePreview && (
          <motion.div key="playing" className="w-full h-full relative">
            {/* Audio HUD — top right */}
            <div className="fixed top-3 right-3 z-40 flex flex-col items-end gap-1.5">
              <div className="flex gap-1.5">
                <button onClick={toggleMuteBg}
                  className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-[10px] font-mono uppercase tracking-widest text-white/50 hover:text-white/80 transition-colors"
                >{muteBg ? "🔇" : "🔊"} BG</button>
                <button onClick={toggleMuteSfx}
                  className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-[10px] font-mono uppercase tracking-widest text-white/50 hover:text-white/80 transition-colors"
                >{muteSfx ? "🔇" : "🔊"} SFX</button>
              </div>
              {!muteBg && (
                <p className="text-[8px] font-mono text-white/30 tracking-wide pr-0.5">
                  ♪ {activeScene}
                </p>
              )}
            </div>

            {levelData ? (
              <GameView
                levelData={levelData}
                imagePreview={imagePreview}
                onWin={handleWin}
                onDeath={handleDeath}
                onBack={() => { 
                  setState("landing"); 
                  setDifficultyLevel(1); 
                  setAutoPlayTimer(5);
                }}
                deathCount={deathCount}
                difficulty={getDifficultyConfig(difficultyLevel)}
                showDebugLabels={showDebugLabels}
                showMobileControls={showMobileControls}
                muteBg={muteBg}
                muteSfx={muteSfx}
                onToggleMuteBg={toggleMuteBg}
                onToggleMuteSfx={toggleMuteSfx}
              />
            ) : null}
          </motion.div>
        )}

        {state === "won" && (
          <motion.div
            key="won"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6"
          >
            <div className="max-w-md w-full bg-[#111] rounded-[2rem] border border-white/10 p-8 text-center space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="w-20 h-20 bg-green-500/20 rounded-3xl flex items-center justify-center mx-auto border border-green-500/20">
                <Trophy className="w-10 h-10 text-green-500" />
              </div>
              
              <div className="space-y-2 text-center">
                <h2 className="text-3xl font-black uppercase tracking-tighter">Level Conquered</h2>
                {difficultyLevel > 1 && (
                  <div className="inline-block px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/30 text-[10px] font-mono uppercase tracking-widest text-orange-400">
                    Difficulty {difficultyLevel - 1} cleared
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-white/30">Deaths</p>
                  <p className="text-2xl font-mono font-bold text-red-400">{deathCount}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-white/30">Time</p>
                  <p className="text-2xl font-mono font-bold text-blue-400">{elapsedTime}s</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-white/30">Next</p>
                  <p className="text-2xl font-mono font-bold text-orange-400">Lv.{difficultyLevel}</p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => { setDeathCount(0); setState("playing"); }}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-bold uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-3 shadow-lg shadow-orange-900/20"
                >
                  <Flame className="w-5 h-5" />
                  Play Again — Difficulty {difficultyLevel}
                  <span className="ml-auto text-xs font-mono bg-black/20 px-2 py-1 rounded-lg">
                    {autoPlayTimer}s
                  </span>
                </button>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-left space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Next Difficulty Modifiers</p>
                  {getDifficultyConfig(difficultyLevel).fragilePlatformCount > 0 && (
                    <p className="text-xs text-white/60">⚠ {getDifficultyConfig(difficultyLevel).fragilePlatformCount} Fragile Platforms</p>
                  )}
                  {getDifficultyConfig(difficultyLevel).enemyCount > 0 && (
                    <p className="text-xs text-white/60">👾 {getDifficultyConfig(difficultyLevel).enemyCount} Patrolling Enemies</p>
                  )}
                  {getDifficultyConfig(difficultyLevel).platformWidthMultiplier < 1.0 && (
                    <p className="text-xs text-white/60">📏 Platforms {Math.round((1 - getDifficultyConfig(difficultyLevel).platformWidthMultiplier) * 100)}% Shorter</p>
                  )}
                  {difficultyLevel === 1 && <p className="text-xs text-white/30 italic">No modifiers yet</p>}
                </div>

                <button 
                  onClick={() => { setState("landing"); setDifficultyLevel(1); setAutoPlayTimer(5); }}
                  className="w-full py-3 rounded-2xl bg-white/8 hover:bg-white/12 border border-white/10 text-white/60 text-sm font-medium uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Upload New Photo
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
