import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Sparkles,
  Zap,
  Award,
  ShieldCheck,
  CalendarCheck2,
  Plus,
  Trash2,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Key,
} from "lucide-react";
import { api } from "../lib/api";
import { playEnter, playNotification, playFailed, playScroll, playBack } from "../lib/sound";
import { ChatMessage as ChatMessageType } from "../types";
import { ChatMessage } from "../components/chat/ChatMessage";
import { useEcosystem } from "../context/EcosystemContext";

const QUICK_ACTIONS = [
  {
    title: "Draft Today's Schedule",
    description: "Generate today's Must & Should tasks from active quarter goals.",
    prompt: "Draft today's tasks from the active plan.",
    icon: CalendarCheck2,
    color: "text-purple-600 dark:text-purple-400 bg-purple-500/10",
  },
  {
    title: "Start 60m Focus Block",
    description: "Activate Pomodoro timer with Lemon DNS shield protection.",
    prompt: "Start a 60-minute focus session with DNS shield.",
    icon: Zap,
    color: "text-amber-500 bg-amber-500/10",
  },
  {
    title: "Run Day Reflection",
    description: "Review today's device activity, adherence rate, and verdict.",
    prompt: "How did I perform today? Show summary feedback.",
    icon: Award,
    color: "text-cherry-flesh dark:text-cherry-blush bg-cherry-500/10",
  },
  {
    title: "Quarter Accountability",
    description: "Inspect 3 QK ledger, 7-day sprint timeline, and 50 JP limits.",
    prompt: "What is my current Quarter status and remaining keys?",
    icon: ShieldCheck,
    color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  },
];

