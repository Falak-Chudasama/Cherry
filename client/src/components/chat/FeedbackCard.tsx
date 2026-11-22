import React from "react";
import { Award, CheckCircle2, AlertTriangle } from "lucide-react";
import { ObservationItem, DerivedMetrics } from "../../types";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";

interface FeedbackCardProps {
  data: {
    summary_id: string;
    date_str: string;
    verdict: string;
    observations: ObservationItem[];
    metrics: DerivedMetrics;
  };
}

export const FeedbackCard: React.FC<FeedbackCardProps> = ({ data }) => {
  const formatDuration = (seconds: number) => {
    const hours = seconds / 3600;
    return `${hours.toFixed(1)}h`;
  };

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5 my-2 border border-black/5 dark:border-white/10 text-xs sm:text-sm space-y-3.5 max-w-xl shadow-soft">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-cherry-flesh" />
          <span className="font-bold text-stone-900 dark:text-stone-100">
            Daily Feedback Report — {data.date_str}
          </span>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase font-mono ${
            data.metrics.bad_day
              ? "bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30"
              : "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
          }`}
        >
          {data.metrics.bad_day ? "High Distraction" : "Adherent"}
        </span>
      </div>

      {/* Alignment Verdict */}
      <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
        <MarkdownRenderer content={data.verdict} variant="compact" />
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
          <span className="text-2xs text-stone-400 dark:text-stone-500 block uppercase font-bold">
            Active
          </span>
          <span className="font-mono font-bold text-stone-900 dark:text-stone-100 text-sm">
            {formatDuration(data.metrics.total_active_seconds)}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
          <span className="text-2xs text-stone-400 dark:text-stone-500 block uppercase font-bold">
            Tasks
          </span>
          <span className="font-mono font-bold text-stone-900 dark:text-stone-100 text-sm">
            {data.metrics.tasks_completed_count}/{data.metrics.tasks_approved_count}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
          <span className="text-2xs text-stone-400 dark:text-stone-500 block uppercase font-bold">
            Focus
          </span>
          <span className="font-mono font-bold text-stone-900 dark:text-stone-100 text-sm">
            {data.metrics.focus_minutes_total.toFixed(0)}m
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
          <span className="text-2xs text-stone-400 dark:text-stone-500 block uppercase font-bold">
            Junk Pts
          </span>
          <span
            className={`font-mono font-bold text-sm ${
              data.metrics.junk_points_total > 50
                ? "text-rose-600 dark:text-rose-400"
                : "text-stone-900 dark:text-stone-100"
            }`}
          >
            {data.metrics.junk_points_total}
          </span>
        </div>
      </div>

      {/* Observations */}
      {data.observations && data.observations.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <h4 className="text-2xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Behavioral Observations
          </h4>
          <div className="space-y-1">
            {data.observations.map((obs, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2 rounded-xl bg-black/[0.015] dark:bg-white/[0.02] text-xs text-stone-700 dark:text-stone-300"
              >
                <span className="mt-0.5 shrink-0 text-cherry-flesh">
                  {obs.evidence_type === "OBSERVED_FACT" ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  )}
                </span>
                <span className="flex-1 leading-relaxed">
                  <strong className="text-stone-800 dark:text-stone-200">[{obs.category}]</strong> {obs.statement}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
