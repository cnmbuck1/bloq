// Original sound effects, synthesised live with Web Audio (no audio files, nothing to license).
// Build 2 direction: precise, technological, never harsh. Metallic snaps use inharmonic partials;
// energy sounds are filtered noise sweeps and sine glides. Bigger moments are richer and higher.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) { enabled = on; }

/** iOS only starts audio from a user gesture: call this from the first touch. */
export function unlockAudio() {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'ambient'; // mix with music, respect the silent switch
  } catch { /* older WebKit */ }
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function suspendAudio() { ctx?.suspend().catch(() => {}); }

interface ToneOpts { type?: OscillatorType; gain?: number; to?: number; attack?: number; filter?: number }

function tone(freq: number, start: number, dur: number, o: ToneOpts = {}) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const peak = o.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (o.filter) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter;
    node = osc.connect(f);
  }
  node.connect(g).connect(master);
  osc.start(t); osc.stop(t + dur + 0.03);
}

function noise(start: number, dur: number, gain: number, from: number, to = from, q = 1.2) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + start;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

/** A struck metal plate: a few inharmonic partials with fast decay. */
function metal(base: number, start: number, dur: number, gain: number) {
  [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(base * m, start, dur / (1 + i * 0.6), { type: 'sine', gain: gain / (1 + i * 1.3) }));
}

const ready = () => enabled && ctx && ctx.state === 'running';
// Minor-pentatonic ladder in A keeps layered energy tones consonant and cool rather than bright.
const LADDER = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

