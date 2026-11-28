// Original sound effects, synthesised live with Web Audio (no audio files, nothing to license).
// Build 2 direction: precise, technological, never harsh. Metallic snaps use inharmonic partials;
// energy sounds are filtered noise sweeps and sine glides. Bigger moments are richer and higher.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Build 4: sound effects and music have separate levels. */
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let enabled = true;
let sfxVolume = 0.8;
let musicVolume = 0.5;
let musicOn = true;

export function setSoundEnabled(on: boolean) { enabled = on; }
export function setSfxVolume(v: number) { sfxVolume = Math.max(0, Math.min(1, v)); if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(sfxVolume, ctx.currentTime, 0.05); }
export function setMusicVolume(v: number) { musicVolume = Math.max(0, Math.min(1, v)); applyMusicLevel(); }
export function setMusicEnabled(on: boolean) { musicOn = on; applyMusicLevel(); if (on) music.start(); }
function applyMusicLevel() {
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(musicOn ? musicVolume * 0.55 : 0, ctx.currentTime, 0.4);
}

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
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVolume; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    applyMusicLevel();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (musicOn) music.start();
}

export function suspendAudio() { ctx?.suspend().catch(() => {}); }

interface ToneOpts { type?: OscillatorType; gain?: number; to?: number; attack?: number; filter?: number; out?: AudioNode | null; at?: number; detune?: number }

function tone(freq: number, start: number, dur: number, o: ToneOpts = {}) {
  const out = o.out ?? sfxBus;
  if (!ctx || !out) return;
  const t = o.at ?? ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.detune) osc.detune.value = o.detune;
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
  node.connect(g).connect(out);
  osc.start(t); osc.stop(t + dur + 0.03);
}

