import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Plus,
  Trash2,
  Undo2,
  Loader2,
  CheckSquare,
  Square,
  Calendar,
  ChevronDown,
  ChevronUp,
  Flame,
  Clock,
  Repeat,
  CircleDot,
  Play,
  CheckCircle2,
} from 'lucide-react';
import { useEcosystem } from '../../context/EcosystemContext';
import { api } from '../../lib/api';
import { useToast } from '../ui/ToastProvider';
import { playEnter, playBack, playNotification, playFailed, playScroll } from '../../lib/sound';
import { KanbanStatus, PeriodType, TaskTier } from '../../types';

interface SubtaskItem {
  id?: string;
  subtask_id?: string;
  title: string;
  start_day: number;
  end_day: number;
  selected_days?: number[];
  is_completed?: boolean;
}

interface StatusOption {
  id: KanbanStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STATUS_OPTIONS: StatusOption[] = [
  { id: 'Not started', label: 'Not started', icon: CircleDot },
  { id: 'In progress', label: 'In progress', icon: Play },
  { id: 'Done', label: 'Done', icon: CheckCircle2 },
];

export const TaskDrawer: React.FC = () => {
  const {
    isTaskDrawerOpen,
    taskDrawerData,
    closeTaskDrawer,
    activeQuarterId,
    activePeriodType,
    todayStr,
    bumpWorkspaceRevision,
  } = useEcosystem();

  const { push: toast } = useToast();

  const mode = taskDrawerData?.mode || (taskDrawerData?.task?.task_id ? 'edit' : 'create');
  const existingTask = taskDrawerData?.task;

  // Compute current day of period (1..7 or 1..3)
  const computeDayInPeriod = (dateStr: string): number => {
    try {
      const day = new Date(dateStr).getDate();
      if (day <= 7) return day;
      if (day <= 14) return day - 7;
      if (day <= 21) return day - 14;
      if (day <= 28) return day - 21;
      return day - 28;
    } catch {
      return 1;
    }
  };

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tier, setTier] = useState<TaskTier>('Must Do');
  const [status, setStatus] = useState<KanbanStatus>('Not started');
  const [periodId, setPeriodId] = useState('');
  const [periodType, setPeriodType] = useState<PeriodType>('Q4');
  const [taskDays, setTaskDays] = useState<number[]>([1]);
  const [taskAnchorDay, setTaskAnchorDay] = useState<number | null>(null);
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>([]);

