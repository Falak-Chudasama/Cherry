import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Clock,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  ArrowRight,
  MessageSquare,
  BookOpen,
  Award,
} from "lucide-react";
import { api } from "../lib/api";
import { playEnter, playNotification, playFailed, playScroll } from "../lib/sound";
import { useToast } from "../components/ui/ToastProvider";
import { useEcosystem } from "../context/EcosystemContext";
import { LiveFocusTimer } from "../components/features/LiveFocusTimer";
import { Task, RoutineOccurrence, TaskCategory, DailyFeedbackSummary } from "../types";
import { CategoryBadge } from "../components/Badge";

const SHORTCUTS = [
  {
    to: "/chat",
    title: "Chat Operating Assistant",
    description: "Converse with Cherry for quarter planning, task breakdown, and deep work accountability.",
    icon: MessageSquare,
    tone: "cherry",
  },
  {
    to: "/quarter",
    title: "Quarter Strategy & Ledger",
    description: "Inspect 3 Quarter Key ledger, 7-day sprint timeline, and high-leverage outcomes.",
    icon: ShieldCheck,
    tone: "amber",
  },
  {
    to: "/notes",
    title: "Notes & Scratchpad",
    description: "Capture fleeting thoughts, retrospective insights, and strategic drafts offline.",
    icon: BookOpen,
    tone: "blue",
  },
];

