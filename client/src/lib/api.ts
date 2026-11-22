/**
 * Cherry Typed API Client.
 * Communicates with Cherry backend endpoints (/api/...).
 */
import {
  SystemHealth,
  Day,
  Quarter,
  Task,
  PomodoroSession,
  FocusState,
  ChatMessage,
  PersonalNote,
  KanbanStatus,
  PeriodType,
  JunkPointSummary,
  Rule,
  Violation,
  Command,
} from "../types";

const BASE_URL =
  typeof window !== "undefined" && window.location.hostname === "cherry.jam"
    ? "https://api.cherry.jam"
    : "";

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error [${res.status}]: ${errorText}`);
  }
  return res.json();
}

export const api = {
  // System
  getHealth: () => request<SystemHealth>("/api/system/health"),
  getOverview: () => request<any>("/api/system/overview"),

  // Calendar
  getToday: () => request<{ day: Day; quarter: Quarter | null; season: any; verse: any }>("/api/calendar/today"),
  getDay: (dateStr: string) => request<{ day: Day; period_type: PeriodType; period_id: string }>(`/api/calendar/date/${dateStr}`),
  getQuarter: (quarterId: string) => request<Quarter>(`/api/calendar/quarter/${quarterId}`),
  getSeasonSummary: (seasonId: string) => request<any>(`/api/calendar/season/${seasonId}/summary`),
  getVerseSummary: (year: number) => request<any>(`/api/calendar/verse/${year}/summary`),

  // Kanban Tasks & Routines
  getPeriodTasks: (periodId: string) => request<Task[]>(`/api/tasks/period/${periodId}`),
  getDayTasks: (dateStr: string) =>
    request<{
      date_str: string;
      tasks: Task[];
      routines: any[];
      routine_adherence: boolean;
      missed_routines: string[];
      all_routines_skipped: boolean;
      total_routines: number;
      completed_routines: number;
    }>(`/api/tasks/day/${dateStr}`),
  createTask: (payload: {
    period_id: string;
    quarter_id?: string;
    title: string;
    period_type?: PeriodType;
    tier?: string;
    category?: string;
    description?: string;
    priority?: string;
    status?: KanbanStatus;
    target_date?: string;
    deadline?: string;
    estimated_minutes?: number;
    start_day?: number;
    end_day?: number;
    scheduled_days?: number[];
    subtasks?: any[];
  }) => request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(payload) }),
  createTasksBatch: (tasks: any[]) =>
    request<{ created_count: number; tasks: Task[] }>("/api/tasks/batch", {
      method: "POST",
      body: JSON.stringify({ tasks }),
    }),
  updateTask: (taskId: string, payload: any) =>
    request<Task>(`/api/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteTask: (taskId: string) =>
    request<{ deleted: boolean; task_id: string }>(`/api/tasks/${taskId}`, { method: "DELETE" }),
  updateTaskStatus: (taskId: string, status: KanbanStatus) =>
    request<Task>(`/api/tasks/${taskId}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  toggleSubtask: (taskId: string, subtaskId: string, is_completed: boolean) =>
    request<Task>(`/api/tasks/${taskId}/subtask/${subtaskId}`, {
      method: "PUT",
      body: JSON.stringify({ is_completed }),
    }),
  carryOverTasks: (payload: {
    from_period_id: string;
    to_period_id: string;
    to_period_type?: PeriodType;
    task_ids?: string[];
  }) => request<any>("/api/tasks/carry-over", { method: "POST", body: JSON.stringify(payload) }),

  // Routines
  getActiveRoutines: (quarterId?: string) =>
    request<any[]>(quarterId ? `/api/tasks/routines/active?quarter_id=${quarterId}` : "/api/tasks/routines/active"),
  createRoutine: (payload: {
    title: string;
    description?: string;
    quarter_id?: string;
    days_of_week?: number[];
  }) => request<any>("/api/tasks/routines", { method: "POST", body: JSON.stringify(payload) }),
  toggleRoutineOccurrence: (occurrenceId: string, is_completed: boolean) =>
    request<any>(`/api/tasks/routines/occurrences/${occurrenceId}/toggle`, {
      method: "PUT",
      body: JSON.stringify({ is_completed }),
    }),
  deleteRoutineOccurrence: (occurrenceId: string) =>
    request<{ deleted: boolean; occurrence_id: string }>(`/api/tasks/routines/occurrences/${occurrenceId}`, {
      method: "DELETE",
    }),

  // Plans & Compose
  commitQuarterPlan: (payload: {
    period_id: string;
    quarter_goal: string;
    deliverables: any[];
  }) => request<any>("/api/plans/quarter/commit", { method: "POST", body: JSON.stringify(payload) }),
  getActivePlan: (quarterId: string) => request<any>(`/api/plans/quarter/${quarterId}/active`),
  approveQuarterPlan: (planId: string, approval_notes?: string) =>
    request<any>(`/api/plans/quarter/${planId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approval_notes }),
    }),
  proposeQuarterPlan: (quarter_id: string, intent: string) =>
    request<any>("/api/plans/quarter/propose", {
      method: "POST",
      body: JSON.stringify({ quarter_id, intent }),
    }),
  getTodoDraft: (dateStr: string) => request<any>(`/api/plans/todo/${dateStr}`),
  finalizeTodoDraft: (dateStr: string) =>
    request<any>(`/api/plans/todo/${dateStr}/finalize`, { method: "POST" }),

  // AI Refinement for Composer Modal
  refinePlanWithAi: (payload: { prompt: string; current_draft?: any; period_id?: string }) =>
    request<any>("/api/chat/composer/refine-plan", { method: "POST", body: JSON.stringify(payload) }),
  refineTaskWithAi: (payload: { prompt: string; current_draft?: any; period_id?: string; period_type?: string }) =>
    request<any>("/api/chat/composer/refine-task", { method: "POST", body: JSON.stringify(payload) }),

  // Focus & Pomodoro
  getFocusStatus: () => request<FocusState>("/api/focus/status"),
  startFocus: (dateStr: string, plannedMinutes: number = 60, taskTitle?: string) =>
    request<PomodoroSession>("/api/focus/start", {
      method: "POST",
      body: JSON.stringify({ date_str: dateStr, planned_minutes: plannedMinutes, task_title: taskTitle }),
    }),
  stopFocus: (sessionId: string, outcomeNotes?: string) =>
    request<PomodoroSession>("/api/focus/stop", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, status: "completed", outcome_notes: outcomeNotes }),
    }),
  getDayFocusSessions: (dateStr: string) => request<PomodoroSession[]>(`/api/focus/sessions/${dateStr}`),

  // Accountability: Rules, Violations, Diet/JP, Quarter Keys
  getRules: () => request<Rule[]>("/api/accountability/rules"),
  getPeriodViolations: (periodId: string) => request<Violation[]>(`/api/accountability/violations/period/${periodId}`),
  getDayViolations: (dateStr: string) => request<Violation[]>(`/api/accountability/violations/day/${dateStr}`),
  recordViolation: (payload: {
    rule_id: string;
    evidence: string;
    date_str?: string;
    period_id?: string;
    rule_name?: string;
    notes?: string;
  }) => request<Violation>("/api/accountability/violations", { method: "POST", body: JSON.stringify(payload) }),
  deleteViolation: (violationId: string) =>
    request<{ deleted: boolean; violation_id: string }>(`/api/accountability/violations/${violationId}`, {
      method: "DELETE",
    }),

  // Diet / Junk Points
  getDayJunkPoints: (dateStr: string) => request<JunkPointSummary>(`/api/accountability/junk-points/day/${dateStr}`),
  getPeriodJunkPoints: (periodId: string) => request<JunkPointSummary>(`/api/accountability/junk-points/period/${periodId}`),
  addJunkPoint: (payload: {
    food_item: string;
    jp_value: number;
    date_str?: string;
    period_id?: string;
    notes?: string;
  }) => request<any>("/api/accountability/junk-points", { method: "POST", body: JSON.stringify(payload) }),
  updateJunkPoint: (entryId: string, updates: any) =>
    request<any>(`/api/accountability/junk-points/${entryId}`, { method: "PUT", body: JSON.stringify(updates) }),
  deleteJunkPoint: (entryId: string) =>
    request<any>(`/api/accountability/junk-points/${entryId}`, { method: "DELETE" }),

  // Food Mappings
  getFoodMappings: () => request<any[]>("/api/accountability/food-mappings"),
  setFoodMapping: (payload: { food_name: string; default_jp: number; notes?: string }) =>
    request<any>("/api/accountability/food-mappings", { method: "POST", body: JSON.stringify(payload) }),
  deleteFoodMapping: (mappingId: string) =>
    request<any>(`/api/accountability/food-mappings/${mappingId}`, { method: "DELETE" }),

  // Quarter Keys
  getQuarterAccountability: (quarterId: string) => request<any>(`/api/accountability/quarter/${quarterId}`),
  spendQuarterKey: (payload: { quarter_id: string; date_str: string; reason: string; violation_id?: string }) =>
    request<any>("/api/accountability/keys/spend", { method: "POST", body: JSON.stringify(payload) }),

  // Basket Commands
  listCommands: () => request<Command[]>("/api/commands"),
  createCommand: (payload: { name: string; content: string; is_active?: boolean }) =>
    request<Command>("/api/commands", { method: "POST", body: JSON.stringify(payload) }),
  updateCommand: (commandId: string, payload: { name?: string; content?: string; is_active?: boolean }) =>
    request<Command>(`/api/commands/${commandId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCommand: (commandId: string) =>
    request<{ deleted: boolean; command_id: string }>(`/api/commands/${commandId}`, { method: "DELETE" }),

  // Feedback & Reflection
  getDailyFeedback: (dateStr: string, regenerate: boolean = false) =>
    request<any>(`/api/feedback/day/${dateStr}?regenerate=${regenerate}`),

  // Personal Notes
  getNotes: () => request<PersonalNote[]>("/api/notes"),
  createNote: (payload: { title: string; content: string; tags?: string[] }) =>
    request<PersonalNote>("/api/notes", { method: "POST", body: JSON.stringify(payload) }),
  updateNote: (noteId: string, payload: { title: string; content: string; tags?: string[] }) =>
    request<PersonalNote>(`/api/notes/${noteId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteNote: (noteId: string) => request<{ success: boolean }>(`/api/notes/${noteId}`, { method: "DELETE" }),

  // Chat & Multi-Conversations
  listConversations: () =>
    request<
      Array<{
        conversation_id: string;
        session_id: string;
        title: string;
        message_count: number;
        preview: string;
        updated_at: string;
      }>
    >("/api/chat/conversations"),
  createConversation: (title?: string) =>
    request<any>("/api/chat/conversations", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  getConversationById: (conversationId: string) =>
    request<{ conversation_id: string; title: string; messages: ChatMessage[] }>(
      `/api/chat/conversations/${conversationId}`
    ),
  deleteConversation: (conversationId: string) =>
    request<{ deleted: boolean; conversation_id: string }>(
      `/api/chat/conversations/${conversationId}`,
      { method: "DELETE" }
    ),
  renameConversation: (conversationId: string, title: string) =>
    request<{ updated: boolean; conversation_id: string; title: string }>(
      `/api/chat/conversations/${conversationId}`,
      { method: "PATCH", body: JSON.stringify({ title }) }
    ),
  sendMessage: (content: string, conversationId?: string) =>
    request<{ conversation_id: string; reply: ChatMessage }>("/api/chat/message", {
      method: "POST",
      body: JSON.stringify({ content, conversation_id: conversationId }),
    }),
  executeAction: (payload: { action_id: string; action_data: any; session_id?: string; message_id?: string }) =>
    request<any>("/api/chat/actions/execute", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  rejectAction: (payload: { action_id: string; session_id?: string; message_id?: string }) =>
    request<any>("/api/chat/actions/reject", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Focus & Lemon direct controls
  completeFocus: (sessionId: string) =>
    request<any>("/api/focus/complete", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    }),
  toggleLemonDns: (enable?: boolean) =>
    request<any>("/api/focus/lemon/toggle", {
      method: "POST",
      body: JSON.stringify({ enable }),
    }),
  getLemonDns: () => request<any>("/api/lemon/dns"),
  getQuarantines: () => request<any[]>("/api/lemon/quarantines"),
  createQuarantine: (targetValue: string, durationMinutes: number = 60) =>
    request<any>("/api/lemon/quarantines", {
      method: "POST",
      body: JSON.stringify({ target_value: targetValue, duration_minutes: durationMinutes }),
    }),

  // Lifecycle
  triggerReconcile: () => request<any>("/api/lifecycle/reconcile", { method: "POST" }),
  getLifecycleJobs: () => request<any[]>("/api/lifecycle/jobs"),
};
