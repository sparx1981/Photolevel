import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";

const MESSAGES = [
  "Scanning your image for structural integrity...",
  "Detecting walkable surfaces...",
  "Calculating jump arcs and traversal paths...",
  "Placing the exit door in a challenging spot...",
  "Applying physics to the visual world...",
  "Almost ready to play...",
];

export default function LoadingScreen({ imagePreview }: { imagePreview: string | null }) {
  const [currentMessage, setCurrentMessage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessage((prev) => (prev + 1) % MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-[#050505] z-50 flex flex-col items-center justify-center p-8 overflow-hidden">
      {imagePreview && (
        <div className="absolute inset-0 opacity-20 filter blur-2xl scale-110">
          <img src={imagePreview} className="w-full h-full object-cover" alt="" />
        </div>
      )}

      <div className="relative z-10 w-full max-w-md text-center space-y-12">
        <div className="relative inline-block">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="w-32 h-32 rounded-full border-2 border-dashed border-blue-500/30 flex items-center justify-center"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-blue-500">Processing Level</h2>
          <div className="h-6 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={currentMessage}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-lg font-light text-white/80"
              >
                {MESSAGES[currentMessage]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 12, ease: "easeInOut" }}
            className="h-full bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
          />
        </div>
      </div>
    </div>
  );
}