export const sfx = {
  /** Soft electronic click. */
  select() { if (!ready()) return; tone(2200, 0, 0.03, { type: 'square', gain: 0.025, filter: 3500 }); },
  /** Satisfying metallic snap. */
  place() {
    if (!ready()) return;
    noise(0, 0.03, 0.18, 3800);
    metal(410, 0, 0.12, 0.09);
    tone(120, 0, 0.07, { type: 'sine', gain: 0.22, to: 70 });
  },
  /** Precision mechanical movement: a servo glide between two detents. */
  rotate() {
    if (!ready()) return;
    noise(0, 0.02, 0.1, 5000);
    tone(330, 0.01, 0.13, { type: 'sawtooth', gain: 0.03, to: 520, filter: 1400 });
    noise(0.13, 0.025, 0.12, 4200);
    metal(900, 0.13, 0.06, 0.03);
  },
  /** Subtle low-frequency feedback. */
  invalid() {
    if (!ready()) return;
    tone(110, 0, 0.12, { type: 'sine', gain: 0.18, to: 85 });
    tone(220, 0, 0.06, { type: 'triangle', gain: 0.03 });
  },
  /** Rotation refused: no energy. */
  denied() {
    if (!ready()) return;
    tone(196, 0, 0.07, { type: 'triangle', gain: 0.05 });
    tone(147, 0.08, 0.1, { type: 'triangle', gain: 0.05 });
  },
  /** Line clear: an energy sweep; more lines add layers, combos lift the pitch. */
  clear(lines: number, combo: number) {
    if (!ready()) return;
    const lift = Math.min(combo - 1, 4);
    noise(0, 0.22 + lines * 0.03, 0.07 + lines * 0.02, 700, 5200, 2);
    tone(LADDER[lift], 0, 0.28, { type: 'sine', gain: 0.1, to: LADDER[lift] * 1.5 });
    for (let i = 1; i < Math.min(lines + 1, 5); i++) {
      const f = LADDER[Math.min(lift + i * 2, LADDER.length - 1)];
      tone(f, i * 0.05, 0.3, { type: 'sine', gain: 0.07 });
      tone(f * 2.01, i * 0.05, 0.16, { type: 'triangle', gain: 0.015 });
    }
    if (lines >= 4) noise(0.12, 0.5, 0.05, 2000, 9000, 0.8);
  },
  /** Focused electronic burst; each wave in a chain rises and thickens. */
  pulse(wave: number, count: number) {
    if (!ready()) return;
    const lift = Math.pow(1.122, Math.min(wave, 8));
    tone(95 * lift, 0, 0.3, { type: 'sine', gain: 0.3, to: 48 * lift });
    tone(1320 * lift, 0, 0.12, { type: 'square', gain: 0.02 + Math.min(count, 4) * 0.006, to: 660 * lift, filter: 4000 });
    noise(0, 0.14, 0.09 + wave * 0.02, 1800 * lift, 600 * lift, 1.5);
    if (wave >= 1) tone(LADDER[Math.min(wave * 2, LADDER.length - 1)], 0.03, 0.35, { type: 'sine', gain: 0.06 });
  },
  /** Soft ascending tone as a charge lands in the meter. */
  energy(seg: number) {
    if (!ready()) return;
    const f = LADDER[3 + Math.min(seg, 4) * 2];
    tone(f, 0, 0.16, { type: 'sine', gain: 0.07, to: f * 1.26 });
    tone(f * 2, 0.03, 0.1, { type: 'sine', gain: 0.02 });
  },
  record() {
    if (!ready()) return;
    [0, 3, 5, 7, 10].forEach((n, i) => { tone(LADDER[n], i * 0.07, 0.4, { type: 'triangle', gain: 0.07 }); metal(LADDER[n] / 2, i * 0.07, 0.1, 0.02); });
  },
  // ---- Build 3 progression sounds
  /** Level bar moved: a quiet electronic tick. */
  progress() { if (!ready()) return; tone(1760, 0, 0.05, { type: 'sine', gain: 0.025 }); },
  /** Level up: a rising energy sequence ending on a bright chord. */
  levelUp() {
    if (!ready()) return;
    noise(0, 0.55, 0.05, 400, 6000, 1.4);
    [0, 2, 4, 5, 7].forEach((n, i) => tone(LADDER[n], i * 0.06, 0.3, { type: 'triangle', gain: 0.065, to: LADDER[n] * 1.01 }));
    [5, 7, 9].forEach((n) => tone(LADDER[n], 0.34, 0.75, { type: 'sine', gain: 0.06 }));
    metal(LADDER[5] / 2, 0.34, 0.25, 0.03);
  },
  /** Material transition: a smooth sweep across the board. */
  materialSweep() {
    if (!ready()) return;
    noise(0, 0.6, 0.06, 300, 4500, 0.9);
    tone(220, 0, 0.6, { type: 'sawtooth', gain: 0.025, to: 660, filter: 1800 });
  },
  /** Rotation Energy fully restored by a level-up. */
  recharge() {
    if (!ready()) return;
    tone(330, 0, 0.32, { type: 'sine', gain: 0.07, to: 990 });
    tone(990, 0.3, 0.18, { type: 'sine', gain: 0.05 });
  },
  /** A material unlocked for good. */
  unlock() {
    if (!ready()) return;
    [7, 9, 10].forEach((n, i) => { tone(LADDER[n], i * 0.09, 0.55, { type: 'triangle', gain: 0.06 }); metal(LADDER[n], i * 0.09, 0.12, 0.02); });
  },
  /** An achievement: short and celebratory, never loud. */
  achievement() {
    if (!ready()) return;
    tone(LADDER[5], 0, 0.14, { type: 'triangle', gain: 0.06 });
    tone(LADDER[8], 0.08, 0.3, { type: 'triangle', gain: 0.06 });
  },
  /** Major chain (4+ Pulses): a layered discharge under the last wave. */
  majorChain(count: number) {
    if (!ready()) return;
    tone(60, 0, 0.6, { type: 'sine', gain: 0.25, to: 35 });
    noise(0, 0.7, 0.07 + Math.min(count - 4, 3) * 0.02, 5000, 400, 0.8);
    [0, 4, 7].forEach((n, i) => tone(LADDER[n + 3], 0.05 + i * 0.04, 0.5, { type: 'sine', gain: 0.05 }));
  },
  gameOver() {
    if (!ready()) return;
    [659.25, 523.25, 440, 329.63].forEach((f, i) => tone(f, i * 0.15, 0.5, { type: 'sine', gain: 0.08 }));
    noise(0, 0.6, 0.03, 1200, 300);
  },
};
