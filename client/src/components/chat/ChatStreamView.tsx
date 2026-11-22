import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Plus,
  Square,
  Sparkles,
  ArrowDown,
  Maximize2,
  X,
  Layers,
  Activity,
  Loader2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { playEnter, playNotification, playFailed } from '../../lib/sound';
import { ChatMessage as ChatMessageType } from '../../types';
import { ChatMessage } from './ChatMessage';
import { useEcosystem } from '../../context/EcosystemContext';

export interface ChatStreamViewProps {
  isDrawerMode?: boolean;
  onExpandToFullView?: () => void;
  onClose?: () => void;
  prefillPrompt?: string;
}

const STARTER_PROMPTS = [
  {
    title: 'Create tasks with Must Do & Should Do tiers',
    description: 'Add priority-tagged daily tasks directly to Kanban',
    prompt: 'Add these 2 tasks for today: first should be Must do and second should be Should do.',
    icon: Sparkles,
  },
  {
    title: 'Break down a task into 4 subtasks',
    description: 'Split complex tasks across days 2 to 5',
    prompt: 'Break my core priority task into 4 subtasks scheduled across days 2 to 5.',
    icon: Layers,
  },
  {
    title: 'Draft next 7-day Quarter Plan',
    description: 'Design 7-day quarter deliverables and subtasks with AI',
    prompt: 'Plan the upcoming Quarter with core deliverables and subtasks.',
    icon: Activity,
  },
  {
    title: 'Salvage my last hour today',
    description: 'Feeling behind? Get a focused mini-task to close the day',
    prompt: "I'm feeling behind today with limited time left—suggest a realistic mini task so I don't end the day with guilt.",
    icon: Sparkles,
  },
];

