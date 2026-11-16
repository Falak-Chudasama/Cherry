import { useState, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/ui/ToastProvider';
import { ThemeProvider } from './components/ui/ThemeProvider';
import { EcosystemProvider } from './context/EcosystemContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { DirectionalPageTransition } from './components/layout/DirectionalPageTransition';
import { KeyboardShortcutsModal } from './components/ui/KeyboardShortcutsModal';
import { useKeyboardNav } from './hooks/useKeyboardNav';

import { DayPage } from './pages/DayPage';
import { ChatPage } from './pages/ChatPage';
import { QuarterPage } from './pages/QuarterPage';
import { NotesPage } from './pages/NotesPage';

function LoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 dark:border-stone-700 border-t-cherry-flesh dark:border-t-cherry-blush" />
    </div>
  );
}

function MainAppLayout() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Bind global keyboard navigation (Ctrl+Arrows, 1-4, /, t, m, ?, Esc)
  useKeyboardNav({
    onToggleShortcutsModal: () => setShortcutsOpen((prev) => !prev),
  });

  return (
    <div className="relative min-h-screen bg-[#F8F9F5] dark:bg-[#121310] text-stone-900 dark:text-stone-100 font-sans transition-colors duration-200 overflow-x-hidden">
      {/* Ambient light fields to enable subtle glass refraction matching Cherry palette */}
      <div className="pointer-events-none fixed top-10 -left-32 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-cherry-500/[0.06] to-transparent blur-[120px] dark:from-cherry-flesh/[0.08]" />
      <div className="pointer-events-none fixed top-1/3 -right-32 h-[500px] w-[500px] rounded-full bg-gradient-to-bl from-cherry-leaf/[0.05] to-transparent blur-[120px] dark:from-cherry-leaf/[0.06]" />
      <div className="pointer-events-none fixed -bottom-32 left-1/4 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-cherry-700/[0.04] to-transparent blur-[130px] dark:from-cherry-900/[0.05]" />

      <div className="relative z-10 pt-20 sm:pt-24">
        <Header
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />
        {/* Mobile Slide-Over Drawer */}
        <Sidebar
          isCollapsed={false}
          onToggleCollapse={() => {}}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          mobileOnly={true}
        />
        <div className="min-h-[calc(100vh-6rem)]">
          <Suspense fallback={<LoadingFallback />}>
            <DirectionalPageTransition>
              <Routes>
                <Route path="/" element={<DayPage />} />
                <Route path="/day" element={<Navigate to="/" replace />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/quarter" element={<QuarterPage />} />
                <Route path="/notes" element={<NotesPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </DirectionalPageTransition>
          </Suspense>
        </div>
      </div>

      <KeyboardShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <EcosystemProvider>
          <BrowserRouter>
            <MainAppLayout />
          </BrowserRouter>
        </EcosystemProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export { App };