export const ChatPage: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    createConversation,
    deleteConversation,
    loadConversations,
    refreshEcosystem,
    toggleFocus,
    activeQuarterId,
    remainingKeys,
    junkPoints,
    isFocusActive,
  } = useEcosystem();

  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (activeConversationId) {
      loadActiveConversation(activeConversationId);
    }
  }, [activeConversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const loadActiveConversation = async (convId: string) => {
    try {
      const data = await api.getConversation(convId);
      setMessages(data.messages || []);
    } catch (err) {
      console.debug("Failed to load conversation", err);
    }
  };

  const handleSelectChat = (id: string) => {
    playScroll();
    setActiveConversationId(id);
  };

  const handleNewChat = async () => {
    try {
      playEnter();
      await createConversation();
    } catch (err) {
      console.error("Failed to create new chat", err);
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    playBack();
    await deleteConversation(id);
  };

  const handleSend = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    playEnter();
    setInput("");

    const tempUserMsg: ChatMessageType = {
      message_id: `temp-${Date.now()}`,
      role: "user",
      content: content,
      card_type: "text",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setLoading(true);

    try {
      const res = await api.sendMessage(content, activeConversationId);
      if (!activeConversationId && res.conversation_id) {
        setActiveConversationId(res.conversation_id);
      }
      setMessages((prev) => [...prev, res.reply]);
      playNotification();
      await loadConversations();
      await refreshEcosystem();
    } catch (err) {
      playFailed();
      const errorMsg: ChatMessageType = {
        message_id: `err-${Date.now()}`,
        role: "assistant",
        content: "Unable to reach the inference provider. Local backend rules remain active.",
        card_type: "text",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex h-[calc(100vh-7.5rem)] w-full max-w-5xl gap-4 px-4 pb-4">
      {/* Integrated Multi-Chat Sessions Sidebar */}
      <aside
        className={`flex flex-col justify-between rounded-3xl glass-panel border border-black/5 dark:border-white/10 p-3 transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          sidebarCollapsed ? "w-14 items-center" : "w-64 lg:w-72"
        }`}
        aria-label="Chat Sessions"
      >
        {/* Top: Header & New Chat Button */}
        <div className="w-full space-y-2.5 pb-2 border-b border-black/5 dark:border-white/10">
          <div className="flex items-center justify-between">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-cherry-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                  Chats ({conversations.length})
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-black/5 dark:hover:bg-white/10 transition"
              title={sidebarCollapsed ? "Expand chats" : "Collapse chats"}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          {!sidebarCollapsed ? (
            <button
              type="button"
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-cherry-500 hover:bg-cherry-600 active:bg-cherry-700 text-white text-xs font-bold transition shadow-none cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>New Chat</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNewChat}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-cherry-500 hover:bg-cherry-600 text-white transition shadow-none cursor-pointer"
              title="New Chat"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
            </button>
          )}
        </div>

        {/* Middle: Scrollable Conversations List */}
        <div className="flex-1 w-full overflow-y-auto py-2 space-y-1 scrollbar-thin">
          {conversations.length === 0 ? (
            !sidebarCollapsed && (
              <div className="py-6 text-center text-xs text-stone-400">
                No previous conversations.
              </div>
            )
          ) : (
            conversations.map((conv) => {
              const isActive = conv.conversation_id === activeConversationId;
              return (
                <div
                  key={conv.conversation_id}
                  onClick={() => handleSelectChat(conv.conversation_id)}
                  className={`group relative flex items-center gap-2 rounded-xl p-2 text-xs transition cursor-pointer select-none ${
                    isActive
                      ? "bg-cherry-500/15 text-cherry-600 dark:text-cherry-300 font-bold border border-cherry-500/25"
                      : "text-stone-600 dark:text-stone-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-stone-900 dark:hover:text-stone-100 border border-transparent"
                  } ${sidebarCollapsed ? "justify-center p-2" : ""}`}
                  title={conv.title}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1 truncate text-xs font-medium">
                        {conv.title || "Untitled Chat"}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteChat(e, conv.conversation_id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-stone-400 hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10 transition"
                        title="Delete conversation"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom: Quick Accountability Footer */}
        {!sidebarCollapsed ? (
          <div className="w-full pt-2.5 border-t border-black/5 dark:border-white/10 space-y-2">
            <div className="flex items-center justify-between text-2xs">
              <span className="flex items-center gap-1 font-semibold text-stone-600 dark:text-stone-300">
                <Calendar className="h-3.5 w-3.5 text-cherry-flesh" />
                <span className="font-mono">{activeQuarterId}</span>
              </span>
              <span className="flex items-center gap-1 font-mono font-bold text-amber-600 dark:text-amber-400">
                <Key className="h-3.5 w-3.5 text-amber-500" />
                <span>{remainingKeys}/3 QK</span>
              </span>
            </div>
            <button
              type="button"
              onClick={toggleFocus}
              className={`w-full py-1.5 px-2 rounded-xl text-2xs font-bold transition flex items-center justify-between border ${
                isFocusActive
                  ? "bg-cherry-500/15 border-cherry-500/30 text-cherry-600 dark:text-cherry-300"
                  : "bg-black/5 dark:bg-white/5 border-transparent text-stone-600 dark:text-stone-300 hover:bg-black/10 dark:hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-1">
                <Zap className={`h-3 w-3 ${isFocusActive ? "text-cherry-flesh" : "text-stone-400"}`} />
                <span>{isFocusActive ? "Shield Active" : "Start Focus"}</span>
              </div>
              <span className="font-mono text-3xs font-semibold text-stone-400">
                {junkPoints}/50 JP
              </span>
            </button>
          </div>
        ) : (
          <div className="pt-2 border-t border-black/5 dark:border-white/10">
            <button
              type="button"
              onClick={toggleFocus}
              className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                isFocusActive
                  ? "bg-cherry-500 text-white"
                  : "text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
              }`}
              title={isFocusActive ? "Shield Active" : "Start Focus"}
            >
              <Zap className="h-4 w-4" />
            </button>
          </div>
        )}
      </aside>

      {/* Active Conversation Surface */}
      <section className="flex-1 flex flex-col justify-between rounded-3xl glass-panel border border-black/5 dark:border-white/10 p-4 sm:p-5 min-w-0 overflow-hidden shadow-none">
        {/* Empty State / Welcome Screen - Balanced & Proportioned Without Overlap */}
        {messages.length <= 1 && (
          <div className="flex-1 flex flex-col items-center justify-center py-4 sm:py-6 text-center animate-fade-in overflow-y-auto">
            {/* Hero Badge */}
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl glass-card p-2.5 mb-3 shadow-none border border-black/5 dark:border-white/10">
              <img src="/cherry-icon.svg" alt="Cherry" className="h-9 w-9 object-contain" />
            </div>

            {/* Heading */}
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 leading-tight">
              How can Cherry help today?
            </h1>

            {/* Subtitle */}
            <p className="mt-2 max-w-md text-xs sm:text-sm text-stone-600 dark:text-stone-400 font-sans leading-relaxed">
              Local-first productivity and behavioural intelligence. Plan quarters, execute focus sprints, and analyze performance with evidence-based feedback.
            </p>

            {/* 2x2 Specialized Action Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full mt-6">
              {QUICK_ACTIONS.map((action, idx) => {
                const Icon = action.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      playScroll();
                      handleSend(action.prompt);
                    }}
                    className="group flex items-start gap-3 rounded-2xl glass-card p-3.5 sm:p-4 text-left transition hover:border-cherry-500/50 hover:bg-white/60 dark:hover:bg-white/[0.04] border border-black/5 dark:border-white/10 cursor-pointer shadow-none"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-transparent transition group-hover:scale-105 ${action.color}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 font-sans group-hover:text-cherry-flesh dark:group-hover:text-cherry-blush transition">
                        {action.title}
                      </h3>
                      <p className="text-2xs sm:text-xs text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed font-sans">
                        {action.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Message Stream */}
        {messages.length > 1 && (
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 sm:pr-2 scrollbar-thin py-2">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.message_id}
                message={msg}
                onRefresh={refreshEcosystem}
                onStopFocus={toggleFocus}
              />
            ))}

            {loading && (
              <div className="flex items-center gap-2.5 text-stone-400 dark:text-stone-500 text-xs py-2 pl-9 animate-fade-in">
                <Sparkles className="h-3.5 w-3.5 text-cherry-flesh animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input Bar */}
        <div className="pt-3 border-t border-black/5 dark:border-white/10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] px-4 py-2.5 border border-black/10 dark:border-white/10 shadow-none"
          >
            <input
              type="text"
              data-chat-input="true"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message or instruction... (Press '/' to focus)"
              className="flex-1 bg-transparent text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send"
              className="btn-glass-primary !p-2 h-8 w-8 rounded-xl shrink-0 disabled:opacity-30 cursor-pointer shadow-none"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
};