  // Sliding pill for Kanban Status selector
  const statusContainerRef = useRef<HTMLDivElement>(null);
  const statusItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [statusPillStyle, setStatusPillStyle] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    opacity: number;
  }>({ left: 0, top: 0, width: 0, height: 0, opacity: 0 });
  const [isStatusReady, setIsStatusReady] = useState(false);

  // AI refinement states
  const [showAiRefine, setShowAiRefine] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [previousDraft, setPreviousDraft] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeDayPickerIdx, setActiveDayPickerIdx] = useState<number | null>(null);
  const [subtaskAnchorDay, setSubtaskAnchorDay] = useState<number | null>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const isSurplus = periodId.includes('SURPLUS') || periodType === 'SURPLUS';
  const totalDays = isSurplus ? 3 : 7;
  const dayPills = Array.from({ length: totalDays }, (_, i) => i + 1);

  // Mount/Unmount & smooth slide transition orchestration
  useEffect(() => {
    if (isTaskDrawerOpen) {
      setShouldRender(true);
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => {
          setIsVisible(true);
        });
        return () => cancelAnimationFrame(r2);
      });
      return () => cancelAnimationFrame(r1);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 320);
      return () => clearTimeout(timer);
    }
  }, [isTaskDrawerOpen]);

  // Update Status sliding pill geometry
  const updateStatusPill = () => {
    const el = statusItemRefs.current[status];
    if (el && statusContainerRef.current) {
      setStatusPillStyle({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
        opacity: 1,
      });
    } else {
      setStatusPillStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  };

  useEffect(() => {
    if (isVisible) {
      updateStatusPill();
      const t1 = setTimeout(() => {
        setIsStatusReady(true);
        updateStatusPill();
      }, 60);
      const t2 = setTimeout(() => {
        updateStatusPill();
      }, 180);
      window.addEventListener('resize', updateStatusPill);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        window.removeEventListener('resize', updateStatusPill);
      };
    }
  }, [status, isVisible]);

  // Initialize data on open
  useEffect(() => {
    if (!isTaskDrawerOpen) return;

    setShowDeleteConfirm(false);
    setShowAiRefine(false);
    setPreviousDraft(null);
    setAiPrompt('');
    setActiveDayPickerIdx(null);
    setSubtaskAnchorDay(null);
    setTaskAnchorDay(null);

    const todayDayNum = computeDayInPeriod(todayStr);

    const initDays = (st: any, maxDays: number) => {
      if (Array.isArray(st.selected_days) && st.selected_days.length > 0) {
        return st.selected_days;
      }
      const s = st.start_day ?? 1;
      const e = st.end_day ?? maxDays;
      return Array.from({ length: Math.max(1, e - s + 1) }, (_, i) => s + i);
    };

    if (mode === 'edit' && existingTask) {
      setTitle(existingTask.title || '');
      setDescription(existingTask.description || '');
      setTier((existingTask.tier as TaskTier) || 'Must Do');
      setStatus(existingTask.status || 'Not started');
      const pid = existingTask.period_id || existingTask.quarter_id || activeQuarterId;
      setPeriodId(pid);
      setPeriodType(existingTask.period_type || (pid.includes('SURPLUS') ? 'SURPLUS' : 'Q4'));
      const tDays = pid.includes('SURPLUS') ? 3 : 7;

      // Restore task days
      if (Array.isArray(existingTask.scheduled_days) && existingTask.scheduled_days.length > 0) {
        setTaskDays(existingTask.scheduled_days);
      } else if (existingTask.start_day !== undefined && existingTask.end_day !== undefined) {
        setTaskDays(
          Array.from(
            { length: existingTask.end_day - existingTask.start_day + 1 },
            (_, i) => existingTask.start_day! + i
          )
        );
      } else {
        setTaskDays([Math.min(todayDayNum, tDays)]);
      }

      // Existing subtasks
      setSubtasks(
        (existingTask.subtasks || []).map((st: any, idx: number) => {
          const days = initDays(st, tDays);
          return {
            id: st.subtask_id || st.id || `st-${idx}`,
            title: st.title || '',
            start_day: Math.min(...days),
            end_day: Math.max(...days),
            selected_days: days,
            is_completed: st.is_completed ?? false,
          };
        })
      );
    } else {
      setTitle(taskDrawerData?.title || '');
      setDescription(taskDrawerData?.description || '');
      setTier((taskDrawerData?.tier as TaskTier) || 'Must Do');
      setStatus('Not started');
      const pid = taskDrawerData?.period_id || activeQuarterId;
      setPeriodId(pid);
      setPeriodType(taskDrawerData?.period_type || (pid.includes('SURPLUS') ? 'SURPLUS' : activePeriodType));
      const tDays = (pid.includes('SURPLUS') || activePeriodType === 'SURPLUS') ? 3 : 7;

      // By default: current day of period is selected!
      setTaskDays([Math.min(todayDayNum, tDays)]);

      // STRICT REQUIREMENT: No default subtasks! Start completely empty.
      setSubtasks(
        taskDrawerData?.subtasks && taskDrawerData.subtasks.length > 0
          ? taskDrawerData.subtasks.map((st: any, idx: number) => {
              const days = initDays(st, tDays);
              return {
                id: st.subtask_id || st.id || `st-${idx}`,
                title: st.title || '',
                start_day: Math.min(...days),
                end_day: Math.max(...days),
                selected_days: days,
                is_completed: st.is_completed ?? false,
              };
            })
          : []
      );
    }
  }, [isTaskDrawerOpen, taskDrawerData, mode, existingTask, activeQuarterId, activePeriodType, todayStr]);

  // Graceful animated close (slides smoothly left-to-right off-screen)
  const handleAnimatedClose = () => {
    if (!isVisible) return;
    playBack();
    setIsVisible(false);
    setTimeout(() => {
      closeTaskDrawer();
    }, 280);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        handleAnimatedClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVisible]);

  // Task-level Day Tagging (Click: single, Shift+click: range, Ctrl+click: multi)
  const handleTaskDayClick = (dayNum: number, e: React.MouseEvent) => {
    playScroll();
    let nextDays: number[];

    if (e.shiftKey) {
      const anchor = taskAnchorDay ?? (taskDays.length > 0 ? taskDays[0] : 1);
      const min = Math.min(anchor, dayNum);
      const max = Math.max(anchor, dayNum);
      nextDays = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    } else if (e.ctrlKey || e.metaKey) {
      if (taskDays.includes(dayNum)) {
        nextDays = taskDays.filter((d) => d !== dayNum);
        if (nextDays.length === 0) nextDays = [dayNum];
      } else {
        nextDays = [...taskDays, dayNum].sort((a, b) => a - b);
      }
      setTaskAnchorDay(dayNum);
    } else {
      nextDays = [dayNum];
      setTaskAnchorDay(dayNum);
    }

    setTaskDays(nextDays);
  };

  // Subtask helpers
  const handleAddSubtask = () => {
    playScroll();
    const defaultDays = taskDays.length > 0 ? [...taskDays] : [1];
    setSubtasks([
      ...subtasks,
      {
        id: `st-${Date.now()}`,
        title: '',
        start_day: Math.min(...defaultDays),
        end_day: Math.max(...defaultDays),
        selected_days: defaultDays,
        is_completed: false,
      },
    ]);
  };

  const handleRemoveSubtask = (index: number) => {
    playScroll();
    setSubtasks(subtasks.filter((_, i) => i !== index));
    if (activeDayPickerIdx === index) setActiveDayPickerIdx(null);
  };

  const handleUpdateSubtaskTitle = (index: number, newTitle: string) => {
    const updated = [...subtasks];
    updated[index].title = newTitle;
    setSubtasks(updated);
  };

  const handleToggleSubtaskCompletion = (index: number) => {
    playScroll();
    const updated = [...subtasks];
    updated[index].is_completed = !updated[index].is_completed;
    setSubtasks(updated);
  };

  // Subtask Day Range Selection: Click (single), Shift+click (range), Ctrl+click (multi)
  const handleDayPillClick = (index: number, dayNum: number, e: React.MouseEvent) => {
    e.stopPropagation();
    playScroll();
    const updated = [...subtasks];
    const current = updated[index];
    const currentDays = current.selected_days || Array.from(
      { length: current.end_day - current.start_day + 1 },
      (_, i) => current.start_day + i
    );

    let nextDays: number[];
    if (e.shiftKey) {
      const anchor = subtaskAnchorDay ?? (currentDays.length > 0 ? currentDays[0] : 1);
      const min = Math.min(anchor, dayNum);
      const max = Math.max(anchor, dayNum);
      nextDays = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    } else if (e.ctrlKey || e.metaKey) {
      if (currentDays.includes(dayNum)) {
        nextDays = currentDays.filter((d) => d !== dayNum);
        if (nextDays.length === 0) nextDays = [dayNum];
      } else {
        nextDays = [...currentDays, dayNum].sort((a, b) => a - b);
      }
      setSubtaskAnchorDay(dayNum);
    } else {
      nextDays = [dayNum];
      setSubtaskAnchorDay(dayNum);
    }

    current.selected_days = nextDays;
    current.start_day = Math.min(...nextDays);
    current.end_day = Math.max(...nextDays);
    setSubtasks(updated);
  };

  const getSubtaskDayLabel = (st: SubtaskItem) => {
    const days = st.selected_days || Array.from(
      { length: st.end_day - st.start_day + 1 },
      (_, i) => st.start_day + i
    );
    if (days.length === totalDays) return 'All Days';
    if (days.length === 1) return `Day ${days[0]}`;
    const isContiguous = days.every((d, i, arr) => i === 0 || d === arr[i - 1] + 1);
    if (isContiguous) {
      return `D${days[0]}–${days[days.length - 1]}`;
    }
    return `D${days.join(', ')}`;
  };

  // AI Refinement
  const handleAiRefine = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiGenerating(true);
    playEnter();

    setPreviousDraft({
      title,
      description,
      tier,
      subtasks: JSON.parse(JSON.stringify(subtasks)),
    });

    try {
      const refined = await api.refineTaskWithAi({
        prompt: aiPrompt,
        current_draft: {
          title,
          description,
          tier,
          subtasks,
          period_id: periodId,
          period_type: periodType,
        },
        period_id: periodId,
        period_type: periodType,
      });

      if (refined.title) setTitle(refined.title);
      if (refined.description) setDescription(refined.description);
      if (refined.subtasks && Array.isArray(refined.subtasks)) {
        setSubtasks(
          refined.subtasks.map((st: any, i: number) => {
            const start = st.start_day ?? 1;
            const end = st.end_day ?? totalDays;
            const days = Array.from({ length: end - start + 1 }, (_, k) => start + k);
            return {
              id: st.subtask_id || `st-${i}`,
              title: st.title || '',
              start_day: start,
              end_day: end,
              selected_days: days,
              is_completed: false,
            };
          })
        );
      }
      toast('success', 'Subtasks generated with AI');
      setAiPrompt('');
      setShowAiRefine(false);
      playNotification();
    } catch (err: any) {
      playFailed();
      toast('error', `AI Refinement failed: ${err.message}`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleUndoAi = () => {
    if (!previousDraft) return;
    setTitle(previousDraft.title);
    setDescription(previousDraft.description);
    setTier(previousDraft.tier || 'Must Do');
    setSubtasks(previousDraft.subtasks);
    setPreviousDraft(null);
    playBack();
    toast('info', 'Reverted AI changes');
  };

  // Save / Update Task
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast('error', 'Task title cannot be empty');
      return;
    }

    setIsSubmitting(true);
    try {
      const priority = tier === 'Must Do' ? 'High' : tier === 'Should Do' ? 'Normal' : 'Low';
      const cleanSubtasks = subtasks
        .filter((st) => st.title.trim().length > 0)
        .map((st) => ({
          subtask_id: st.subtask_id || st.id,
          title: st.title.trim(),
          start_day: st.start_day,
          end_day: st.end_day,
          is_completed: st.is_completed ?? false,
        }));

      const category = tier === 'Must Do' ? 'MUST' : tier === 'Should Do' ? 'SHOULD' : 'ROUTINE';
      const payload = {
        title: title.trim(),
        description: description.trim(),
        tier,
        category,
        priority,
        status,
        period_id: periodId,
        quarter_id: periodId,
        period_type: periodType,
        target_date: todayStr,
        start_day: Math.min(...taskDays),
        end_day: Math.max(...taskDays),
        scheduled_days: taskDays,
        subtasks: cleanSubtasks,
      };

      if (mode === 'edit' && existingTask?.task_id) {
        await api.updateTask(existingTask.task_id, payload);
        toast('success', `Updated "${title.trim()}"`);
      } else {
        await api.createTask(payload);
        toast('success', `Created "${title.trim()}"`);
      }

      playEnter();
      bumpWorkspaceRevision();
      handleAnimatedClose();
    } catch (err: any) {
      playFailed();
      toast('error', err.message || 'Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Task
  const handleDelete = async () => {
    if (!existingTask?.task_id) return;
    setIsSubmitting(true);
    try {
      await api.deleteTask(existingTask.task_id);
      playNotification();
      toast('success', 'Task deleted');
      bumpWorkspaceRevision();
      handleAnimatedClose();
    } catch (err: any) {
      playFailed();
      toast('error', err.message || 'Failed to delete task');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-xs transition-opacity duration-300 ease-out ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleAnimatedClose}
      />

      {/* Floating Rounded Modal Sheet with Apple-grade Smooth Slide Transitions */}
      <aside
        className={`fixed top-3 bottom-3 right-3 sm:top-4 sm:bottom-4 sm:right-4 z-50 w-[calc(100%-1.5rem)] sm:w-[460px] rounded-3xl bg-stone-50/95 dark:bg-[#151613]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl flex flex-col justify-between overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform will-change-transform ${
          isVisible
            ? 'translate-x-0 opacity-100 scale-100 pointer-events-auto'
            : 'translate-x-[calc(100%+3rem)] opacity-0 scale-[0.98] pointer-events-none'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'edit' ? 'Edit Task' : 'New Task'}
      >
        {/* Drawer Header */}
        <div className="h-14 px-5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between shrink-0 bg-white/40 dark:bg-black/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className="font-display text-sm sm:text-base font-bold text-stone-900 dark:text-white truncate">
              {mode === 'edit' ? 'Edit Task' : 'New Task'}
            </h2>
            <span className="text-[11px] font-mono font-medium text-stone-500 dark:text-stone-400 px-2.5 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] shrink-0">
              {periodId}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {mode === 'edit' && existingTask && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 rounded-full text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0 whitespace-nowrap"
                title="Delete Task"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleAnimatedClose}
              className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition shrink-0 whitespace-nowrap"
              title="Close Drawer (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 1. Task Title */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
              Task title
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be accomplished?"
              className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-stone-900/60 border border-black/[0.08] dark:border-white/[0.10] text-sm font-medium text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-cherry-500/40 transition shadow-2xs"
            />
          </div>

          {/* 2. Execution Tier (Must Do, Should Do, Routine) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
              Execution tier
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Must Do', 'Should Do', 'Routine'] as const).map((t) => {
                const isSelected = tier === t;
                const Icon = t === 'Must Do' ? Flame : t === 'Should Do' ? Clock : Repeat;
                const activeClasses =
                  t === 'Must Do'
                    ? 'bg-rose-500 text-white font-medium shadow-xs'
                    : t === 'Should Do'
                    ? 'bg-orange-500 text-white font-medium shadow-xs'
                    : 'bg-purple-600 text-white font-medium shadow-xs';

                const inactiveClasses =
                  t === 'Must Do'
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/15 font-medium'
                    : t === 'Should Do'
                    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 hover:bg-orange-500/15 font-medium'
                    : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 hover:bg-purple-500/15 font-medium';

                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      playScroll();
                      setTier(t);
                    }}
                    className={`whitespace-nowrap flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs transition-colors duration-150 ${
                      isSelected ? activeClasses : inactiveClasses
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{t}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Task Scheduled Day(s) (Tagging by Date, defaults to current day) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                Scheduled day(s)
              </label>
              <button
                type="button"
                onClick={() => {
                  playScroll();
                  if (taskDays.length === totalDays) {
                    setTaskDays([Math.min(computeDayInPeriod(todayStr), totalDays)]);
                  } else {
                    setTaskDays(Array.from({ length: totalDays }, (_, i) => i + 1));
                  }
                }}
                className="whitespace-nowrap text-[11px] font-medium text-cherry-flesh hover:underline"
              >
                {taskDays.length === totalDays ? 'Single day' : 'All days'}
              </button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {dayPills.map((dayNum) => {
                const isSelected = taskDays.includes(dayNum);
                return (
                  <button
                    key={dayNum}
                    type="button"
                    onClick={(e) => handleTaskDayClick(dayNum, e)}
                    className={`h-7 min-w-[34px] px-2 rounded-xl text-xs font-mono font-semibold whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-90 select-none ${
                      isSelected
                        ? 'bg-cherry-flesh text-white shadow-xs scale-100'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                    title={`Tag Day ${dayNum} for this task`}
                  >
                    D{dayNum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Fluid Sliding Status Segmented Control */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
              Status
            </label>
            <div
              ref={statusContainerRef}
              className="relative flex items-center p-1 rounded-2xl bg-transparent border border-black/[0.06] dark:border-white/[0.08]"
            >
              {/* Dynamic Sliding Active Indicator Pill */}
              <div
                className={`absolute top-0 left-0 rounded-xl bg-stone-900 dark:bg-stone-100 shadow-xs pointer-events-none ${
                  isStatusReady ? 'transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]' : ''
                }`}
                style={{
                  transform: `translate3d(${statusPillStyle.left}px, ${statusPillStyle.top}px, 0)`,
                  width: `${statusPillStyle.width}px`,
                  height: `${statusPillStyle.height}px`,
                  opacity: statusPillStyle.opacity,
                  willChange: 'transform, width',
                }}
                aria-hidden="true"
              />

              {STATUS_OPTIONS.map((opt) => {
                const isSelected = status === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    ref={(el) => {
                      statusItemRefs.current[opt.id] = el;
                    }}
                    onClick={() => {
                      playScroll();
                      setStatus(opt.id);
                    }}
                    className={`relative z-10 flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors duration-200 text-center flex items-center justify-center gap-1.5 select-none ${
                      isSelected
                        ? 'text-white dark:text-stone-900'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${opt.id === 'In progress' ? 'w-3 h-3 fill-current' : ''}`} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Notes & Acceptance Criteria */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
              Notes & criteria (optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details, links, or context..."
              className="w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-stone-900/60 border border-black/[0.08] dark:border-white/[0.10] text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-cherry-500/40 resize-none transition shadow-2xs"
            />
          </div>

          {/* 6. Subtasks & Schedule Checklist */}
          <div className="space-y-2.5 pt-2 border-t border-black/[0.05] dark:border-white/[0.08]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-semibold text-stone-800 dark:text-stone-200 truncate">
                  Subtasks {subtasks.length > 0 && `(${subtasks.length})`}
                </h4>
                <p className="text-[11px] text-stone-400 truncate">
                  Optional day breakdown ({isSurplus ? 'D1–D3' : 'D1–D7'})
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddSubtask}
                className="whitespace-nowrap shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-cherry-flesh hover:bg-cherry-500/10 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add subtask</span>
              </button>
            </div>

            {subtasks.length > 0 && (
              <div className="space-y-2">
                {subtasks.map((st, idx) => {
                  const isDayPickerOpen = activeDayPickerIdx === idx;
                  const isDone = st.is_completed;
                  const dayLabel = getSubtaskDayLabel(st);
                  const currentDays = st.selected_days || Array.from(
                    { length: st.end_day - st.start_day + 1 },
                    (_, i) => st.start_day + i
                  );

                  return (
                    <div
                      key={st.id || idx}
                      className="p-3 rounded-2xl bg-white dark:bg-stone-900/60 border border-black/[0.06] dark:border-white/[0.08] space-y-2 shadow-2xs transition"
                    >
                      {/* Subtask Row: Checkbox, Title Input, Day Badge, Trash */}
                      <div className="flex items-center gap-2">
                        {mode === 'edit' && (
                          <button
                            type="button"
                            onClick={() => handleToggleSubtaskCompletion(idx)}
                            className="whitespace-nowrap text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition shrink-0"
                          >
                            {isDone ? (
                              <CheckSquare className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        )}

                        <input
                          type="text"
                          value={st.title}
                          onChange={(e) => handleUpdateSubtaskTitle(idx, e.target.value)}
                          placeholder={`Subtask ${idx + 1}...`}
                          className={`flex-1 bg-transparent text-xs font-medium focus:outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 ${
                            isDone ? 'line-through text-stone-400 dark:text-stone-500' : 'text-stone-900 dark:text-white'
                          }`}
                        />

                        {/* Day Range Pill Button (Click to toggle day picker) */}
                        <button
                          type="button"
                          onClick={() => {
                            playScroll();
                            setActiveDayPickerIdx(isDayPickerOpen ? null : idx);
                          }}
                          className={`whitespace-nowrap shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-medium transition ${
                            isDayPickerOpen
                              ? 'bg-cherry-flesh text-white shadow-2xs'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                          }`}
                        >
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span>{dayLabel}</span>
                          {isDayPickerOpen ? (
                            <ChevronUp className="h-3 w-3 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3 w-3 shrink-0" />
                          )}
                        </button>

                        {/* Remove Subtask */}
                        <button
                          type="button"
                          onClick={() => handleRemoveSubtask(idx)}
                          className="whitespace-nowrap text-stone-400 hover:text-rose-500 p-1 transition shrink-0"
                          title="Remove subtask"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Inline Day Selector (Clean D1..D7 buttons, NO noisy text) */}
                      {isDayPickerOpen && (
                        <div className="pt-2 border-t border-black/[0.04] dark:border-white/[0.05] animate-scale-in">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {dayPills.map((dayNum) => {
                              const isSelected = currentDays.includes(dayNum);
                              return (
                                <button
                                  key={dayNum}
                                  type="button"
                                  onClick={(e) => handleDayPillClick(idx, dayNum, e)}
                                  className={`h-7 min-w-[32px] px-2 rounded-xl text-xs font-mono font-semibold whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-90 select-none ${
                                    isSelected
                                      ? 'bg-cherry-flesh text-white shadow-xs scale-100'
                                      : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                                  }`}
                                >
                                  D{dayNum}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 7. AI Assistant Helper */}
          <div className="pt-2 border-t border-black/[0.05] dark:border-white/[0.08] space-y-2">
            {!showAiRefine ? (
              <button
                type="button"
                onClick={() => {
                  playScroll();
                  setShowAiRefine(true);
                }}
                className="whitespace-nowrap flex items-center gap-1.5 text-xs text-stone-500 hover:text-cherry-flesh dark:hover:text-cherry-blush transition py-1"
              >
                <Sparkles className="h-3.5 w-3.5 text-cherry-flesh shrink-0" />
                <span>Need help breaking this down? Ask AI</span>
              </button>
            ) : (
              <div className="p-3 rounded-2xl bg-white dark:bg-stone-900/60 border border-cherry-500/20 space-y-2 animate-scale-in">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-cherry-flesh shrink-0" />
                    <span>AI Subtask Generator</span>
                  </span>
                  {previousDraft && (
                    <button
                      type="button"
                      onClick={handleUndoAi}
                      className="whitespace-nowrap text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                    >
                      <Undo2 className="h-3 w-3" />
                      <span>Undo</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAiRefine();
                      }
                    }}
                    placeholder="e.g. Split into research, draft, review..."
                    disabled={isAiGenerating}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAiRefine}
                    disabled={!aiPrompt.trim() || isAiGenerating}
                    className="whitespace-nowrap px-3 py-1.5 rounded-xl bg-cherry-flesh hover:bg-cherry-700 text-white font-semibold text-xs disabled:opacity-40 transition shrink-0"
                  >
                    {isAiGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Generate'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Drawer Action Footer */}
        <div className="p-4 border-t border-black/[0.06] dark:border-white/[0.08] bg-white/60 dark:bg-black/30 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
          {mode === 'edit' ? (
            showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap">
                  Delete task?
                </span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="whitespace-nowrap px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition shrink-0"
                >
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="whitespace-nowrap text-stone-400 text-xs hover:underline px-1 shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="whitespace-nowrap inline-flex items-center gap-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 px-3 py-1.5 rounded-full text-xs font-semibold transition shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Task</span>
              </button>
            )
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAnimatedClose}
              className="whitespace-nowrap px-4 py-2 rounded-full text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || !title.trim()}
              className="whitespace-nowrap px-5 py-2 rounded-full bg-cherry-flesh hover:bg-cherry-700 text-white text-xs font-semibold shadow-xs transition hover:scale-[1.02] disabled:opacity-40"
            >
              {isSubmitting ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