export const DayPage: React.FC = () => {
  const { todayStr, activeQuarterId, remainingKeys, junkPoints, refreshEcosystem } = useEcosystem();
  const { push } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<RoutineOccurrence[]>([]);
  const [routineAdherence, setRoutineAdherence] = useState(true);
  const [missedRoutines, setMissedRoutines] = useState<string[]>([]);
  const [frictions, setFrictions] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<DailyFeedbackSummary | null>(null);

  // Loading states
  const [drafting, setDrafting] = useState(false);
  const [reflecting, setReflecting] = useState(false);

  // Form states
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState<TaskCategory>("MUST");
  const [frictionDesc, setFrictionDesc] = useState("");

  useEffect(() => {
    loadDayData();
  }, [todayStr]);

  const loadDayData = async () => {
    try {
      const data = await api.getDayTasks(todayStr);
      setTasks(data.tasks || []);
      setRoutines(data.routines || []);
      setRoutineAdherence(data.routine_adherence ?? true);
      setMissedRoutines(data.missed_routines || []);

      const f = await api.getDayFrictions(todayStr);
      setFrictions(f || []);
    } catch (err) {
      console.debug("Failed to load day data", err);
    }
  };

  const handleToggleTask = async (task: Task) => {
    playEnter();
    const nextStatus = task.status === "completed" ? "in_progress" : "completed";
    await api.updateTaskStatus(task.task_id, nextStatus);
    loadDayData();
    refreshEcosystem();
  };

  const handleDeleteTask = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    playEnter();
    try {
      await api.updateTaskStatus(taskId, "cancelled");
      push("info", "Task cancelled.");
      loadDayData();
      refreshEcosystem();
    } catch {
      push("error", "Failed to cancel task.");
    }
  };

  const handleToggleRoutine = async (occ: RoutineOccurrence) => {
    playEnter();
    await api.completeRoutine(occ.occurrence_id, !occ.is_completed);
    loadDayData();
    refreshEcosystem();
  };

  // 1-Click AI Task Drafting directly on Day Page
  const handleAutoDraft = async () => {
    setDrafting(true);
    playEnter();
    try {
      await api.getTodoDraft(todayStr);
      await api.finalizeTodoDraft(todayStr);
      playNotification();
      push("success", "Today's Todo list generated from active Quarter goals.");
      await loadDayData();
      await refreshEcosystem();
    } catch {
      playFailed();
      push("error", "Unable to draft tasks. Please ensure an active plan exists.");
    } finally {
      setDrafting(false);
    }
  };

  // 1-Click Evening Reflection
  const handleReflectDay = async () => {
    setReflecting(true);
    playEnter();
    try {
      const fb = await api.getDailyFeedback(todayStr, true);
      setFeedback(fb);
      playNotification();
      push("success", "Daily reflection synthesized from Lemon device activity.");
    } catch {
      playFailed();
      push("error", "Failed to retrieve reflection.");
    } finally {
      setReflecting(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !activeQuarterId) return;

    playEnter();
    try {
      await api.createTask({
        quarter_id: activeQuarterId,
        title: newTaskTitle.trim(),
        category: newTaskCategory,
        target_date: todayStr,
        estimated_minutes: 30,
      });
      setNewTaskTitle("");
      push("success", "Task added.");
      loadDayData();
      refreshEcosystem();
    } catch {
      playFailed();
      push("error", "Failed to create task.");
    }
  };

  const handleAddFriction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!frictionDesc.trim()) return;

    playEnter();
    try {
      await api.logFriction({
        date_str: todayStr,
        category: "interruption",
        description: frictionDesc.trim(),
      });
      setFrictionDesc("");
      push("info", "Friction logged.");
      loadDayData();
    } catch {
      playFailed();
      push("error", "Failed to log friction.");
    }
  };

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const completedRoutines = routines.filter((r) => r.is_completed).length;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-4 sm:pt-6 pb-24 sm:pb-20">
      {/* Hero Header - Matching Kiwi's Proportions & Elegance */}
      <section className="text-center mb-8 sm:mb-10 animate-fade-in">
        <div className="inline-flex items-center justify-center mb-4 sm:mb-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl glass-card p-2.5 shadow-none border border-black/5 dark:border-white/10">
            <img src="/cherry-icon.svg" alt="Cherry" className="h-11 w-11 object-contain" />
          </div>
        </div>

        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 leading-tight">
          Daily Execution Workspace.
        </h1>

        <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base text-stone-600 dark:text-stone-400 font-sans leading-relaxed">
          Track deliverables, maintain non-negotiable routines, and protect deep focus.
        </p>

        {/* Status Pill Badges Row */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold glass-card border border-black/5 dark:border-white/10 text-stone-700 dark:text-stone-300">
            <Clock className="h-3.5 w-3.5 text-cherry-flesh" />
            <span className="font-mono">{todayStr}</span>
          </span>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold glass-card border border-black/5 dark:border-white/10 text-stone-700 dark:text-stone-300">
            <Key className="h-3.5 w-3.5 text-amber-500" />
            <span>Quarter {activeQuarterId} ({remainingKeys}/3 QK)</span>
          </span>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              routineAdherence
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20"
            }`}
          >
            {routineAdherence ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            <span>{routineAdherence ? "Routines Adherent" : `Missed (${missedRoutines.join(", ")})`}</span>
          </span>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold glass-card border border-black/5 dark:border-white/10 text-stone-600 dark:text-stone-400">
            <span>{junkPoints}/50 JP</span>
          </span>
        </div>
      </section>

      {/* Primary Workspace Surface: Live Focus Pomodoro Timer Widget */}
      <section className="mb-8 sm:mb-10">
        <LiveFocusTimer />
      </section>

      {/* Core Execution 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
        {/* Column 1: Actionable Deliverables */}
        <div className="glass-panel rounded-2xl p-5 sm:p-6 shadow-none border border-black/5 dark:border-white/10 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200 font-sans">
                  Deliverables ({completedCount}/{tasks.length})
                </h2>
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  Must & Should tasks planned for today
                </span>
              </div>
              <button
                onClick={handleAutoDraft}
                disabled={drafting}
                className="btn-glass-primary !py-1.5 !px-3 text-xs font-bold shrink-0 cursor-pointer shadow-none"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{drafting ? "Drafting..." : "Draft with AI"}</span>
              </button>
            </div>

            {/* Task List */}
            {tasks.length === 0 ? (
              <div className="py-8 text-center space-y-3 glass-card rounded-xl p-4 border border-black/5 dark:border-white/10">
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  No deliverables scheduled for today yet.
                </p>
                <button
                  onClick={handleAutoDraft}
                  disabled={drafting}
                  className="btn-glass-primary text-xs font-semibold cursor-pointer shadow-none"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Synthesize from Active Plan</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => {
                  const isDone = task.status === "completed";
                  return (
                    <div
                      key={task.task_id}
                      onClick={() => handleToggleTask(task)}
                      className="group flex items-center justify-between p-3 rounded-xl glass-card cursor-pointer select-none transition hover:bg-black/5 dark:hover:bg-white/5 border border-black/5 dark:border-white/10"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isDone ? (
                          <CheckSquare className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-stone-400 shrink-0 group-hover:text-stone-600" />
                        )}
                        <span
                          className={`text-xs sm:text-sm font-medium truncate ${
                            isDone ? "line-through text-stone-400" : "text-stone-800 dark:text-stone-200"
                          }`}
                        >
                          {task.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <CategoryBadge category={task.category} />
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTask(e, task.task_id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-stone-400 hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10 transition"
                          title="Delete task"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Add Inline Form */}
          <form onSubmit={handleCreateTask} className="pt-2 border-t border-black/5 dark:border-white/10 flex gap-2">
            <input
              type="text"
              placeholder="Add a new deliverable..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="flex-1 bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-cherry-500"
            />
            <select
              value={newTaskCategory}
              onChange={(e) => setNewTaskCategory(e.target.value as TaskCategory)}
              className="bg-black/5 dark:bg-white/5 rounded-xl px-2.5 py-2 text-xs font-bold text-stone-700 dark:text-stone-300 focus:outline-none"
            >
              <option value="MUST">MUST</option>
              <option value="SHOULD">SHOULD</option>
            </select>
            <button
              type="submit"
              disabled={!newTaskTitle.trim()}
              className="px-3 py-2 rounded-xl bg-cherry-500 hover:bg-cherry-600 text-white text-xs font-bold disabled:opacity-40 transition shadow-none cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>

        {/* Column 2: Routines & Evening Reflection */}
        <div className="space-y-6">
          {/* Non-Negotiable Routines */}
          <div className="glass-panel rounded-2xl p-5 sm:p-6 shadow-none border border-black/5 dark:border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200 font-sans">
                  Non-Negotiable Routines ({completedRoutines}/{routines.length})
                </h2>
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  Everyday foundational habits
                </span>
              </div>
              <span className="text-2xs font-mono font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                Non-Negotiable
              </span>
            </div>

            <div className="space-y-2">
              {routines.map((occ) => (
                <div
                  key={occ.occurrence_id}
                  onClick={() => handleToggleRoutine(occ)}
                  className="flex items-center justify-between p-3 rounded-xl glass-card cursor-pointer select-none transition hover:bg-black/5 dark:hover:bg-white/5 border border-black/5 dark:border-white/10"
                >
                  <div className="flex items-center gap-3">
                    {occ.is_completed ? (
                      <CheckSquare className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-stone-400 shrink-0" />
                    )}
                    <span
                      className={`text-xs sm:text-sm font-medium ${
                        occ.is_completed ? "line-through text-stone-400" : "text-stone-800 dark:text-stone-200"
                      }`}
                    >
                      {occ.title}
                    </span>
                  </div>
                  <span className="text-3xs font-mono uppercase tracking-wider text-stone-400">
                    {occ.is_completed ? "Done" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Evening Reflection & Daily Synthesis */}
          <div className="glass-panel rounded-2xl p-5 sm:p-6 shadow-none border border-black/5 dark:border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200 font-sans">
                  Daily Reflection & Evidence
                </h2>
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  Synthesize Lemon activity into performance feedback
                </span>
              </div>
              <button
                onClick={handleReflectDay}
                disabled={reflecting}
                className="btn-glass-primary !py-1.5 !px-3 text-xs font-bold shrink-0 cursor-pointer shadow-none"
              >
                <Award className="h-3.5 w-3.5" />
                <span>{reflecting ? "Analyzing..." : "Run Reflection"}</span>
              </button>
            </div>

            {feedback ? (
              <div className="p-3.5 rounded-xl glass-card space-y-2 border border-black/5 dark:border-white/10">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-stone-800 dark:text-stone-200">Alignment Verdict</span>
                  <span className="font-bold text-cherry-flesh">{feedback.alignment_verdict}</span>
                </div>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                  {feedback.actionable_improvement}
                </p>
                <div className="text-3xs font-mono text-stone-400 flex justify-between pt-1 border-t border-black/5 dark:border-white/10">
                  <span>Tasks: {feedback.metrics.tasks_completed_count}/{feedback.metrics.tasks_approved_count}</span>
                  <span>Routines: {feedback.metrics.routines_completed_count}/{feedback.metrics.routines_scheduled_count}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Run daily reflection at the end of your day to inspect adherence and close the day.
              </p>
            )}

            {/* Friction Log Form */}
            <form onSubmit={handleAddFriction} className="pt-2 flex gap-2">
              <input
                type="text"
                placeholder="Log a friction or distraction..."
                value={frictionDesc}
                onChange={(e) => setFrictionDesc(e.target.value)}
                className="flex-1 bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!frictionDesc.trim()}
                className="px-3 py-2 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/15 text-stone-700 dark:text-stone-300 text-xs font-bold disabled:opacity-40 transition shadow-none cursor-pointer"
              >
                Log
              </button>
            </form>

            {/* Logged frictions preview */}
            {frictions.length > 0 && (
              <div className="pt-2 border-t border-black/5 dark:border-white/10 space-y-1">
                <span className="text-3xs font-mono uppercase text-stone-400">Logged Frictions ({frictions.length})</span>
                <div className="flex flex-wrap gap-1.5">
                  {frictions.map((f: any, idx: number) => (
                    <span key={idx} className="text-2xs px-2 py-0.5 rounded-lg glass-card text-stone-600 dark:text-stone-300">
                      {f.description}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Specialized Tool Shortcuts - Matching Kiwi's SHORTCUTS Grid */}
      <section>
        <div className="mb-4 sm:mb-5 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 font-sans">
            Specialized Toolkits
          </h2>
          <span className="text-xs text-stone-400 dark:text-stone-500">Choose a dedicated mode</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SHORTCUTS.map(({ to, title, description, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => playScroll()}
              className="group flex flex-col justify-between rounded-2xl glass-card p-5 sm:p-6 shadow-none border border-black/5 dark:border-white/10 transition hover:border-cherry-500/50 hover:bg-white/50 dark:hover:bg-white/[0.04] cursor-pointer"
            >
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl glass-card text-cherry-500 dark:text-cherry-300 transition group-hover:bg-cherry-500 group-hover:text-white border border-black/5 dark:border-white/10">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-stone-900 dark:text-stone-100 font-sans group-hover:text-cherry-flesh dark:group-hover:text-cherry-blush transition">
                  {title}
                </h3>
                <p className="mt-1.5 text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed font-sans">
                  {description}
                </p>
              </div>

              <div className="mt-5 flex items-center gap-1.5 text-xs font-bold text-stone-400 group-hover:text-cherry-flesh dark:group-hover:text-cherry-blush transition">
                <span>Open tool</span>
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
};
