import React from 'react';
import { X, Command } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { key: '1 - 2', desc: 'Jump to view (Today, Quarter)' },
      { key: '3 - 4', desc: 'Utility views (Notes, Chat)' },
      { key: 'Ctrl + →', desc: 'Next view' },
      { key: 'Ctrl + ←', desc: 'Previous view' },
      { key: 'Shift + ← / →', desc: 'Navigate sub-menu filters (Tier, Day, Status)' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { key: '/ or Ctrl+K', desc: 'Toggle AI Side Drawer' },
      { key: 'n', desc: 'Create New Task' },
      { key: 't', desc: 'Toggle Dark / Light mode' },
      { key: 'm', desc: 'Toggle Audio SFX mute' },
      { key: '?', desc: 'Show shortcuts' },
      { key: 'Esc', desc: 'Close dialog / drawer / blur input' },
    ],
  },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl glass-panel p-5 shadow-lift border border-white/20 dark:border-white/10 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-cherry-500/10 dark:bg-cherry-400/20 text-cherry-600 dark:text-cherry-300">
              <Command className="h-3.5 w-3.5" />
            </div>
            <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">
              Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((sc) => (
                  <div
                    key={sc.key}
                    className="flex items-center justify-between py-1 px-1.5 rounded-lg text-xs"
                  >
                    <span className="text-stone-600 dark:text-stone-400 font-medium">
                      {sc.desc}
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded text-2xs font-semibold font-mono bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700">
                      {sc.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
