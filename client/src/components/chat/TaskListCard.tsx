import React, { useState } from 'react';
import { CheckCircle2, Plus, Sparkles, ExternalLink, Flame, Clock, Repeat } from 'lucide-react';
import { api } from '../../lib/api';
import { playEnter, playNotification, playFailed } from '../../lib/sound';
import { useToast } from '../ui/ToastProvider';
import { useEcosystem } from '../../context/EcosystemContext';

interface ProposedSubtask {
  title: string;
  start_day?: number;
  end_day?: number;
}

interface ProposedTask {
  title: string;
  tier?: 'Must Do' | 'Should Do' | 'Routine' | string;
  priority?: string;
  description?: string;
  subtasks?: ProposedSubtask[];
  period_id?: string;
  period_type?: string;
}

interface TaskListCardProps {
  cardData: {
    period_id?: string;
    period_type?: string;
    tasks: ProposedTask[];
  };
  onTasksAdded?: () => void;
}

export const TaskListCard: React.FC<TaskListCardProps> = ({ cardData, onTasksAdded }) => {
  const { period_id = '2026-11-Q4', period_type = 'Q4', tasks: initialTasks = [] } = cardData;
  const { openTaskDrawer, bumpWorkspaceRevision } = useEcosystem();
  const { push: toast } = useToast();

  const [selectedIndices, setSelectedIndices] = useState<number[]>(
    initialTasks.map((_, i) => i)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdded, setIsAdded] = useState(false);

  const toggleSelect = (index: number) => {
    if (isAdded) return;
    setSelectedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleBatchAdd = async () => {
    if (selectedIndices.length === 0 || isSubmitting || isAdded) return;
    setIsSubmitting(true);
    playEnter();

    try {
      const tasksToAdd = selectedIndices.map((idx) => {
        const t = initialTasks[idx];
        const tier = t.tier || 'Must Do';
        const category = tier === 'Must Do' ? 'MUST' : tier === 'Should Do' ? 'SHOULD' : 'ROUTINE';
        return {
          period_id,
          quarter_id: period_id,
          period_type,
          title: t.title,
          tier,
          category,
          priority: t.priority || 'Normal',
          description: t.description || '',
          status: 'Not started',
          subtasks: t.subtasks || [],
        };
      });

      const res = await api.createTasksBatch(tasksToAdd);
      setIsAdded(true);
      playNotification();
      toast('success', `Added ${res.created_count} task(s) to ${period_id}!`);
      bumpWorkspaceRevision();
      onTasksAdded?.();
    } catch (err: any) {
      playFailed();
      toast('error', err?.message || 'Failed to add tasks.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTierBadge = (tier?: string) => {
    const norm = (tier || '').toLowerCase();
    if (norm.includes('must')) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          <Flame className="w-2.5 h-2.5 text-rose-500" />
          <span>Must Do</span>
        </span>
      );
    }
    if (norm.includes('should')) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
          <Clock className="w-2.5 h-2.5 text-orange-500" />
          <span>Should Do</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
        <Repeat className="w-2.5 h-2.5 text-purple-500" />
        <span>Routine</span>
      </span>
    );
  };

  return (
    <div className="p-4 rounded-2xl bg-white/95 dark:bg-[#161616]/95 border border-cherry-500/30 shadow-md space-y-3.5 animate-fade-in text-xs max-w-xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-cherry-500/10 text-cherry-flesh dark:text-cherry-blush">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold font-sans text-stone-900 dark:text-white">
              Generated Task List
            </h4>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              {initialTasks.length} task(s) tailored for {period_id}
            </p>
          </div>
        </div>

        {isAdded ? (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-xs bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Added to Board
          </span>
        ) : (
          <button
            type="button"
            onClick={handleBatchAdd}
            disabled={isSubmitting || selectedIndices.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cherry-flesh hover:bg-cherry-700 text-white font-semibold shadow-xs transition hover:scale-[1.02] disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="animate-spin text-xs">●</span>
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>Add Tasks ({selectedIndices.length})</span>
          </button>
        )}
      </div>

      {/* Task Items */}
      <div className="space-y-2">
        {initialTasks.map((t, idx) => {
          const isSelected = selectedIndices.includes(idx);
          return (
            <div
              key={idx}
              className={`p-3 rounded-xl border transition-all ${
                isSelected
                  ? 'bg-stone-50 dark:bg-stone-900/60 border-stone-300 dark:border-stone-700'
                  : 'bg-black/[0.01] dark:bg-white/[0.01] border-transparent opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 flex-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isAdded}
                    onChange={() => toggleSelect(idx)}
                    className="mt-0.5 rounded border-stone-300 text-cherry-flesh focus:ring-cherry-flesh cursor-pointer"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {t.title}
                      </span>
                      {getTierBadge(t.tier)}
                    </div>
                    {t.description && (
                      <p className="text-[11px] text-stone-500 dark:text-stone-400">
                        {t.description}
                      </p>
                    )}
                  </div>
                </div>

                {!isAdded && (
                  <button
                    type="button"
                    onClick={() =>
                      openTaskDrawer({
                        title: t.title,
                        description: t.description,
                        priority: t.priority,
                        period_id,
                        period_type,
                        subtasks: t.subtasks,
                        mode: 'create',
                      })
                    }
                    className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition p-1"
                    title="Tweak in Task Drawer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Subtasks pills */}
              {t.subtasks && t.subtasks.length > 0 && (
                <div className="mt-2.5 pl-6 space-y-1 border-t border-black/5 dark:border-white/5 pt-2">
                  {t.subtasks.map((st, sIdx) => (
                    <div
                      key={sIdx}
                      className="flex items-center justify-between text-[11px] text-stone-600 dark:text-stone-300"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="text-stone-400">↳</span>
                        <span>{st.title}</span>
                      </span>
                      {(st.start_day !== undefined || st.end_day !== undefined) && (
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-stone-200/80 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                          D{st.start_day ?? 1}–{st.end_day ?? 7}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
