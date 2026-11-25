import React, { useState, useEffect } from 'react';
import { CheckCircle2, Plus, ExternalLink } from 'lucide-react';
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
    added?: boolean;
    tasks: ProposedTask[];
  };
  messageId?: string;
  onTasksAdded?: () => void;
}

export const TaskListCard: React.FC<TaskListCardProps> = ({
  cardData,
  messageId,
  onTasksAdded,
}) => {
  const {
    period_id = '2026-11-Q4',
    period_type = 'Q4',
    added = false,
    tasks: initialTasks = [],
  } = cardData;
  const { openTaskDrawer, bumpWorkspaceRevision, activeConversationId } = useEcosystem();
  const { push: toast } = useToast();

  const [selectedIndices, setSelectedIndices] = useState<number[]>(
    initialTasks.map((_, i) => i)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdded, setIsAdded] = useState(Boolean(added));

  useEffect(() => {
    setIsAdded(Boolean(added));
  }, [added]);

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
      if (activeConversationId && messageId && !messageId.startsWith('temp-')) {
        api
          .updateCardState({
            session_id: activeConversationId,
            message_id: messageId,
            card_updates: { added: true },
          })
          .catch(() => {});
      }
      playNotification();
      toast('success', `Added ${res.created_count} task(s).`);
      bumpWorkspaceRevision();
      onTasksAdded?.();
    } catch (err: any) {
      playFailed();
      toast('error', err?.message || 'Failed to add tasks.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTierPill = (tier?: string) => {
    const norm = (tier || '').toLowerCase();
    if (norm.includes('must')) {
      return (
        <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
          Must
        </span>
      );
    }
    if (norm.includes('should')) {
      return (
        <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
          Should
        </span>
      );
    }
    return (
      <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
        Routine
      </span>
    );
  };

  return (
    <div className="p-3.5 rounded-2xl glass-card border border-black/[0.07] dark:border-white/[0.08] space-y-2.5 animate-fade-in text-xs max-w-lg">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-black/[0.05] dark:border-white/[0.06]">
        <span className="font-semibold text-stone-900 dark:text-white">
          {initialTasks.length} Task{initialTasks.length !== 1 ? 's' : ''}
        </span>

        {isAdded ? (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-2xs">
            <CheckCircle2 className="w-3.5 h-3.5" /> Added
          </span>
        ) : (
          <button
            type="button"
            onClick={handleBatchAdd}
            disabled={isSubmitting || selectedIndices.length === 0}
            className="btn-interactive flex items-center gap-1 px-3 py-1 rounded-full bg-cherry-flesh hover:bg-cherry-600 text-white text-2xs font-semibold disabled:opacity-45"
          >
            <Plus className="w-3 h-3" />
            <span>{isSubmitting ? 'Adding...' : `Add (${selectedIndices.length})`}</span>
          </button>
        )}
      </div>

      {/* Task Rows */}
      <div className="space-y-1.5">
        {initialTasks.map((t, idx) => {
          const isSelected = selectedIndices.includes(idx);
          return (
            <div
              key={idx}
              className={`p-2.5 rounded-xl transition ${
                isSelected
                  ? 'bg-black/[0.025] dark:bg-white/[0.04]'
                  : 'opacity-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isAdded}
                    onChange={() => toggleSelect(idx)}
                    className="rounded border-stone-300 text-cherry-flesh focus:ring-cherry-flesh cursor-pointer shrink-0"
                  />
                  <span className="font-medium text-stone-900 dark:text-stone-100 truncate">
                    {t.title}
                  </span>
                  {getTierPill(t.tier)}
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
                    className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition p-1 shrink-0"
                    title="Open in Task Drawer"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>

              {t.subtasks && t.subtasks.length > 0 && (
                <div className="mt-1.5 pl-5 space-y-0.5">
                  {t.subtasks.map((st, sIdx) => (
                    <div
                      key={sIdx}
                      className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400"
                    >
                      <span className="truncate">{st.title}</span>
                      {(st.start_day !== undefined || st.end_day !== undefined) && (
                        <span className="font-mono text-3xs text-stone-400 shrink-0 ml-2">
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
