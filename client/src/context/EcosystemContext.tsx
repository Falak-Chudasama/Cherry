import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '../lib/api';
import { playNotification, playFailed, playEnter } from '../lib/sound';
import { ConversationSummary } from '../types';

interface EcosystemContextType {
  todayStr: string;
  activeQuarterId: string;
  remainingKeys: number;
  junkPoints: number;
  basketAvailable: boolean;
  lemonAvailable: boolean;
  isFocusActive: boolean;
  currentSessionId?: string;
  conversations: ConversationSummary[];
  activeConversationId: string;
  setActiveConversationId: (id: string) => void;
  loadConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  refreshEcosystem: () => Promise<void>;
  toggleFocus: () => Promise<void>;
}

const EcosystemContext = createContext<EcosystemContextType | null>(null);

export const useEcosystem = () => {
  const ctx = useContext(EcosystemContext);
  if (!ctx) throw new Error('useEcosystem must be used within EcosystemProvider');
  return ctx;
};

export const EcosystemProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [todayStr, setTodayStr] = useState<string>('2026-11-16');
  const [activeQuarterId, setActiveQuarterId] = useState<string>('2026-11-Q3');
  const [remainingKeys, setRemainingKeys] = useState<number>(3);
  const [junkPoints, setJunkPoints] = useState<number>(0);
  const [basketAvailable, setBasketAvailable] = useState<boolean>(true);
  const [lemonAvailable, setLemonAvailable] = useState<boolean>(true);
  const [isFocusActive, setIsFocusActive] = useState<boolean>(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    return localStorage.getItem('cherry_active_conversation_id') || '';
  });

  const loadConversations = async () => {
    try {
      const list = await api.listConversations();
      setConversations(list);
      if (list.length > 0) {
        const exists = list.some((c) => c.conversation_id === activeConversationId);
        if (!activeConversationId || !exists) {
          const firstId = list[0].conversation_id;
          setActiveConversationId(firstId);
          localStorage.setItem('cherry_active_conversation_id', firstId);
        }
      }
    } catch (err) {
      console.debug('Failed to load conversations', err);
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    localStorage.setItem('cherry_active_conversation_id', id);
  };

  const createConversation = async (title?: string): Promise<string> => {
    try {
      const conv = await api.createConversation(title);
      playEnter();
      await loadConversations();
      setActiveConversationId(conv.conversation_id);
      localStorage.setItem('cherry_active_conversation_id', conv.conversation_id);
      return conv.conversation_id;
    } catch (err) {
      playFailed();
      console.error('Failed to create conversation', err);
      throw err;
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await api.deleteConversation(id);
      playNotification();
      const updatedList = conversations.filter((c) => c.conversation_id !== id);
      setConversations(updatedList);
      if (activeConversationId === id) {
        const nextId = updatedList.length > 0 ? updatedList[0].conversation_id : '';
        setActiveConversationId(nextId);
        if (nextId) {
          localStorage.setItem('cherry_active_conversation_id', nextId);
        } else {
          localStorage.removeItem('cherry_active_conversation_id');
        }
      }
    } catch (err) {
      playFailed();
      console.error('Failed to delete conversation', err);
    }
  };

  const refreshEcosystem = async () => {
    try {
      const overview = await api.getOverview();
      if (overview.today) setTodayStr(overview.today);
      if (overview.active_quarter) {
        setActiveQuarterId(overview.active_quarter.quarter_id);
        setRemainingKeys(overview.active_quarter.remaining_keys ?? 3);
      }
      setBasketAvailable(overview.basket_available ?? false);
      setLemonAvailable(overview.lemon_available ?? false);

      const focusState = await api.getFocusStatus();
      setIsFocusActive(focusState.is_focus_active);
      setCurrentSessionId(focusState.current_session_id);

      const jp = await api.getDayJunkPoints(overview.today || '2026-11-16');
      setJunkPoints(jp.total_junk_points ?? 0);
    } catch (err) {
      console.debug('Ecosystem refresh failed', err);
    }
  };

  const toggleFocus = async () => {
    try {
      if (isFocusActive && currentSessionId) {
        await api.stopFocus(currentSessionId);
        playNotification();
      } else {
        await api.startFocus(todayStr, 60);
        playNotification();
      }
      await refreshEcosystem();
    } catch (err) {
      playFailed();
      console.error('Focus toggle failed', err);
    }
  };

  useEffect(() => {
    refreshEcosystem();
    loadConversations();
    const interval = setInterval(refreshEcosystem, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <EcosystemContext.Provider
      value={{
        todayStr,
        activeQuarterId,
        remainingKeys,
        junkPoints,
        basketAvailable,
        lemonAvailable,
        isFocusActive,
        currentSessionId,
        conversations,
        activeConversationId,
        setActiveConversationId: handleSelectConversation,
        loadConversations,
        createConversation,
        deleteConversation,
        refreshEcosystem,
        toggleFocus,
      }}
    >
      {children}
    </EcosystemContext.Provider>
  );
};
