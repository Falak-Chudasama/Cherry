import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CheckSquare,
  Square,
  Plus,
  Sparkles,
  ChevronRight,
  Circle,
  CheckCircle2,
  Clock,
  ListTodo,
  Flame,
  Repeat,
} from 'lucide-react';
import { api } from '../lib/api';
import { playEnter, playNotification, playFailed, playScroll } from '../lib/sound';
import { useToast } from '../components/ui/ToastProvider';
import { useEcosystem } from '../context/EcosystemContext';
import { Task, KanbanStatus, TaskTier } from '../types';

export const DayPage: React.FC = () => {
  const {
    todayStr,
    openTaskDrawer,
    openAiDrawer,
    workspaceRevision,
    bumpWorkspaceRevision,
  } = useEcosystem();

  const { push: toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<'ALL' | 'Must Do' | 'Should Do' | 'Routine'>('ALL');
  const tierContainerRef = useRef<HTMLDivElement>(null);
  const tierItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [tierPillStyle, setTierPillStyle] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    opacity: number;
  }>({ left: 0, top: 0, width: 0, height: 0, opacity: 0 });
  const [isTierReady, setIsTierReady] = useState(false);

  const updateTierPill = () => {
    const el = tierItemRefs.current[tierFilter];
    if (el && tierContainerRef.current) {
      setTierPillStyle({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
        opacity: 1,
      });
    } else {
      setTierPillStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  };

  useEffect(() => {
    updateTierPill();
    const timer = setTimeout(() => {
      setIsTierReady(true);
      updateTierPill();
    }, 50);
    window.addEventListener('resize', updateTierPill);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateTierPill);
    };
  }, [tierFilter]);

  // Compute day number in quarter
  const dayMeta = useMemo(() => {
    try {
      const d = new Date(todayStr);
      const dayOfMonth = d.getDate();
      let dayInPeriod = 1;
      let totalDays = 7;
      let periodName = 'Quarter 1';

      if (dayOfMonth >= 1 && dayOfMonth <= 7) {
        dayInPeriod = dayOfMonth;
        periodName = 'Quarter 1';
      } else if (dayOfMonth >= 8 && dayOfMonth <= 14) {
        dayInPeriod = dayOfMonth - 7;
        periodName = 'Quarter 2';
      } else if (dayOfMonth >= 15 && dayOfMonth <= 21) {
        dayInPeriod = dayOfMonth - 14;
        periodName = 'Quarter 3';
      } else if (dayOfMonth >= 22 && dayOfMonth <= 28) {
        dayInPeriod = dayOfMonth - 21;
        periodName = 'Quarter 4';
      } else {
        dayInPeriod = dayOfMonth - 28;
        totalDays = 3;
        periodName = 'Surplus Period';
      }

      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      };
      const formattedDate = d.toLocaleDateString('en-US', options);

      return {
        formattedDate,
        dayInPeriod,
        totalDays,
        periodName,
      };
    } catch {
      return {
        formattedDate: todayStr,
        dayInPeriod: 1,
        totalDays: 7,
        periodName: 'Quarter',
      };
    }
  }, [todayStr]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await api.getDayTasks(todayStr);
      setTasks(data.tasks || []);
    } catch (err) {
      console.debug('Failed to load day tasks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [todayStr, workspaceRevision]);

  // Status cycle: Not started -> In progress -> Done -> Not started
  const cycleTaskStatus = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    playScroll();
    const nextStatus: KanbanStatus =
      task.status === 'Not started'
        ? 'In progress'
        : task.status === 'In progress'
        ? 'Done'
        : 'Not started';

    try {
      const updated = await api.updateTaskStatus(task.task_id, nextStatus);
      setTasks((prev) => prev.map((t) => (t.task_id === task.task_id ? updated : t)));
      playNotification();
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to update task status.');
    }
  };

  // Toggle subtask directly from card
  const handleToggleSubtask = async (
    taskId: string,
    subtaskId: string,
    currentVal: boolean,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    playScroll();
    try {
      const updated = await api.toggleSubtask(taskId, subtaskId, !currentVal);
      setTasks((prev) => prev.map((t) => (t.task_id === taskId ? updated : t)));
      playNotification();
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to update subtask.');
    }
  };

  // Filter tasks by selected Tier
  const filteredTasks = useMemo(() => {
    if (tierFilter === 'ALL') return tasks;
    return tasks.filter((t) => (t.tier || 'Must Do') === tierFilter);
  }, [tasks, tierFilter]);

  const completedCount = useMemo(() => {
    return tasks.filter((t) => t.status === 'Done').length;
  }, [tasks]);

  const progressPercent = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round((completedCount / tasks.length) * 100);
  }, [tasks, completedCount]);

  const getTierBadge = (tier?: TaskTier | string) => {
    const norm = (tier || '').toLowerCase();
    if (norm.includes('must')) {
      return (
        <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          <Flame className="h-3 w-3 text-rose-500" />
          <span>Must Do</span>
        </span>
      );
    }
    if (norm.includes('should')) {
      return (
        <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
          <Clock className="h-3 w-3 text-orange-500" />
          <span>Should Do</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
        <Repeat className="h-3 w-3 text-purple-500" />
        <span>Routine</span>
      </span>
    );
  };

  const getTaskDaysBadge = (task: Task) => {
    const days =
      task.scheduled_days ||
      (task.start_day !== undefined && task.end_day !== undefined
        ? Array.from({ length: task.end_day - task.start_day + 1 }, (_, i) => task.start_day! + i)
        : null);
    if (!days || days.length === 0) return null;
    const isSurplus = (task.period_id || '').includes('SURPLUS');
    const tDays = isSurplus ? 3 : 7;
    const label =
      days.length === tDays
        ? 'All Days'
        : days.length === 1
        ? `Day ${days[0]}`
        : `D${days[0]}–${days[days.length - 1]}`;

    return (
      <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200/60 dark:border-stone-700/60 shrink-0">
        {label}
      </span>
    );
  };

  const getStatusBadge = (status: KanbanStatus) => {
    switch (status) {
      case 'Done':
        return (
          <span className="flex items-center gap-1 text-2xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" /> Done
          </span>
        );
      case 'In progress':
        return (
          <span className="flex items-center gap-1 text-2xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
            <Clock className="h-3 w-3" /> In Progress
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-2xs font-semibold px-2.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700">
            <Circle className="h-3 w-3" /> Not Started
          </span>
        );
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8 space-y-6">
      {/* Calm, Minimalist Day Header */}
      <div className="glass-panel rounded-3xl p-5 sm:p-6 border border-black/[0.06] dark:border-white/[0.08] shadow-soft space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900">
                {dayMeta.periodName} • Day {dayMeta.dayInPeriod} of {dayMeta.totalDays}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-white">
              {dayMeta.formattedDate}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                playEnter();
                openTaskDrawer({ mode: 'create' });
              }}
              className="focus-ring flex items-center gap-1.5 px-4 py-2 rounded-full bg-cherry-flesh hover:bg-cherry-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition hover:scale-[1.02]"
            >
              <Plus className="h-4 w-4" />
              <span>New Task</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playEnter();
                openAiDrawer();
              }}
              className="focus-ring flex items-center gap-1.5 px-3.5 py-2 rounded-full glass-card text-stone-700 dark:text-stone-300 text-xs sm:text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition"
              title="Chat with Assistant"
            >
              <Sparkles className="h-4 w-4 text-cherry-flesh dark:text-cherry-blush" />
              <span>Ask AI</span>
            </button>
          </div>
        </div>

        {/* Clean Progress Indicator */}
        <div className="space-y-1.5 pt-2 border-t border-black/[0.05] dark:border-white/[0.08]">
          <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-400">
            <span>
              {completedCount} of {tasks.length} tasks completed
            </span>
            <span className="font-semibold">{progressPercent}%</span>
          </div>
          <div className="h-1.5 w-full bg-stone-200/80 dark:bg-stone-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cherry-flesh transition-all duration-500 ease-out rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tier Filter Pills (Kiwi Segmented Style with Dynamic Sliding Pill) */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
        <div
          ref={tierContainerRef}
          className="relative flex items-center gap-1 p-1 rounded-full bg-transparent border border-black/[0.06] dark:border-white/[0.08]"
        >
          {/* Dynamic Sliding Active Indicator Pill */}
          <div
            className={`absolute top-0 left-0 rounded-full bg-stone-900 dark:bg-stone-100 shadow-xs pointer-events-none ${
              isTierReady ? 'transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]' : ''
            }`}
            style={{
              transform: `translate3d(${tierPillStyle.left}px, ${tierPillStyle.top}px, 0)`,
              width: `${tierPillStyle.width}px`,
              height: `${tierPillStyle.height}px`,
              opacity: tierPillStyle.opacity,
              willChange: 'transform, width',
            }}
            aria-hidden="true"
          />

          {(['ALL', 'Must Do', 'Should Do', 'Routine'] as const).map((t) => {
            const isSelected = tierFilter === t;
            return (
              <button
                key={t}
                type="button"
                ref={(el) => {
                  tierItemRefs.current[t] = el;
                }}
                onClick={() => {
                  playScroll();
                  setTierFilter(t);
                }}
                className={`relative z-10 px-3.5 py-1 rounded-full text-xs font-semibold transition-colors duration-200 ${
                  isSelected
                    ? 'text-white dark:text-stone-900'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                {t === 'ALL' ? 'All Tasks' : t}
              </button>
            );
          })}
        </div>

        <span className="text-xs text-stone-400 font-medium hidden sm:inline">
          {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 dark:border-stone-700 border-t-cherry-flesh" />
        </div>
      ) : filteredTasks.length === 0 ? (
        /* Kiwi-Style Restrained Empty State */
        <div className="glass-panel rounded-3xl p-8 sm:p-12 text-center border border-black/[0.06] dark:border-white/[0.08] shadow-soft space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-400">
            <ListTodo className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-stone-900 dark:text-white">
              No tasks scheduled for today
            </h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Add your daily priorities or ask Cherry AI to organize your day into Must Do and Should Do tasks.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                playEnter();
                openTaskDrawer({ mode: 'create' });
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-cherry-flesh hover:bg-cherry-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Task</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playEnter();
                openAiDrawer('Plan my tasks for today with Must Do and Should Do tiers');
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full glass-card text-stone-700 dark:text-stone-300 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              <Sparkles className="h-3.5 w-3.5 text-cherry-flesh dark:text-cherry-blush" />
              <span>Ask AI to Plan</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const isDone = task.status === 'Done';
            const subtasks = task.subtasks || [];
            const doneSubtasks = subtasks.filter((s) => s.is_completed).length;

            return (
              <div
                key={task.task_id}
                onClick={() => openTaskDrawer({ task, mode: 'edit' })}
                className={`glass-card rounded-2xl p-4 sm:p-5 border transition-all cursor-pointer group shadow-soft hover:border-black/20 dark:hover:border-white/20 ${
                  isDone
                    ? 'border-black/[0.04] dark:border-white/[0.05] opacity-75'
                    : 'border-black/[0.07] dark:border-white/[0.09]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: Status Toggle & Title */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => cycleTaskStatus(task, e)}
                      className="mt-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition shrink-0"
                      title="Click to cycle status"
                    >
                      {isDone ? (
                        <CheckSquare className="h-5 w-5 text-emerald-500 fill-emerald-500/20" />
                      ) : task.status === 'In progress' ? (
                        <Clock className="h-5 w-5 text-blue-500" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3
                          className={`text-sm sm:text-base font-semibold leading-snug transition-colors ${
                            isDone
                              ? 'line-through text-stone-400 dark:text-stone-500'
                              : 'text-stone-900 dark:text-white'
                          }`}
                        >
                          {task.title}
                        </h3>
                        {getTierBadge(task.tier)}
                        {getTaskDaysBadge(task)}
                      </div>

                      {task.description && (
                        <p className="text-xs text-stone-500 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Status Pill & Arrow */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div
                      onClick={(e) => cycleTaskStatus(task, e)}
                      className="cursor-pointer select-none"
                    >
                      {getStatusBadge(task.status)}
                    </div>
                    <ChevronRight className="h-4 w-4 text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-200 transition" />
                  </div>
                </div>

                {/* Subtasks Checklist */}
                {subtasks.length > 0 && (
                  <div className="mt-3.5 pl-8 space-y-1.5 border-t border-black/[0.04] dark:border-white/[0.06] pt-3">
                    <div className="flex items-center justify-between text-2xs text-stone-400 font-medium">
                      <span>Subtasks</span>
                      <span>
                        {doneSubtasks}/{subtasks.length} done
                      </span>
                    </div>

                    <div className="space-y-1">
                      {subtasks.map((st) => (
                        <div
                          key={st.subtask_id}
                          onClick={(e) =>
                            handleToggleSubtask(
                              task.task_id,
                              st.subtask_id,
                              st.is_completed,
                              e
                            )
                          }
                          className="flex items-center justify-between p-1.5 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-2">
                            {st.is_completed ? (
                              <CheckSquare className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Square className="h-3.5 w-3.5 text-stone-400" />
                            )}
                            <span
                              className={`text-xs ${
                                st.is_completed
                                  ? 'line-through text-stone-400 dark:text-stone-500'
                                  : 'text-stone-700 dark:text-stone-300'
                              }`}
                            >
                              {st.title}
                            </span>
                          </div>

                          {(st.start_day !== undefined || st.end_day !== undefined) && (
                            <span className="font-mono text-2xs px-1.5 py-0.2 rounded bg-stone-200/60 dark:bg-stone-800 text-stone-500">
                              D{st.start_day ?? 1}–{st.end_day ?? 7}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
