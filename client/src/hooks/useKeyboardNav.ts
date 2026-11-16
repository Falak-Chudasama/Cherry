import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { playScroll, toggleSound } from '../lib/sound';
import { useTheme } from '../components/ui/ThemeProvider';

export const NAV_PAGES = [
  '/',
  '/chat',
  '/quarter',
  '/notes',
] as const;

export function normalizeNavPath(pathname: string): string {
  if (pathname === '/day') return '/';
  return pathname;
}

interface UseKeyboardNavOptions {
  onToggleShortcutsModal?: () => void;
  onFocusInput?: () => void;
}

/**
 * Global keyboard navigation hook for Cherry.
 */
export function useKeyboardNav(options?: UseKeyboardNavOptions) {
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // Handle Escape: blur active input or close modal
      if (e.key === 'Escape') {
        if (isEditingText) {
          (target as HTMLElement).blur();
        }
        return;
      }

      // Handle '?' or Shift+'?' for shortcuts modal
      if ((e.key === '?' || (e.shiftKey && e.key === '/')) && !isEditingText) {
        e.preventDefault();
        options?.onToggleShortcutsModal?.();
        return;
      }

      // Handle '/' to focus chat input
      if (e.key === '/' && !isEditingText) {
        e.preventDefault();
        options?.onFocusInput?.();
        const chatInput = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          'input[data-chat-input="true"], textarea[data-chat-input="true"], input[type="text"]'
        );
        if (chatInput) {
          chatInput.focus();
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

      // Handle number keys 1-4 for quick page jump
      if (['1', '2', '3', '4'].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditingText) {
        const pageIdx = parseInt(e.key, 10) - 1;
        const targetPage = NAV_PAGES[pageIdx];
        if (targetPage && targetPage !== location.pathname) {
          e.preventDefault();
          playScroll();
          navigate(targetPage);
        }
        return;
      }

      // Handle Ctrl+Arrow / Cmd+Arrow cycling
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const isRight = e.key === 'ArrowRight' || e.code === 'ArrowRight';
        const isLeft = e.key === 'ArrowLeft' || e.code === 'ArrowLeft';

        if (!isRight && !isLeft) return;

        e.preventDefault();
        const currentPath = normalizeNavPath(location.pathname);
        const currentIndex = NAV_PAGES.indexOf(currentPath as any);

        let nextIndex = 0;
        if (isRight) {
          nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % NAV_PAGES.length;
        } else if (isLeft) {
          nextIndex = currentIndex === -1 ? NAV_PAGES.length - 1 : (currentIndex - 1 + NAV_PAGES.length) % NAV_PAGES.length;
        }

        const targetPath = NAV_PAGES[nextIndex];
        if (targetPath && targetPath !== location.pathname) {
          playScroll();
          navigate(targetPath);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [location.pathname, navigate, toggleTheme, options]);
}
