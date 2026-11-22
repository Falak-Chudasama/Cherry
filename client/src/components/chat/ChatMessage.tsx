import React, { useState } from "react";
import { User, Layers, CheckSquare, Search, Activity, ExternalLink, Check, X } from "lucide-react";
import { ChatMessage as ChatMessageType } from "../../types";
import { useEcosystem } from "../../context/EcosystemContext";
import { api } from "../../lib/api";
import { playEnter, playBack, playFailed, playNotification } from "../../lib/sound";
import { useToast } from "../ui/ToastProvider";
import { TodoDraftCard } from "./TodoDraftCard";
import { TaskListCard } from "./TaskListCard";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";

interface ChatMessageProps {
  message: ChatMessageType;
  onRefresh?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRefresh }) => {
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
        push("success", "Action executed successfully.");
        bumpWorkspaceRevision();
        onRefresh?.();
      } else {
        setActionStatus("failed");
        setExecutionResult(res.message || "Action execution failed.");
        playFailed();
        push("error", res.message || "Failed to execute action.");
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
      push("info", "Action proposal rejected.");
      onRefresh?.();
    } catch {
      playFailed();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className={`flex gap-3 my-3 animate-fade-in ${isUser ? "justify-end" : "justify-start"}`}>
      {/* Assistant Avatar: Official Cherry Icon */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 p-1 flex items-center justify-center shrink-0 mt-0.5">
          <img
            src="/icons/cherry-icon.svg"
            alt="Cherry"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/cherry-icon.svg";
            }}
            className="w-5 h-5 object-contain"
          />
        </div>
      )}

      {/* Message Body */}
      <div className={`max-w-2xl ${isUser ? "items-end" : "items-start"} space-y-2`}>
        {/* Text bubble */}
        {message.content && (
          <div
            className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed transition-colors duration-200 ${
              isUser
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 rounded-br-xs font-medium shadow-2xs"
                : "bg-white/90 dark:bg-[#181915]/90 text-stone-900 dark:text-stone-100 border border-stone-200/80 dark:border-stone-800 rounded-bl-xs shadow-xs"
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <MarkdownRenderer content={message.content} variant="bubble" />
            )}
          </div>
        )}

        {/* Structured Interactive Cards */}

        {/* 0. Structured Task List Card (Batch Task & Subtask Creation) */}
        {message.card_type === "task_list_card" && message.card_data && (
          <TaskListCard
            cardData={message.card_data}
            onTasksAdded={() => {
              bumpWorkspaceRevision();
              onRefresh?.();
            }}
          />
        )}

        {/* 1. Plan Composer Card -> Open in Plan Workbench */}
        {message.card_type === "plan_composer" && message.card_data && (
          <div className="p-4 rounded-2xl bg-white/90 dark:bg-[#161616]/90 border border-cherry-500/30 shadow-md space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-cherry-500/10 text-cherry-flesh dark:text-cherry-blush">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold font-sans text-stone-900 dark:text-white">
                    {message.card_data.quarter_goal || "Drafted Quarter Plan"}
                  </h4>
                  <p className="text-[11px] text-stone-400">
                    {message.card_data.deliverables?.length || 0} task(s) drafted for {message.card_data.period_id}
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cherry-flesh hover:bg-cherry-700 text-white text-xs font-semibold shadow transition-all hover:scale-[1.02]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Workbench</span>
              </button>
            </div>

            {message.card_data.deliverables && (
              <div className="space-y-1.5 pt-1">
                {message.card_data.deliverables.slice(0, 3).map((d: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800">
                    <span className="font-medium text-stone-800 dark:text-stone-200">{d.title}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                      {d.subtasks?.length || 0} subtasks
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. Task Composer Card -> Open in Task Drawer */}
        {message.card_type === "task_composer" && message.card_data && (
          <div className="p-4 rounded-2xl bg-white/90 dark:bg-[#161616]/90 border border-cherry-500/30 shadow-md space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-cherry-500/10 text-cherry-flesh dark:text-cherry-blush">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold font-sans text-stone-900 dark:text-white">
                    {message.card_data.title}
                  </h4>
                  <p className="text-[11px] text-stone-400">
                    Priority: {message.card_data.priority || "P2"} | Period: {message.card_data.period_type || "Q4"}
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cherry-flesh hover:bg-cherry-700 text-white text-xs font-semibold shadow transition-all hover:scale-[1.02]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Task Drawer</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. Query Result Card */}
        {message.card_type === "query_result" && message.card_data && (
          <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-[#151515] border border-stone-200 dark:border-stone-800 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-stone-500 font-medium">
              <Search className="w-3.5 h-3.5 text-blue-500" />
              <span>Collection: <strong className="text-stone-800 dark:text-stone-200">{message.card_data.collection}</strong></span>
              <span className="text-[11px] font-mono">({message.card_data.result_count} results)</span>
            </div>
            {message.card_data.results && message.card_data.results.length > 0 && (
              <div className="space-y-1 pt-1 max-h-48 overflow-y-auto">
                {message.card_data.results.map((r: any, idx: number) => (
                  <div key={idx} className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800/60">
                    <div className="font-semibold text-stone-900 dark:text-stone-100">
                      {r.title || r.food_item || r.rule_name || r.name || "Record"}
                    </div>
                    {r.description && <p className="text-[11px] text-stone-500 truncate">{r.description}</p>}
                    {r.status && <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 font-mono">{r.status}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Action Confirmation Card (Approval Gate) */}
        {(message.card_type === "action_confirm" || message.card_type === "action_result") && message.card_data && (
          <div className="p-4 rounded-2xl bg-white/90 dark:bg-[#161616]/90 border border-stone-200 dark:border-stone-800 shadow-md space-y-3 animate-fade-in text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-cherry-500/10 text-cherry-flesh dark:text-cherry-blush">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold font-sans text-stone-900 dark:text-white">
                    Action Proposal
                  </h4>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    {message.card_data.summary || "Pending Confirmation"}
                  </p>
                </div>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase ${
                  actionStatus === "pending"
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                    : actionStatus === "executed"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : actionStatus === "failed"
                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                    : "bg-stone-500/15 text-stone-600 dark:text-stone-400 border border-stone-500/30"
                }`}
              >
                {actionStatus}
              </span>
            </div>

            {/* Actions Breakdown */}
            {message.card_data.actions && (
              <div className="space-y-1.5 pt-1">
                {message.card_data.actions.map((act: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {act.target}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                        {act.action_type}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      {act.description}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Execution Result Message */}
            {executionResult && (
              <div
                className={`p-2.5 rounded-xl text-[11px] ${
                  actionStatus === "executed"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20"
                }`}
              >
                {executionResult}
              </div>
            )}

            {/* Approval / Rejection Controls */}
            {actionStatus === "pending" && (
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={handleRejectAction}
                  disabled={actionLoading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold transition"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  onClick={handleApproveAction}
                  disabled={actionLoading}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-xl bg-cherry-flesh hover:bg-cherry-700 text-white font-semibold shadow transition hover:scale-[1.02]"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{actionLoading ? "Executing..." : "Approve & Execute"}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {message.card_type === "todo_draft" && message.card_data && (
          <TodoDraftCard data={message.card_data} onFinalized={onRefresh} />
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
};
