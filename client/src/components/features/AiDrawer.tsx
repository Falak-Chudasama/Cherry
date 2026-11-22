import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEcosystem } from '../../context/EcosystemContext';
import { ChatStreamView } from '../chat/ChatStreamView';
import { playScroll, playBack } from '../../lib/sound';

export const AiDrawer: React.FC = () => {
  const { isAiDrawerOpen, closeAiDrawer, aiDrawerPrefill } = useEcosystem();
  const navigate = useNavigate();
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isAiDrawerOpen) {
      setShouldRender(true);
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => {
          setIsVisible(true);
        });
        return () => cancelAnimationFrame(r2);
      });
      return () => cancelAnimationFrame(r1);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 320);
      return () => clearTimeout(timer);
    }
  }, [isAiDrawerOpen]);

  const handleAnimatedClose = () => {
    if (!isVisible) return;
    playBack();
    setIsVisible(false);
    setTimeout(() => {
      closeAiDrawer();
    }, 280);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        handleAnimatedClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVisible]);

  if (!shouldRender) return null;

  const handleExpandToFullView = () => {
    closeAiDrawer();
    playScroll();
    navigate('/chat');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-xs transition-opacity duration-300 ease-out ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleAnimatedClose}
      />

      {/* Floating Rounded AI Drawer Modal with Apple-grade Smooth Slide Transitions */}
      <aside
        className={`fixed top-3 bottom-3 right-3 sm:top-4 sm:bottom-4 sm:right-4 z-50 w-[calc(100%-1.5rem)] sm:w-[420px] rounded-3xl bg-stone-50/95 dark:bg-[#181915]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl flex flex-col justify-between overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform will-change-transform ${
          isVisible
            ? 'translate-x-0 opacity-100 scale-100 pointer-events-auto'
            : 'translate-x-[calc(100%+3rem)] opacity-0 scale-[0.98] pointer-events-none'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="AI Assistant Drawer"
      >
        <ChatStreamView
          isDrawerMode
          onExpandToFullView={handleExpandToFullView}
          onClose={handleAnimatedClose}
          prefillPrompt={aiDrawerPrefill}
        />
      </aside>
    </>
  );
};
