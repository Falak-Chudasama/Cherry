import React, { useState, useEffect } from "react";
import {
  Layers,
  CheckSquare,
  Search,
  ExternalLink,
  Check,
  X,
  Copy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ChatMessage as ChatMessageType } from "../../types";
import { useEcosystem } from "../../context/EcosystemContext";
import { api } from "../../lib/api";
import { playEnter, playBack, playFailed, playNotification } from "../../lib/sound";
import { useToast } from "../ui/ToastProvider";
import { TodoDraftCard } from "./TodoDraftCard";
import { TaskListCard } from "./TaskListCard";
import { FocusCard } from "./FocusCard";
import { FeedbackCard } from "./FeedbackCard";
import { PlanProposalCard } from "./PlanProposalCard";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
  streamStatus?: string | null;
  onRefresh?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isStreaming = false,
  streamStatus = null,
  onRefresh,
}) => {
  const isUser = message.role === "user";
  const { openTaskDrawer, openPlanModal, bumpWorkspaceRevision, activeConversationId } = useEcosystem();
  const { push } = useToast();

  const [actionStatus, setActionStatus] = useState<string>(
    message.card_data?.status || "pending"
  );
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<string>(
    message.card_data?.result?.message || ""
  );
  const [copied, setCopied] = useState(false);
  const [queryExpanded, setQueryExpanded] = useState(false);

  // Sync status when message reloads from backend
  useEffect(() => {
    setActionStatus(message.card_data?.status || "pending");
    setExecutionResult(message.card_data?.result?.message || "");
  }, [message.message_id, message.card_data?.status, message.card_data?.result?.message]);

  const handleCopyMessage = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleApproveAction = async () => {
    if (!message.card_data?.action_id || actionLoading) return;
    setActionLoading(true);
    playEnter();
    try {
      const res = await api.executeAction({
        action_id: message.card_data.action_id,
        action_data: message.card_data,
        session_id: activeConversationId,
        message_id: message.message_id,
      });
      if (res.success) {
        setActionStatus("executed");
        setExecutionResult(res.message);
        playNotification();
        push("success", res.message || "Done.");
        bumpWorkspaceRevision();
        onRefresh?.();
      } else {
        setActionStatus("failed");
        setExecutionResult(res.message || "Action failed.");
        playFailed();
        push("error", res.message || "Action failed.");
      }
    } catch (err: any) {
      setActionStatus("failed");
      playFailed();
      push("error", err?.message || "Failed to execute action.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectAction = async () => {
    if (!message.card_data?.action_id || actionLoading) return;
    setActionLoading(true);
    playBack();
    try {
      await api.rejectAction({
        action_id: message.card_data.action_id,
        session_id: activeConversationId,
        message_id: message.message_id,
      });
      setActionStatus("rejected");
      onRefresh?.();
    } catch {
      playFailed();
    } finally {
      setActionLoading(false);
    }
  };

  // User prompt pill (no avatar, crisp minimal bubble)
  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[82%] sm:max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 text-[13px] sm:text-sm leading-relaxed shadow-2xs">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  // Borderless editorial assistant response
  const hasCard = Boolean(message.card_type && message.card_type !== "text" && message.card_data);

  return (
    <div className="group flex items-start gap-3 animate-fade-in">
      {/* Bare minimal Cherry mark */}
      <img
        src="/icons/cherry-icon.svg"
        alt="Cherry"
        onError={(e) => {
          (e.target as HTMLImageElement).src = "/cherry-icon.svg";
        }}
        className="w-5 h-5 object-contain shrink-0 mt-1 opacity-90"
      />

      <div className="flex-1 min-w-0 space-y-2.5">
        {/* Live status before tokens arrive */}
        {!message.content && isStreaming && streamStatus && (
          <div className="flex items-center gap-2 py-0.5 text-xs text-stone-400 dark:text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-cherry-flesh animate-pulse" />
            <span>{streamStatus}</span>
          </div>
        )}

        {/* Borderless Markdown Prose */}
        {message.content && (
          <div className="text-[13px] sm:text-sm leading-relaxed text-stone-800 dark:text-stone-200">
            <MarkdownRenderer content={message.content} />
            {isStreaming && !hasCard && (
              <span className="inline-block w-1.5 h-3.5 ml-1 align-middle rounded-full bg-cherry-flesh animate-pulse" />
            )}
          </div>
        )}

        {/* Structured Interactive Cards */}

        {/* 0. Task List Card */}
        {message.card_type === "task_list_card" && message.card_data && (
          <TaskListCard
            cardData={message.card_data}
            messageId={message.message_id}
            onTasksAdded={() => {
              bumpWorkspaceRevision();
              onRefresh?.();
            }}
          />
        )}

        {/* 1. Plan Composer Card */}
        {message.card_type === "plan_composer" && message.card_data && (
          <div className="p-3.5 rounded-2xl glass-card border border-black/[0.07] dark:border-white/[0.08] space-y-2.5 max-w-lg animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="w-4 h-4 text-cherry-flesh shrink-0" />
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-stone-900 dark:text-white truncate">
                    {message.card_data.quarter_goal || "Quarter Plan"}
                  </h4>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    {message.card_data.deliverables?.length || 0} deliverables
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  openPlanModal({
                    period_id: message.card_data.period_id,
                    initialDraft: message.card_data,
                  })
                }
                className="btn-interactive flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cherry-flesh hover:bg-cherry-600 text-white text-2xs font-semibold shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Workbench</span>
              </button>
            </div>

            {message.card_data.deliverables && message.card_data.deliverables.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-black/[0.04] dark:border-white/[0.05]">
                {message.card_data.deliverables.slice(0, 3).map((d: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs py-1 text-stone-700 dark:text-stone-300"
                  >
                    <span className="truncate">{d.title}</span>
                    <span className="text-3xs font-mono text-stone-400 shrink-0 ml-2">
                      {d.subtasks?.length || 0} steps
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. Task Composer Card */}
        {message.card_type === "task_composer" && message.card_data && (
          <div className="p-3.5 rounded-2xl glass-card border border-black/[0.07] dark:border-white/[0.08] flex items-center justify-between gap-3 max-w-lg animate-fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <CheckSquare className="w-4 h-4 text-cherry-flesh shrink-0" />
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-stone-900 dark:text-white truncate">
                  {message.card_data.title}
                </h4>
                <p className="text-[11px] text-stone-500">
                  {message.card_data.priority || "Normal"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                openTaskDrawer({
                  title: message.card_data.title,
                  description: message.card_data.description,
                  priority: message.card_data.priority,
                  period_id: message.card_data.period_id,
                  period_type: message.card_data.period_type,
                  subtasks: message.card_data.subtasks,
                  mode: "create",
                })
              }
              className="btn-interactive flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cherry-flesh hover:bg-cherry-600 text-white text-2xs font-semibold shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>
        )}

        {/* 3. Query Result Collapsible Pill */}
        {message.card_type === "query_result" &&
          message.card_data?.results &&
          message.card_data.results.length > 0 && (
            <div className="max-w-lg">
              <button
                type="button"
                onClick={() => setQueryExpanded((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-card border border-black/[0.07] dark:border-white/[0.08] text-2xs font-medium text-stone-600 dark:text-stone-300 hover:border-black/15 dark:hover:border-white/20 transition"
              >
                <Search className="w-3 h-3 text-cherry-flesh" />
                <span>
                  {message.card_data.result_count} {message.card_data.collection?.replace("_", " ") || "records"}
                </span>
                {queryExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {queryExpanded && (
                <div className="mt-2 p-2.5 rounded-2xl glass-card border border-black/[0.06] dark:border-white/[0.08] space-y-1.5 max-h-52 overflow-y-auto animate-scale-in">
                  {message.card_data.results.map((r: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] text-xs"
                    >
                      <span className="font-medium text-stone-800 dark:text-stone-200 truncate">
                        {r.title || r.food_item || r.rule_name || r.name || "Record"}
                      </span>
                      {r.status && (
                        <span className="text-3xs font-mono text-stone-400 shrink-0">
                          {r.status}
                        </span>
                      )}
                      {r.jp_value !== undefined && (
                        <span className="text-3xs font-mono text-amber-600 dark:text-amber-400 shrink-0">
                          +{r.jp_value} JP
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        {/* 4. Action Confirmation Card (Two-Phase Approval Gate) */}
        {(message.card_type === "action_confirm" || message.card_type === "action_result") &&
          message.card_data && (
            <div className="p-3.5 rounded-2xl glass-card border border-black/[0.07] dark:border-white/[0.08] space-y-2.5 max-w-lg animate-fade-in text-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-stone-900 dark:text-white">
                    {message.card_data.summary || "Confirm Action"}
                  </div>
                  {message.card_data.actions?.[0]?.description && (
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      {message.card_data.actions[0].description}
                    </p>
                  )}
                </div>

                {actionStatus !== "pending" && (
                  <span
                    className={`text-3xs font-mono font-semibold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                      actionStatus === "executed"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : actionStatus === "failed"
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                        : "bg-stone-500/15 text-stone-500 dark:text-stone-400"
                    }`}
                  >
                    {actionStatus}
                  </span>
                )}
              </div>

              {executionResult && (
                <p
                  className={`text-[11px] leading-relaxed ${
                    actionStatus === "executed"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {executionResult}
                </p>
              )}

              {actionStatus === "pending" && (
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleRejectAction}
                    disabled={actionLoading}
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] font-medium transition"
                  >
                    <X className="w-3 h-3" />
                    <span>Dismiss</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleApproveAction}
                    disabled={actionLoading}
                    className="btn-interactive flex items-center gap-1 px-3.5 py-1 rounded-full bg-cherry-flesh hover:bg-cherry-600 text-white font-semibold"
                  >
                    <Check className="w-3 h-3" />
                    <span>{actionLoading ? "Running..." : "Approve"}</span>
                  </button>
                </div>
              )}
            </div>
          )}

        {message.card_type === "todo_draft" && message.card_data && (
          <TodoDraftCard data={message.card_data} onFinalized={onRefresh} />
        )}

        {message.card_type === "quarter_plan_proposal" && message.card_data && (
          <PlanProposalCard data={message.card_data} onApproved={onRefresh} />
        )}

        {message.card_type === "focus_control" && message.card_data && (
          <FocusCard data={message.card_data} />
        )}

        {message.card_type === "feedback_report" && message.card_data && (
          <FeedbackCard data={message.card_data} />
        )}

        {/* Quiet Hover Copy Row */}
        {message.content && !isStreaming && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pt-0.5">
            <button
              type="button"
              onClick={handleCopyMessage}
              className="flex items-center gap-1 text-3xs text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition"
              title="Copy response"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-500">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
