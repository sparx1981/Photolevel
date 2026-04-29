import { useState, useEffect } from "react";

const MESSAGES = [
  "Scanning your image...",
  "Identifying surfaces...",
  "Designing platforms...",
  "Aligning with architecture...",
  "Tuning jump distances...",
  "Placing your exit...",
  "Almost ready..."
];

export default function LoadingScreen({ imagePreview }: { imagePreview: string | null; mode?: string }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [progress, setProgress]   = useState(0);

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setMsgIndex(i => Math.min(i + 1, MESSAGES.length - 1));
    }, 1800);
    const progTimer = setInterval(() => {
      setProgress(p => Math.min(p + 100 / (MESSAGES.length * 3), 95));
    }, 600);
    return () => { clearInterval(msgTimer); clearInterval(progTimer); };
  }, [MESSAGES.length]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#080c14]">
      {imagePreview && (
        <div className="absolute inset-0 opacity-20">
          <img src={imagePreview} className="w-full h-full object-cover" alt="" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#080c14] via-transparent to-[#080c14]" />
        </div>
      )}
      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-md px-8">
        {/* Spinner */}
        <div className="w-20 h-20 rounded-full border-2 border-dashed border-blue-500/30 flex items-center justify-center animate-spin" style={{ animationDuration: "3s" }}>
          <div className="w-10 h-10 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
        </div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-blue-400">Processing Level</p>
        
        {/* Single message — no overlap possible */}
        <div className="h-6 flex items-center justify-center">
          <p className="text-sm text-white/60 text-center transition-all duration-500">{MESSAGES[msgIndex]}</p>
        </div>
        
        {/* Progress bar */}
        <div className="w-full h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
