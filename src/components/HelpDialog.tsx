import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Book, Rocket, Code, HelpCircle } from "lucide-react";

interface HelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpDialog({ isOpen, onClose }: HelpDialogProps) {
  const [activeTab, setActiveTab] = useState<"user" | "release" | "dev">("user");

  const releaseNotes = [
    {
      date: "2026-04-29",
      changes: [
        "Added virtual analogue joystick for smoother mobile traversal.",
        "Implemented analogue velocity-targeting for immediate movement feedback.",
        "Removed double-jump flash effect to maintain visual immersion.",
        "Added touch-action: none to game viewport to prevent browser scroll interference."
      ]
    },
    {
      date: "2026-04-29",
      changes: [
        "Major Release: 'Be Inspired' mode. Uses real-photo crops as game platforms.",
        "Implemented multi-layer parallax scrolling system for deep environment feel.",
        "Added procedural 3D lighting and shadow effects to photo-extracted assets.",
        "New fluid camera system with cover-fit scaling and look-ahead follow.",
        "Implemented image dimension validation and size requirement logic.",
        "Refactored game architecture to support dual specialized render engines.",
        "Improved AI designer prompts for better traversal paths in both modes."
      ]
    },
    {
      date: "2026-04-29",
      changes: [
        "Implemented fluid camera system with cover-fit scaling and look-ahead follow.",
        "Added camera clamping to eliminate black edges in widescreen views.",
        "Major redesign: Theme-inspired level generation. Photos are now inspiration, not geometry sources.",
        "Implemented themed pseudo-3D platform rendering with environment-matched palettes.",
        "Fixed availability errors by switching to gemini-flash-latest for AI analysis.",
        "Fixed critical black screen issue by implementing PixiJS v8 Assets.load.",
        "Refactored physics to Matter.js v0.20 (Composite API).",
        "Added advanced mechanics: Coyote Time, Jump Buffering, and Wall Jumping.",
        "Improved grounded detection logic.",
        "Added win timer and death counter persistence.",
        "Implemented spawn arrow hint for new players."
      ]
    },
    {
      date: "2026-04-28",
      changes: [
        "Initial prototype of PhotoLevel.",
        "Gemini level generation integration.",
        "Basic movement and physics."
      ]
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-3xl h-[600px] bg-[#111] border border-white/10 rounded-[2rem] overflow-hidden flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3 text-blue-400">
                <HelpCircle className="w-6 h-6" />
                <h2 className="text-xl font-bold uppercase tracking-tight text-white">Help & Resources</h2>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-full transition-colors"
                id="close-help-dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar */}
              <div className="w-48 border-r border-white/5 p-4 space-y-2 bg-black/20">
                <TabButton 
                  active={activeTab === "user"} 
                  onClick={() => setActiveTab("user")}
                  icon={<Book className="w-4 h-4" />}
                  label="User Guide"
                  id="tab-user-guide"
                />
                <TabButton 
                  active={activeTab === "release"} 
                  onClick={() => setActiveTab("release")}
                  icon={<Rocket className="w-4 h-4" />}
                  label="Release Notes"
                  id="tab-release-notes"
                />
                <TabButton 
                  active={activeTab === "dev"} 
                  onClick={() => setActiveTab("dev")}
                  icon={<Code className="w-4 h-4" />}
                  label="Developer"
                  id="tab-developer"
                />
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {activeTab === "user" && (
                  <div className="space-y-6">
                    <section className="space-y-4">
                      <h3 className="text-lg font-bold text-white uppercase tracking-wider border-l-2 border-blue-500 pl-4">How to Play</h3>
                      <div className="space-y-2 text-white/70">
                        <p>1. **Upload**: Drag or click to upload a photo.</p>
                        <p>2. **Generate**: Gemini analyzes the photo and creates a level structure.</p>
                        <p>3. **Survival**: Reach the green exit portal without falling into the abyss.</p>
                      </div>
                    </section>
                    <section className="space-y-4 pt-4">
                      <h3 className="text-lg font-bold text-white uppercase tracking-wider border-l-2 border-green-500 pl-4">Advanced Moves</h3>
                      <div className="grid grid-cols-1 gap-3">
                        <DocItem title="Wall Jump" description="Push against a wall while falling and press Jump to leap away." />
                        <DocItem title="Coyote Time" description="You can still jump for a split second after walking off an edge." />
                        <DocItem title="Jump Buffer" description="Press jump just before you land to bounce immediately." />
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === "release" && (
                  <div className="space-y-8">
                    {releaseNotes.map((note) => (
                      <div key={note.date} className="space-y-3">
                        <div className="flex items-center gap-4">
                          <div className="h-px flex-1 bg-white/10" />
                          <span className="text-xs font-mono text-white/40 uppercase tracking-widest">{note.date}</span>
                          <div className="h-px flex-1 bg-white/10" />
                        </div>
                        <ul className="space-y-2 list-disc list-inside text-sm text-white/60 pl-4">
                          {note.changes.map((change, i) => <li key={i}>{change}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "dev" && (
                  <div className="space-y-6">
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <p className="text-xs text-blue-300 font-mono leading-relaxed">
                        PhotoLevel Developer Suite provides real-time access to game state and level data.
                      </p>
                    </div>
                    
                    <section className="space-y-4">
                      <h3 className="text-md font-bold text-white uppercase tracking-widest opacity-50">API Usage</h3>
                      <CodeBlock 
                        code={`// Get time elapsed\nconst seconds = gameCore.getElapsedSeconds();\nconsole.log(\`Time: \${seconds}s\`);`} 
                      />
                    </section>

                    <section className="space-y-4">
                      <h3 className="text-md font-bold text-white uppercase tracking-widest opacity-50">Level Format</h3>
                      <CodeBlock 
                        code={`interface LevelData {\n  platforms: { id, x, y, width, height, theme }[];\n  walls: { id, x, y, width, height, theme }[];\n  theme: { name, primaryColour, accentColour, skyTint, description };\n  spawn: { x, y };\n  exit: { x, y };\n}`} 
                      />
                    </section>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function TabButton({ active, onClick, icon, label, id }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; id: string }) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
        active ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" : "text-white/40 hover:bg-white/5"
      }`}
    >
      {icon}
      <span className="font-medium uppercase tracking-tight">{label}</span>
    </button>
  );
}

function DocItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
      <p className="text-sm font-bold text-white uppercase tracking-tighter">{title}</p>
      <p className="text-xs text-white/40 leading-relaxed">{description}</p>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <button 
        onClick={copy}
        className="absolute top-3 right-3 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] uppercase font-bold opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? "Copied!" : "Try It"}
      </button>
      <pre className="p-4 rounded-xl bg-black font-mono text-[11px] text-blue-300 leading-relaxed border border-white/10 overflow-x-auto">
        {code}
      </pre>
    </div>
  );
}
