import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GameCore } from "./GameCore";
import { LevelData, DifficultyConfig, getDifficultyConfig } from "./types";
import { 
  generateLevelFromImage, 
  getFallbackLevel 
} from "./services/geminiService";
import LandingScreen from "./components/LandingScreen";
import HelpDialog from "./components/HelpDialog";
import LoadingScreen from "./components/LoadingScreen";
import { Home, Trophy, Skull, HelpCircle, RotateCcw, Flame } from "lucide-react";

type AppState = "landing" | "loading" | "playing" | "won";

// Standard Game View Component
function GameView({ levelData, imagePreview, onWin, onDeath, onBack, deathCount, difficulty, showDebugLabels, showMobileControls }: { 
  levelData: LevelData; 
  imagePreview: string; 
  onWin: (time: number) => void; 
  onDeath: () => void; 
  onBack: () => void; 
  deathCount: number;
  difficulty: DifficultyConfig;
  showDebugLabels: boolean;
  showMobileControls: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameCoreRef = useRef<GameCore | null>(null);

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
          showDebugLabels
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
      />

      {showMobileControls && (
        <div className="absolute bottom-0 left-0 right-0 z-30 flex justify-between items-end px-5 pb-6 pointer-events-none select-none">
          {/* Left / Right */}
          <div className="flex gap-3 pointer-events-auto">
            <button
              onPointerDown={() => gameCoreRef.current?.setKey('ArrowLeft', true)}
              onPointerUp={() => gameCoreRef.current?.setKey('ArrowLeft', false)}
              onPointerLeave={() => gameCoreRef.current?.setKey('ArrowLeft', false)}
              onPointerCancel={() => gameCoreRef.current?.setKey('ArrowLeft', false)}
              className="w-16 h-16 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm
                        flex items-center justify-center text-white/80 text-2xl
                        active:bg-white/25 active:scale-95 transition-all"
            >◀</button>
            <button
              onPointerDown={() => gameCoreRef.current?.setKey('ArrowRight', true)}
              onPointerUp={() => gameCoreRef.current?.setKey('ArrowRight', false)}
              onPointerLeave={() => gameCoreRef.current?.setKey('ArrowRight', false)}
              onPointerCancel={() => gameCoreRef.current?.setKey('ArrowRight', false)}
              className="w-16 h-16 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm
                        flex items-center justify-center text-white/80 text-2xl
                        active:bg-white/25 active:scale-95 transition-all"
            >▶</button>
          </div>
          {/* Jump */}
          <div className="pointer-events-auto">
            <button
              onPointerDown={() => gameCoreRef.current?.setKey('Space', true)}
              onPointerUp={() => gameCoreRef.current?.setKey('Space', false)}
              onPointerLeave={() => gameCoreRef.current?.setKey('Space', false)}
              onPointerCancel={() => gameCoreRef.current?.setKey('Space', false)}
              className="w-20 h-20 rounded-full bg-blue-500/15 border border-blue-400/30 backdrop-blur-sm
                        flex items-center justify-center text-blue-300 text-xs font-bold uppercase
                        tracking-widest active:bg-blue-500/35 active:scale-95 transition-all"
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

  const toggleDebug = () => setShowDebugLabels(prev => {
    localStorage.setItem('cq_debug', String(!prev)); return !prev;
  });
  const toggleMobile = () => setShowMobileControls(prev => {
    localStorage.setItem('cq_mobile', String(!prev)); return !prev;
  });

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

  const startLevel = async (file: File) => {
    setState("loading");
    setDeathCount(0);
    setElapsedTime(0);
    setDifficultyLevel(1);
    
    try {
      const preview = await readFileAsDataUrl(file);
      setImagePreview(preview);
      const base64 = preview.split(",")[1];

      try {
        const data = await generateLevelFromImage(base64, file.type, preview);
        setLevelData(data);
      } catch (error) {
        console.error("[App] Level generation failed, using fallback:", error);
        setLevelData(getFallbackLevel());
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
