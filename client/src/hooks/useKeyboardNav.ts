import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { playPageNav, toggleSound } from '../lib/sound';
import { useTheme } from '../components/ui/ThemeProvider';
import { useEcosystem } from '../context/EcosystemContext';
import { PRIMARY_NAV_PAGES, normalizeNavPath } from '../lib/routes';

interface UseKeyboardNavOptions {
  onToggleShortcutsModal?: () => void;
  isShortcutsOpen?: boolean;
}

/**
 * Global Keyboard Navigation Hook for Cherry.
 * Strictly adheres to Fruit Family Specification:
 * - 1-4: Primary tabs (Today, Quarter, Seasons, Notes)
 * - 5: Full Chat Workbench (/chat)
 * - Ctrl+Left / Ctrl+Right: Carousel cycle tabs
 * - / or Ctrl+K: Summon 420px AI Drawer from any page
 * - n: Quick Capture Modal (+ task / diet / violation)
 * - t: Toggle Theme
 * - m: Toggle Audio SFX
 * - ?: Show Keyboard Shortcuts Modal
 * - Esc: Close active modals/drawers or blur inputs
 */
export function useKeyboardNav(options?: UseKeyboardNavOptions) {
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();
  const {
    isAiDrawerOpen,
    openAiDrawer,
    closeAiDrawer,
    isTaskDrawerOpen,
    openTaskDrawer,
    closeTaskDrawer,
    isPlanModalOpen,
    closePlanModal,
    isQuickCaptureOpen,
    openQuickCapture,
    closeQuickCapture,
  } = useEcosystem();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // Handle Escape: Close topmost overlay or blur active input
      if (e.key === 'Escape') {
        if (isEditingText) {
          (target as HTMLElement).blur();
          return;
        }
        if (options?.isShortcutsOpen) {
          options.onToggleShortcutsModal?.();
          return;
        }
        if (isQuickCaptureOpen) {
          closeQuickCapture();
          return;
        }
        if (isTaskDrawerOpen) {
          closeTaskDrawer();
          return;
        }
        if (isPlanModalOpen) {
          closePlanModal();
          return;
        }
        if (isAiDrawerOpen) {
          closeAiDrawer();
          return;
        }
        return;
      }

      // Handle '?' for shortcuts modal
      if ((e.key === '?' || (e.shiftKey && e.key === '/')) && !isEditingText) {
        e.preventDefault();
        options?.onToggleShortcutsModal?.();
        return;
      }

      // Handle '/' or 'Ctrl+K' / 'Cmd+K' to toggle AI Drawer
      if ((e.key === '/' && !isEditingText) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (isAiDrawerOpen) {
          closeAiDrawer();
        } else {
          openAiDrawer();
        }
        return;
      }

      // Handle 'n' for Create Task in TaskDrawer
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditingText) {
        e.preventDefault();
        if (isTaskDrawerOpen) {
          closeTaskDrawer();
        } else {
          openTaskDrawer({ mode: 'create' });
        }
        return;
      }

      // Handle 't' for theme toggle
      if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditingText) {
        e.preventDefault();
        toggleTheme();
        return;
      }

      // Handle 'm' for sound toggle
      if (e.key === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditingText) {
        e.preventDefault();
        toggleSound();
        return;
      }

      // Handle number keys 1-4
      if (['1', '2', '3', '4'].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditingText) {
        const keyMap: Record<string, string> = {
          '1': '/',
          '2': '/quarter',
          '3': '/notes',
          '4': '/chat',
        };
        const targetPage = keyMap[e.key];
        if (targetPage && targetPage !== location.pathname) {
          e.preventDefault();
          playPageNav();
          navigate(targetPage);
        }
        return;
      }

      // Handle key 5 for full chat workbench
      if (e.key === '5' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditingText) {
        e.preventDefault();
        playPageNav();
        navigate('/chat');
        return;
      }

      // Handle Ctrl+Arrow / Cmd+Arrow cycling
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const isRight = e.key === 'ArrowRight' || e.code === 'ArrowRight';
        const isLeft = e.key === 'ArrowLeft' || e.code === 'ArrowLeft';

        if (!isRight && !isLeft) return;

        e.preventDefault();
        const currentPath = normalizeNavPath(location.pathname);
        const currentIndex = PRIMARY_NAV_PAGES.indexOf(currentPath as any);

        let nextIndex = 0;
        if (isRight) {
          nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % PRIMARY_NAV_PAGES.length;
        } else if (isLeft) {
          nextIndex = currentIndex === -1 ? PRIMARY_NAV_PAGES.length - 1 : (currentIndex - 1 + PRIMARY_NAV_PAGES.length) % PRIMARY_NAV_PAGES.length;
        }

        const targetPath = PRIMARY_NAV_PAGES[nextIndex];
        if (targetPath && targetPath !== location.pathname) {
          playPageNav();
          navigate(targetPath);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    location.pathname,
    navigate,
    toggleTheme,
    options,
    isAiDrawerOpen,
    isTaskDrawerOpen,
    isPlanModalOpen,
    isQuickCaptureOpen,
    openAiDrawer,
    closeAiDrawer,
    closeTaskDrawer,
    closePlanModal,
    openQuickCapture,
    closeQuickCapture,
  ]);
}
