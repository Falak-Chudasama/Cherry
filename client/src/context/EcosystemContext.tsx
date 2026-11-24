import React, { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { api } from '../lib/api';
import { playNotification, playFailed, playEnter } from '../lib/sound';
import { ConversationSummary, PeriodType, FocusState, Task } from '../types';

export interface TaskDrawerData {
  task?: any;
  title?: string;
  description?: string;
  tier?: string;
  priority?: string;
  subtasks?: any[];
  period_id?: string;
  period_type?: PeriodType;
  mode?: 'create' | 'edit';
}

export interface PlanModalData {
  period_id?: string;
  period_type?: PeriodType;
  initialDraft?: any;
}

export type QuickCaptureTab = 'task' | 'diet' | 'violation';

interface EcosystemContextType {
  todayStr: string;
  activeQuarterId: string;
  activePeriodType: PeriodType;
  junkPoints: number;
  basketAvailable: boolean;
  lemonAvailable: boolean;
  isFocusActive: boolean;
  currentSessionId?: string;
  focusState: FocusState;
  conversations: ConversationSummary[];
  activeConversationId: string;
  setActiveConversationId: (id: string) => void;
  loadConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  refreshEcosystem: () => Promise<void>;
  toggleFocus: () => Promise<void>;
  toggleLemonDns: (enable?: boolean) => Promise<boolean>;
  completeFocusSession: () => Promise<void>;

  // Preloaded Data Cache for instant page switches
  cachedDayTasks: Task[];
  setCachedDayTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  cachedPeriodTasks: Task[];
  setCachedPeriodTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  cachedRoutines: any[];
  isDataPreloaded: boolean;
  preloadData: (tStr?: string, qId?: string) => Promise<void>;

  // Global Workspace Invalidation Revision
  workspaceRevision: number;
  bumpWorkspaceRevision: () => void;

  // AI Side Drawer (420px slide-over)
  isAiDrawerOpen: boolean;
  aiDrawerPrefill?: string;
  openAiDrawer: (prefill?: string) => void;
  closeAiDrawer: () => void;

  // Task Drawer (480px slide-over for Create / Edit task)
  isTaskDrawerOpen: boolean;
  taskDrawerData?: TaskDrawerData | null;
  openTaskDrawer: (data?: TaskDrawerData | any) => void;
  closeTaskDrawer: () => void;

  // Plan Workbench Modal (max-w-5xl wide modal for 7-day Quarter Plan)
  isPlanModalOpen: boolean;
  planModalData?: PlanModalData | null;
  openPlanModal: (data?: PlanModalData | any) => void;
  closePlanModal: () => void;

  // Quick Capture Modal (n shortcut)
  isQuickCaptureOpen: boolean;
  quickCaptureTab: QuickCaptureTab;
  openQuickCapture: (tab?: QuickCaptureTab) => void;
  closeQuickCapture: () => void;

  // Backward-compatible Composer Modal shim
  isComposerOpen: boolean;
  composerMode: 'task' | 'plan';
  composerData: any;
  openComposer: (mode: 'task' | 'plan', data?: any) => void;
  closeComposer: () => void;
}

const EcosystemContext = createContext<EcosystemContextType | null>(null);

export const useEcosystem = () => {
  const ctx = useContext(EcosystemContext);
  if (!ctx) throw new Error('useEcosystem must be used within EcosystemProvider');
  return ctx;
};

export const EcosystemProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [todayStr, setTodayStr] = useState<string>('2026-11-22');
  const [activeQuarterId, setActiveQuarterId] = useState<string>('2026-11-Q4');
  const [activePeriodType, setActivePeriodType] = useState<PeriodType>('Q4');
  const [junkPoints, setJunkPoints] = useState<number>(0);
  const [basketAvailable, setBasketAvailable] = useState<boolean>(true);
  const [lemonAvailable, setLemonAvailable] = useState<boolean>(true);
  const [isFocusActive, setIsFocusActive] = useState<boolean>(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [focusState, setFocusState] = useState<FocusState>({ is_focus_active: false });
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    return localStorage.getItem('cherry_active_conversation_id') || '';
  });

  // Preloaded Data Caching (stale-while-revalidate)
  const [cachedDayTasks, setCachedDayTasks] = useState<Task[]>([]);
  const [cachedPeriodTasks, setCachedPeriodTasks] = useState<Task[]>([]);
  const [cachedRoutines, setCachedRoutines] = useState<any[]>([]);
  const [isDataPreloaded, setIsDataPreloaded] = useState<boolean>(false);

  // Global Workspace Invalidation
  const [workspaceRevision, setWorkspaceRevision] = useState<number>(0);
  const bumpWorkspaceRevision = () => {
    setWorkspaceRevision((prev) => prev + 1);
  };

  const preloadData = async (tStr?: string, qId?: string) => {
    const targetDate = tStr || todayStr;
    const targetQuarter = qId || activeQuarterId;
    try {
      const [dayData, periodData] = await Promise.allSettled([
        api.getDayTasks(targetDate),
        api.getPeriodTasks(targetQuarter),
      ]);
      if (dayData.status === 'fulfilled') {
        setCachedDayTasks(dayData.value.tasks || []);
        setCachedRoutines(dayData.value.routines || []);
      }
      if (periodData.status === 'fulfilled') {
        setCachedPeriodTasks(periodData.value || []);
      }
      setIsDataPreloaded(true);
    } catch (err) {
      console.debug('Failed to preload client data', err);
    }
  };

  // Eagerly preload data on mount and whenever revision changes
  useEffect(() => {
    preloadData(todayStr, activeQuarterId);
  }, [todayStr, activeQuarterId, workspaceRevision]);

  // AI Drawer State (420px slide-over)
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [aiDrawerPrefill, setAiDrawerPrefill] = useState<string | undefined>(undefined);

  const openAiDrawer = (prefill?: string) => {
    // Ensure only one right-side drawer occupies the screen
    setIsTaskDrawerOpen(false);
    setAiDrawerPrefill(prefill);
    setIsAiDrawerOpen(true);
  };

  const closeAiDrawer = () => {
    setIsAiDrawerOpen(false);
    setAiDrawerPrefill(undefined);
  };

  // Task Drawer State (480px slide-over for Task Create / Edit)
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState<boolean>(false);
  const [taskDrawerData, setTaskDrawerData] = useState<TaskDrawerData | null>(null);

  const openTaskDrawer = (data?: TaskDrawerData | any) => {
    // Ensure only one right-side drawer occupies the screen
    setIsAiDrawerOpen(false);
    if (data && 'task_id' in data) {
      setTaskDrawerData({ task: data, mode: 'edit', period_id: data.period_id || activeQuarterId });
    } else {
      setTaskDrawerData(data || { mode: 'create', period_id: activeQuarterId });
    }
    setIsTaskDrawerOpen(true);
  };

  const closeTaskDrawer = () => {
    setIsTaskDrawerOpen(false);
    setTaskDrawerData(null);
  };

  // Plan Workbench Modal State
  const [isPlanModalOpen, setIsPlanModalOpen] = useState<boolean>(false);
  const [planModalData, setPlanModalData] = useState<PlanModalData | null>(null);

  const openPlanModal = (data?: PlanModalData | any) => {
    setPlanModalData(data || { period_id: activeQuarterId, period_type: activePeriodType });
    setIsPlanModalOpen(true);
  };

  const closePlanModal = () => {
    setIsPlanModalOpen(false);
    setPlanModalData(null);
  };

  // Quick Capture Modal State
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState<boolean>(false);
  const [quickCaptureTab, setQuickCaptureTab] = useState<QuickCaptureTab>('task');

  const openQuickCapture = (tab?: QuickCaptureTab) => {
    setQuickCaptureTab(tab || 'task');
    setIsQuickCaptureOpen(true);
  };

  const closeQuickCapture = () => {
    setIsQuickCaptureOpen(false);
  };

  // Backward compatibility shim
  const openComposer = (mode: 'task' | 'plan', data?: any) => {
    if (mode === 'plan') {
      openPlanModal(data);
    } else {
      openTaskDrawer(data);
    }
  };

  const closeComposer = () => {
    closeTaskDrawer();
    closePlanModal();
  };

  const isComposerOpen = isTaskDrawerOpen || isPlanModalOpen;
  const composerMode = isPlanModalOpen ? 'plan' : 'task';
  const composerData = isPlanModalOpen ? planModalData : taskDrawerData;

  const loadConversations = async () => {
    try {
      const list = await api.listConversations();
      setConversations(list);
    } catch (err) {
      console.debug('Failed to load conversations', err);
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    if (id) {
      localStorage.setItem('cherry_active_conversation_id', id);
    } else {
      localStorage.removeItem('cherry_active_conversation_id');
    }
  };

  const createConversation = async (title?: string): Promise<string> => {
    try {
      const conv = await api.createConversation(title);
      playEnter();
      await loadConversations();
      const newId = conv.conversation_id || conv.session_id;
      setActiveConversationId(newId);
      localStorage.setItem('cherry_active_conversation_id', newId);
      return newId;
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
        handleSelectConversation(nextId);
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
        const qid = overview.active_quarter.quarter_id;
        setActiveQuarterId(qid);
        if (qid.includes('SURPLUS')) {
          setActivePeriodType('SURPLUS');
        } else if (qid.includes('Q4')) {
          setActivePeriodType('Q4');
        } else if (qid.includes('Q3')) {
          setActivePeriodType('Q3');
        } else if (qid.includes('Q2')) {
          setActivePeriodType('Q2');
        } else {
          setActivePeriodType('Q1');
        }
      }
      setBasketAvailable(overview.basket_available ?? false);
      setLemonAvailable(overview.lemon_available ?? false);

      const fState = await api.getFocusStatus();
      setFocusState(fState);
      setIsFocusActive(fState.is_focus_active);
      setCurrentSessionId(fState.current_session_id);

      const jp = await api.getDayJunkPoints(overview.today || '2026-11-22');
      setJunkPoints(jp.accumulated_jp ?? 0);
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
      bumpWorkspaceRevision();
    } catch (err) {
      playFailed();
      console.error('Focus toggle failed', err);
    }
  };

  const completeFocusSession = async () => {
    if (!currentSessionId) return;
    try {
      await api.completeFocus(currentSessionId);
      playNotification();
      await refreshEcosystem();
      bumpWorkspaceRevision();
    } catch (err) {
      playFailed();
      console.error('Complete focus failed', err);
    }
  };

  const toggleLemonDns = async (enable?: boolean): Promise<boolean> => {
    try {
      const res = await api.toggleLemonDns(enable);
      await refreshEcosystem();
      return res.success;
    } catch (err) {
      console.error('Lemon DNS toggle failed', err);
      return false;
    }
  };

  const lastRefreshTime = useRef<number>(Date.now());
  useEffect(() => {
    refreshEcosystem();
    loadConversations();

    const handleFocus = () => {
      if (Date.now() - lastRefreshTime.current > 30000) {
        lastRefreshTime.current = Date.now();
        refreshEcosystem();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [workspaceRevision]);

  // Scoped poller while active Focus session is running
  useEffect(() => {
    if (!isFocusActive) return;
    const interval = setInterval(() => {
      api.getFocusStatus().then((s) => {
        setIsFocusActive(s.is_focus_active);
        setCurrentSessionId(s.current_session_id);
      }).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [isFocusActive]);

  return (
    <EcosystemContext.Provider
      value={{
        todayStr,
        activeQuarterId,
        activePeriodType,
        junkPoints,
        basketAvailable,
        lemonAvailable,
        isFocusActive,
        currentSessionId,
        focusState,
        conversations,
        activeConversationId,
        setActiveConversationId: handleSelectConversation,
        loadConversations,
        createConversation,
        deleteConversation,
        refreshEcosystem,
        toggleFocus,
        toggleLemonDns,
        completeFocusSession,
        cachedDayTasks,
        setCachedDayTasks,
        cachedPeriodTasks,
        setCachedPeriodTasks,
        cachedRoutines,
        isDataPreloaded,
        preloadData,
        workspaceRevision,
        bumpWorkspaceRevision,
        isAiDrawerOpen,
        aiDrawerPrefill,
        openAiDrawer,
        closeAiDrawer,
        isTaskDrawerOpen,
        taskDrawerData,
        openTaskDrawer,
        closeTaskDrawer,
        isPlanModalOpen,
        planModalData,
        openPlanModal,
        closePlanModal,
        isQuickCaptureOpen,
        quickCaptureTab,
        openQuickCapture,
        closeQuickCapture,
        isComposerOpen,
        composerMode,
        composerData,
        openComposer,
        closeComposer,
      }}
    >
      {children}
    </EcosystemContext.Provider>
  );
};
