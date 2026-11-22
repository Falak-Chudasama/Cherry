import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEcosystem } from '../../context/EcosystemContext';
import { ChatStreamView } from '../chat/ChatStreamView';
import { playScroll, playBack } from '../../lib/sound';

export const AiDrawer: React.FC = () => {
  const { isAiDrawerOpen, closeAiDrawer, aiDrawerPrefill } = useEcosystem();
  const navigate = useNavigate();
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isAiDrawerOpen) {
      setIsClosing(false);
    }
  }, [isAiDrawerOpen]);

  const handleAnimatedClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    playBack();
    setTimeout(() => {
      closeAiDrawer();
      setIsClosing(false);
    }, 280);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAiDrawerOpen && !isClosing) {
        handleAnimatedClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAiDrawerOpen, isClosing]);

  if (!isAiDrawerOpen && !isClosing) return null;

  const handleExpandToFullView = () => {
    closeAiDrawer();
    playScroll();
    navigate('/chat');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-xs transition-opacity duration-300 ${
          isClosing ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        onClick={handleAnimatedClose}
      />

      {/* Floating Rounded AI Drawer Modal with Apple-grade Smooth Slide Transitions */}
      <aside
        className={`fixed top-3 bottom-3 right-3 sm:top-4 sm:bottom-4 sm:right-4 z-50 w-[calc(100%-1.5rem)] sm:w-[420px] rounded-3xl bg-stone-50/95 dark:bg-[#181915]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl flex flex-col justify-between overflow-hidden ${
          isClosing
            ? 'transition-all duration-280 ease-[cubic-bezier(0.16,1,0.3,1)] translate-x-[calc(100%+2rem)] opacity-0 scale-95'
            : 'animate-drawer-in'
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
