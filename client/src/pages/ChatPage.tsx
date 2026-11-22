import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Layers,
} from 'lucide-react';
import { useEcosystem } from '../context/EcosystemContext';
import { ChatStreamView } from '../components/chat/ChatStreamView';
import { playEnter, playScroll, playBack } from '../lib/sound';

function formatTime(dateStr?: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr.replace(' ', 'T'));
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export const ChatPage: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    deleteConversation,
    activeQuarterId,
    openPlanModal,
  } = useEcosystem();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleSelectChat = (id: string) => {
    playScroll();
    setActiveConversationId(id);
  };

  const handleNewChat = () => {
    playEnter();
    setActiveConversationId('');
  };

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    playBack();
    await deleteConversation(id);
  };

  const activeChat = conversations.find((c) => c.conversation_id === activeConversationId);
  const activeTitle = activeChat?.title || 'New Chat';

  return (
    <div className="w-full h-[calc(100vh-4rem)] sm:h-[calc(100vh-5rem)] flex overflow-hidden border-t border-stone-200/60 dark:border-stone-800/60 select-none">
      {/* Collapsible Left Sidebar */}
      <aside
        className={`h-full border-r border-stone-200/50 dark:border-stone-800/50 bg-white/60 dark:bg-[#141512]/60 backdrop-blur-md flex flex-col shrink-0 transition-all duration-200 ease-out z-20 ${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        }`}
        aria-label="Chat threads sidebar"
      >
        <div className="p-3 px-3.5 border-b border-stone-200/40 dark:border-stone-800/40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-2xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 font-sans">
              Chats
            </span>
            <span className="px-1.5 py-0.2 rounded-full text-3xs font-mono bg-stone-200/50 dark:bg-stone-800/80 text-stone-500 dark:text-stone-400">
              {conversations.length}
            </span>
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:opacity-90 active:scale-95 transition cursor-pointer"
            title="Start new conversation"
          >
            <Plus className="h-3 w-3 stroke-[2.5]" />
            <span>New</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {conversations.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-400 dark:text-stone-500">
              No previous chats.
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.conversation_id === activeConversationId;
              const formattedDate = formatTime(conv.updated_at);
              return (
                <div
                  key={conv.conversation_id}
                  onClick={() => handleSelectChat(conv.conversation_id)}
                  className={`group relative flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs transition duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-stone-200/80 dark:bg-stone-800/90 text-stone-900 dark:text-stone-100 font-semibold shadow-2xs'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/40 dark:hover:bg-stone-800/40 hover:text-stone-900 dark:hover:text-stone-100 font-normal'
                  }`}
                  title={conv.title}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-90" />
                    <span className="truncate">{conv.title || 'Untitled Chat'}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {formattedDate && (
                      <span className="text-3xs font-mono text-stone-400 dark:text-stone-500 group-hover:hidden whitespace-nowrap">
                        {formattedDate}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => handleDeleteChat(e, conv.conversation_id)}
                      className="hidden group-hover:flex items-center justify-center p-1 rounded-md text-stone-400 hover:text-rose-500 hover:bg-rose-500/10 transition"
                      title="Delete chat"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 px-3.5 border-t border-stone-200/40 dark:border-stone-800/40 flex items-center justify-between text-3xs text-stone-400 dark:text-stone-500 font-mono">
          <span>Quarter {activeQuarterId}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-cherry-flesh" />
            <span>2-Call GBNF</span>
          </span>
        </div>
      </aside>

      {/* Main Full-Page Chat Area */}
      <main className="flex-1 flex flex-col h-full bg-white/30 dark:bg-[#121310]/30 backdrop-blur-sm min-w-0 select-text relative">
        <div className="h-10 px-4 border-b border-stone-200/40 dark:border-stone-800/40 flex items-center justify-between shrink-0 bg-stone-50/20 dark:bg-[#121310]/20">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="p-1 rounded-lg text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition cursor-pointer"
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
            <h1 className="text-xs font-semibold text-stone-700 dark:text-stone-300 truncate font-sans">
              {activeTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openPlanModal({ period_id: activeQuarterId })}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-cherry-500/10 text-cherry-600 dark:text-cherry-300 border border-cherry-500/30 hover:bg-cherry-500/20 transition"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Plan Quarter</span>
            </button>
          </div>
        </div>

        {/* Reusable Chat Stream View */}
        <ChatStreamView isDrawerMode={false} />
      </main>
    </div>
  );
};
