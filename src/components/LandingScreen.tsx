import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Upload, AlertCircle } from "lucide-react";
import { 
  getImageDimensions, 
  MIN_CREATE_WIDTH, 
  MIN_CREATE_HEIGHT, 
  ImageDimensions
} from "../utils/imageCrop";

interface LandingScreenProps {
  onUpload: (file: File) => void;
  showDebugLabels: boolean;
  onToggleDebug: () => void;
  showMobileControls: boolean;
  onToggleMobile: () => void;
}

export default function LandingScreen({ 
  onUpload, 
  showDebugLabels, 
  onToggleDebug, 
  showMobileControls, 
  onToggleMobile 
}: LandingScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const dims = await getImageDimensions(dataUrl);
      
      if (dims.width < MIN_CREATE_WIDTH || dims.height < MIN_CREATE_HEIGHT) {
        setError(`Photo must be at least ${MIN_CREATE_WIDTH}×${MIN_CREATE_HEIGHT}px. Your photo is ${dims.width}×${dims.height}px.`);
        return;
      }

      onUpload(file);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl relative z-10 text-center space-y-8"
      >
        <div className="space-y-4">
          <h1 className="text-6xl font-black uppercase tracking-tighter leading-none">
            Capture<span className="text-blue-500">Quest</span>
          </h1>
          <p className="text-white/40 text-lg font-medium tracking-tight">
            Turn your world into an adventure.
          </p>
        </div>

        <div 
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
          }}
          className="group relative h-80 rounded-[2.5rem] border-2 border-dashed border-white/10 hover:border-blue-500/50 bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer flex flex-col items-center justify-center gap-6"
        >
          <div className="p-6 rounded-full bg-white/5 group-hover:scale-110 group-hover:bg-blue-500/20 transition-all">
            <Upload className="w-10 h-10 text-white/40 group-hover:text-blue-400" />
          </div>
          <div className="space-y-1">
            <p className="text-xl font-bold text-white group-hover:text-blue-400">Upload a Photo</p>
            <p className="text-sm text-white/30 font-medium">Drag and drop or click to browse</p>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={(e) => {
              if (e.target.files?.[0]) handleFile(e.target.files[0]);
            }} 
          />
        </div>

        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-4 text-left"
            >
              <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
              <p className="text-sm text-red-200 font-medium leading-relaxed">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-blue-500 text-xs font-bold uppercase tracking-widest pt-4">
          Recommended: Landscapes, Interiors, or Objects with flat surfaces
        </p>
      </motion.div>

      {/* Settings toggles — subtle bottom-right */}
      <div className="fixed bottom-4 right-5 z-50 flex flex-col items-end gap-2">
        <button
          onClick={onToggleMobile}
          className="flex items-center gap-1.5 text-white/25 hover:text-white/55 transition-colors"
        >
          <div className={`w-2 h-2 rounded-full border transition-colors ${
            showMobileControls ? "bg-blue-500 border-blue-400" : "bg-transparent border-white/30"
          }`} />
          <span className="text-[10px] font-mono uppercase tracking-widest">touch controls</span>
        </button>
        <button
          onClick={onToggleDebug}
          className="flex items-center gap-1.5 text-white/20 hover:text-white/45 transition-colors"
        >
          <div className={`w-2 h-2 rounded-full border transition-colors ${
            showDebugLabels ? "bg-blue-500 border-blue-400" : "bg-transparent border-white/30"
          }`} />
          <span className="text-[10px] font-mono uppercase tracking-widest">debug</span>
        </button>
      </div>
    </div>
  );
}
