export type TaskCategory = "ROUTINE" | "MUST" | "SHOULD";
export type TaskStatus = "suggested" | "draft" | "approved" | "in_progress" | "completed" | "missed" | "deferred" | "cancelled";
export type CardType = "text" | "quarter_plan_proposal" | "todo_draft" | "focus_control" | "feedback_report" | "quarantine_control" | "accountability_status";

export interface Subtask {
  subtask_id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  completed_at?: string;
}

export interface Task {
  task_id: string;
  quarter_id: string;
  goal_id?: string;
  title: string;
  description?: string;
  category: TaskCategory;
  status: TaskStatus;
  target_date?: string;
  deadline?: string;
  estimated_minutes: number;
  actual_minutes: number;
  subtasks: Subtask[];
  is_promoted: boolean;
  promotion_reason?: string;
}

export interface RoutineOccurrence {
  occurrence_id: string;
  routine_id: string;
  date_str: string;
  title: string;
  is_completed: boolean;
  completed_at?: string;
  missed: boolean;
}

export interface Goal {
  goal_id: string;
  quarter_id: string;
  priority: number;
  title: string;
  description?: string;
  status: "not_started" | "in_progress" | "done";
}

export interface Quarter {
  quarter_id: string;
  season_id: string;
  verse_id: string;
  quarter_num: number;
  start_date: string;
  end_date: string;
  day_ids: string[];
  plan_version: number;
  remaining_keys: number;
  total_violations: number;
  status: "active" | "closed";
}

export interface Day {
  date_str: string;
  period_type: "Q1" | "Q2" | "Q3" | "Q4" | "SURPLUS";
  period_id: string;
  season_id: string;
  verse_id: string;
  status: "active" | "closed";
  is_bad_day: boolean;
  bad_day_reasons: string[];
  closure_completed: boolean;
}

export interface QuarterPlanGoal {
  priority: number;
  title: string;
  description?: string;
}

export interface QuarterPlanTask {
  title: string;
  category: TaskCategory;
  goal_priority?: number;
  target_date?: string;
  deadline?: string;
  estimated_minutes: number;
  subtasks: string[];
}

export interface QuarterPlan {
  plan_id: string;
  quarter_id: string;
  version: number;
  status: "proposed" | "approved" | "superseded" | "rejected";
  goals: QuarterPlanGoal[];
  tasks: QuarterPlanTask[];
  rationale?: string;
}

export interface TodoDraftItem {
  task_id?: string;
  title: string;
  category: TaskCategory;
  is_routine: boolean;
  routine_occurrence_id?: string;
  is_selected: boolean;
  estimated_minutes: number;
}

export interface TodoDraft {
  draft_id: string;
  date_str: string;
  items: TodoDraftItem[];
  status: "draft" | "approved";
  is_retrospective: boolean;
}

export interface PomodoroSession {
  session_id: string;
  date_str: string;
  task_id?: string;
  task_title?: string;
  planned_minutes: number;
  started_at: string;
  paused_at?: string;
  status: "active" | "paused" | "completed" | "interrupted" | "abandoned";
  dns_enabled_by_session: boolean;
  outcome_notes?: string;
}

export interface FocusState {
  is_focus_active: boolean;
  current_session_id?: string;
  dns_protection_active: boolean;
  lemon_synchronized: boolean;
  error_message?: string;
}

export interface ObservationItem {
  evidence_type: "OBSERVED_FACT" | "USER_REPORT" | "AI_HYPOTHESIS";
  category: string;
  statement: string;
  confidence: number;
  evidence_source?: string;
}

export interface DerivedMetrics {
  total_active_seconds: number;
  productive_seconds: number;
  entertainment_seconds: number;
  tasks_approved_count: number;
  tasks_completed_count: number;
  tasks_missed_count: number;
  routines_scheduled_count: number;
  routines_completed_count: number;
  routines_missed_count: number;
  focus_sessions_completed: number;
  focus_minutes_total: number;
  friction_events_count: number;
  junk_points_total: number;
  bad_day: boolean;
}

export interface DailyFeedbackSummary {
  summary_id: string;
  date_str: string;
  version: number;
  is_complete: boolean;
  lemon_data_available: boolean;
  basket_ai_used: boolean;
  observations: ObservationItem[];
  accomplishments: string[];
  distractions_and_friction: string[];
  alignment_verdict: string;
  actionable_improvement: string;
  metrics: DerivedMetrics;
}

export interface ChatMessage {
  message_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  card_type: CardType;
  card_data?: any;
  created_at: string;
}

export interface ConversationSummary {
  conversation_id: string;
  title: string;
  context_date: string;
  active_quarter_id?: string;
  message_count: number;
  preview: string;
  created_at?: string;
  updated_at?: string;
}

export interface Conversation {
  conversation_id: string;
  title: string;
  messages: ChatMessage[];
  context_date: string;
  active_quarter_id: string;
  created_at: string;
  updated_at: string;
}

export interface PersonalNote {
  note_id: string;
  title: string;
  content: string;
  tags: string[];
  updated_at: string;
}

export interface SystemHealth {
  status: string;
  service: string;
  version: string;
  database_ok: boolean;
  basket_ai_ok: boolean;
  lemon_desktop_ok: boolean;
  current_local_date: string;
  timezone: string;
  junk_point_limit: number;
  quarter_keys_initial: number;
}
