import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Sparkles,
  Plus,
  CheckSquare,
  Square,
  Clock,
  Circle,
  CheckCircle2,
  Flame,
  Repeat,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { playEnter, playNotification, playFailed, playScroll } from '../lib/sound';
import { useToast } from '../components/ui/ToastProvider';
import { useEcosystem } from '../context/EcosystemContext';
import { Task, KanbanStatus, TaskTier, PeriodType } from '../types';

const KANBAN_COLUMNS: Array<{ status: KanbanStatus; label: string }> = [
  { status: 'Not started', label: 'Not Started' },
  { status: 'In progress', label: 'In Progress' },
  { status: 'Done', label: 'Done' },
];

export const QuarterPage: React.FC = () => {
  const {
    todayStr,
    activeQuarterId,
    openTaskDrawer,
    openPlanModal,
    isTaskDrawerOpen,
    isAiDrawerOpen,
    workspaceRevision,
    bumpWorkspaceRevision,
    cachedPeriodTasks,
    setCachedPeriodTasks,
  } = useEcosystem();

  const [searchParams] = useSearchParams();
  const periodIdParam = searchParams.get('period_id');
  const currentPeriodId = periodIdParam || activeQuarterId;

  const isSurplus = currentPeriodId.includes('SURPLUS');
  const currentPeriodType: PeriodType = isSurplus
    ? 'SURPLUS'
    : currentPeriodId.includes('Q4')
    ? 'Q4'
    : currentPeriodId.includes('Q3')
    ? 'Q3'
    : currentPeriodId.includes('Q2')
    ? 'Q2'
    : 'Q1';

  const quarterNum = isSurplus ? null : parseInt(currentPeriodType.replace('Q', ''), 10);
  const totalDays = isSurplus ? 3 : 7;

  // Compute Period Meta & Date Ranges
  const periodMeta = useMemo(() => {
    const match = currentPeriodId.match(/^(\d{4})-(\d{2})-(Q[1-4]|SURPLUS)$/);
    if (!match) {
      return {
        label: isSurplus ? 'Surplus Period' : `Quarter ${quarterNum}`,
        dateRange: 'Active Period',
        days: Array.from({ length: totalDays }, (_, i) => ({ dayNum: i + 1, dateLabel: `D${i + 1}` })),
        startDay: 1,
        monthStr: 'Nov',
        year: 2026,
      };
    }
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const type = match[3];
    const daysInMonth = new Date(year, month, 0).getDate();

    let startDay = 1;
    let endDay = 7;
    let label = `Quarter 1`;

    if (type === 'Q1') {
      startDay = 1;
      endDay = 7;
      label = `Quarter 1`;
    } else if (type === 'Q2') {
      startDay = 8;
      endDay = 14;
      label = `Quarter 2`;
    } else if (type === 'Q3') {
      startDay = 15;
      endDay = 21;
      label = `Quarter 3`;
    } else if (type === 'Q4') {
      startDay = 22;
      endDay = 28;
      label = `Quarter 4`;
    } else if (type === 'SURPLUS') {
      startDay = 29;
      endDay = daysInMonth;
      label = `Surplus Period`;
    }

    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const monthStr = monthNames[month - 1];
    const dateRange = `${monthStr} ${startDay} – ${monthStr} ${endDay}`;

    const actualTotalDays = endDay - startDay + 1;
    const days = Array.from({ length: actualTotalDays }, (_, i) => ({
      dayNum: i + 1,
      dateLabel: `D${i + 1}`,
    }));

    return { label, dateRange, days, startDay, endDay, month, monthStr, year };
  }, [currentPeriodId, isSurplus, quarterNum, totalDays]);

  // Compute which day number represents "today" within the currently viewed period
  const todayDayNum = useMemo(() => {
    try {
      const parts = (todayStr || '').split('-').map(Number);
      if (parts.length === 3) {
        const [y, m, d] = parts;
        if (y === periodMeta.year && m === periodMeta.month) {
          if (d >= periodMeta.startDay && d <= periodMeta.endDay) {
            return d - periodMeta.startDay + 1;
          }
        }
      }
    } catch {
      // fallback
    }
    return null;
  }, [todayStr, periodMeta]);

  const { push: toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>(() => cachedPeriodTasks || []);
  const [loading, setLoading] = useState(() => !cachedPeriodTasks || cachedPeriodTasks.length === 0);
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'ALL'>('ALL');
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const dayFilterContainerRef = useRef<HTMLDivElement>(null);
  const dayFilterItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [dayPillStyle, setDayPillStyle] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    opacity: number;
  }>({ left: 0, top: 0, width: 0, height: 0, opacity: 0 });
  const [isDayPillReady, setIsDayPillReady] = useState(false);

  const updateDayPill = () => {
    const key = String(selectedDayFilter);
    const el = dayFilterItemRefs.current[key];
    if (el && dayFilterContainerRef.current) {
      setDayPillStyle({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
        opacity: 1,
      });
    } else {
      setDayPillStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  };

  useEffect(() => {
    updateDayPill();
    const timer = setTimeout(() => {
      setIsDayPillReady(true);
      updateDayPill();
    }, 50);
    window.addEventListener('resize', updateDayPill);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateDayPill);
    };
  }, [selectedDayFilter]);

  // Keyboard navigation for sub-menu day filter (Shift + ArrowLeft / Shift + ArrowRight)
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
        const dayOptions: (number | 'ALL')[] = ['ALL', ...periodMeta.days.map((d) => d.dayNum)];
        const currentIdx = dayOptions.indexOf(selectedDayFilter);
        let nextIdx = currentIdx;
        if (e.key === 'ArrowRight') {
          nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % dayOptions.length;
        } else {
          nextIdx = currentIdx === -1 ? dayOptions.length - 1 : (currentIdx - 1 + dayOptions.length) % dayOptions.length;
        }
        playScroll();
        setSelectedDayFilter(dayOptions[nextIdx]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDayFilter, periodMeta.days, isTaskDrawerOpen, isAiDrawerOpen]);

  const loadPeriodTasks = async (showLoadingSpinner = false) => {
    try {
      if (showLoadingSpinner) setLoading(true);
      const data = await api.getPeriodTasks(currentPeriodId);
      const fetched = data || [];
      setTasks(fetched);
      setCachedPeriodTasks(fetched);
    } catch (err) {
      console.debug('Failed to load period tasks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasCached = cachedPeriodTasks && cachedPeriodTasks.length > 0;
    loadPeriodTasks(!hasCached);
  }, [currentPeriodId, workspaceRevision]);

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: KanbanStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
    setDraggingTaskId(null);

    if (!taskId) return;
    const task = tasks.find((t) => t.task_id === taskId);
    if (!task || task.status === targetStatus) return;

    playScroll();
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.task_id === taskId ? { ...t, status: targetStatus } : t))
    );
    setCachedPeriodTasks((prev) =>
      prev.map((t) => (t.task_id === taskId ? { ...t, status: targetStatus } : t))
    );

    try {
      await api.updateTaskStatus(taskId, targetStatus);
      playNotification();
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to update task column.');
      loadPeriodTasks();
    }
  };

  // Toggle subtask directly in card
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
      setCachedPeriodTasks((prev) => prev.map((t) => (t.task_id === taskId ? updated : t)));
      playNotification();
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to update subtask.');
    }
  };

  // Delete task directly in card
  const handleDeleteTask = async (taskId: string, taskTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
      setCachedPeriodTasks((prev) => prev.filter((t) => t.task_id !== taskId));
      playNotification();
      toast('info', `Deleted "${taskTitle}"`);
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to delete task.');
    }
  };

  // Filter tasks by Day (ALL or specific day D_k)
  const filteredTasks = useMemo(() => {
    if (selectedDayFilter === 'ALL') return tasks;

    const dayNum = Number(selectedDayFilter);
    return tasks.filter((t) => {
      // 1. Check task-level days
      if (t.scheduled_days && t.scheduled_days.length > 0) {
        return t.scheduled_days.includes(dayNum);
      }
      if (t.start_day !== undefined && t.end_day !== undefined) {
        if (dayNum >= t.start_day && dayNum <= t.end_day) return true;
      }
      // 2. Check subtasks
      if (t.subtasks && t.subtasks.length > 0) {
        return t.subtasks.some((st) => {
          if (st.selected_days && st.selected_days.length > 0) {
            return st.selected_days.includes(dayNum);
          }
          if (st.start_day !== undefined && st.end_day !== undefined) {
            return dayNum >= st.start_day && dayNum <= st.end_day;
          }
          return false;
        });
      }
      return false;
    });
  }, [tasks, selectedDayFilter]);

  const completedCount = useMemo(() => {
    return tasks.filter((t) => t.status === 'Done').length;
  }, [tasks]);

  const progressPercent = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round((completedCount / tasks.length) * 100);
  }, [tasks, completedCount]);

  // Requirement 7: Focus on text "Nov 22 – Nov 28", and when switching to e.g. Day 2, show "Nov 23"
  const activeDateDisplay = useMemo(() => {
    if (selectedDayFilter === 'ALL') {
      return periodMeta.dateRange;
    }
    const dayNum = Number(selectedDayFilter);
    const targetDay = periodMeta.startDay + dayNum - 1;
    return `${periodMeta.monthStr} ${targetDay}`;
  }, [selectedDayFilter, periodMeta]);

  const getTierBadge = (tier?: TaskTier | string) => {
    const norm = (tier || '').toLowerCase();
    if (norm.includes('must')) {
      return (
        <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
          <Flame className="h-3 w-3 text-rose-500" />
          <span>Must Do</span>
        </span>
      );
    }
    if (norm.includes('should')) {
      return (
        <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 shrink-0">
          <Clock className="h-3 w-3 text-orange-500" />
          <span>Should Do</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
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
    const tDays = isSurplus ? 3 : 7;
    const label =
      days.length >= tDays
        ? 'All Days'
        : days.length === 1
        ? `Day ${days[0]}`
        : `D${days[0]}–${days[days.length - 1]}`;

    return (
      <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200/60 dark:border-stone-700/60 shrink-0 whitespace-nowrap">
        {label}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-6">
      {/* Quarter Header - 0.65 of original size, aligned on the left (Feedback 3) */}
      <div className="w-full lg:w-[65%] glass-panel rounded-3xl p-5 sm:p-6 border border-black/[0.06] dark:border-white/[0.08] shadow-soft space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            {/* Requirement 7: Display focused date (Nov 22 – Nov 28 or Nov 23 on Day 2), removed 2026-11-Q4 */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-2xs">
                {activeDateDisplay}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-900 dark:text-white">
              {periodMeta.label} Kanban
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                playEnter();
                openTaskDrawer({
                  period_id: currentPeriodId,
                  period_type: currentPeriodType,
                  mode: 'create',
                });
              }}
              className="focus-ring flex items-center gap-1.5 px-4 py-2 rounded-full bg-cherry-flesh hover:bg-cherry-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition hover:scale-[1.02] active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>New Task</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playEnter();
                openPlanModal({
                  period_id: currentPeriodId,
                  period_type: currentPeriodType,
                });
              }}
              className="focus-ring flex items-center gap-1.5 px-3.5 py-2 rounded-full glass-card text-stone-700 dark:text-stone-300 text-xs sm:text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition active:scale-95"
            >
              <Sparkles className="h-4 w-4 text-cherry-flesh dark:text-cherry-blush" />
              <span>AI Plan</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
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

      {/* Day Filter Strip (Kiwi Segmented Style with Dynamic Sliding Pill) */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
        <div
          ref={dayFilterContainerRef}
          className="relative flex items-center gap-1 p-1.5 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08]"
        >
          {/* Dynamic Sliding Active Indicator Pill */}
          <div
            className={`absolute top-0 left-0 rounded-full shadow-xs pointer-events-none transition-colors duration-300 ${
              selectedDayFilter === todayDayNum
                ? 'bg-cherry-flesh shadow-cherry-500/25'
                : 'bg-stone-900 dark:bg-stone-100'
            } ${
              isDayPillReady ? 'transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]' : ''
            }`}
            style={{
              transform: `translate3d(${dayPillStyle.left}px, ${dayPillStyle.top}px, 0)`,
              width: `${dayPillStyle.width}px`,
              height: `${dayPillStyle.height}px`,
              opacity: dayPillStyle.opacity,
              willChange: 'transform, width',
            }}
            aria-hidden="true"
          />

          <button
            type="button"
            ref={(el) => {
              dayFilterItemRefs.current['ALL'] = el;
            }}
            onClick={() => {
              playScroll();
              setSelectedDayFilter('ALL');
            }}
            className={`relative z-10 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors duration-200 select-none ${
              selectedDayFilter === 'ALL'
                ? 'text-white dark:text-stone-900'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            All Days
          </button>

          {periodMeta.days.map((d) => {
            const isSelected = selectedDayFilter === d.dayNum;
            const isToday = todayDayNum === d.dayNum;
            return (
              <button
                key={d.dayNum}
                type="button"
                ref={(el) => {
                  dayFilterItemRefs.current[String(d.dayNum)] = el;
                }}
                onClick={() => {
                  playScroll();
                  setSelectedDayFilter(d.dayNum);
                }}
                className={`relative z-10 px-3 py-1.5 rounded-full text-xs font-semibold font-mono transition-colors duration-200 select-none ${
                  isSelected
                    ? isToday
                      ? 'text-white'
                      : 'text-white dark:text-stone-900'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                {d.dateLabel}
                {isToday && !isSelected && (
                  <span
                    className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-[#FF5252] ring-1 ring-white dark:ring-[#141212] pointer-events-none"
                    title="Today"
                    aria-label="Today"
                  />
                )}
              </button>
            );
          })}
        </div>

        <span className="text-xs text-stone-400 font-medium hidden sm:inline">
          {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      {/* Kanban Board Columns - Requirement 6: Handled overflow, zero unnecessary scrollbars, no UI clipping */}
      {loading ? (
        <div className="flex min-h-[35vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 dark:border-stone-700 border-t-cherry-flesh" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.status)}
                className="flex flex-col rounded-3xl glass-panel border border-black/[0.06] dark:border-white/[0.08] p-4 min-h-[500px] shadow-soft space-y-3 min-w-0 overflow-hidden"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div className="flex items-center gap-2 min-w-0">
                    {col.status === 'Done' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : col.status === 'In progress' ? (
                      <Clock className="h-4 w-4 text-sky-500 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-stone-400 shrink-0" />
                    )}
                    <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 truncate">
                      {col.label}
                    </h3>
                  </div>
                  <span className="font-mono text-2xs px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.05] text-stone-500 font-bold shrink-0">
                    {colTasks.length}
                  </span>
                </div>

                {/* Column Task Cards: overflow-y-auto, overflow-x-hidden to prevent parent horizontal scrollbar */}
                <div className="flex-1 space-y-2.5 overflow-y-auto overflow-x-hidden pr-0.5">
                  {colTasks.length === 0 ? (
                    <div className="h-28 flex items-center justify-center border border-dashed border-black/10 dark:border-white/10 rounded-2xl text-stone-400 text-xs">
                      Drop tasks here
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const isDone = task.status === 'Done';
                      const subtasks = task.subtasks || [];
                      const doneSubtasks = subtasks.filter((s) => s.is_completed).length;

                      return (
                        <div
                          key={task.task_id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.task_id)}
                          onClick={() => openTaskDrawer({ task, mode: 'edit' })}
                          className={`glass-card rounded-2xl p-4 border transition-all duration-200 cursor-pointer group shadow-2xs hover:shadow-md hover:border-black/20 dark:hover:border-white/20 select-none overflow-hidden ${
                            isDone
                              ? 'border-black/[0.04] dark:border-white/[0.05] opacity-75'
                              : 'border-black/[0.07] dark:border-white/[0.09]'
                          }`}
                        >
                          <div className="space-y-2">
                            {/* Card Top: Title on top, Trash button right */}
                            <div className="flex items-start justify-between gap-2">
                              <h4
                                className={`text-xs font-semibold leading-snug break-words min-w-0 flex-1 ${
                                  isDone
                                    ? 'line-through text-stone-400 dark:text-stone-500'
                                    : 'text-stone-900 dark:text-white'
                                }`}
                              >
                                {task.title}
                              </h4>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteTask(task.task_id, task.title, e)}
                                title="Delete task"
                                className="p-1 rounded-md text-stone-300 dark:text-stone-600 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {/* Badges in their own row: prevents ss3 clipping bug */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {getTierBadge(task.tier)}
                              {getTaskDaysBadge(task)}
                            </div>

                            {task.description && (
                              <p className="text-2xs text-stone-500 line-clamp-2">
                                {task.description}
                              </p>
                            )}

                            {/* Subtasks checklist */}
                            {subtasks.length > 0 && (
                              <div className="pt-2 border-t border-black/[0.04] dark:border-white/[0.06] space-y-1">
                                <div className="flex items-center justify-between text-3xs text-stone-400 font-mono">
                                  <span>Subtasks</span>
                                  <span>
                                    {doneSubtasks}/{subtasks.length}
                                  </span>
                                </div>
                                {subtasks.slice(0, 3).map((st) => (
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
                                    className="flex items-center justify-between p-1 rounded hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition text-2xs select-none gap-2 min-w-0"
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
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
                                      <span className="font-mono text-3xs px-1 rounded bg-stone-200/60 dark:bg-stone-800 text-stone-500 shrink-0">
                                        D{st.start_day ?? 1}–{st.end_day ?? 7}
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {subtasks.length > 3 && (
                                  <span className="text-3xs text-stone-400 pl-1 block">
                                    +{subtasks.length - 3} more subtasks
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
