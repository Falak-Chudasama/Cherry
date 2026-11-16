import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  MessageSquare,
  CalendarCheck2,
  ShieldCheck,
  BookOpen,
  Moon,
  Sun,
} from 'lucide-react';
import { useTheme } from '../ui/ThemeProvider';
import { playScroll, playBack } from '../../lib/sound';

export const NAV_ITEMS = [
  { to: '/', label: 'Day', icon: CalendarCheck2 },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/quarter', label: 'Quarter', icon: ShieldCheck },
  { to: '/notes', label: 'Notes', icon: BookOpen },
];

interface HeaderProps {
  onOpenShortcuts?: () => void;
  onOpenMobileSidebar?: () => void;
}

export function Header({ onOpenShortcuts: _, onOpenMobileSidebar }: HeaderProps) {
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
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

  const handleToggleTheme = () => {
    playBack();
    toggleTheme();
  };

  const updatePill = () => {
    const activeItem = NAV_ITEMS.find((item) => {
      if (item.to === '/') {
        return location.pathname === '/' || location.pathname === '/day';
      }
      return location.pathname === item.to;
    });

    if (activeItem && itemRefs.current[activeItem.to] && navContainerRef.current) {
      const navRect = navContainerRef.current.getBoundingClientRect();
      const elRect = itemRefs.current[activeItem.to]!.getBoundingClientRect();

      setPillStyle({
        left: elRect.left - navRect.left,
        top: elRect.top - navRect.top,
        width: elRect.width,
        height: elRect.height,
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
            onClick={() => playScroll()}
            className="focus-ring flex items-center gap-2.5 rounded-full pr-1 transition hover:opacity-90"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full glass-card p-1 shadow-2xs">
              <img src="/cherry-icon.svg" alt="Cherry" className="h-6 w-6 object-contain" />
            </div>
            <span className="font-display text-base font-extrabold text-stone-900 dark:text-white tracking-tight">
              Cherry
            </span>
          </Link>

          {/* Nav Links + Controls */}
          <nav className="flex items-center gap-1 sm:gap-1.5" aria-label="Primary Desktop Navigation">
            <div ref={navContainerRef} className="relative flex items-center gap-1">
              {/* Dynamic Sliding Active Indicator Pill */}
              <div
                className={`absolute rounded-full bg-stone-900 dark:bg-stone-100 pointer-events-none ${
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

              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => playScroll()}
                  ref={(el) => {
                    itemRefs.current[to] = el;
                  }}
                  className={({ isActive }) =>
                    `relative z-10 focus-ring flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                      isActive
                        ? 'text-white dark:text-stone-900'
                        : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white'
                    }`
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>

            <div className="mx-1 h-4 w-px bg-stone-200 dark:bg-stone-700" aria-hidden="true" />

            {/* Dark/Light Mode Switcher */}
            <button
              type="button"
              onClick={handleToggleTheme}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
              aria-label={isDark ? 'Switch to light mode (t)' : 'Switch to dark mode (t)'}
              title={isDark ? 'Switch to light mode (t)' : 'Switch to dark mode (t)'}
            >
              {isDark ? (
                <Sun className="h-4 w-4 text-cherry-blush transition-transform duration-200 hover:rotate-45" />
              ) : (
                <Moon className="h-4 w-4 text-cherry-flesh transition-transform duration-200 hover:-rotate-12" />
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile Top Header Bar */}
      <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between glass-panel px-4 py-2.5 transition-colors duration-200 sm:hidden">
        <div className="flex items-center gap-2">
          <Link to="/" onClick={() => playScroll()} className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full glass-card p-0.5">
              <img src="/cherry-icon.svg" alt="Cherry" className="h-5 w-5 object-contain" />
            </div>
            <span className="font-display text-sm font-extrabold text-stone-900 dark:text-white">
              Cherry
            </span>
          </Link>
          {onOpenMobileSidebar && (
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              className="flex items-center gap-1 rounded-full bg-cherry-500/10 px-2 py-0.5 font-mono text-3xs font-bold text-cherry-600 dark:text-cherry-300 border border-cherry-500/20"
              title="Open Accountability Pulse"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cherry-leaf" />
              <span>Pulse</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleToggleTheme}
            className="focus-ring flex h-7 w-7 items-center justify-center rounded-full text-stone-500 dark:text-stone-400"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="h-3.5 w-3.5 text-cherry-blush" /> : <Moon className="h-3.5 w-3.5 text-cherry-flesh" />}
          </button>
        </div>
      </header>

      {/* Mobile Floating Bottom Dock */}
      <nav
        className="fixed bottom-3 inset-x-3 z-50 flex justify-around rounded-2xl glass-capsule py-2 px-1 shadow-lift transition-colors duration-200 sm:hidden"
        aria-label="Primary Mobile Navigation"
      >
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => playScroll()}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-xl px-3 py-1 text-2xs font-semibold transition ${
                isActive
                  ? 'text-cherry-flesh dark:text-cherry-blush bg-cherry-500/10 dark:bg-cherry-400/15 font-bold'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
