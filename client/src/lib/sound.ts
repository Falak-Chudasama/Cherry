/**
 * Cherry Studio UI Sound Effects (SFX) Subsystem
 *
 * Professional studio-grade acoustic micro-interactions.
 * Modeled after Linear, Teenage Engineering, and Apple UI:
 * Warm, organic, tactile, and non-fatiguing. Zero cheap/high-pitched pings.
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
  scroll: 0.18,
  enter: 0.28,
  back: 0.22,
  failed: 0.35,
  notification: 0.32,
};

const STORAGE_KEY_MUTED = 'cherry_sound_muted';

const audioCache: Partial<Record<SoundCategory, HTMLAudioElement>> = {};
let lastScrollTime = 0;
const SCROLL_THROTTLE_MS = 120;

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * 1. Scroll / Tab switch: Warm wooden/mechanical micro-tap (220Hz -> 140Hz with lowpass filter)
 */
function synthScroll(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(850, t);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.035);

  gain.gain.setValueAtTime(vol * 0.7, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + 0.038);
}

/**
 * 2. Enter / Create: Warm marimba confirmation chime (G4 392Hz + D5 587.3Hz)
 */
function synthEnter(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1600, t);

  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(392, t);
  gain1.gain.setValueAtTime(0, t);
  gain1.gain.linearRampToValueAtTime(vol * 0.7, t + 0.004);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(587.3, t + 0.015);
  gain2.gain.setValueAtTime(0, t);
  gain2.gain.setValueAtTime(0, t + 0.015);
  gain2.gain.linearRampToValueAtTime(vol * 0.55, t + 0.02);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain1);
  filter.connect(gain2);
  gain1.connect(ctx.destination);
  gain2.connect(ctx.destination);

  osc1.start(t);
  osc1.stop(t + 0.2);
  osc2.start(t + 0.015);
  osc2.stop(t + 0.24);
}

/**
 * 3. Back / Cancel: Soft, low downward pop (240Hz -> 140Hz)
 */
function synthBack(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(650, t);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(240, t);
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.06);

  gain.gain.setValueAtTime(vol * 0.65, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + 0.065);
}

/**
 * 4. Notification / Alert: Luxurious Apple/Linear-grade dual chime (A4 440Hz -> E5 659.25Hz)
 */
function synthNotification(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, t);

  // Note 1: A4 (440Hz)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(440, t);
  gain1.gain.setValueAtTime(0, t);
  gain1.gain.linearRampToValueAtTime(vol * 0.75, t + 0.006);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

  // Note 2: E5 (659.25Hz) starting 60ms later
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(659.25, t + 0.06);
  gain2.gain.setValueAtTime(0, t);
  gain2.gain.setValueAtTime(0, t + 0.06);
  gain2.gain.linearRampToValueAtTime(vol * 0.85, t + 0.066);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain1);
  filter.connect(gain2);
  gain1.connect(ctx.destination);
  gain2.connect(ctx.destination);

  osc1.start(t);
  osc1.stop(t + 0.26);
  osc2.start(t + 0.06);
  osc2.stop(t + 0.40);
}

/**
 * 5. Failed: Gentle low muffled double knock (130Hz and 95Hz)
 */
function synthFailed(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(320, t);

  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(130, t);
  gain1.gain.setValueAtTime(vol * 0.7, t);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(95, t + 0.075);
  gain2.gain.setValueAtTime(0, t);
  gain2.gain.setValueAtTime(vol * 0.6, t + 0.075);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain1);
  filter.connect(gain2);
  gain1.connect(ctx.destination);
  gain2.connect(ctx.destination);

  osc1.start(t);
  osc1.stop(t + 0.06);
  osc2.start(t + 0.075);
  osc2.stop(t + 0.14);
}

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
 * Play a high-definition studio UI sound effect.
 */
export function playSound(category: SoundCategory): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (isSoundMuted()) {
    return;
  }

  // Throttle rapid scroll sounds
  if (category === 'scroll') {
    const now = Date.now();
    if (now - lastScrollTime < SCROLL_THROTTLE_MS) {
      return;
    }
    lastScrollTime = now;
  }

  const vol = VOLUMES[category] ?? 0.25;

  // Primary: Instant Web Audio synthesis with studio acoustic shaping
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'running') {
    try {
      switch (category) {
        case 'scroll':
          synthScroll(ctx, vol);
          return;
        case 'enter':
          synthEnter(ctx, vol);
          return;
        case 'back':
          synthBack(ctx, vol);
          return;
        case 'notification':
          synthNotification(ctx, vol);
          return;
        case 'failed':
          synthFailed(ctx, vol);
          return;
      }
    } catch {
      // Fall through to audio element fallback
    }
  }

  // Fallback: HTMLAudioElement playing 320kbps MP3 / WAV
  try {
    let audio = audioCache[category];
    if (!audio) {
      audio = new Audio(SFX_FILES[category]);
      audio.preload = 'auto';
      audio.volume = vol;
      audioCache[category] = audio;
    } else {
      audio.currentTime = 0;
    }

    const promise = audio.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {
        // Autoplay policy or user interaction needed: fail silently
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
