/**
 * Cherry UI Sound Effects (SFX) Subsystem
 *
 * Balanced Acoustic Micro-interactions.
 * Hits the sweet spot between crisp tactile feedback and warm organic body.
 * Neither harsh/high-pitched nor muddy/low-pitched.
 */

export type SoundCategory = 'scroll' | 'nav' | 'enter' | 'back' | 'failed' | 'notification';

const SFX_FILES: Record<SoundCategory, string> = {
  scroll: '/sfx/scroll.mp3',
  nav: '/sfx/nav.mp3',
  enter: '/sfx/enter.mp3',
  back: '/sfx/back.mp3',
  failed: '/sfx/failed.mp3',
  notification: '/sfx/notification.mp3',
};

const VOLUMES: Record<SoundCategory, number> = {
  scroll: 0.18,
  nav: 0.22,
  enter: 0.28,
  back: 0.22,
  failed: 0.30,
  notification: 0.28,
};

const STORAGE_KEY_MUTED = 'cherry_sound_muted';

const audioCache: Partial<Record<SoundCategory, HTMLAudioElement>> = {};
let lastScrollTime = 0;
const SCROLL_THROTTLE_MS = 100;

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
 * 1. Selection: Pristine, dry, tactile haptic micro-tick
 * Completely removes the goofy/cartoonish pitch-bend "boop".
 * High-end, subtle, dry, mechanical/glass detent.
 */
function synthScroll(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1600, t);

  // Crisp micro-transient at 880Hz (A5)
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  clickOsc.type = 'sine';
  clickOsc.frequency.setValueAtTime(880, t);
  clickGain.gain.setValueAtTime(vol * 0.45, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.014);

  // Muted damp body at 460Hz (constant frequency, zero goofy pitch-slide)
  const bodyOsc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  bodyOsc.type = 'sine';
  bodyOsc.frequency.setValueAtTime(460, t);
  bodyGain.gain.setValueAtTime(vol * 0.35, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.020);

  clickOsc.connect(filter);
  bodyOsc.connect(filter);
  filter.connect(clickGain);
  filter.connect(bodyGain);
  clickGain.connect(ctx.destination);
  bodyGain.connect(ctx.destination);

  clickOsc.start(t);
  clickOsc.stop(t + 0.016);
  bodyOsc.start(t);
  bodyOsc.stop(t + 0.024);
}

/**
 * 2. Page Navigation: Atmospheric spatial silk slide (Unconventional, non-material)
 * Smooth airy breath + subtle harmonic spatial resonance.
 */
function synthNav(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(700, t);
  filter.frequency.exponentialRampToValueAtTime(1100, t + 0.06);
  filter.Q.setValueAtTime(1.2, t);

  // Filtered soft air brush (white-noise envelope)
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.floor(sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * (i / bufferSize));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(vol * 0.22, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

  // Subtle warm spatial undertone (380Hz -> 460Hz)
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(380, t);
  osc.frequency.linearRampToValueAtTime(460, t + 0.05);
  oscGain.gain.setValueAtTime(0, t);
  oscGain.gain.linearRampToValueAtTime(vol * 0.25, t + 0.008);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);

  noise.start(t);
  osc.start(t);
  osc.stop(t + 0.085);
}

/**
 * 3. Enter / Primary Action: Solid, mature, velvety tactile impact
 * Completely eliminates goofy arpeggiated tutorial chimes.
 * Clean, dry, physical mechanical contact with high acoustic mass (340Hz body + 720Hz micro-transient).
 */
function synthEnter(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, t);

  // Crisp physical contact transient (first 5ms)
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  clickOsc.type = 'sine';
  clickOsc.frequency.setValueAtTime(720, t);
  clickGain.gain.setValueAtTime(vol * 0.40, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.012);

  // Warm, solid, executive acoustic body at 340Hz (constant frequency, zero arpeggio)
  const bodyOsc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  bodyOsc.type = 'sine';
  bodyOsc.frequency.setValueAtTime(340, t);
  bodyGain.gain.setValueAtTime(vol * 0.50, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.038);

  clickOsc.connect(filter);
  bodyOsc.connect(filter);
  filter.connect(clickGain);
  filter.connect(bodyGain);
  clickGain.connect(ctx.destination);
  bodyGain.connect(ctx.destination);

  clickOsc.start(t);
  clickOsc.stop(t + 0.015);
  bodyOsc.start(t);
  bodyOsc.stop(t + 0.042);
}

/**
 * 4. Back / Cancel: Crisp Gentle Pop (420Hz -> 280Hz)
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
 * 5. Notification / Alert: Airy Dual Chime (F5 698Hz -> A5 880Hz + C6 harmonic)
 */
function synthNotification(ctx: AudioContext, vol: number) {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2400, t);

  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(698.46, t);
  gain1.gain.setValueAtTime(0, t);
  gain1.gain.linearRampToValueAtTime(vol * 0.70, t + 0.005);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

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
 * 6. Failed: Crisp Wooden Double Knock (280Hz and 220Hz)
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
        case 'nav':
          synthNav(ctx, vol);
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
export const playPageNav = () => playSound('nav');

export const sound = {
  play: (cat: SoundCategory) => playSound(cat),
  toggle: () => toggleSound(),
};
