import React, { useState } from "react";
import { CheckSquare, Square, CheckCircle2, ArrowRight } from "lucide-react";
import { api } from "../../lib/api";
import { playEnter, playNotification, playFailed, playScroll } from "../../lib/sound";
import { useToast } from "../ui/ToastProvider";
import { CategoryBadge } from "../Badge";
import { TodoDraftItem } from "../../types";

interface TodoDraftCardProps {
  data: {
    draft_id: string;
    date_str: string;
    items: TodoDraftItem[];
    status: string;
  };
  onFinalized?: () => void;
}

export const TodoDraftCard: React.FC<TodoDraftCardProps> = ({ data, onFinalized }) => {
  const [items, setItems] = useState<TodoDraftItem[]>(data.items);
  const [finalized, setFinalized] = useState(data.status === "approved");
  const [loading, setLoading] = useState(false);
  const { push } = useToast();

  const toggleItem = (idx: number) => {
    if (finalized) return;
    const updated = [...items];
    updated[idx].is_selected = !updated[idx].is_selected;
    setItems(updated);
    playScroll();
  };

  const handleFinalize = async () => {
    setLoading(true);
    playEnter();
    try {
      await api.finalizeTodoDraft(data.date_str);
      setFinalized(true);
      playNotification();
      push("success", `Todo list for ${data.date_str} committed to Day execution.`);
      if (onFinalized) onFinalized();
    } catch (err: any) {
      playFailed();
      push("error", "Failed to finalize todo draft.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5 my-2 border border-black/5 dark:border-white/10 text-xs sm:text-sm space-y-3.5 max-w-xl shadow-soft">
      <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-cherry-flesh" />
          <span className="font-bold text-stone-900 dark:text-stone-100">
            Daily Todo Draft — {data.date_str}
          </span>
        </div>
        {finalized ? (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" /> Finalized
          </span>
        ) : (
          <span className="text-2xs text-amber-600 dark:text-amber-400 font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
            Draft Review
          </span>
        )}
      </div>

      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        {items.map((item, idx) => (
          <div
            key={idx}
            onClick={() => toggleItem(idx)}
            className={`flex items-center gap-2.5 p-2 rounded-xl transition cursor-pointer select-none border ${
              item.is_selected
                ? "bg-black/[0.02] dark:bg-white/[0.03] border-black/5 dark:border-white/5"
                : "opacity-45 bg-black/[0.01] dark:bg-white/[0.01] border-transparent"
            }`}
          >
            {item.is_selected ? (
              <CheckSquare className="h-4 w-4 text-cherry-flesh shrink-0" />
            ) : (
              <Square className="h-4 w-4 text-stone-400 shrink-0" />
            )}
            <CategoryBadge category={item.category} />
            <span
              className={`flex-1 font-medium ${
                item.is_selected
                  ? "text-stone-800 dark:text-stone-200"
                  : "line-through text-stone-400 dark:text-stone-500"
              }`}
            >
              {item.title}
            </span>
            <span className="text-2xs text-stone-400 dark:text-stone-500 font-mono">
              {item.estimated_minutes}m
            </span>
          </div>
        ))}
      </div>

      {!finalized && (
        <button
          onClick={handleFinalize}
          disabled={loading || items.filter((i) => i.is_selected).length === 0}
          className="btn-glass-primary w-full text-center text-xs font-bold"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Finalizing Day Checklist...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <span>Finalize Todo List ({items.filter((i) => i.is_selected).length} Tasks)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      )}
    </div>
  );
};
