// Original sound effects, synthesised live with Web Audio (no audio files, nothing to license).
// Bigger moments get richer, higher sounds: the clear chord grows with lines and combo,
// and each wave of a Pulse chain rises in pitch.

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
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function suspendAudio() { ctx?.suspend().catch(() => {}); }

function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number; attack?: number } = {}) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const peak = opts.gain ?? 0.2;
  const a = opts.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(start: number, dur: number, gain: number, freq: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + start;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const ready = () => enabled && ctx && ctx.state === 'running';
// A pentatonic ladder (C major pentatonic) keeps every combination consonant.
const LADDER = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];

export const sfx = {
  select() { if (!ready()) return; tone(660, 0, 0.05, { type: 'triangle', gain: 0.06 }); },
  place() {
    if (!ready()) return;
    tone(196, 0, 0.11, { type: 'triangle', gain: 0.22, to: 140 });
    noise(0, 0.04, 0.12, 2400);
  },
  invalid() {
    if (!ready()) return;
    tone(180, 0, 0.08, { type: 'square', gain: 0.04 });
    tone(150, 0.09, 0.1, { type: 'square', gain: 0.04 });
  },
  /** lines = lines cleared this move; combo = consecutive clearing moves. */
  clear(lines: number, combo: number) {
    if (!ready()) return;
    const base = Math.min(combo - 1, 3);
    const notes = Math.min(2 + lines, 6);
    for (let i = 0; i < notes; i++) {
      const f = LADDER[Math.min(base + i, LADDER.length - 1)];
      tone(f, i * 0.045, 0.32 + i * 0.03, { type: 'sine', gain: 0.13 });
      tone(f * 2, i * 0.045, 0.18, { type: 'triangle', gain: 0.03 });
    }
    noise(0, 0.25, lines > 1 ? 0.09 : 0.05, 5000);
  },
  /** wave = 0 for the first pulse wave, rising through a chain. */
  pulse(wave: number, count: number) {
    if (!ready()) return;
    const lift = Math.pow(1.122, Math.min(wave, 8)); // a whole tone per wave
    tone(110 * lift, 0, 0.35, { type: 'sine', gain: 0.32, to: 55 * lift });
    tone(880 * lift, 0.02, 0.25, { type: 'sine', gain: 0.05 + Math.min(count, 4) * 0.012, to: 1320 * lift });
    noise(0, 0.18, 0.08, 1200 * lift);
  },
  record() {
    if (!ready()) return;
    [0, 2, 4, 5, 7].forEach((n, i) => tone(LADDER[n], i * 0.08, 0.4, { type: 'triangle', gain: 0.1 }));
  },
  gameOver() {
    if (!ready()) return;
    [783.99, 659.25, 523.25, 392].forEach((f, i) => tone(f, i * 0.14, 0.5, { type: 'sine', gain: 0.1 }));
  },
};
