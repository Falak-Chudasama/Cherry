export type KanbanStatus = "Not started" | "In progress" | "Done";
export type TaskCategory = "ROUTINE" | "MUST" | "SHOULD";
export type TaskTier = "Must Do" | "Should Do" | "Routine";
export type PeriodType = "Q1" | "Q2" | "Q3" | "Q4" | "SURPLUS";

export type CardType =
  | "text"
  | "task_list_card"
  | "plan_composer"
  | "task_composer"
  | "query_result"
  | "action_confirm"
  | "action_result"
  | "quarter_plan_proposal"
  | "todo_draft"
  | "focus_control"
  | "feedback_report"
  | "quarantine_control"
  | "accountability_status";

export interface Subtask {
  subtask_id: string;
  task_id?: string;
  title: string;
  is_completed: boolean;
  start_day?: number;
  end_day?: number;
  scheduled_days?: number[];
  completed_at?: string;
}

export interface Task {
  task_id: string;
  period_id: string;
  quarter_id?: string;
  period_type?: PeriodType;
  goal_id?: string;
  title: string;
  description?: string;
  status: KanbanStatus;
  tier?: TaskTier;
  priority?: string;
  category?: TaskCategory;
  target_date?: string;
  deadline?: string;
  estimated_minutes?: number;
  actual_minutes?: number;
  start_day?: number;
  end_day?: number;
  scheduled_days?: number[];
  subtasks: Subtask[];
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
}

export interface RoutineDefinition {
  routine_id: string;
  quarter_id?: string;
  title: string;
  description?: string;
  days_of_week: number[];
  scheduled_dates?: string[];
  is_active: boolean;
}

export interface RoutineOccurrence {
  occurrence_id: string;
  routine_id: string;
  date_str: string;
  title: string;
  is_completed: boolean;
  completed_at?: string;
  missed?: boolean;
}

export interface Goal {
  goal_id: string;
  quarter_id: string;
  priority: number;
  title: string;
  description?: string;
  status: KanbanStatus;
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
  period_type: PeriodType;
  period_id: string;
  season_id: string;
  verse_id: string;
  status: "active" | "closed";
  is_bad_day?: boolean;
  bad_day_reasons?: string[];
  closure_completed?: boolean;
}

export interface DeliverableDraft {
  title: string;
  description: string;
  priority: string;
  subtasks: Array<{
    title: string;
    start_day: number;
    end_day: number;
    is_completed?: boolean;
  }>;
}

export interface PlanComposerData {
  quarter_goal: string;
  period_id: string;
  deliverables: DeliverableDraft[];
}

export interface TaskComposerData {
  task_id?: string;
  title: string;
  description: string;
  priority: string;
  period_type: PeriodType;
  period_id: string;
  target_date?: string;
  deadline?: string;
  estimated_minutes?: number;
  subtasks: Array<{
    subtask_id?: string;
    title: string;
    start_day: number;
    end_day: number;
    is_completed?: boolean;
  }>;
}

export interface JunkPointEntry {
  entry_id: string;
  date_str: string;
  period_id: string;
  food_item: string;
  jp_value: number;
  notes?: string;
  timestamp?: string;
}

export interface JunkPointSummary {
  scope: "day" | "period";
  identifier: string;
  limit: number;
  accumulated_jp: number;
  remaining_jp: number;
  entries: JunkPointEntry[];
}

export interface Rule {
  rule_id: string;
  name: string;
  description: string;
  is_active: boolean;
}

export interface Violation {
  violation_id: string;
  rule_id: string;
  rule_name: string;
  date_str: string;
  period_id: string;
  evidence: string;
  notes?: string;
  is_confirmed: boolean;
  timestamp: string;
}

export interface Command {
  command_id: string;
  application: string;
  name: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  message_id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  card_type?: CardType;
  card_data?: any;
  created_at?: string;
}

export interface ConversationSummary {
  conversation_id: string;
  session_id?: string;
  title: string;
  message_count?: number;
  preview?: string;
  updated_at: string;
}

export interface PomodoroSession {
  session_id: string;
  date_str: string;
  planned_minutes: number;
  actual_minutes: number;
  status: "active" | "completed" | "interrupted";
  task_title?: string;
}

export interface FocusState {
  is_focus_active: boolean;
  current_session_id?: string;
  dns_protection_active?: boolean;
  lemon_synchronized?: boolean;
  error_message?: string;
  phase?: "idle" | "focus" | "break";
  started_at?: string;
  planned_minutes?: number;
  break_started_at?: string;
  break_minutes?: number;
}

export interface PersonalNote {
  note_id: string;
  title: string;
  content: string;
  tags?: string[];
  updated_at?: string;
}

export interface TodoDraftItem {
  item_id: string;
  title: string;
  category: TaskCategory;
  estimated_minutes?: number;
  is_selected?: boolean;
}

export interface TodoDraft {
  draft_id: string;
  date_str: string;
  quarter_id: string;
  items: TodoDraftItem[];
  status: "draft" | "finalized";
  created_at?: string;
  finalized_at?: string;
}

export interface ObservationItem {
  domain?: string;
  observed_activity?: string;
  category: string;
  evidence_type?: string;
  statement?: string;
  timestamp?: string;
}

export interface DerivedMetrics {
  bad_day?: boolean;
  total_active_seconds: number;
  tasks_completed_count: number;
  tasks_approved_count: number;
  focus_minutes_total: number;
  junk_points_total: number;
  total_screen_minutes?: number;
  alignment_ratio?: number;
}

export interface DailyFeedbackSummary {
  date_str: string;
  alignment_verdict?: string;
  verdict_rationale?: string;
  observations?: ObservationItem[];
  metrics?: DerivedMetrics;
}

export interface QuarterPlan {
  plan_id: string;
  quarter_id: string;
  version: number;
  status: "proposed" | "approved" | "superseded" | "rejected";
  goals: any[];
  tasks: any[];
  rationale?: string;
}

export interface SystemHealth {
  status: string;
  mongodb: boolean;
  basket: boolean;
  lemon: boolean;
  timestamp: string;
}
