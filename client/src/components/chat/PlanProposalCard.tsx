import React, { useState } from "react";
import { CheckCircle2, Target, ArrowRight } from "lucide-react";
import { api } from "../../lib/api";
import { playEnter, playNotification, playFailed } from "../../lib/sound";
import { useToast } from "../ui/ToastProvider";
import { CategoryBadge } from "../Badge";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";

interface PlanProposalCardProps {
  data: {
    plan_id: string;
    quarter_id: string;
    version: number;
    goals: { priority: number; title: string; description?: string }[];
    tasks: {
      title: string;
      category: "ROUTINE" | "MUST" | "SHOULD";
      goal_priority?: number;
      estimated_minutes: number;
      subtasks: string[];
    }[];
    rationale?: string;
  };
  onApproved?: () => void;
}

export const PlanProposalCard: React.FC<PlanProposalCardProps> = ({ data, onApproved }) => {
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const { push } = useToast();

  const handleApprove = async () => {
    setLoading(true);
    playEnter();
    try {
      await api.approveQuarterPlan(data.plan_id, "Approved via card");
      setApproved(true);
      playNotification();
      push("success", `Plan ${data.quarter_id} approved.`);
      if (onApproved) onApproved();
    } catch {
      playFailed();
      push("error", "Failed to approve plan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-4 my-2 border border-black/5 dark:border-white/10 text-xs space-y-3 max-w-lg shadow-soft">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/10">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-cherry-flesh" />
          <span className="font-bold text-stone-900 dark:text-stone-100">
            {data.quarter_id} Plan
          </span>
          <span className="text-2xs text-stone-400 font-mono">v{data.version}</span>
        </div>
        {approved ? (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-2xs">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </span>
        ) : (
          <span className="text-2xs text-amber-600 dark:text-amber-400 font-medium">Pending Approval</span>
        )}
      </div>

      {/* Goals */}
      {data.goals.length > 0 && (
        <div className="space-y-1">
          {data.goals.map((g, idx) => (
            <div key={idx} className="flex items-baseline gap-2 text-stone-800 dark:text-stone-200">
              <span className="text-2xs font-bold text-cherry-flesh font-mono shrink-0">#{g.priority}</span>
              <span className="font-medium">{g.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rationale Narrative if present */}
      {data.rationale && (
        <div className="p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-stone-200/50 dark:border-stone-800/50">
          <MarkdownRenderer content={data.rationale} variant="compact" />
        </div>
      )}

      {/* Tasks List */}
      <div className="space-y-1 pt-1 max-h-40 overflow-y-auto">
        {data.tasks.map((t, idx) => (
          <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <CategoryBadge category={t.category} />
              <span className="text-stone-800 dark:text-stone-200 font-medium">{t.title}</span>
            </div>
            <span className="text-2xs text-stone-400 font-mono">{t.estimated_minutes}m</span>
          </div>
        ))}
      </div>

      {/* Consequential Action Button */}
      {!approved && (
        <button
          onClick={handleApprove}
          disabled={loading}
          className="btn-glass-primary w-full text-xs font-semibold !py-2"
        >
          {loading ? "Approving..." : (
            <span className="flex items-center justify-center gap-1">
              <span>Approve Plan</span>
              <ArrowRight className="h-3 w-3" />
            </span>
          )}
        </button>
      )}
    </div>
  );
};