export const ChatStreamView: React.FC<ChatStreamViewProps> = ({
  isDrawerMode = false,
  onExpandToFullView,
  onClose,
  prefillPrompt,
}) => {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    loadConversations,
    refreshEcosystem,
    bumpWorkspaceRevision,
  } = useEcosystem();

  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
      setIsNearBottom(true);
      setShowScrollBottom(false);
    }
  }, []);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const near = distanceToBottom < 80;
    setIsNearBottom(near);
    setShowScrollBottom(!near);
  };

  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom(false);
    }
  }, [messages, isNearBottom, scrollToBottom]);

  // Load active conversation messages
  useEffect(() => {
    let isMounted = true;
    if (activeConversationId) {
      api
        .getConversationById(activeConversationId)
        .then((doc) => {
          if (isMounted) {
            setMessages(doc.messages || []);
            setTimeout(() => scrollToBottom(false), 50);
          }
        })
        .catch(() => {
          if (isMounted) setMessages([]);
        });
    } else {
      setMessages([]);
    }
    return () => {
      isMounted = false;
    };
  }, [activeConversationId, scrollToBottom]);

  // Handle prefillPrompt
  useEffect(() => {
    if (prefillPrompt) {
      setInput(prefillPrompt);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, [prefillPrompt]);

  const handleNewChat = () => {
    playEnter();
    setActiveConversationId('');
    setMessages([]);
    setStreamStatus(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setStreamStatus(null);
  };

  const handleSend = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    playEnter();
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const tempUserMsg: ChatMessageType = {
      message_id: `temp-${Date.now()}`,
      role: 'user',
      content,
      card_type: 'text',
      created_at: new Date().toISOString(),
    };

    const tempAssistantMsgId = `temp-assist-${Date.now()}`;
    const initialAssistantMsg: ChatMessageType = {
      message_id: tempAssistantMsgId,
      role: 'assistant',
      content: '',
      card_type: 'text',
      card_data: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg, initialAssistantMsg]);
    setLoading(true);
    setStreamStatus('Routing request...');
    setIsNearBottom(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeConversationId || undefined,
          content,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          let eventType = 'message';
          let dataStr = '';

          const lines = block.split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.substring(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.substring(6).trim();
            }
          }

          if (eventType === 'status') {
            try {
              const statusData = JSON.parse(dataStr);
              setStreamStatus(statusData.step || statusData.message || 'Thinking...');
            } catch {
              setStreamStatus(dataStr);
            }
          } else if (eventType === 'delta') {
            setStreamStatus(null);
            try {
              const parsedToken = JSON.parse(dataStr);
              setMessages((prev) =>
                prev.map((m) =>
                  m.message_id === tempAssistantMsgId
                    ? { ...m, content: m.content + parsedToken }
                    : m
                )
              );
            } catch {
              setMessages((prev) =>
                prev.map((m) =>
                  m.message_id === tempAssistantMsgId
                    ? { ...m, content: m.content + dataStr }
                    : m
                )
              );
            }
          } else if (eventType === 'card') {
            try {
              const cardPayload = JSON.parse(dataStr);
              setMessages((prev) =>
                prev.map((m) =>
                  m.message_id === tempAssistantMsgId
                    ? {
                        ...m,
                        card_type: cardPayload.card_type,
                        card_data: cardPayload.card_data,
                      }
                    : m
                )
              );
            } catch (err) {
              console.debug('Failed to parse card event', err);
            }
          } else if (eventType === 'title') {
            try {
              const titlePayload = JSON.parse(dataStr);
              if (titlePayload.title) {
                await loadConversations();
              }
            } catch {}
          } else if (eventType === 'done') {
            setStreamStatus(null);
            try {
              const donePayload = JSON.parse(dataStr);
              if (donePayload.session_id && !activeConversationId) {
                setActiveConversationId(donePayload.session_id);
              }
            } catch {}
          }
        }
      }

      playNotification();
      await loadConversations();
      await refreshEcosystem();
      bumpWorkspaceRevision();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.debug('Stream aborted by user');
      } else {
        playFailed();
        setMessages((prev) =>
          prev.map((m) =>
            m.message_id === tempAssistantMsgId
              ? {
                  ...m,
                  content:
                    m.content ||
                    'Unable to reach Cherry AI backend service. Please verify server connection.',
                }
              : m
          )
        );
      }
    } finally {
      setLoading(false);
      setStreamStatus(null);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  };

  const activeChat = conversations.find((c) => c.conversation_id === activeConversationId);
  const activeTitle = activeChat?.title || (messages.length > 0 ? 'Conversation' : 'New Chat');

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 select-text relative">
      {/* Drawer Top Header (only in drawer mode) */}
      {isDrawerMode && (
        <div className="h-12 px-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between shrink-0 bg-stone-50/50 dark:bg-[#181915]/50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-cherry-500/10 text-cherry-600 dark:text-cherry-300">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-xs font-bold text-stone-800 dark:text-stone-200 truncate">
              {activeTitle}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-1 px-3 py-1 text-2xs font-semibold rounded-full bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 transition"
              title="New Conversation"
            >
              <Plus className="h-3 w-3" />
              <span>New</span>
            </button>

            {onExpandToFullView && (
              <button
                type="button"
                onClick={onExpandToFullView}
                className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200/50 dark:hover:bg-stone-800 transition"
                title="Expand to Full View (/chat)"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition"
                title="Close Drawer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="max-w-md mx-auto py-6 space-y-4 animate-fade-in text-center">
            <div className="w-10 h-10 rounded-2xl bg-cherry-500/10 border border-cherry-500/20 mx-auto flex items-center justify-center p-2 shadow-2xs">
              <img
                src="/icons/cherry-icon.svg"
                alt="Cherry"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/cherry-icon.svg';
                }}
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h3 className="text-sm font-bold font-sans text-stone-900 dark:text-white">
                Cherry AI
              </h3>
              <p className="text-2xs text-stone-500 dark:text-stone-400 mt-0.5">
                Fast, structured task planning and Quarter management
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 text-left pt-1">
              {STARTER_PROMPTS.map((p, idx) => {
                const Icon = p.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(p.prompt)}
                    className="p-3 rounded-2xl bg-white/70 dark:bg-stone-900/50 border border-black/[0.06] dark:border-white/[0.08] hover:border-cherry-500/40 dark:hover:border-cherry-500/40 hover:bg-white dark:hover:bg-stone-900/80 transition text-left space-y-1 hover:scale-[1.01] shadow-2xs group"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-stone-900 dark:text-white group-hover:text-cherry-flesh transition-colors">
                      <Icon className="w-3.5 h-3.5 text-cherry-flesh shrink-0" />
                      <span>{p.title}</span>
                    </div>
                    <p className="text-2xs text-stone-500 dark:text-stone-400">
                      {p.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          messages.map((m, idx) => (
            <ChatMessage
              key={m.message_id || idx}
              message={m}
              onRefresh={refreshEcosystem}
            />
          ))
        )}

        {/* Subtle Inline Status Step Indicator */}
        {streamStatus && (
          <div className="flex items-center gap-2 py-1 px-3 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 text-2xs font-mono w-fit animate-pulse">
            <Loader2 className="h-3 w-3 animate-spin text-cherry-flesh" />
            <span>{streamStatus}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll To Bottom Floating Pill */}
      {showScrollBottom && messages.length > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-20 right-5 p-2 rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-lift hover:scale-105 transition z-10"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Input Composer */}
      <div className="p-3 sm:p-3.5 border-t border-black/5 dark:border-white/10 bg-white/70 dark:bg-[#141512]/70 backdrop-blur-md">
        <div className="flex items-end gap-2 p-1.5 rounded-2xl bg-stone-100 dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800 focus-within:ring-2 focus-within:ring-cherry-500">
          <textarea
            ref={textareaRef}
            data-chat-input="true"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="Ask Cherry to plan quarter, break down tasks, or chat..."
            rows={1}
            className="flex-1 bg-transparent px-3 py-1.5 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none resize-none max-h-36"
          />

          {loading ? (
            <button
              type="button"
              onClick={handleStop}
              className="p-2 rounded-xl bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:text-red-500 transition"
              title="Stop generation"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="p-2 rounded-xl bg-cherry-flesh hover:bg-cherry-700 text-white disabled:opacity-40 transition shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
