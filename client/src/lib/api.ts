/**
 * Cherry Typed API Client.
 * Communicates with Cherry backend endpoints (/api/...).
 */
import {
  SystemHealth,
  Day,
  Quarter,
  Task,
  QuarterPlan,
  TodoDraft,
  PomodoroSession,
  FocusState,
  DailyFeedbackSummary,
  ChatMessage,
  PersonalNote,
  TaskCategory,
  TaskStatus,
} from "../types";

const BASE_URL = "";

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
  getDay: (dateStr: string) => request<{ day: Day; period_type: string; period_id: string }>(`/api/calendar/date/${dateStr}`),
  getQuarter: (quarterId: string) => request<Quarter>(`/api/calendar/quarter/${quarterId}`),

  // Tasks & Routines
  getDayTasks: (dateStr: string) =>
    request<{ date_str: string; tasks: Task[]; routines: any[]; routine_adherence: boolean; missed_routines: string[] }>(
      `/api/tasks/day/${dateStr}`
    ),
  createTask: (payload: {
    quarter_id: string;
    title: string;
    category: TaskCategory;
    target_date?: string;
    deadline?: string;
    estimated_minutes?: number;
    subtasks?: string[];
  }) => request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(payload) }),
  updateTaskStatus: (taskId: string, status: TaskStatus) =>
    request<Task>(`/api/tasks/${taskId}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  toggleSubtask: (taskId: string, subtaskId: string, is_completed: boolean) =>
    request<Task>(`/api/tasks/${taskId}/subtask/${subtaskId}`, {
      method: "PUT",
      body: JSON.stringify({ is_completed }),
    }),
  completeRoutine: (occurrenceId: string, is_completed: boolean) =>
    request<any>(`/api/tasks/routines/${occurrenceId}/complete`, {
      method: "PUT",
      body: JSON.stringify({ is_completed }),
    }),

  // Plans & Drafting
  proposeQuarterPlan: (quarter_id: string, intent: string) =>
    request<QuarterPlan>("/api/plans/quarter/propose", {
      method: "POST",
      body: JSON.stringify({ quarter_id, intent }),
    }),
  approveQuarterPlan: (planId: string, approval_notes?: string) =>
    request<QuarterPlan>(`/api/plans/quarter/${planId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approval_notes }),
    }),
  getActivePlan: (quarterId: string) => request<any>(`/api/plans/quarter/${quarterId}/active`),
  getTodoDraft: (dateStr: string) => request<TodoDraft>(`/api/plans/todo/${dateStr}`),
  finalizeTodoDraft: (dateStr: string) =>
    request<TodoDraft>(`/api/plans/todo/${dateStr}/finalize`, { method: "POST" }),

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

  // Accountability & Ledgers
  getQuarterAccountability: (quarterId: string) => request<any>(`/api/accountability/quarter/${quarterId}`),
  getDayJunkPoints: (dateStr: string) => request<any>(`/api/accountability/junk-points/${dateStr}`),
  addJunkPoint: (payload: { date_str: string; quarter_id: string; food_item: string; base_score: number; portion_factor?: number; adjustments?: number }) =>
    request<any>("/api/accountability/junk-points", { method: "POST", body: JSON.stringify(payload) }),

  // Feedback & Friction
  getDailyFeedback: (dateStr: string, regenerate: boolean = false) =>
    request<DailyFeedbackSummary>(`/api/feedback/day/${dateStr}?regenerate=${regenerate}`),
  logFriction: (payload: { date_str: string; category: string; description: string }) =>
    request<any>("/api/feedback/friction", { method: "POST", body: JSON.stringify(payload) }),
  getDayFrictions: (dateStr: string) => request<any[]>(`/api/feedback/frictions/${dateStr}`),

  // Personal Notes
  getNotes: () => request<PersonalNote[]>("/api/notes"),
  createNote: (payload: { title: string; content: string; tags?: string[] }) =>
    request<PersonalNote>("/api/notes", { method: "POST", body: JSON.stringify(payload) }),
  deleteNote: (noteId: string) => request<{ success: boolean }>(`/api/notes/${noteId}`, { method: "DELETE" }),

  // Chat & Multi-Conversations
  listConversations: () =>
    request<
      Array<{
        conversation_id: string;
        title: string;
        context_date: string;
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
  getConversation: (conversationId?: string) =>
    request<{ conversation_id: string; title: string; messages: ChatMessage[] }>(
      conversationId ? `/api/chat/conversations/${conversationId}` : "/api/chat/conversation"
    ),
  sendMessage: (content: string, conversationId?: string) =>
    request<{ conversation_id: string; reply: ChatMessage }>("/api/chat/message", {
      method: "POST",
      body: JSON.stringify({ content, conversation_id: conversationId }),
    }),

  // Lemon direct controls
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
