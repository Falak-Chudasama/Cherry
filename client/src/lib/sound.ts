/**
 * Cherry UI Sound Effects (SFX) Subsystem
 *
 * Balanced Acoustic Micro-interactions.
 * Hits the sweet spot between crisp tactile feedback and warm organic body.
 * Neither harsh/high-pitched nor muddy/low-pitched.
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
  scroll: 0.20,
  enter: 0.30,
  back: 0.24,
  failed: 0.32,
  notification: 0.30,
};

const STORAGE_KEY_MUTED = 'cherry_sound_muted';

const audioCache: Partial<Record<SoundCategory, HTMLAudioElement>> = {};
let lastScrollTime = 0;
const SCROLL_THROTTLE_MS = 110;

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
 * 1. Scroll / Selection: Signature Cherry Pop (Crisp Ceramic Click + 540Hz->380Hz Resonant Body)
 * Distinctive, snappy, non-typical tactile feedback.
 */
function synthScroll(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, t);

  // Transient micro-click (1250Hz for 6ms)
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  clickOsc.type = 'sine';
  clickOsc.frequency.setValueAtTime(1250, t);
  clickGain.gain.setValueAtTime(vol * 0.35, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.008);

  // Resonant rounded body (540Hz -> 380Hz)
  const bodyOsc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  bodyOsc.type = 'sine';
  bodyOsc.frequency.setValueAtTime(540, t);
  bodyOsc.frequency.exponentialRampToValueAtTime(380, t + 0.035);
  bodyGain.gain.setValueAtTime(vol * 0.65, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

  clickOsc.connect(filter);
  bodyOsc.connect(filter);
  filter.connect(clickGain);
  filter.connect(bodyGain);
  clickGain.connect(ctx.destination);
  bodyGain.connect(ctx.destination);

  clickOsc.start(t);
  clickOsc.stop(t + 0.01);
  bodyOsc.start(t);
  bodyOsc.stop(t + 0.045);
}

/**
 * 2. Enter / Create: Radiant Major Triad Chime (C5 523Hz + E5 659Hz + G5 784Hz)
 */
function synthEnter(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2200, t);

  const notes = [
    { freq: 523.25, delay: 0.000, gainMul: 0.32, dur: 0.16 },
    { freq: 659.25, delay: 0.012, gainMul: 0.28, dur: 0.18 },
    { freq: 783.99, delay: 0.024, gainMul: 0.24, dur: 0.20 },
  ];

  notes.forEach(({ freq, delay, gainMul, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startT = t + delay;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startT);

    gain.gain.setValueAtTime(0, t);
    gain.gain.setValueAtTime(0, startT);
    gain.gain.linearRampToValueAtTime(vol * gainMul, startT + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, startT + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startT);
    osc.stop(startT + dur + 0.01);
  });
}

/**
 * 3. Back / Cancel: Crisp Gentle Pop (420Hz -> 280Hz)
 */
function synthBack(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1100, t);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.exponentialRampToValueAtTime(280, t + 0.05);

  gain.gain.setValueAtTime(vol * 0.65, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + 0.055);
}

/**
 * 4. Notification / Alert: Airy Dual Chime (F5 698Hz -> A5 880Hz + C6 harmonic)
 */
function synthNotification(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2400, t);

  // Note 1: F5 (698Hz)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(698.46, t);
  gain1.gain.setValueAtTime(0, t);
  gain1.gain.linearRampToValueAtTime(vol * 0.70, t + 0.005);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

  // Note 2: A5 (880Hz) starting 50ms later with subtle harmonic
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(880.0, t + 0.05);
  gain2.gain.setValueAtTime(0, t);
  gain2.gain.setValueAtTime(0, t + 0.05);
  gain2.gain.linearRampToValueAtTime(vol * 0.75, t + 0.055);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain1);
  filter.connect(gain2);
  gain1.connect(ctx.destination);
  gain2.connect(ctx.destination);

  osc1.start(t);
  osc1.stop(t + 0.24);
  osc2.start(t + 0.05);
  osc2.stop(t + 0.34);
}

/**
 * 5. Failed: Crisp Wooden Double Knock (280Hz and 220Hz)
 */
function synthFailed(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(600, t);

  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(280, t);
  gain1.gain.setValueAtTime(vol * 0.65, t);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(220, t + 0.065);
  gain2.gain.setValueAtTime(0, t);
  gain2.gain.setValueAtTime(vol * 0.60, t + 0.065);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain1);
  filter.connect(gain2);
  gain1.connect(ctx.destination);
  gain2.connect(ctx.destination);

  osc1.start(t);
  osc1.stop(t + 0.045);
  osc2.start(t + 0.065);
  osc2.stop(t + 0.12);
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
 * Play a balanced, studio-grade UI sound effect.
 */
export function playSound(category: SoundCategory): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (isSoundMuted()) {
    return;
  }

  if (category === 'scroll') {
    const now = Date.now();
    if (now - lastScrollTime < SCROLL_THROTTLE_MS) {
      return;
    }
    lastScrollTime = now;
  }

  const vol = VOLUMES[category] ?? 0.25;

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
      promise.catch(() => {});
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

export const sound = {
  play: (cat: SoundCategory) => playSound(cat),
  toggle: () => toggleSound(),
};
