import React, { useState, useCallback } from "react";
import { Upload, Image as ImageIcon, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LandingScreenProps {
  onUpload: (file: File) => void;
}

export default function LandingScreen({ onUpload }: LandingScreenProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      onUpload(file);
    }
  }, [onUpload]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  }, [onUpload]);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent blur-3xl" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl w-full text-center space-y-8 relative z-10"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono tracking-widest text-white/50 uppercase">
          <Sparkles className="w-3 h-3 text-yellow-500" />
          Every Photo is a Level
        </div>

        <div className="space-y-2">
          <h1 className="text-7xl md:text-8xl font-black tracking-tighter uppercase leading-[0.85]">
            Photo<span className="text-blue-500">Level</span>
          </h1>
          <p className="text-xl text-white/60 font-light max-w-xl mx-auto">
            Transform your world into a traversal puzzle. Upload a photo to begin your adventure.
          </p>
        </div>

        <motion.label
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`
            relative block w-full aspect-[16/9] max-h-[400px] cursor-pointer rounded-3xl border-2 border-dashed 
            transition-all duration-300 group overflow-hidden
            ${isDragging ? "border-blue-500 bg-blue-500/10" : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]"}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input 
            type="file" 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange}
          />
          
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className={`p-6 rounded-full transition-all duration-300 ${isDragging ? "bg-blue-500 scale-110" : "bg-white/5 group-hover:scale-110"}`}>
              {isDragging ? <Upload className="w-8 h-8" /> : <ImageIcon className="w-8 h-8 text-white/40 group-hover:text-white" />}
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium">Click or drag photo here</p>
              <p className="text-sm text-white/40">Bookshelves, buildings, and landscapes work best</p>
            </div>
          </div>

          <div className="absolute bottom-4 left-0 w-full flex justify-center gap-4 opacity-40 text-[10px] uppercase tracking-widest font-mono">
            <span>JPG</span>
            <span>PNG</span>
            <span>WEBP</span>
          </div>
        </motion.label>

        <div className="flex flex-wrap justify-center gap-8 pt-4">
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-blue-500 font-bold border border-white/10">01</div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold">Snap it</p>
              <p className="text-[10px] text-white/40 uppercase tracking-tighter">Capture any image</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-blue-500 font-bold border border-white/10">02</div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold">Build it</p>
              <p className="text-[10px] text-white/40 uppercase tracking-tighter">AI detects platforms</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-blue-500 font-bold border border-white/10">03</div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold">Play it</p>
              <p className="text-[10px] text-white/40 uppercase tracking-tighter">Reach the exit</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
