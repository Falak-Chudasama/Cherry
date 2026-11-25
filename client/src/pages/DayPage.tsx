import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CheckSquare,
  Square,
  Plus,
  Clock,
  Flame,
  Repeat,
  Trash2,
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
    isTaskDrawerOpen,
    isAiDrawerOpen,
    workspaceRevision,
    bumpWorkspaceRevision,
    cachedDayTasks,
    setCachedDayTasks,
  } = useEcosystem();

  const { push: toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>(() => cachedDayTasks || []);
  const [loading, setLoading] = useState(() => !cachedDayTasks || cachedDayTasks.length === 0);
  const [tierFilter, setTierFilter] = useState<'ALL' | 'Must Do' | 'Should Do' | 'Routine'>('ALL');

  // Delayed sorting map for requirement 12 (3-second grace period)
  const [delayedSortMap, setDelayedSortMap] = useState<
    Record<string, { sortStatus: KanbanStatus; expireAt: number }>
  >({});

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

  // Keyboard navigation for sub-menu (Shift + ArrowLeft / Shift + ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTaskDrawerOpen || isAiDrawerOpen) return;
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isEditingText) return;

      if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const TIER_OPTIONS = ['ALL', 'Must Do', 'Should Do', 'Routine'] as const;
        const currentIdx = TIER_OPTIONS.indexOf(tierFilter);
        let nextIdx = currentIdx;
        if (e.key === 'ArrowRight') {
          nextIdx = (currentIdx + 1) % TIER_OPTIONS.length;
        } else {
          nextIdx = (currentIdx - 1 + TIER_OPTIONS.length) % TIER_OPTIONS.length;
        }
        playScroll();
        setTierFilter(TIER_OPTIONS[nextIdx]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tierFilter, isTaskDrawerOpen, isAiDrawerOpen]);

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

  const loadTasks = async (showLoadingSpinner = false) => {
    try {
      if (showLoadingSpinner) setLoading(true);
      const data = await api.getDayTasks(todayStr);
      const fetchedTasks = data.tasks || [];
      setTasks(fetchedTasks);
      setCachedDayTasks(fetchedTasks);
    } catch (err) {
      console.debug('Failed to load day tasks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasCached = cachedDayTasks && cachedDayTasks.length > 0;
    loadTasks(!hasCached);
  }, [todayStr, workspaceRevision]);

  // Requirement 1: Only tasks that are either of that day or of all days
  const isTaskForToday = (t: Task): boolean => {
    const totalDays = dayMeta.totalDays;
    const currentDay = dayMeta.dayInPeriod;
    const days =
      t.scheduled_days && t.scheduled_days.length > 0
        ? t.scheduled_days
        : t.start_day !== undefined && t.end_day !== undefined
        ? Array.from({ length: t.end_day - t.start_day + 1 }, (_, i) => t.start_day! + i)
        : [];

    if (days.length === 0) {
      // Check subtasks if present
      if (t.subtasks && t.subtasks.length > 0) {
        const subDays = t.subtasks.flatMap((st) =>
          st.selected_days && st.selected_days.length > 0
            ? st.selected_days
            : st.start_day !== undefined && st.end_day !== undefined
            ? Array.from({ length: st.end_day - st.start_day + 1 }, (_, i) => st.start_day! + i)
            : []
        );
        if (subDays.length > 0) {
          return subDays.length >= totalDays || subDays.includes(currentDay);
        }
      }
      return true; // Untagged falls back to today
    }

    const isAllDays = days.length >= totalDays;
    const isThisDay = days.includes(currentDay);
    return isAllDays || isThisDay;
  };

  // Status cycle: Not started -> In progress -> Done -> Not started
  // Requirement 12: 3-second delay on rearranging when user clicks in-progress
  const cycleTaskStatus = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    playScroll();
    const nextStatus: KanbanStatus =
      task.status === 'Not started'
        ? 'In progress'
        : task.status === 'In progress'
        ? 'Done'
        : 'Not started';

    // Hold sorting position for 3 seconds so the item doesn't jump from under cursor
    setDelayedSortMap((prev) => ({
      ...prev,
      [task.task_id]: {
        sortStatus: task.status,
        expireAt: Date.now() + 3000,
      },
    }));

    setTimeout(() => {
      setDelayedSortMap((prev) => {
        const next = { ...prev };
        delete next[task.task_id];
        return next;
      });
    }, 3000);

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.task_id === task.task_id ? { ...t, status: nextStatus } : t))
    );

    try {
      const updated = await api.updateTaskStatus(task.task_id, nextStatus);
      setTasks((prev) => prev.map((t) => (t.task_id === task.task_id ? updated : t)));
      setCachedDayTasks((prev) => prev.map((t) => (t.task_id === task.task_id ? updated : t)));
      playNotification();
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to update task status.');
      loadTasks();
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
      setCachedDayTasks((prev) => prev.map((t) => (t.task_id === taskId ? updated : t)));
      playNotification();
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to update subtask.');
    }
  };

  // Delete task directly from card
  const handleDeleteTask = async (taskId: string, taskTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
      setCachedDayTasks((prev) => prev.filter((t) => t.task_id !== taskId));
      playNotification();
      toast('info', `Deleted "${taskTitle}"`);
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to delete task.');
    }
  };

  // Status priority for sorting: In progress (0) -> Not started (1) -> Done (2)
  const getStatusPriority = (st: KanbanStatus): number => {
    if (st === 'In progress') return 0;
    if (st === 'Not started') return 1;
    return 2; // Done
  };

  // Sort tasks according to Requirement 12
  const sortTasks = (taskList: Task[]): Task[] => {
    return [...taskList].sort((a, b) => {
      const aDelay = delayedSortMap[a.task_id];
      const bDelay = delayedSortMap[b.task_id];

      const aEffectiveStatus =
        aDelay && aDelay.expireAt > Date.now() ? aDelay.sortStatus : a.status;
      const bEffectiveStatus =
        bDelay && bDelay.expireAt > Date.now() ? bDelay.sortStatus : b.status;

      const prioA = getStatusPriority(aEffectiveStatus);
      const prioB = getStatusPriority(bEffectiveStatus);

      if (prioA !== prioB) return prioA - prioB;
      return (a.title || '').localeCompare(b.title || '');
    });
  };

  // Filter tasks to today only, then split into tiers
  const todayTasks = useMemo(() => {
    return tasks.filter(isTaskForToday);
  }, [tasks, dayMeta.dayInPeriod, dayMeta.totalDays]);

  const routineTasks = useMemo(() => {
    return sortTasks(todayTasks.filter((t) => (t.tier || '').toLowerCase() === 'routine'));
  }, [todayTasks, delayedSortMap]);

  const mustDoTasks = useMemo(() => {
    return sortTasks(todayTasks.filter((t) => (t.tier || '').toLowerCase() === 'must do'));
  }, [todayTasks, delayedSortMap]);

  const shouldDoTasks = useMemo(() => {
    return sortTasks(todayTasks.filter((t) => (t.tier || '').toLowerCase() === 'should do'));
  }, [todayTasks, delayedSortMap]);

  const completedCount = useMemo(() => {
    return todayTasks.filter((t) => t.status === 'Done').length;
  }, [todayTasks]);

  const progressPercent = useMemo(() => {
    if (todayTasks.length === 0) return 0;
    return Math.round((completedCount / todayTasks.length) * 100);
  }, [todayTasks, completedCount]);

  const getTaskDaysBadge = (task: Task) => {
    const days =
      task.scheduled_days ||
      (task.start_day !== undefined && task.end_day !== undefined
        ? Array.from({ length: task.end_day - task.start_day + 1 }, (_, i) => task.start_day! + i)
        : null);
    if (!days || days.length === 0) return null;
    const isSurplus = (task.period_id || '').includes('SURPLUS');
    const tDays = isSurplus ? 3 : 7;
    if (days.length >= tDays) return null;
    const label = days.length === 1 ? `D${days[0]}` : `D${days[0]}–${days[days.length - 1]}`;

    return (
      <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 shrink-0 whitespace-nowrap">
        {label}
      </span>
    );
  };

  // Render a single task card
  const renderTaskCard = (task: Task) => {
    const isDone = task.status === 'Done';
    const isInProgress = task.status === 'In progress';
    const subtasks = task.subtasks || [];
    const doneSubtasks = subtasks.filter((s) => s.is_completed).length;
    const daysBadge = getTaskDaysBadge(task);

    return (
      <div
        key={task.task_id}
        onClick={() => openTaskDrawer({ task, mode: 'edit' })}
        className={`glass-card rounded-2xl p-3.5 border transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer group shadow-2xs hover:shadow-md hover:border-black/20 dark:hover:border-white/20 select-none overflow-hidden ${
          isDone
            ? 'border-black/[0.04] dark:border-white/[0.05] opacity-70'
            : 'border-black/[0.07] dark:border-white/[0.09]'
        }`}
      >
        <div className="space-y-2">
          {/* Card Top: Status Toggle, Title, Subtle Meta & Trash */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              <button
                type="button"
                onClick={(e) => cycleTaskStatus(task, e)}
                className="mt-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition shrink-0"
                title="Cycle status"
              >
                {isDone ? (
                  <CheckSquare className="h-4 w-4 text-emerald-500 fill-emerald-500/20" />
                ) : isInProgress ? (
                  <Clock className="h-4 w-4 text-sky-500" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>

              <h4
                className={`text-xs font-semibold leading-snug break-words min-w-0 flex-1 ${
                  isDone
                    ? 'line-through text-stone-400 dark:text-stone-500'
                    : 'text-stone-900 dark:text-white'
                }`}
              >
                {task.title}
              </h4>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isInProgress && (
                <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300">
                  In Progress
                </span>
              )}
              {daysBadge}
              <button
                type="button"
                onClick={(e) => handleDeleteTask(task.task_id, task.title, e)}
                title="Delete task"
                className="p-1 rounded-md text-stone-300 dark:text-stone-600 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {task.description && (
            <p className="text-2xs text-stone-500 line-clamp-2 pl-6">
              {task.description}
            </p>
          )}

          {/* Subtasks Checklist */}
          {subtasks.length > 0 && (
            <div className="pt-2 border-t border-black/[0.04] dark:border-white/[0.06] space-y-1">
              <div className="flex items-center justify-end text-3xs text-stone-400 font-mono">
                <span>
                  {doneSubtasks}/{subtasks.length}
                </span>
              </div>

              <div className="space-y-0.5">
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
                    className="flex items-center justify-between p-1 rounded hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition text-2xs select-none"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {st.is_completed ? (
                        <CheckSquare className="h-3 w-3 text-emerald-500 shrink-0" />
                      ) : (
                        <Square className="h-3 w-3 text-stone-400 shrink-0" />
                      )}
                      <span
                        className={`truncate ${
                          st.is_completed
                            ? 'line-through text-stone-400'
                            : 'text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        {st.title}
                      </span>
                    </div>

                    {(st.start_day !== undefined || st.end_day !== undefined) && (
                      <span className="font-mono text-3xs text-stone-400 shrink-0 ml-2">
                        D{st.start_day ?? 1}–{st.end_day ?? 7}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Section column component
  const renderSectionColumn = (
    title: string,
    tier: TaskTier,
    icon: React.ReactNode,
    taskList: Task[],
    accentBorder: string,
    _emptyMessage: string
  ) => {
    return (
      <div className="flex flex-col rounded-3xl glass-panel border border-black/[0.06] dark:border-white/[0.08] p-4 shadow-soft space-y-3 min-w-0">
        {/* Column Header */}
        <div className="flex items-center justify-between pb-2 border-b border-black/[0.04] dark:border-white/[0.06]">
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200 truncate">
              {title}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono text-2xs px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-stone-600 dark:text-stone-400 font-bold">
              {taskList.length}
            </span>
            <button
              type="button"
              onClick={() => {
                playEnter();
                openTaskDrawer({ mode: 'create', tier });
              }}
              className="p-1 rounded-full text-stone-400 hover:text-cherry-flesh hover:bg-cherry-500/10 transition"
              title={`Add ${title} task`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Task Cards or Minimal Empty State */}
        <div className="space-y-2.5 overflow-y-auto overflow-x-hidden pr-0.5">
          {taskList.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                playEnter();
                openTaskDrawer({ mode: 'create', tier });
              }}
              className={`w-full py-6 rounded-2xl border border-dashed ${accentBorder} text-center text-xs text-stone-400 hover:text-cherry-flesh hover:border-cherry-500/30 transition flex items-center justify-center gap-1.5`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add task</span>
            </button>
          ) : (
            taskList.map(renderTaskCard)
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-6">
      {/* Calm, Minimalist Day Header - 0.65 of original size, aligned on the left (Feedback 3) */}
      <div className="w-full lg:w-[65%] glass-panel rounded-3xl p-5 sm:p-6 border border-black/[0.06] dark:border-white/[0.08] shadow-soft space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {/* Requirement 9: Remove "of 7", keep "Quarter 4 • Day 3" */}
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-2xs">
                {dayMeta.periodName} • Day {dayMeta.dayInPeriod}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-900 dark:text-white">
              {dayMeta.formattedDate}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                playEnter();
                openTaskDrawer({ mode: 'create' });
              }}
              className="focus-ring flex items-center gap-1.5 px-4 py-2 rounded-full bg-cherry-flesh hover:bg-cherry-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition hover:scale-[1.02] active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>New Task</span>
            </button>
          </div>
        </div>

        {/* Clean Progress Indicator */}
        <div className="space-y-1.5 pt-2 border-t border-black/[0.05] dark:border-white/[0.08]">
          <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-400">
            <span>
              {completedCount} of {todayTasks.length} tasks completed today
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

      {/* Requirement 9: Tier Filter Slider slightly bigger & more comfortable */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
        <div
          ref={tierContainerRef}
          className="relative flex items-center gap-1 p-1.5 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08]"
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
                className={`relative z-10 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-colors duration-200 select-none ${
                  isSelected
                    ? 'text-white dark:text-stone-900'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                {t === 'ALL' ? 'All' : t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tasks Content / Grid */}
      {loading ? (
        <div className="flex min-h-[35vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 dark:border-stone-700 border-t-cherry-flesh" />
        </div>
      ) : (
        /* Requirement 2: Routine section, Must do and Should do sections next to each other in a grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
          {(tierFilter === 'ALL' || tierFilter === 'Routine') &&
            renderSectionColumn(
              'Routine',
              'Routine',
              <Repeat className="h-4 w-4 text-purple-500 shrink-0" />,
              routineTasks,
              'border-purple-500/20',
              'No routine tasks scheduled for today'
            )}

          {(tierFilter === 'ALL' || tierFilter === 'Must Do') &&
            renderSectionColumn(
              'Must Do',
              'Must Do',
              <Flame className="h-4 w-4 text-rose-500 shrink-0" />,
              mustDoTasks,
              'border-rose-500/20',
              'No Must Do tasks scheduled for today'
            )}

          {(tierFilter === 'ALL' || tierFilter === 'Should Do') &&
            renderSectionColumn(
              'Should Do',
              'Should Do',
              <Clock className="h-4 w-4 text-orange-500 shrink-0" />,
              shouldDoTasks,
              'border-orange-500/20',
              'No Should Do tasks scheduled for today'
            )}
        </div>
      )}
    </div>
  );
};
