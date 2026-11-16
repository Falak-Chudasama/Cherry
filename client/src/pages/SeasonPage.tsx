import React from "react";
import { Layers } from "lucide-react";
import { useEcosystem } from "../context/EcosystemContext";

interface SeasonPageProps {
  activeQuarterId?: string;
}

export const SeasonPage: React.FC<SeasonPageProps> = () => {
  const { activeQuarterId } = useEcosystem();

  const quarters = [
    { num: 1, name: "Quarter I", dates: "Days 1 – 7", id: "2026-11-Q1", desc: "Foundation & Setup" },
    { num: 2, name: "Quarter II", dates: "Days 8 – 14", id: "2026-11-Q2", desc: "Deep Execution" },
    { num: 3, name: "Quarter III", dates: "Days 15 – 21", id: "2026-11-Q3", desc: "Mid-Season Acceleration" },
    { num: 4, name: "Quarter IV", dates: "Days 22 – 28", id: "2026-11-Q4", desc: "Delivery & Hardening" },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-2 pb-24 sm:pb-20 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="border-b border-black/5 dark:border-white/10 pb-4">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
          Verses & Seasons
        </h1>
        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 mt-1">
          Quarter Calendar Hierarchy: <strong className="text-stone-900 dark:text-stone-100">Day → Quarter (7 Days) → Season (Month) → Verse (Year)</strong>
        </p>
      </div>

      {/* Season Overview Card */}
      <div className="glass-card rounded-2xl p-6 border border-black/5 dark:border-white/10 space-y-6 shadow-soft">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/5 dark:border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl glass-card text-cherry-flesh shadow-2xs">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 font-sans">
                Verse 2026 — Season November 2026
              </h2>
              <span className="text-2xs text-stone-400 dark:text-stone-500 font-mono">
                30 Calendar Days • Exactly 4 Quarters + Surplus Period
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cherry-500/10 text-cherry-600 dark:text-cherry-300 text-xs font-mono font-bold border border-cherry-500/25">
            Active: {activeQuarterId}
          </span>
        </div>

        {/* Quarters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quarters.map((q) => {
            const isActive = activeQuarterId === q.id;
            return (
              <div
                key={q.num}
                className={`p-4 rounded-2xl border transition-all shadow-soft ${
                  isActive
                    ? "bg-cherry-500/10 border-cherry-500/40 dark:bg-cherry-500/15"
                    : "glass-card border-black/5 dark:border-white/5 hover:border-black/10 dark:hover:border-white/10"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-xs font-bold ${
                      isActive ? "text-cherry-flesh" : "text-stone-900 dark:text-stone-100"
                    }`}
                  >
                    {q.name}
                  </span>
                  {isActive && (
                    <span className="text-2xs px-2 py-0.5 rounded-full bg-cherry-flesh text-white font-mono font-bold uppercase">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">{q.dates}</p>
                <p className="text-2xs text-stone-500 dark:text-stone-400 mt-1">{q.desc}</p>
                <div className="mt-4 pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-2xs font-mono text-stone-400">
                  <span>7 Calendar Days</span>
                  <span>3 QK Seed</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Surplus Period Banner */}
        <div className="glass-panel p-5 rounded-2xl border border-black/5 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-soft">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                Surplus Period
              </h4>
              <span className="text-2xs px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-stone-600 dark:text-stone-300 font-mono font-semibold">
                Days 29 – 30
              </span>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1.5 leading-relaxed max-w-2xl">
              November contains 30 days. Days 29 and 30 form the distinct Surplus Period entity belonging to this Season.
              It is not a fifth Quarter and not an extension of Quarter IV.
            </p>
          </div>
          <span className="text-2xs font-mono text-stone-500 font-semibold px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 shrink-0 self-start sm:self-center">
            Status: Scheduled
          </span>
        </div>
      </div>
    </main>
  );
};
