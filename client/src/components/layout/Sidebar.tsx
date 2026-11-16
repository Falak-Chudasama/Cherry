import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Plus,
  Trash2,
  Calendar,
  Key,
  Zap,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useEcosystem } from '../../context/EcosystemContext';
import { playScroll, playBack } from '../../lib/sound';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  mobileOnly?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  mobileOnly = false,
}) => {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    createConversation,
    deleteConversation,
    activeQuarterId,
    remainingKeys,
    junkPoints,
    isFocusActive,
    toggleFocus,
  } = useEcosystem();

  const navigate = useNavigate();

  const handleSelectChat = (id: string) => {
    playScroll();
    setActiveConversationId(id);
    navigate('/chat');
    if (mobileOpen) onCloseMobile();
  };

  const handleNewChat = async () => {
    try {
      await createConversation();
      navigate('/chat');
      if (mobileOpen) onCloseMobile();
    } catch (err) {
      console.error('Failed to create new chat', err);
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    playBack();
    await deleteConversation(id);
  };

  const renderContent = (collapsed: boolean) => (
    <div className="flex h-full flex-col justify-between overflow-hidden select-none">
      {/* Top Header & Brand */}
      <div className="p-3.5 pb-2 border-b border-black/5 dark:border-white/10">
        <div className="flex items-center justify-between gap-2 mb-3">
          {!collapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl glass-card p-1">
                <img src="/cherry-icon.svg" alt="Cherry" className="h-6 w-6 object-contain" />
              </div>
              <div>
                <span className="font-display text-sm font-extrabold text-stone-900 dark:text-stone-100 tracking-tight block leading-tight">
                  Cherry
                </span>
                <span className="text-3xs font-mono uppercase tracking-wider text-stone-400 block leading-tight">
                  Operating System
                </span>
              </div>
            </div>
          ) : (
            <div className="mx-auto">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl glass-card p-1">
                <img src="/cherry-icon.svg" alt="Cherry" className="h-6 w-6 object-contain" />
              </div>
            </div>
          )}

          {/* Collapse/Expand Toggle on Desktop */}
          <button
            type="button"
            onClick={() => {
              playBack();
              onToggleCollapse();
            }}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-black/5 dark:hover:bg-white/10 transition"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          {/* Close Button on Mobile */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* New Chat Button */}
        {!collapsed ? (
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
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-cherry-500 hover:bg-cherry-600 text-white transition shadow-none cursor-pointer"
            title="New Chat"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* Middle Section: Multi-Chat History List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {!collapsed && (
          <div className="px-2 py-1 flex items-center justify-between text-3xs font-mono uppercase tracking-wider text-stone-400 font-extrabold">
            <span>Conversations</span>
            <span className="text-stone-400">{conversations.length}</span>
          </div>
        )}

        {conversations.length === 0 ? (
          !collapsed && (
            <div className="py-8 text-center text-xs text-stone-400">
              No previous chats.
            </div>
          )
        ) : (
          conversations.map((conv) => {
            const isActive = conv.conversation_id === activeConversationId;
            return (
              <div
                key={conv.conversation_id}
                onClick={() => handleSelectChat(conv.conversation_id)}
                className={`group relative flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs transition cursor-pointer ${
                  isActive
                    ? 'bg-cherry-500/10 text-cherry-600 dark:text-cherry-300 font-bold border border-cherry-500/20'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-stone-900 dark:hover:text-stone-100 border border-transparent'
                } ${collapsed ? 'justify-center px-1' : ''}`}
                title={conv.title}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-xs font-medium">
                      {conv.title || 'Untitled Chat'}
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

      {/* Bottom Section: Compact Accountability Pulse */}
      <div className="p-3 border-t border-black/5 dark:border-white/10 bg-black/[0.015] dark:bg-white/[0.015]">
        {!collapsed ? (
          <div className="space-y-2.5">
            {/* Quarter & Keys Row */}
            <div className="flex items-center justify-between text-2xs">
              <button
                type="button"
                onClick={() => {
                  navigate('/quarter');
                  if (mobileOpen) onCloseMobile();
                }}
                className="flex items-center gap-1.5 font-semibold text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white"
              >
                <Calendar className="h-3.5 w-3.5 text-cherry-flesh" />
                <span className="font-mono">{activeQuarterId}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  navigate('/quarter');
                  if (mobileOpen) onCloseMobile();
                }}
                className="flex items-center gap-1 font-mono font-bold text-amber-600 dark:text-amber-400"
              >
                <Key className="h-3.5 w-3.5 text-amber-500" />
                <span>{remainingKeys}/3 QK</span>
              </button>
            </div>

            {/* Focus Shield Button */}
            <button
              type="button"
              onClick={toggleFocus}
              className={`w-full py-1.5 px-2.5 rounded-xl text-2xs font-bold transition flex items-center justify-between border ${
                isFocusActive
                  ? 'bg-cherry-500/15 border-cherry-500/30 text-cherry-600 dark:text-cherry-300'
                  : 'bg-black/5 dark:bg-white/5 border-transparent text-stone-600 dark:text-stone-300 hover:bg-black/10 dark:hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Zap className={`h-3 w-3 ${isFocusActive ? 'text-cherry-flesh' : 'text-stone-400'}`} />
                <span>{isFocusActive ? 'Shield Active' : 'Start Focus'}</span>
              </div>
              <span className="font-mono text-3xs font-semibold text-stone-400">
                {junkPoints}/50 JP
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={toggleFocus}
              className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                isFocusActive
                  ? 'bg-cherry-500 text-white'
                  : 'text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
              title={isFocusActive ? 'Shield Active - Click to stop' : 'Start Focus'}
            >
              <Zap className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Docked Sidebar (Only when not mobileOnly) */}
      {!mobileOnly && (
        <aside
          className={`fixed left-0 top-0 bottom-0 h-screen z-40 hidden md:flex flex-col border-r border-black/5 dark:border-white/10 bg-white/95 dark:bg-[#141512]/95 backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
            isCollapsed ? 'w-16' : 'w-64 lg:w-72'
          }`}
          aria-label="Multi-Chat Sessions Sidebar"
        >
          {renderContent(isCollapsed)}
        </aside>
      )}

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={onCloseMobile}
        />
      )}

      {/* Mobile Slide-Over Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-[#141512] shadow-2xl border-r border-black/10 dark:border-white/10 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Mobile Chats Drawer"
      >
        {renderContent(false)}
      </div>
    </>
  );
};