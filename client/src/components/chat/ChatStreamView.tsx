import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowUp,
  Plus,
  Square,
  Sparkles,
  ArrowDown,
  Maximize2,
  X,
  Layers,
  Flame,
  ListChecks,
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
    label: 'Add Must & Should tasks for today',
    prompt: 'Add 2 tasks for today: first should be Must do and second should be Should do.',
    icon: Sparkles,
  },
  {
    label: 'What tasks do I have today?',
    prompt: 'What tasks do I have right now?',
    icon: ListChecks,
  },
  {
    label: 'Draft next 7-day Quarter plan',
    prompt: 'Plan the upcoming Quarter with core deliverables and subtasks.',
    icon: Layers,
  },
  {
    label: 'Start a 60m focus session',
    prompt: 'Start a 60 min focus session',
    icon: Flame,
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
  const skipNextFetchRef = useRef<string | null>(null);

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
    const near = distanceToBottom < 90;
    setIsNearBottom(near);
    setShowScrollBottom(!near);
  };

  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom(false);
    }
  }, [messages, isNearBottom, scrollToBottom]);

  // Load active conversation messages when user switches threads
  useEffect(() => {
    let isMounted = true;
    if (activeConversationId) {
      if (skipNextFetchRef.current === activeConversationId) {
        skipNextFetchRef.current = null;
        return;
      }
      api
        .getConversationById(activeConversationId)
        .then((doc) => {
          if (isMounted) {
            setMessages(doc.messages || []);
            setTimeout(() => scrollToBottom(false), 40);
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
      textareaRef.current?.focus();
    }
  }, [prefillPrompt]);

  const handleNewChat = () => {
    playEnter();
    skipNextFetchRef.current = null;
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
      card_data: null,
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
    setStreamStatus('Thinking...');
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
          let dataLines: string[] = [];

          const lines = block.split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataLines.push(line.slice(6));
            }
          }
          const dataStr = dataLines.join('\n');

          if (eventType === 'status') {
            try {
              const statusData = JSON.parse(dataStr);
              setStreamStatus(statusData.step || statusData.message || 'Thinking...');
            } catch {
              setStreamStatus(dataStr);
            }
          } else if (eventType === 'delta') {
            setStreamStatus(null);
            let token = dataStr;
            try {
              token = JSON.parse(dataStr);
            } catch {
              // Keep raw fallback
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.message_id === tempAssistantMsgId
                  ? { ...m, content: m.content + token }
                  : m
              )
            );
          } else if (eventType === 'card') {
            try {
              const cardPayload = JSON.parse(dataStr);
              setMessages((prev) =>
                prev.map((m) =>
                  m.message_id === tempAssistantMsgId
                    ? {
                        ...m,
                        message_id: cardPayload.message_id || m.message_id,
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
              if (donePayload.message_id) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.message_id === tempAssistantMsgId
                      ? { ...m, message_id: donePayload.message_id }
                      : m
                  )
                );
              }
              if (donePayload.session_id && !activeConversationId) {
                skipNextFetchRef.current = donePayload.session_id;
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
                  content: m.content || 'Unable to reach Cherry backend.',
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
  const activeTitle = activeChat?.title || 'Cherry';

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 select-text relative">
      {/* Minimal Floating Drawer Bar */}
      {isDrawerMode && (
        <div className="h-12 px-4 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/icons/cherry-icon.svg"
              alt="Cherry"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/cherry-icon.svg';
              }}
              className="h-4 w-4 object-contain shrink-0"
            />
            <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 truncate">
              {activeConversationId ? activeTitle : 'Cherry'}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold rounded-full bg-black/[0.04] hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.12] text-stone-700 dark:text-stone-300 transition"
              title="New chat"
            >
              <Plus className="h-3 w-3" />
              <span>New</span>
            </button>

            {onExpandToFullView && (
              <button
                type="button"
                onClick={onExpandToFullView}
                className="p-1.5 rounded-full text-stone-400 hover:text-stone-900 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition"
                title="Open full view"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Centered Editorial Message Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        <div
          className={`mx-auto w-full min-h-full flex flex-col ${
            isDrawerMode ? 'px-4 pt-2 pb-28' : 'max-w-3xl px-4 sm:px-6 pt-2 pb-32'
          }`}
        >
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 space-y-6 animate-fade-in">
              <div className="flex flex-col items-center gap-2.5 text-center">
                <img
                  src="/icons/cherry-icon.svg"
                  alt="Cherry"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/cherry-icon.svg';
                  }}
                  className="w-8 h-8 object-contain"
                />
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-100">
                  What are we working on?
                </h2>
              </div>

              <div
                className={`grid gap-2 w-full ${
                  isDrawerMode ? 'grid-cols-1 max-w-sm' : 'grid-cols-1 sm:grid-cols-2 max-w-xl'
                }`}
              >
                {STARTER_PROMPTS.map((p, idx) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSend(p.prompt)}
                      className="btn-interactive flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl glass-card border border-black/[0.06] dark:border-white/[0.08] hover:border-cherry-500/35 text-left text-xs font-medium text-stone-700 dark:text-stone-300 hover:text-stone-950 dark:hover:text-white group"
                    >
                      <Icon className="w-3.5 h-3.5 text-cherry-flesh shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" />
                      <span className="truncate">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-5 pt-2">
              {messages.map((m, idx) => {
                const isLastAssistant =
                  m.role === 'assistant' && idx === messages.length - 1;
                return (
                  <ChatMessage
                    key={m.message_id || idx}
                    message={m}
                    isStreaming={loading && isLastAssistant}
                    streamStatus={isLastAssistant ? streamStatus : null}
                    onRefresh={refreshEcosystem}
                  />
                );
              })}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Centered Frosted Scroll-to-Bottom Pill */}
      {showScrollBottom && messages.length > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="glass-capsule absolute bottom-20 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full flex items-center justify-center text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:scale-105 transition z-20 animate-scale-in"
          title="Jump to latest"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Floating Glass Input Dock */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 pt-8 ${
          isDrawerMode
            ? 'px-3 pb-3 bg-gradient-to-t from-[#FAF6F6] via-[#FAF6F6]/85 to-transparent dark:from-[#161714] dark:via-[#161714]/85'
            : 'px-3 sm:px-6 pb-4 bg-gradient-to-t from-[#FAF6F6]/95 via-[#FAF6F6]/75 to-transparent dark:from-[#141212]/95 dark:via-[#141212]/75'
        }`}
      >
        <div
          className={`pointer-events-auto mx-auto w-full ${
            isDrawerMode ? '' : 'max-w-3xl'
          } flex items-end gap-2 px-3.5 py-2 rounded-[22px] bg-white/80 dark:bg-[#1E1F1B]/85 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.10] shadow-floating focus-within:border-cherry-500/45 transition-all duration-200`}
        >
          <textarea
            ref={textareaRef}
            data-chat-input="true"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="Message Cherry..."
            rows={1}
            className="flex-1 bg-transparent py-1 text-[13px] sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none resize-none max-h-36 leading-relaxed"
          />

          {loading ? (
            <button
              type="button"
              onClick={handleStop}
              className="h-8 w-8 rounded-full flex items-center justify-center bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:opacity-85 active:scale-95 transition shrink-0"
              title="Stop"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="h-8 w-8 rounded-full flex items-center justify-center bg-cherry-flesh hover:bg-cherry-600 text-white disabled:bg-stone-200 dark:disabled:bg-stone-800 disabled:text-stone-400 dark:disabled:text-stone-600 transition-all duration-150 hover:scale-105 active:scale-95 shrink-0"
              title="Send"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.25]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
