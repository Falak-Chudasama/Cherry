import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Moon,
  Sun,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { useTheme } from '../ui/ThemeProvider';
import { useEcosystem } from '../../context/EcosystemContext';
import { playEnter, playPageNav } from '../../lib/sound';
import { NAV_ROUTES } from '../../lib/routes';

export function Header() {
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    activePeriodType,
    openAiDrawer,
  } = useEcosystem();

  const navContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pillStyle, setPillStyle] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    opacity: number;
  }>({ left: 0, top: 0, width: 0, height: 0, opacity: 0 });
  const [isReady, setIsReady] = useState(false);

  const primaryRoutes = NAV_ROUTES.filter((r) => !r.isSecondary);

  const updatePill = () => {
    const activeItem = primaryRoutes.find((item) => {
      if (item.to === '/') {
        return location.pathname === '/' || location.pathname === '/day';
      }
      return location.pathname === item.to;
    });

    const activeEl = activeItem ? itemRefs.current[activeItem.to] : null;
    if (activeEl && navContainerRef.current) {
      setPillStyle({
        left: activeEl.offsetLeft,
        top: activeEl.offsetTop,
        width: activeEl.offsetWidth,
        height: activeEl.offsetHeight,
        opacity: 1,
      });
    } else {
      setPillStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  };

  useEffect(() => {
    updatePill();
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 50);
    window.addEventListener('resize', updatePill);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePill);
    };
  }, [location.pathname]);

  return (
    <>
      {/* Desktop Floating Navigation Capsule */}
      <header className="fixed top-4 inset-x-0 z-40 mx-auto hidden w-full max-w-4xl px-4 sm:block pointer-events-none">
        <div className="glass-capsule pointer-events-auto flex items-center justify-between gap-3 rounded-full px-5 py-2.5 shadow-floating transition-colors duration-200">
          {/* Brand Wordmark & Logo */}
          <Link
            to="/"
            onClick={() => playPageNav()}
            className="focus-ring flex items-center gap-2.5 rounded-full pr-1 transition hover:opacity-90 shrink-0"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full glass-card p-1 shadow-2xs">
              <img
                src="/icons/cherry-icon.svg"
                alt="Cherry"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/cherry-icon.svg';
                }}
                className="h-6 w-6 object-contain"
              />
            </div>
            <span className="font-display text-base font-extrabold text-stone-900 dark:text-white tracking-tight">
              Cherry
            </span>
          </Link>

          {/* Minimalist Segmented Navigation Pill Bar (Today | Quarter/Surplus) */}
          <nav className="flex items-center gap-1 shrink-0" aria-label="Primary Desktop Navigation">
            <div
              ref={navContainerRef}
              className="relative flex items-center gap-1 p-1 rounded-full bg-transparent border border-black/[0.06] dark:border-white/[0.08]"
            >
              {/* Dynamic Sliding Active Indicator Pill */}
              <div
                className={`absolute top-0 left-0 rounded-full bg-stone-900 dark:bg-stone-100 shadow-xs pointer-events-none ${
                  isReady ? 'transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]' : ''
                }`}
                style={{
                  transform: `translate3d(${pillStyle.left}px, ${pillStyle.top}px, 0)`,
                  width: `${pillStyle.width}px`,
                  height: `${pillStyle.height}px`,
                  opacity: pillStyle.opacity,
                  willChange: 'transform, width',
                }}
                aria-hidden="true"
              />

              {primaryRoutes.map(({ to, label, icon: Icon }) => {
                const displayLabel =
                  to === '/quarter' && activePeriodType === 'SURPLUS' ? 'Surplus' : label;

                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={(e) => {
                      playPageNav();
                      if (to === '/quarter' && location.search) {
                        e.preventDefault();
                        navigate('/quarter');
                      }
                    }}
                    ref={(el) => {
                      itemRefs.current[to] = el;
                    }}
                    className={({ isActive }) =>
                      `relative z-10 focus-ring flex items-center gap-2 rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors duration-200 ${
                        isActive
                          ? 'text-white dark:text-stone-900'
                          : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{displayLabel}</span>
                  </NavLink>
                );
              })}
            </div>
          </nav>

          {/* Global Utility Cluster: Basket Notes, + New Task, Ask AI, Theme Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Basket Notes & Commands Utility Link */}
            <NavLink
              to="/notes"
              onClick={() => playPageNav()}
              title="Basket Notes & Commands"
              className={({ isActive }) =>
                `focus-ring flex h-8 w-8 items-center justify-center rounded-full transition ${
                  isActive
                    ? 'bg-stone-200 dark:bg-stone-800 text-stone-900 dark:text-white'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/60'
                }`
              }
            >
              <BookOpen className="h-4 w-4" />
            </NavLink>

            {/* Ask AI Button */}
            <button
              type="button"
              onClick={() => {
                playEnter();
                openAiDrawer();
              }}
              className="focus-ring flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-medium border border-stone-200 dark:border-stone-700 transition"
              title="Ask Cherry AI (/ or Ctrl+K)"
            >
              <Sparkles className="h-3.5 w-3.5 text-cherry-flesh dark:text-cherry-blush" />
              <span>AI</span>
            </button>

            <div className="h-4 w-px bg-stone-200 dark:bg-stone-700 mx-0.5" aria-hidden="true" />

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-cherry-flesh transition-transform duration-200 hover:rotate-45" />
              ) : (
                <Moon className="h-4 w-4 text-cherry-flesh transition-transform duration-200 hover:-rotate-12" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Sticky Top Header */}
      <header className="sticky top-0 z-40 flex w-full items-center justify-between border-b border-black/5 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-[#121310]/80 sm:hidden">
        <Link
          to="/"
          onClick={() => playPageNav()}
          className="flex items-center gap-2"
        >
          <img
            src="/icons/cherry-icon.svg"
            alt="Cherry"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/cherry-icon.svg';
            }}
            className="h-6 w-6 object-contain"
          />
          <span className="font-display text-sm font-bold text-stone-900 dark:text-white">
            Cherry
          </span>
        </Link>

        {/* Mobile Navigation Pills */}
        <div className="flex items-center gap-1">
          {primaryRoutes.map(({ to, label }) => {
            const displayLabel =
              to === '/quarter' && activePeriodType === 'SURPLUS' ? 'Surplus' : label;
            return (
              <NavLink
                key={to}
                to={to}
                onClick={() => playPageNav()}
                className={({ isActive }) =>
                  `px-3 py-1 rounded-full text-xs font-semibold transition ${
                    isActive
                      ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                      : 'text-stone-600 dark:text-stone-400'
                  }`
                }
              >
                {displayLabel}
              </NavLink>
            );
          })}
        </div>

        {/* Mobile Utility Icons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              playEnter();
              openAiDrawer();
            }}
            className="p-1.5 rounded-full text-stone-600 dark:text-stone-300"
            aria-label="Ask AI"
          >
            <Sparkles className="h-4 w-4 text-cherry-flesh" />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-full text-stone-600 dark:text-stone-300"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-4 w-4 text-cherry-flesh" /> : <Moon className="h-4 w-4 text-cherry-flesh" />}
          </button>
        </div>
      </header>
    </>
  );
}
