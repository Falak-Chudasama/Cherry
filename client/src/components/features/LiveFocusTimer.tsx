import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, Shield, Clock } from 'lucide-react';
import { playEnter, playBack, playNotification } from '../../lib/sound';
import { useEcosystem } from '../../context/EcosystemContext';

export const LiveFocusTimer: React.FC = () => {
  const { isFocusActive, toggleFocus } = useEcosystem();
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60 * 60);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isFocusActive && !isPaused) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            playNotification();
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (!isFocusActive) {
      setSecondsRemaining(60 * 60);
      setIsPaused(false);
    }
    return () => clearInterval(interval);
  }, [isFocusActive, isPaused]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const pct = Math.round(((3600 - secondsRemaining) / 3600) * 100);

  const handleStart = () => {
    playEnter();
    setSecondsRemaining(60 * 60);
    setIsPaused(false);
    toggleFocus();
  };

  const handleStop = () => {
    playBack();
    toggleFocus();
  };

  const handlePauseResume = () => {
    playEnter();
    setIsPaused((prev) => !prev);
  };

  return (
    <div className="glass-panel rounded-2xl p-5 shadow-soft border border-black/5 dark:border-white/10 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-cherry-flesh" />
          <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
            Focus Sprint (60m Block)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isFocusActive && (
            <span className="flex items-center gap-1 text-2xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              <Shield className="h-3 w-3" /> Lemon DNS Shield Active
            </span>
          )}
          <span
            className={`text-2xs font-mono font-bold px-2 py-0.5 rounded-full ${
              isFocusActive
                ? isPaused
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-cherry-500/15 text-cherry-600 dark:text-cherry-300'
                : 'text-stone-400'
            }`}
          >
            {isFocusActive ? (isPaused ? 'PAUSED' : 'BLOCK IN PROGRESS') : 'IDLE'}
          </span>
        </div>
      </div>

      {/* Countdown Clock & Progress */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-1">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-4xl sm:text-5xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
            {formatTime(secondsRemaining)}
          </span>
          <span className="text-xs font-medium text-stone-500">
            {isFocusActive ? `${pct}% complete` : 'Standard: 60m focus • 10m break'}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!isFocusActive ? (
            <button
              onClick={handleStart}
              className="btn-glass-primary !py-2.5 !px-5 text-xs font-bold"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Start 60m Sprint</span>
            </button>
          ) : (
            <>
              <button
                onClick={handlePauseResume}
                className="btn-interactive flex items-center gap-1.5 px-3.5 py-2 rounded-full glass-card text-xs font-semibold text-stone-700 dark:text-stone-300 border border-black/5 dark:border-white/10"
              >
                {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                <span>{isPaused ? 'Resume' : 'Pause'}</span>
              </button>
              <button
                onClick={handleStop}
                className="btn-interactive flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25 text-xs font-bold"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>End Sprint</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {isFocusActive && (
        <div className="h-1.5 w-full rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-cherry-flesh transition-all duration-1000"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
};
