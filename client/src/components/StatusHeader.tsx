import React from "react";
import { Shield, Sparkles, Key, AlertTriangle, Play, Square } from "lucide-react";
import { sound } from "../lib/audio";

interface StatusHeaderProps {
  todayStr: string;
  activeQuarterId?: string;
  remainingKeys: number;
  junkPoints: number;
  junkPointLimit: number;
  basketAvailable: boolean;
  lemonAvailable: boolean;
  isFocusActive: boolean;
  onToggleFocus: () => void;
}

export const StatusHeader: React.FC<StatusHeaderProps> = ({
  todayStr,
  activeQuarterId,
  remainingKeys,
  junkPoints,
  junkPointLimit,
  basketAvailable,
  lemonAvailable,
  isFocusActive,
  onToggleFocus,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-canvas-dark/80 backdrop-blur-md px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Brand & Hierarchy Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img src="/cherry-icon.svg" alt="Cherry" className="w-6 h-6 object-contain" />
            <span className="font-display font-black text-sm tracking-tight text-white">CHERRY</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs">
            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-ink-primaryDark font-mono font-medium">
              {todayStr}
            </span>
            {activeQuarterId && (
              <span className="px-2 py-0.5 rounded-md bg-cherry/10 border border-cherry/25 text-cherry font-medium">
                {activeQuarterId}
              </span>
            )}
          </div>
        </div>

        {/* Center: Ledgers & Accountability */}
        <div className="flex items-center gap-2 text-xs">
          {/* Quarter Keys */}
          <div
            title="Remaining Quarter Keys for this Quarter (Spent on confirmed violations)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-dark border border-white/5 text-amber-400"
          >
            <Key size={13} />
            <span className="font-mono font-bold">{remainingKeys} QK</span>
          </div>

          {/* Junk Points */}
          <div
            title="Today's Junk Points (Must not exceed limit)"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-dark border ${
              junkPoints > junkPointLimit
                ? "border-red-500/50 text-red-400"
                : "border-white/5 text-ink-primaryDark"
            }`}
          >
            {junkPoints > junkPointLimit ? <AlertTriangle size={13} className="text-red-400" /> : null}
            <span className="font-mono">
              <strong className={junkPoints > junkPointLimit ? "text-red-400 font-bold" : ""}>
                {junkPoints}
              </strong>
              /{junkPointLimit} JP
            </span>
          </div>
        </div>

        {/* Right: Ecosystem Status & Quick Focus Button */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-[11px] text-ink-secondaryDark">
            {/* Basket AI Indicator */}
            <div
              title={`Basket AI Engine (${basketAvailable ? "Online" : "Offline - Fallback active"})`}
              className="flex items-center gap-1"
            >
              <Sparkles size={12} className={basketAvailable ? "text-emerald-400" : "text-amber-500"} />
              <span>Basket</span>
            </div>

            {/* Lemon Desktop Indicator */}
            <div
              title={`Lemon Desktop Activity & DNS (${lemonAvailable ? "Online" : "Offline"})`}
              className="flex items-center gap-1 ml-1"
            >
              <Shield size={12} className={lemonAvailable ? "text-emerald-400" : "text-zinc-500"} />
              <span>Lemon</span>
            </div>
          </div>

          {/* Quick Focus Button */}
          <button
            onClick={() => {
              sound.play(isFocusActive ? "back" : "enter");
              onToggleFocus();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isFocusActive
                ? "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                : "bg-cherry hover:bg-cherry-pressed text-white shadow-md shadow-cherry/20"
            }`}
          >
            {isFocusActive ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            <span>{isFocusActive ? "Stop Focus" : "Start Focus"}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