function noise(start: number, dur: number, gain: number, from: number, to = from, q = 1.2, out: AudioNode | null = sfxBus, at?: number) {
  if (!ctx || !out) return;
  const t = at ?? ctx.currentTime + start;
  // Build 10: one shared noise buffer (the gain ramp below shapes each burst). Generating a fresh buffer per sound
  // cost a few milliseconds of main-thread work on every big clear, Overdrive start/end and every Overdrive hat.
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    const len = Math.floor(ctx.sampleRate * 1.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  const offset = Math.random() * Math.max(0, noiseBuf.duration - dur);
  src.start(t, offset, Math.min(dur, noiseBuf.duration));
}
let noiseBuf: AudioBuffer | null = null;

// Overlap limiting: the same sound retriggered within a few ms is skipped, so fast chains never pile up.
const lastPlayed = new Map<string, number>();
function throttle(key: string, ms: number): boolean {
  const now = performance.now();
  if (now - (lastPlayed.get(key) ?? -1e9) < ms) return false;
  lastPlayed.set(key, now);
  return true;
}
/** Small random detune so repeated sounds never feel identical. */
const vary = (f: number, cents = 18) => f * Math.pow(2, ((Math.random() * 2 - 1) * cents) / 1200);

/** A struck metal plate: a few inharmonic partials with fast decay. */
function metal(base: number, start: number, dur: number, gain: number) {
  [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(base * m, start, dur / (1 + i * 0.6), { type: 'sine', gain: gain / (1 + i * 1.3) }));
}

const ready = () => enabled && ctx && ctx.state === 'running';
// Minor-pentatonic ladder in A keeps layered energy tones consonant and cool rather than bright.
const LADDER = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

export const sfx = {
  /** Soft electronic click. */
  select() {
    if (!ready() || !throttle('select', 40)) return;
    // Build 6: a short glassy tone as the crystal lifts (two close sine partials, slightly detuned each time)
    const f = vary(1760, 30);
    tone(f, 0, 0.09, { type: 'sine', gain: 0.035, to: f * 1.06 });
    tone(f * 2.4, 0.005, 0.05, { type: 'sine', gain: 0.012 });
  },
  /** Build 6 interface button: a soft dry click (shares the select throttle so a button never double-sounds). */
  click() { if (!ready() || !throttle('select', 40)) return; noise(0, 0.018, 0.08, vary(2600, 80), 2600, 3); tone(vary(1200, 25), 0, 0.025, { type: 'triangle', gain: 0.02 }); },
  /** Build 6: Overdrive charge absorbed by the meter (tiny, rising with the level). */
  odAbsorb(level: number) {
    if (!ready() || !throttle('odabs', 70)) return;
    const f = 900 + Math.min(100, level) * 9;
    tone(vary(f, 20), 0, 0.07, { type: 'sine', gain: 0.022, to: f * 1.12 });
  },
  /** Satisfying metallic snap. */
  place() {
    if (!ready() || !throttle('place', 40)) return;
    noise(0, 0.03, 0.18, vary(3800, 60));
    metal(vary(410, 30), 0, 0.12, 0.09);
    tone(120, 0, 0.07, { type: 'sine', gain: 0.22, to: 70 });
    // a second, softer detent as the block settles (mechanical lock)
    metal(vary(620, 30), 0.07, 0.05, 0.03);
    // Build 6: the crystal rings very briefly as it seats
    tone(vary(2637, 25), 0.075, 0.12, { type: 'sine', gain: 0.018 });
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
    // Build 6: muted — a soft low thud, no buzz
    tone(110, 0, 0.11, { type: 'sine', gain: 0.12, to: 85, filter: 600 });
    tone(220, 0, 0.05, { type: 'triangle', gain: 0.015, filter: 900 });
  },
  /** Rotation refused: no energy. */
  denied() {
    if (!ready()) return;
    tone(196, 0, 0.07, { type: 'triangle', gain: 0.05 });
    tone(147, 0.08, 0.1, { type: 'triangle', gain: 0.05 });
  },
  /** Line clear: an energy sweep; more lines add layers, combos lift the pitch. */
  clear(lines: number, combo: number) {
    if (!ready() || !throttle('clear', 60)) return;
    const lift = Math.min(combo - 1, 4);
    noise(0, 0.22 + lines * 0.03, 0.07 + lines * 0.02, 700, 5200, 2);
    tone(LADDER[lift], 0, 0.28, { type: 'sine', gain: 0.1, to: LADDER[lift] * 1.5 });
    for (let i = 1; i < Math.min(lines + 1, 5); i++) {
      const f = LADDER[Math.min(lift + i * 2, LADDER.length - 1)];
      tone(f, i * 0.05, 0.3, { type: 'sine', gain: 0.07 });
      tone(f * 2.01, i * 0.05, 0.16, { type: 'triangle', gain: 0.015 });
    }
    if (lines >= 4) noise(0.12, 0.5, 0.05, 2000, 9000, 0.8);
    // Build 6 crystal release: a scatter of short glass partials as the blocks fracture, more for bigger clears
    const shards = 3 + Math.min(lines, 4) * 2;
    for (let i = 0; i < shards; i++) tone(vary(2800 + Math.random() * 2600, 40), 0.03 + i * 0.018 + Math.random() * 0.01, 0.06 + Math.random() * 0.05, { type: 'sine', gain: 0.012 + 0.004 * Math.min(lines, 4) });
    noise(0.02, 0.09, 0.05, 7000, 4000, 2.5);
    // Build 8: two or more lines add a crystalline cascade (rising glass chimes, one run per extra line, a little
    // longer and higher for each); four or more end on a bright held shimmer.
    if (lines >= 2) {
      const steps = Math.min(4 + (lines - 2) * 3, 12);
      for (let i = 0; i < steps; i++) {
        const f = LADDER[Math.min(lift + 2 + i, LADDER.length - 1)] * 2;
        tone(vary(f, 10), 0.09 + i * 0.045, 0.22, { type: 'sine', gain: 0.022 + 0.004 * Math.min(lines, 4) });
        tone(vary(f * 2.76, 15), 0.09 + i * 0.045, 0.08, { type: 'sine', gain: 0.006 });
      }
      if (lines >= 4) {
        const t0 = 0.1 + steps * 0.045;
        [1, 1.5, 2].forEach((m, i) => tone(LADDER[6] * m, t0, 0.7, { type: 'sine', gain: 0.03 / (1 + i) }));
      }
    }
  },
  /** Focused electronic burst; each wave in a chain rises and thickens. */
  pulse(wave: number, count: number) {
    if (!ready() || !throttle('pulse' + wave, 50)) return;
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
  // ---- Build 4 signature sounds
  /** Combo Protection spent: a soft guarded chime. */
  shield() {
    if (!ready()) return;
    tone(LADDER[4], 0, 0.22, { type: 'triangle', gain: 0.05 });
    tone(LADDER[4] * 1.5, 0.06, 0.3, { type: 'sine', gain: 0.04 });
    noise(0, 0.12, 0.03, 3000, 1800, 3);
  },
  /** Combo Protection restored by a clear. */
  shieldRestore() { if (!ready()) return; tone(LADDER[6], 0, 0.12, { type: 'sine', gain: 0.035, to: LADDER[7] }); },
  /** Overdrive charging: a short rising shimmer, pitched by the meter level. */
  odCharge(level: number) {
    if (!ready() || !throttle('odc', 120)) return;
    const f = 300 + level * 7;
    tone(f, 0, 0.18, { type: 'sine', gain: 0.04, to: f * 1.5 });
  },
  /** Overdrive ready: the signature motif (rising fifths with a gold shimmer). */
  odReady() {
    if (!ready()) return;
    [[0, 0], [4, 0.09], [7, 0.18]].forEach(([n, at]) => tone(LADDER[n] * 0.5, at, 0.5, { type: 'sawtooth', gain: 0.03, filter: 1800 }));
    tone(LADDER[9], 0.27, 0.6, { type: 'sine', gain: 0.05 });
    noise(0.2, 0.5, 0.03, 6000, 9000, 2);
  },
  /** Overdrive activation: a deep charge and release with a bright chord on top. */
  odActivate() {
    if (!ready()) return;
    tone(55, 0, 0.8, { type: 'sine', gain: 0.3, to: 110 });
    noise(0, 0.6, 0.08, 300, 7000, 1);
    tone(220, 0, 0.5, { type: 'sawtooth', gain: 0.04, to: 880, filter: 2600 });
    [4, 7, 9].forEach((n, i) => tone(LADDER[n], 0.42 + i * 0.03, 0.6, { type: 'triangle', gain: 0.05 }));
  },
  /** Overdrive ended: energy released and settling down. */
  odEnd() {
    if (!ready()) return;
    tone(880, 0, 0.6, { type: 'sine', gain: 0.04, to: 330 });
    noise(0, 0.5, 0.04, 5000, 500, 1);
  },
  /** Perfect board clear: a big gold-and-cyan cascade. */
  perfect() {
    if (!ready()) return;
    tone(65, 0, 0.7, { type: 'sine', gain: 0.25, to: 40 });
    [0, 2, 4, 5, 7, 9, 10].forEach((n, i) => tone(LADDER[n], i * 0.055, 0.45, { type: 'triangle', gain: 0.055 }));
    [7, 9, 10].forEach((n) => tone(LADDER[n], 0.42, 1, { type: 'sine', gain: 0.05 }));
    noise(0.05, 0.9, 0.05, 1200, 9000, 0.9);
  },
  /** Combo built higher: ascending tick, one step per combo level. */
  comboUp(combo: number) {
    if (!ready() || combo < 2) return;
    tone(LADDER[Math.min(2 + combo, LADDER.length - 1)] * 2, 0.12, 0.12, { type: 'sine', gain: 0.03 });
  },
  gameOver() {
    if (!ready()) return;
    [659.25, 523.25, 440, 329.63].forEach((f, i) => tone(f, i * 0.15, 0.5, { type: 'sine', gain: 0.08 }));
    noise(0, 0.6, 0.03, 1200, 300);
  },
};

// ---------------------------------------------------------------- Build 4 ambient music
// A slow generative loop: a soft pad on a four-chord cycle and a muted arpeggio. During Overdrive a second layer
// fades in (sub pulse, off-beat hats, a faster brighter arpeggio) and fades out when it ends. Synthesised live.

const CHORDS = [
  [220, 261.63, 329.63, 392], // Am7
  [174.61, 220, 261.63, 329.63], // Fmaj7
  [196, 246.94, 293.66, 392], // G
  [164.81, 207.65, 246.94, 329.63], // E (sus colour via the arp)
];
const BPM = 92;
const STEP = 60 / BPM / 4; // 16th note

class Music {
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private step = 0;
  private intensity = 0;
  private odGain: GainNode | null = null;
  private baseGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;

  private ensure() {
    if (!ctx || !musicBus || this.baseGain) return;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 1100; this.filter.Q.value = 0.7;
    this.baseGain = ctx.createGain(); this.baseGain.gain.value = 1;
    this.odGain = ctx.createGain(); this.odGain.gain.value = 0;
    this.baseGain.connect(this.filter).connect(musicBus);
    this.odGain.connect(musicBus);
  }

  start() {
    if (!ctx || !musicOn || this.timer) return;
    this.ensure();
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 60);
  }

  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  /** 0 = ambient, 1 = Overdrive. Transitions smoothly. */
  setIntensity(v: number) {
    this.intensity = v;
    if (!ctx || !this.odGain || !this.filter) return;
    this.odGain.gain.setTargetAtTime(v ? 0.9 : 0, ctx.currentTime, 0.6);
    this.filter.frequency.setTargetAtTime(v ? 2600 : 1100, ctx.currentTime, 0.8);
  }

  private schedule() {
    if (!ctx || ctx.state !== 'running' || !musicOn) return;
    while (this.next < ctx.currentTime + 0.25) {
      this.play(this.step, this.next);
      this.step = (this.step + 1) % (16 * 8);
      this.next += STEP;
    }
  }

  private play(step: number, at: number) {
    const bar = Math.floor(step / 16), inBar = step % 16;
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const base = this.baseGain, od = this.odGain;
    // Pad: a new chord every two bars, long attack and release.
    if (step % 32 === 0) {
      for (const f of chord) {
        tone(f / 2, 0, STEP * 32 + 1.2, { type: 'triangle', gain: 0.05, attack: 1.2, out: base, at });
        tone(f / 2, 0, STEP * 32 + 1.2, { type: 'sawtooth', gain: 0.012, attack: 1.4, out: base, at, detune: 7 });
      }
    }
    // Muted arpeggio on eighths (sixteenths during Overdrive).
    const arpEvery = this.intensity ? 1 : 2;
    if (inBar % arpEvery === 0) {
      const idx = [0, 2, 1, 3, 2, 1, 3, 0][(inBar / arpEvery) % 8];
      const f = chord[idx] * (this.intensity ? 2 : 1);
      tone(f, 0, 0.22, { type: 'triangle', gain: this.intensity ? 0.022 : 0.018, out: base, at });
    }
    if (!od || !this.intensity) return;
    // Overdrive layer: sub pulse on the beat, airy hats on the off-beats.
    if (inBar % 4 === 0) tone(chord[0] / 4, 0, 0.28, { type: 'sine', gain: 0.12, to: chord[0] / 6, out: od, at });
    if (inBar % 4 === 2) noise(0, 0.05, 0.035, 8000, 8000, 1.5, od, at);
    if (inBar % 8 === 6) tone(chord[3], 0, 0.3, { type: 'sawtooth', gain: 0.012, filter: 2400, out: od, at });
  }
}

export const music = new Music();
