import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Sparkles,
  Plus,
  Trash2,
  Undo2,
  CheckCircle2,
  Loader2,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useEcosystem } from '../../context/EcosystemContext';
import { api } from '../../lib/api';
import { useToast } from '../ui/ToastProvider';
import { playEnter, playBack, playNotification, playFailed } from '../../lib/sound';
import { DeliverableDraft, PeriodType } from '../../types';

export const PlanWorkbenchModal: React.FC = () => {
  const {
    isPlanModalOpen,
    planModalData,
    closePlanModal,
    activeQuarterId,
    activePeriodType,
    bumpWorkspaceRevision,
  } = useEcosystem();

  const { push: toast } = useToast();

  const targetPeriodId = planModalData?.period_id || activeQuarterId;
  const targetPeriodType: PeriodType =
    planModalData?.period_type || (targetPeriodId.includes('SURPLUS') ? 'SURPLUS' : activePeriodType);

  const isSurplus = targetPeriodId.includes('SURPLUS') || targetPeriodType === 'SURPLUS';
  const totalDays = isSurplus ? 3 : 7;
  const dayPills = Array.from({ length: totalDays }, (_, i) => i + 1);

  // Derive start/end calendar dates from period_id e.g. "2026-11-Q4" or "2026-11-SURPLUS"
  const dateRangeDisplay = useMemo(() => {
    try {
      const parts = targetPeriodId.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const type = parts[2];
      if (type === 'Q1') return `${year}-${month}-01 to ${year}-${month}-07`;
      if (type === 'Q2') return `${year}-${month}-08 to ${year}-${month}-14`;
      if (type === 'Q3') return `${year}-${month}-15 to ${year}-${month}-21`;
      if (type === 'Q4') return `${year}-${month}-22 to ${year}-${month}-28`;
      if (type === 'SURPLUS') return `${year}-${month}-29 to End of Month`;
    } catch {}
    return targetPeriodId;
  }, [targetPeriodId]);

  // Plan draft state
  const [quarterGoal, setQuarterGoal] = useState<string>('');
  const [tasks, setTasks] = useState<DeliverableDraft[]>([]);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<number>(0);
  const [expandedTaskIndices, setExpandedTaskIndices] = useState<Set<number>>(new Set([0]));

  // AI Refinement states
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiScope, setAiScope] = useState<'selected' | 'whole'>('selected');
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);
  const [previousDraft, setPreviousDraft] = useState<any | null>(null);
  const [modifiedTaskIndices, setModifiedTaskIndices] = useState<Set<number>>(new Set());
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  // Initialize draft when modal opens
  useEffect(() => {
    if (!isPlanModalOpen) return;

    setPreviousDraft(null);
    setModifiedTaskIndices(new Set());
    setAiPrompt('');
    setSelectedTaskIndex(0);
    setExpandedTaskIndices(new Set([0]));

    const initial = planModalData?.initialDraft;
    setQuarterGoal(initial?.quarter_goal || `Accomplish key deliverables for ${targetPeriodId}`);

    if (initial?.deliverables && initial.deliverables.length > 0) {
      setTasks(
        initial.deliverables.map((d: any) => ({
          title: d.title || 'Deliverable',
          description: d.description || '',
          priority: d.priority || 'P2',
          subtasks: (d.subtasks || []).map((st: any) => ({
            title: st.title || 'Step',
            start_day: st.start_day ?? 1,
            end_day: st.end_day ?? totalDays,
          })),
        }))
      );
    } else {
      setTasks([
        {
          title: 'Core Milestone Deliverable',
          description: 'Primary objective for this quarter',
          priority: 'P1',
          subtasks: [
            { title: 'Planning & initial research', start_day: 1, end_day: Math.min(2, totalDays) },
            { title: 'Core architecture & execution', start_day: Math.min(3, totalDays), end_day: Math.min(5, totalDays) },
            { title: 'End-to-end verification & polish', start_day: Math.min(6, totalDays), end_day: totalDays },
          ],
        },
        {
          title: 'Secondary System Alignment',
          description: 'Maintenance, tests, and cleanup',
          priority: 'P2',
          subtasks: [
            { title: 'Integration tests & telemetry check', start_day: Math.min(4, totalDays), end_day: totalDays },
          ],
        },
      ]);
    }
  }, [isPlanModalOpen, planModalData, targetPeriodId, targetPeriodType, totalDays]);

  // Live 7-Day Load Bar calculation
  const dayLoads = useMemo(() => {
    const loads = new Array(totalDays).fill(0);
    tasks.forEach((t) => {
      (t.subtasks || []).forEach((st) => {
        const start = Math.max(1, Math.min(totalDays, st.start_day || 1));
        const end = Math.max(1, Math.min(totalDays, st.end_day || totalDays));
        for (let d = start; d <= end; d++) {
          loads[d - 1]++;
        }
      });
    });
    return loads;
  }, [tasks, totalDays]);

  // Task list management
  const handleAddTask = () => {
    const newIdx = tasks.length;
    setTasks([
      ...tasks,
      {
        title: `Task ${newIdx + 1}`,
        description: '',
        priority: 'P2',
        subtasks: [{ title: 'Initial action item', start_day: 1, end_day: totalDays }],
      },
    ]);
    setSelectedTaskIndex(newIdx);
    setExpandedTaskIndices((prev) => new Set([...prev, newIdx]));
  };

  const handleRemoveTask = (idx: number) => {
    const updated = tasks.filter((_, i) => i !== idx);
    setTasks(updated);
    if (selectedTaskIndex >= updated.length) {
      setSelectedTaskIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleAddSubtask = (taskIdx: number) => {
    const updated = [...tasks];
    updated[taskIdx].subtasks.push({
      title: `Subtask ${updated[taskIdx].subtasks.length + 1}`,
      start_day: 1,
      end_day: totalDays,
    });
    setTasks(updated);
  };

  const handleRemoveSubtask = (taskIdx: number, subIdx: number) => {
    const updated = [...tasks];
    updated[taskIdx].subtasks = updated[taskIdx].subtasks.filter((_, i) => i !== subIdx);
    setTasks(updated);
  };

  const handleToggleDayPill = (taskIdx: number, subIdx: number, dayNum: number) => {
    const updated = [...tasks];
    const st = updated[taskIdx].subtasks[subIdx];

    if (st.start_day === dayNum && st.end_day === dayNum) {
      st.start_day = 1;
      st.end_day = totalDays;
    } else if (dayNum < st.start_day) {
      st.start_day = dayNum;
    } else if (dayNum > st.end_day) {
      st.end_day = dayNum;
    } else {
      st.start_day = dayNum;
      st.end_day = dayNum;
    }
    setTasks(updated);
  };

  const toggleTaskExpanded = (idx: number) => {
    setExpandedTaskIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Scoped AI Refinement
  const handleAiRefine = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiGenerating(true);
    playEnter();

    // Snapshot draft before AI change
    setPreviousDraft({
      quarterGoal,
      tasks: JSON.parse(JSON.stringify(tasks)),
    });

    try {
      if (aiScope === 'selected' && tasks[selectedTaskIndex]) {
        // Scoped to single task
        const selectedTask = tasks[selectedTaskIndex];
        const refined = await api.refineTaskWithAi({
          prompt: aiPrompt,
          current_draft: {
            title: selectedTask.title,
            description: selectedTask.description,
            priority: selectedTask.priority,
            subtasks: selectedTask.subtasks,
            period_id: targetPeriodId,
            period_type: targetPeriodType,
          },
          period_id: targetPeriodId,
          period_type: targetPeriodType,
        });

        const updated = [...tasks];
        updated[selectedTaskIndex] = {
          title: refined.title || selectedTask.title,
          description: refined.description ?? selectedTask.description,
          priority: refined.priority || selectedTask.priority,
          subtasks: (refined.subtasks || selectedTask.subtasks).map((st: any) => ({
            title: st.title || 'Step',
            start_day: st.start_day ?? 1,
            end_day: st.end_day ?? totalDays,
          })),
        };
        setTasks(updated);
        setModifiedTaskIndices(new Set([selectedTaskIndex]));
        toast('success', `Refined task "${updated[selectedTaskIndex].title}"`);
      } else {
        // Whole plan refinement pass
        const refined = await api.refinePlanWithAi({
          prompt: aiPrompt,
          current_draft: {
            quarter_goal: quarterGoal,
            period_id: targetPeriodId,
            deliverables: tasks,
          },
          period_id: targetPeriodId,
        });

        if (refined.quarter_goal) setQuarterGoal(refined.quarter_goal);
        if (refined.deliverables && Array.isArray(refined.deliverables)) {
          setTasks(
            refined.deliverables.map((d: any) => ({
              title: d.title || 'Deliverable',
              description: d.description || '',
              priority: d.priority || 'P2',
              subtasks: (d.subtasks || []).map((st: any) => ({
                title: st.title || 'Step',
                start_day: st.start_day ?? 1,
                end_day: st.end_day ?? totalDays,
              })),
            }))
          );
          setModifiedTaskIndices(new Set(refined.deliverables.map((_: any, i: number) => i)));
        }
        toast('success', 'Full plan refined with AI suggestions');
      }

      setAiPrompt('');
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
    setQuarterGoal(previousDraft.quarterGoal);
    setTasks(previousDraft.tasks);
    setPreviousDraft(null);
    setModifiedTaskIndices(new Set());
    playBack();
    toast('info', 'Reverted AI changes');
  };

  // Commit Plan to Quarter
  const handleCommitPlan = async () => {
    if (!quarterGoal.trim()) {
      toast('error', 'Please enter a goal for this period');
      return;
    }
    if (tasks.length === 0) {
      toast('error', 'Add at least one task to this plan');
      return;
    }

    setIsCommitting(true);
    try {
      await api.commitQuarterPlan({
        period_id: targetPeriodId,
        quarter_goal: quarterGoal.trim(),
        deliverables: tasks.map((t) => ({
          title: t.title.trim(),
          description: t.description?.trim() || '',
          priority: t.priority || 'P2',
          subtasks: (t.subtasks || []).map((st) => ({
            title: st.title.trim(),
            start_day: st.start_day,
            end_day: st.end_day,
          })),
        })),
      });

      playEnter();
      toast('success', `Plan committed to ${targetPeriodId}!`);
      bumpWorkspaceRevision();
      closePlanModal();
    } catch (err: any) {
      playFailed();
      toast('error', err.message || 'Failed to commit plan');
    } finally {
      setIsCommitting(false);
    }
  };

  if (!isPlanModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-md animate-fade-in"
      onClick={closePlanModal}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] rounded-3xl glass-panel shadow-lift border border-white/20 dark:border-white/10 flex flex-col justify-between overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-5 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-cherry-500/10 text-cherry-600 dark:text-cherry-300">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-stone-900 dark:text-stone-100">
                  {isSurplus ? 'Surplus Plan' : `Quarter Plan`}
                </h2>
                <span className="text-2xs font-mono font-semibold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                  {dateRangeDisplay}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={closePlanModal}
            className="rounded-full p-2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live 7-Day Load Bar */}
        <div className="px-5 py-3 bg-stone-100/60 dark:bg-stone-900/40 border-b border-black/5 dark:border-white/10 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <Calendar className="h-3.5 w-3.5 text-stone-400" />
            <span className="text-2xs font-mono font-bold uppercase text-stone-500">
              Day Load:
            </span>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end">
            {dayPills.map((dayNum) => {
              const count = dayLoads[dayNum - 1];
              const isOverloaded = count >= 5;
              const isModerate = count >= 3 && count < 5;
              return (
                <div
                  key={dayNum}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-3xs font-mono font-bold border transition ${
                    isOverloaded
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-200'
                      : isModerate
                      ? 'bg-cherry-500/10 border-cherry-500/20 text-cherry-700 dark:text-cherry-300'
                      : 'bg-stone-200/50 dark:bg-stone-800/50 border-transparent text-stone-600 dark:text-stone-400'
                  }`}
                  title={`Day ${dayNum}: ${count} active subtasks`}
                >
                  <span>D{dayNum}</span>
                  <span className="opacity-60">·</span>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable Main Workbench */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Quarter Goal */}
          <div>
            <label className="block text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
              Quarter Goal
            </label>
            <input
              type="text"
              value={quarterGoal}
              onChange={(e) => setQuarterGoal(e.target.value)}
              placeholder="What is the overarching mission for this 7-day period?"
              className="w-full px-4 py-2.5 rounded-2xl glass-card text-sm font-semibold focus-ring"
            />
          </div>

          {/* Tasks & Subtasks List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-stone-800 dark:text-stone-200">
                Deliverables ({tasks.length})
              </h3>
              <button
                type="button"
                onClick={handleAddTask}
                className="flex items-center gap-1 text-2xs font-bold text-cherry-600 dark:text-cherry-300 hover:underline"
              >
                <Plus className="h-3 w-3" />
                <span>Add Task</span>
              </button>
            </div>

            <div className="space-y-3">
              {tasks.map((task, tIdx) => {
                const isSelected = selectedTaskIndex === tIdx;
                const isExpanded = expandedTaskIndices.has(tIdx);
                const isModified = modifiedTaskIndices.has(tIdx);

                return (
                  <div
                    key={tIdx}
                    onClick={() => setSelectedTaskIndex(tIdx)}
                    className={`rounded-2xl glass-card border transition-all p-4 space-y-3 ${
                      isSelected
                        ? 'border-cherry-500/40 shadow-sm ring-1 ring-cherry-500/20'
                        : 'border-black/5 dark:border-white/10 hover:border-black/15'
                    } ${isModified ? 'bg-cherry-500/[0.04]' : ''}`}
                  >
                    {/* Task Header Row */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 flex-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskExpanded(tIdx);
                          }}
                          className="p-1 rounded-lg hover:bg-stone-200/50 dark:hover:bg-stone-800/50 text-stone-400"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>

                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => {
                            const updated = [...tasks];
                            updated[tIdx].title = e.target.value;
                            setTasks(updated);
                          }}
                          placeholder={`Task ${tIdx + 1}`}
                          className="flex-1 bg-transparent text-sm font-bold focus:outline-none text-stone-900 dark:text-stone-100"
                        />

                        {isModified && (
                          <span className="px-2 py-0.5 rounded-full text-micro font-mono font-bold bg-cherry-500/15 text-cherry-600 dark:text-cherry-300">
                            AI Modified
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Priority Pills */}
                        <div className="flex items-center gap-1">
                          {['P1', 'P2', 'P3'].map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const updated = [...tasks];
                                updated[tIdx].priority = p;
                                setTasks(updated);
                              }}
                              className={`px-2 py-0.5 rounded-lg text-micro font-mono font-bold transition ${
                                task.priority === p
                                  ? 'bg-cherry-flesh text-white'
                                  : 'bg-stone-100 dark:bg-stone-800 text-stone-500'
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveTask(tIdx);
                          }}
                          className="text-stone-400 hover:text-rose-500 p-1 transition"
                          title="Remove task"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Subtasks & Details */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-black/5 dark:border-white/10 space-y-2.5">
                        <input
                          type="text"
                          value={task.description || ''}
                          onChange={(e) => {
                            const updated = [...tasks];
                            updated[tIdx].description = e.target.value;
                            setTasks(updated);
                          }}
                          placeholder="Brief description or outcome goals..."
                          className="w-full bg-transparent text-xs text-stone-500 focus:outline-none placeholder-stone-400"
                        />

                        {/* Subtasks */}
                        <div className="space-y-2">
                          {(task.subtasks || []).map((st, sIdx) => (
                            <div
                              key={sIdx}
                              className="flex items-center gap-2 p-2 rounded-xl bg-stone-100/50 dark:bg-stone-900/50 text-xs"
                            >
                              <input
                                type="text"
                                value={st.title}
                                onChange={(e) => {
                                  const updated = [...tasks];
                                  updated[tIdx].subtasks[sIdx].title = e.target.value;
                                  setTasks(updated);
                                }}
                                placeholder={`Step ${sIdx + 1}`}
                                className="flex-1 bg-transparent font-medium focus:outline-none text-stone-800 dark:text-stone-200"
                              />

                              {/* Day Pills */}
                              <div className="flex items-center gap-1">
                                {dayPills.map((dNum) => {
                                  const isSelected = dNum >= st.start_day && dNum <= st.end_day;
                                  const isEdge = dNum === st.start_day || dNum === st.end_day;
                                  return (
                                    <button
                                      key={dNum}
                                      type="button"
                                      onClick={() => handleToggleDayPill(tIdx, sIdx, dNum)}
                                      className={`h-5 min-w-[22px] px-1 rounded text-micro font-mono font-bold transition ${
                                        isSelected
                                          ? isEdge
                                            ? 'bg-cherry-flesh text-white shadow-2xs'
                                            : 'bg-cherry-500/20 text-cherry-700 dark:text-cherry-200'
                                          : 'bg-stone-200/50 dark:bg-stone-800 text-stone-500 hover:bg-stone-300'
                                      }`}
                                    >
                                      D{dNum}
                                    </button>
                                  );
                                })}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveSubtask(tIdx, sIdx)}
                                className="text-stone-400 hover:text-rose-500 p-1"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => handleAddSubtask(tIdx)}
                            className="flex items-center gap-1 text-2xs font-bold text-stone-500 hover:text-cherry-600 transition pt-1"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Add Subtask</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Embedded AI Refinement Bar */}
          <div className="p-4 rounded-2xl glass-panel border border-cherry-500/20 space-y-3 bg-cherry-500/[0.02]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cherry-flesh" />
                <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                  Refine with AI
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Scope Toggle */}
                <div className="flex items-center gap-1 p-0.5 rounded-xl bg-stone-200/60 dark:bg-stone-800">
                  <button
                    type="button"
                    onClick={() => setAiScope('selected')}
                    className={`px-2.5 py-1 rounded-lg text-2xs font-semibold transition ${
                      aiScope === 'selected'
                        ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-2xs'
                        : 'text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    Selected
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiScope('whole')}
                    className={`px-2.5 py-1 rounded-lg text-2xs font-semibold transition ${
                      aiScope === 'whole'
                        ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-2xs'
                        : 'text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    All
                  </button>
                </div>

                {previousDraft && (
                  <button
                    type="button"
                    onClick={handleUndoAi}
                    className="flex items-center gap-1 text-2xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    <Undo2 className="h-3 w-3" />
                    <span>Undo</span>
                  </button>
                )}
              </div>
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
                placeholder={
                  aiScope === 'selected'
                    ? 'Break down this specific task, balance its schedule...'
                    : 'Rebalance tasks across the 7 days, optimize for 60m blocks...'
                }
                disabled={isAiGenerating}
                className="flex-1 px-3.5 py-2 rounded-xl glass-card text-xs focus-ring placeholder-stone-400 dark:placeholder-stone-600"
              />
              <button
                type="button"
                onClick={handleAiRefine}
                disabled={!aiPrompt.trim() || isAiGenerating}
                className="px-4 py-2 rounded-xl bg-cherry-flesh hover:bg-cherry-700 text-white font-bold text-xs shadow-xs disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {isAiGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span>Refine</span>
              </button>
            </div>
          </div>
        </div>

        {/* Commit Footer */}
        <div className="p-4 border-t border-black/5 dark:border-white/10 bg-white/40 dark:bg-black/20 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={closePlanModal}
            className="px-4 py-2 rounded-2xl text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCommitPlan}
            disabled={isCommitting || tasks.length === 0}
            className="px-5 py-2 rounded-2xl text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-xs hover:opacity-90 disabled:opacity-40 transition flex items-center gap-1.5"
          >
            {isCommitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            <span>Commit Plan</span>
          </button>
        </div>
      </div>
    </div>
  );
};
