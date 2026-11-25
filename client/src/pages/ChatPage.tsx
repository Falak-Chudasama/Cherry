import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Layers,
} from 'lucide-react';
import { useEcosystem } from '../context/EcosystemContext';
import { ChatStreamView } from '../components/chat/ChatStreamView';
import { playEnter, playScroll, playBack } from '../lib/sound';

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
    <div className="mx-auto max-w-6xl w-full h-[calc(100vh-4rem)] sm:h-[calc(100vh-5rem)] px-3 sm:px-4 pb-3 pt-1 flex gap-3 overflow-hidden select-none">
      {/* Collapsible Floating Glass Thread Rail */}
      <aside
        className={`h-full rounded-3xl glass-panel border border-black/[0.06] dark:border-white/[0.08] flex flex-col shrink-0 transition-all duration-200 ease-out overflow-hidden ${
          sidebarOpen ? 'w-60 opacity-100' : 'w-0 opacity-0 border-0'
        }`}
        aria-label="Chat threads"
      >
        <div className="p-3.5 pb-2.5 flex items-center justify-between gap-2 shrink-0">
          <span className="text-2xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 pl-1">
            Threads
          </span>

          <button
            type="button"
            onClick={handleNewChat}
            className="btn-interactive flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:opacity-90 cursor-pointer"
            title="New chat"
          >
            <Plus className="h-3 w-3 stroke-[2.5]" />
            <span>New</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {conversations.length === 0 ? (
            <div className="py-10 text-center text-2xs text-stone-400 dark:text-stone-500">
              No chats yet
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.conversation_id === activeConversationId;
              return (
                <div
                  key={conv.conversation_id}
                  onClick={() => handleSelectChat(conv.conversation_id)}
                  className={`group relative flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs transition duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-stone-900/[0.07] dark:bg-white/[0.10] text-stone-900 dark:text-white font-semibold'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-black/[0.03] dark:hover:bg-white/[0.05] hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                  title={conv.title}
                >
                  <span className="truncate flex-1">{conv.title || 'New Chat'}</span>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteChat(e, conv.conversation_id)}
                    className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded-md text-stone-400 hover:text-rose-500 hover:bg-rose-500/10 transition shrink-0"
                    title="Delete chat"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Minimal Chat Surface */}
      <main className="flex-1 flex flex-col h-full rounded-3xl glass-panel border border-black/[0.06] dark:border-white/[0.08] min-w-0 select-text relative overflow-hidden">
        {/* Lightweight Minimal Bar */}
        <div className="h-11 px-4 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="p-1.5 rounded-xl text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition cursor-pointer"
              title={sidebarOpen ? 'Hide threads' : 'Show threads'}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
            {activeConversationId && (
              <h1 className="text-xs font-semibold text-stone-700 dark:text-stone-300 truncate">
                {activeTitle}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={handleNewChat}
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-stone-700 dark:text-stone-300 hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition"
                title="New chat"
              >
                <Plus className="h-3 w-3" />
                <span>New</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => openPlanModal({ period_id: activeQuarterId })}
              className="flex items-center gap-1.5 px-2.5 py-1 text-2xs font-semibold rounded-full text-stone-500 dark:text-stone-400 hover:text-cherry-flesh dark:hover:text-cherry-blush hover:bg-cherry-500/10 transition"
              title="Open Quarter Plan Workbench"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Plan</span>
            </button>
          </div>
        </div>

        {/* Centered Editorial Chat Stream */}
        <ChatStreamView isDrawerMode={false} />
      </main>
    </div>
  );
};
