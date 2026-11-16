import React from "react";
import { User } from "lucide-react";
import { ChatMessage as ChatMessageType } from "../../types";
import { PlanProposalCard } from "./PlanProposalCard";
import { TodoDraftCard } from "./TodoDraftCard";
import { FocusCard } from "./FocusCard";
import { FeedbackCard } from "./FeedbackCard";

interface ChatMessageProps {
  message: ChatMessageType;
  onRefresh?: () => void;
  onStopFocus?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRefresh, onStopFocus }) => {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 my-3 animate-fade-in ${isUser ? "justify-end" : "justify-start"}`}>
      {/* Assistant Avatar: Official Cherry Icon */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full glass-card p-1 shadow-2xs flex items-center justify-center shrink-0 mt-0.5">
          <img src="/cherry-icon.svg" alt="Cherry" className="w-5 h-5 object-contain" />
        </div>
      )}

      {/* Message Body */}
      <div className={`max-w-2xl ${isUser ? "items-end" : "items-start"} space-y-2`}>
        {/* Text bubble */}
        {message.content && (
          <div
            className={`px-4 py-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-soft transition-colors duration-200 ${
              isUser
                ? "bg-cherry text-white rounded-br-xs font-medium"
                : "glass-card text-stone-900 dark:text-stone-100 border border-black/5 dark:border-white/10 rounded-bl-xs"
            }`}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        )}

        {/* Structured Interactive Cards */}
        {message.card_type === "quarter_plan_proposal" && message.card_data && (
          <PlanProposalCard data={message.card_data} onApproved={onRefresh} />
        )}

        {message.card_type === "todo_draft" && message.card_data && (
          <TodoDraftCard data={message.card_data} onFinalized={onRefresh} />
        )}

        {message.card_type === "focus_control" && message.card_data && (
          <FocusCard data={message.card_data} onStop={onStopFocus} />
        )}

        {message.card_type === "feedback_report" && message.card_data && (
          <FeedbackCard data={message.card_data} />
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-full glass-card p-1 text-stone-600 dark:text-stone-300 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
};
