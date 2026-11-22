import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, Shield, Clock, Coffee, AlertCircle } from 'lucide-react';
import { playEnter, playBack, playNotification, playFailed } from '../../lib/sound';
import { useEcosystem } from '../../context/EcosystemContext';
import { useToast } from '../ui/ToastProvider';

export const LiveFocusTimer: React.FC = () => {
  const {
    isFocusActive,
    toggleFocus,
    focusState,
    completeFocusSession,
    toggleLemonDns,
    lemonAvailable,
  } = useEcosystem();
  const { push } = useToast();

  const phase = focusState?.phase || (isFocusActive ? 'focus' : 'idle');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60 * 60);
  const [isPaused, setIsPaused] = useState(false);
  const [dnsToggling, setDnsToggling] = useState(false);

  // Deterministic Clock Calculation from started_at timestamp
  const calculateSecondsRemaining = (): number => {
    if (phase === 'focus' && focusState?.started_at) {
      const plannedSec = (focusState.planned_minutes || 60) * 60;
      const elapsed = Math.floor(
        (Date.now() - new Date(focusState.started_at).getTime()) / 1000
      );
      return Math.max(0, plannedSec - elapsed);
    } else if (phase === 'break' && focusState?.break_started_at) {
      const breakSec = (focusState.break_minutes || 10) * 60;
      const elapsed = Math.floor(
        (Date.now() - new Date(focusState.break_started_at).getTime()) / 1000
      );
      return Math.max(0, breakSec - elapsed);
    }
    return 60 * 60;
  };

  useEffect(() => {
    setSecondsRemaining(calculateSecondsRemaining());

    let interval: any = null;
    if (phase === 'focus' || phase === 'break') {
      interval = setInterval(() => {
        const remaining = calculateSecondsRemaining();
        setSecondsRemaining(remaining);

        if (remaining <= 0) {
          if (phase === 'focus') {
            playNotification();
            push('info', '60m Focus block complete! Transitioning into 10m recovery break.');
            completeFocusSession();
          } else if (phase === 'break') {
            playNotification();
            push('success', '10m recovery break completed. Ready for the next focus block!');
          }
          clearInterval(interval);
        }
      }, 1000);
    } else {
      setSecondsRemaining(60 * 60);
      setIsPaused(false);
    }

    return () => clearInterval(interval);
  }, [phase, focusState?.started_at, focusState?.break_started_at]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const maxSeconds = phase === 'break' ? 10 * 60 : 60 * 60;
  const pct = Math.min(100, Math.round(((maxSeconds - secondsRemaining) / maxSeconds) * 100));

  const handleStart = () => {
    playEnter();
    setIsPaused(false);
    toggleFocus();
  };

  const handleStop = () => {
    playBack();
    toggleFocus();
  };

  const handleManualDnsToggle = async () => {
    if (dnsToggling) return;
    setDnsToggling(true);
    playEnter();
    try {
      const success = await toggleLemonDns();
      if (success) {
        playNotification();
        push('success', 'Lemon DNS Shield toggled.');
      } else {
        playFailed();
        push('error', focusState?.error_message || 'Lemon DNS firewall offline / blackout.');
      }
    } finally {
      setDnsToggling(false);
    }
  };

  const dnsActive = focusState?.dns_protection_active;

  // When IDLE: Sleek single-row bar (no 200px hogging)
  if (phase === 'idle') {
    return (
      <div className="glass-panel rounded-2xl px-4 py-2.5 shadow-soft border border-black/5 dark:border-white/10 flex items-center justify-between gap-3 transition-all duration-300">
        <div className="flex items-center gap-2.5">
          <Clock className="h-4 w-4 text-stone-400" />
          <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
            60m Focus Block
          </span>
          <span className="hidden sm:inline text-2xs text-stone-400">
            • 10m break follows automatically
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Standalone Lemon Shield Button */}
          <button
            type="button"
            onClick={handleManualDnsToggle}
            disabled={dnsToggling}
            className={`flex items-center gap-1.5 text-2xs font-bold px-3 py-1.5 rounded-xl border transition ${
              dnsActive
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'glass-card text-stone-600 dark:text-stone-400 border-stone-200/80 dark:border-stone-800 hover:border-stone-400'
            }`}
            title="Toggle Lemon DNS Firewall"
          >
            <Shield className={`h-3 w-3 ${dnsActive ? 'text-emerald-500 fill-emerald-500/20' : ''}`} />
            <span>Lemon Shield: {dnsActive ? 'ON' : 'OFF'}</span>
          </button>

          {/* Start 60m Focus Button */}
          <button
            type="button"
            onClick={handleStart}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-cherry-flesh hover:bg-cherry-700 text-white font-bold text-xs shadow-xs transition"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>Start 60m Focus</span>
          </button>
        </div>
      </div>
    );
  }

  // When ACTIVE (Focus or Break): Smoothly expanded live countdown & controls
  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5 shadow-soft border border-black/5 dark:border-white/10 space-y-3.5 animate-scale-in transition-all duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          {phase === 'break' ? (
            <Coffee className="h-4 w-4 text-emerald-500 animate-bounce" />
          ) : (
            <Clock className="h-4 w-4 text-cherry-flesh animate-pulse" />
          )}
          <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
            {phase === 'break' ? 'Recovery Break (10m)' : 'Active Focus Block (60m)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Lemon Shield status button */}
          <button
            type="button"
            onClick={handleManualDnsToggle}
            disabled={dnsToggling}
            className={`flex items-center gap-1.5 text-2xs font-bold px-2.5 py-1 rounded-xl border transition ${
              dnsActive
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                : 'glass-card text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-800'
            }`}
          >
            <Shield className="h-3 w-3" />
            <span>Lemon: {dnsActive ? 'ON' : 'OFF'}</span>
          </button>

          <span
            className={`text-2xs font-mono font-bold px-2.5 py-1 rounded-full uppercase ${
              phase === 'focus'
                ? isPaused
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-cherry-500/15 text-cherry-600 dark:text-cherry-300'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {phase === 'focus' ? (isPaused ? 'PAUSED' : 'FOCUS ACTIVE') : 'BREAK ACTIVE'}
          </span>
        </div>
      </div>

      {(!lemonAvailable || focusState?.error_message) && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-2xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{focusState?.error_message || 'Lemon DNS firewall offline / blackout.'}</span>
        </div>
      )}

      {/* Countdown and Action Buttons */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-4xl sm:text-5xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
            {formatTime(secondsRemaining)}
          </span>
          <span className="text-2xs font-medium text-stone-500">
            {phase === 'focus'
              ? `${pct}% completed`
              : `${pct}% rest elapsed`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {phase === 'focus' && (
            <button
              type="button"
              onClick={() => setIsPaused((prev) => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass-card text-xs font-semibold text-stone-700 dark:text-stone-300 border border-black/5 dark:border-white/10 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
            >
              {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleStop}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25 text-xs font-bold hover:bg-rose-500/25 transition"
          >
            <Square className="h-3 w-3 fill-current" />
            <span>{phase === 'break' ? 'End Break' : 'End Sprint'}</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 w-full rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            phase === 'break' ? 'bg-emerald-500' : 'bg-cherry-flesh'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
