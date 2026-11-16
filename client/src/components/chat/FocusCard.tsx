import React from "react";
import { Square, Shield } from "lucide-react";
import { playBack } from "../../lib/sound";

interface FocusCardProps {
  data: {
    session_id?: string;
    planned_minutes?: number;
    dns_enabled?: boolean;
    status: string;
  };
  onStop?: () => void;
}

export const FocusCard: React.FC<FocusCardProps> = ({ data, onStop }) => {
  const isRunning = data.status === "active";

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5 my-2 border border-black/5 dark:border-white/10 text-xs sm:text-sm space-y-3.5 max-w-md shadow-soft">
      <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isRunning ? "bg-cherry-flesh" : "bg-emerald-500"
              }`}
            ></span>
          </span>
          <span className="font-bold text-stone-900 dark:text-stone-100">
            Focus Mode & Pomodoro
          </span>
        </div>
        <span
          className={`font-mono text-2xs font-bold px-2 py-0.5 rounded-full ${
            isRunning
              ? "bg-cherry-500/15 text-cherry-600 dark:text-cherry-300"
              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {isRunning ? "ACTIVE" : "COMPLETED"}
        </span>
      </div>

      <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-stone-600 dark:text-stone-400">Planned Duration</span>
          <span className="font-mono text-stone-900 dark:text-stone-100 font-semibold">
            {data.planned_minutes || 60} minutes
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-stone-600 dark:text-stone-400 flex items-center gap-1.5">
            <Shield
              className={`h-3.5 w-3.5 ${
                data.dns_enabled ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"
              }`}
            />
            Lemon DNS Firewall
          </span>
          <span
            className={`font-mono font-semibold text-2xs ${
              data.dns_enabled
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {data.dns_enabled ? "Enforced Active" : "Pending / Inactive"}
          </span>
        </div>
      </div>

      {isRunning && onStop && (
        <div className="flex justify-end pt-1">
          <button
            onClick={() => {
              playBack();
              onStop();
            }}
            className="btn-interactive flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25 text-xs font-bold transition hover:bg-rose-500/25"
          >
            <Square className="h-3 w-3 fill-current" />
            <span>Stop Focus Session</span>
          </button>
        </div>
      )}
    </div>
  );
};
