import { useState, useRef, useEffect } from "react";
import LandingScreen from "./components/LandingScreen";
import LoadingScreen from "./components/LoadingScreen";
import { generateLevelFromImage, getFallbackLevel } from "./services/geminiService";
import { LevelData } from "./types";
import { GameCore } from "./GameCore";
import { Trash2, RotateCcw, Home, Trophy, Skull } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

type GameState = "landing" | "loading" | "playing" | "won";

function GameView({ 
  levelData, 
  imagePreview, 
  onWin, 
  onDeath, 
  onBack, 
  deathCount 
}: { 
  levelData: LevelData; 
  imagePreview: string; 
  onWin: () => void; 
  onDeath: () => void; 
  onBack: () => void;
  deathCount: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameCoreRef = useRef<GameCore | null>(null);

  useEffect(() => {
    console.log("GameView: Mounted", { hasContainer: !!containerRef.current });
    
    // Use a small timeout to ensure the DOM has finished layout
    const timer = setTimeout(() => {
      if (containerRef.current && levelData && imagePreview) {
        console.log("GameView: Initializing GameCore with measured size:", 
          containerRef.current.clientWidth, "x", containerRef.current.clientHeight);
        
        gameCoreRef.current = new GameCore(
          containerRef.current,
          levelData,
          imagePreview,
          onWin,
          onDeath
        );
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      console.log("GameView: Unmounting, destroying game");
      gameCoreRef.current?.destroy();
      gameCoreRef.current = null;
    };
  }, [levelData, imagePreview]);

  return (
    <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative h-screen flex flex-col overflow-hidden">
      <div className="absolute top-6 left-6 z-20 flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-md transition-all active:scale-95"
        >
          <Home className="w-5 h-5" />
        </button>
        <div className="px-4 py-2 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md flex items-center gap-3">
          <Skull className="w-4 h-4 text-red-500" />
          <span className="font-mono text-sm uppercase tracking-widest">{deathCount}</span>
        </div>
      </div>

      <div className="absolute top-6 right-6 z-20">
         <div className="px-4 py-2 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md">
           <p className="text-[10px] uppercase tracking-tighter text-white/50">Controls</p>
           <p className="text-xs font-mono uppercase tracking-widest">WASD / Arrows • Space</p>
         </div>
      </div>

      <div 
        ref={containerRef} 
        className="flex-1 bg-[#050505] relative" 
      />
    </motion.div>
  );
}

export default function App() {
  const [state, setState] = useState<GameState>("landing");
  const [levelData, setLevelData] = useState<LevelData | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [deathCount, setDeathCount] = useState(0);
  
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameCoreRef = useRef<GameCore | null>(null);

  const startLevel = async (file: File) => {
    console.log("App: startLevel called", file.name);
    setState("loading");
    setDeathCount(0);
    
    try {
      const preview = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setImagePreview(preview);

      const base64 = preview.split(",")[1];
      let data: LevelData;
      try {
        data = await generateLevelFromImage(base64, file.type);
      } catch (geminiError) {
        console.error("App: Gemini failed, using fallback", geminiError);
        data = getFallbackLevel();
      }
      
      setLevelData(data);
      setState("playing");
    } catch (error) {
      console.error("App: Critical start failure", error);
      setState("landing");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500 selection:text-white">
      <AnimatePresence mode="wait">
        {state === "landing" && (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LandingScreen onUpload={startLevel} />
          </motion.div>
        )}

        {state === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LoadingScreen imagePreview={imagePreview} />
          </motion.div>
        )}

        {state === "playing" && levelData && imagePreview && (
          <GameView 
            levelData={levelData}
            imagePreview={imagePreview}
            onWin={() => setState("won")}
            onDeath={() => setDeathCount(prev => prev + 1)}
            onBack={() => setState("landing")}
            deathCount={deathCount}
          />
        )}

        {state === "won" && (
          <motion.div 
            key="won" 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6"
          >
            <div className="max-w-md w-full bg-[#111] rounded-[2rem] border border-white/10 p-12 text-center space-y-8 shadow-2xl">
              <div className="w-24 h-24 bg-green-500/20 rounded-3xl flex items-center justify-center mx-auto border border-green-500/20">
                <Trophy className="w-12 h-12 text-green-500" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-4xl font-black uppercase tracking-tighter">Level Conquered</h2>
                <p className="text-white/40">You've successfully navigated the photo.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-white/30">Deaths</p>
                  <p className="text-2xl font-mono font-bold">{deathCount}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-white/30">Status</p>
                  <p className="text-2xl font-mono font-bold text-green-500 uppercase">Clear</p>
                </div>
              </div>

              <button 
                onClick={() => setState("landing")}
                className="w-full py-4 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-3"
              >
                <RotateCcw className="w-5 h-5" />
                Upload New Photo
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
