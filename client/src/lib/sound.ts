/**
 * Cherry UI Sound Effects (SFX) Subsystem
 *
 * Provides tactile audio feedback for key interactions.
 * If the corresponding audio files do not exist in `/sfx/`, execution continues
 * completely silently with zero errors or console warnings.
 */

export type SoundCategory = 'scroll' | 'enter' | 'back' | 'failed' | 'notification';

const SFX_FILES: Record<SoundCategory, string> = {
  scroll: '/sfx/scroll.mp3',
  enter: '/sfx/enter.mp3',
  back: '/sfx/back.mp3',
  failed: '/sfx/failed.mp3',
  notification: '/sfx/notification.mp3',
};

const VOLUMES: Record<SoundCategory, number> = {
  scroll: 0.22,
  enter: 0.38,
  back: 0.32,
  failed: 0.45,
  notification: 0.42,
};

const STORAGE_KEY_MUTED = 'cherry_sound_muted';

const audioCache: Partial<Record<SoundCategory, HTMLAudioElement>> = {};
let lastScrollTime = 0;
const SCROLL_THROTTLE_MS = 140;

export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY_MUTED) === 'true';
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_MUTED, muted ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}

export function toggleSound(): boolean {
  const current = isSoundMuted();
  const next = !current;
  setSoundMuted(next);
  if (!next) {
    playNotification();
  }
  return next;
}

/**
 * Play a UI sound effect if available and sound is enabled.
 */
export function playSound(category: SoundCategory): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return;
  }

  if (isSoundMuted()) {
    return;
  }

  // Throttle scroll sounds to avoid overwhelming repetitive audio
  if (category === 'scroll') {
    const now = Date.now();
    if (now - lastScrollTime < SCROLL_THROTTLE_MS) {
      return;
    }
    lastScrollTime = now;
  }

  try {
    let audio = audioCache[category];
    if (!audio) {
      audio = new Audio(SFX_FILES[category]);
      audio.preload = 'auto';
      audio.volume = VOLUMES[category] ?? 0.35;
      audioCache[category] = audio;
    } else {
      audio.currentTime = 0;
    }

    const promise = audio.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {
        // Autoplay policy or missing file: fail silently
      });
    }
  } catch {
    // Fail silently
  }
}

export const playEnter = () => playSound('enter');
export const playBack = () => playSound('back');
export const playFailed = () => playSound('failed');
export const playNotification = () => playSound('notification');
export const playScroll = () => playSound('scroll');

// Compatibility interface
export const sound = {
  play: (cat: SoundCategory) => playSound(cat),
  toggle: () => toggleSound(),
};
