// Animation controller. Replays a MoveResult as a timed sequence of visual events.
// It only reads the result: the engine state was already committed atomically, so skipping,
// interrupting or backgrounding mid-animation can never corrupt the board.
//
// Sequence for a clear: lines illuminate -> energy travels along them -> blocks brighten ->
// blocks break into shards -> score counts -> energy flows to the Rotation Energy meter.
// Pulse waves: core charges -> shockwave fills exactly the 3x3 area -> blocks break up ->
// a bolt carries energy to each Pulse caught in the blast -> that Pulse charges and fires.

import type { Board, Cell } from '../engine/board';
import type { MoveResult } from '../engine/game';
import type { PulseWave } from '../engine/pulse';
import { setMaterial, type MaterialLook } from './blocks';

export interface Dying { k: number; cell: Cell; start: number; dur: number; brightFrom: number }
export interface Shock { r: number; c: number; start: number; dur: number; wave: number }
export interface Charge { k: number; start: number; dur: number }
export interface Bolt { fr: number; fc: number; tr: number; tc: number; start: number; dur: number; seed: number }
export interface Sweep { kind: 'row' | 'col'; i: number; origin: number; start: number; dur: number; strength: number }
export interface Flare { r: number; c: number; start: number; dur: number }
export interface Particle { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number; hue: 'ti' | 'cyan' | 'white'; spin: number }
export interface FloatText { text: string; r: number; c: number; start: number; dur: number; big: boolean }
export interface EnergyOrb { r: number; c: number; seg: number; start: number; dur: number; gold?: boolean }
/** Build 3: a material change sweeps across the board from `origin` (cell units). */
export interface MaterialWave { from: MaterialLook; to: MaterialLook; start: number; dur: number; or: number; oc: number }

export interface AnimationHooks {
  onLines?(result: MoveResult): void;
  onWave?(index: number, wave: PulseWave, result: MoveResult): void;
  /** An energy orb reached the meter (one per restored charge). */
  onEnergy?(seg: number): void;
  /** Build 3: every clear and chain has finished and the move gained one or more levels. */
  onLevelUp?(result: MoveResult): void;
  onDone?(result: MoveResult): void;
}

export interface PlayOptions {
  /** Material change that comes with this move's level-up (progressive materials). */
  material?: { from: MaterialLook; to: MaterialLook };
  /** Level-up phase length in ms (700–1200, dev-tunable). */
  levelMs?: number;
  /** Material wave length in ms (400–700, dev-tunable). */
  materialMs?: number;
}

export class Animator {
  /** Board to draw while a sequence runs (null = draw the live state). */
  display: Board | null = null;
  hidden = new Set<number>();
  settles = new Map<number, number>();
  glowCells: { cells: number[]; start: number; dur: number; strength: number } | null = null;
  dying: Dying[] = [];
  shocks: Shock[] = [];
  charges: Charge[] = [];
  bolts: Bolt[] = [];
  sweeps: Sweep[] = [];
  flares: Flare[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];
  orbs: EnergyOrb[] = [];
  /** Frame celebration: cyan for 4+ lines, champagne gold for a level-up. */
  celebrate: { start: number; dur: number; gold?: boolean } | null = null;
  materialWave: MaterialWave | null = null;
  shake: { start: number; dur: number; amp: number } | null = null;
  /** Restored charges still in flight to the meter (the meter shows state energy minus these). */
  pendingEnergy = 0;
  /** Recent orb arrivals, for the meter's flash (gold for level-up energy). */
  arrivals: { seg: number; t: number; gold: boolean }[] = [];

  reduced = false;
  showPoints = true;
  /** Dev: particle multiplier (0.5 low, 1 medium, 1.6 high). */
  particleScale = 1;
  /** Dev: multiplies clear timings (1 = single clear ~340 ms). */
  speed = 1;
  /** Dev: energy wave intensity (sweeps, shockwaves, frame light). */

  private events: { at: number; fn: () => void }[] = [];
  private current: MoveResult | null = null;
  private hooks: AnimationHooks = {};

  get busy() { return this.current !== null; }
  /** True while anything is still moving on screen (keeps the render loop alive). */
  get active() {
    return this.busy || this.dying.length > 0 || this.particles.length > 0 || this.shocks.length > 0 || this.floats.length > 0
      || this.settles.size > 0 || !!this.shake || !!this.glowCells || this.orbs.length > 0 || this.bolts.length > 0 || !!this.celebrate || this.flares.length > 0 || !!this.materialWave || this.arrivals.length > 0;
  }

  play(result: MoveResult, now: number, hooks: AnimationHooks, opts: PlayOptions = {}) {
    this.finish(); // never overlap sequences
    this.current = result;
    this.hooks = hooks;
    this.display = result.boardAfterPlace;
    this.hidden = new Set();
    const k = (this.reduced ? 0.65 : 1) * this.speed;
    const T = (ms: number) => now + ms * k;
    for (const p of result.placed) this.settles.set(p, now);
    // Restored charges stay off the meter until their energy arrives (lines first, then any level-up).
    this.pendingEnergy = result.energyGained + (result.levelEnergy ?? 0);

    const lines = result.rows.length + result.cols.length;
    if (lines === 0) {
      this.finishWith(result, T(100), now, opts);
      return;
    }

    const n = result.boardAfterPlace.size;
    const pr = result.placed.map((p) => Math.floor(p / n)), pc = result.placed.map((p) => p % n);
    const midR = pr.reduce((a, b) => a + b, 0) / pr.length, midC = pc.reduce((a, b) => a + b, 0) / pc.length;
    const multi = lines > 1;

    // 1. completed lines illuminate; 2. energy travels along them from the placed piece
    const strength = Math.min(1 + (lines - 1) * 0.45, 2.4);
    this.glowCells = { cells: result.lineCells, start: T(0), dur: (multi ? 300 : 250) * k, strength };
    const sweepDur = (multi ? 200 : 170) * k;
    for (const r of result.rows) this.sweeps.push({ kind: 'row', i: r, origin: midC, start: T(30), dur: sweepDur, strength });
    for (const c of result.cols) this.sweeps.push({ kind: 'col', i: c, origin: midR, start: T(30), dur: sweepDur, strength });
    if (result.rows.length && result.cols.length) {
      for (const r of result.rows) for (const c of result.cols) this.flares.push({ r, c, start: T(120), dur: 300 * k });
    }
    if (lines >= 4) this.celebrate = { start: T(60), dur: 750 * k };

    // 3. blocks brighten, 4. break into shards, 5. score counts, 6. energy flows to the meter
    const clearAt = multi ? 240 : 190;
    this.at(T(clearAt), () => {
      this.kill(result.lineCells, T(clearAt), 150 * k, result.boardAfterPlace, T(clearAt - 70), lines >= 3 ? 1.4 : 1);
      if (this.showPoints) this.floats.push({ text: `+${result.points.total}`, r: midR, c: midC, start: T(clearAt), dur: 950, big: result.points.total >= 500 });
      this.hooks.onLines?.(result);
      if (!this.reduced && lines >= 3) this.shake = { start: T(clearAt), dur: 220, amp: Math.min(1.5 + lines * 0.6, 4.5) };
      // energy orbs: one per restored charge, from the cleared lines to the meter segments that light up
      const before = (result.energyAfterLines ?? result.energyAfter) - result.energyGained;
      const sources = [...result.rows.map((r) => ({ r, c: midC })), ...result.cols.map((c) => ({ r: midR, c }))];
      for (let i = 0; i < result.energyGained; i++) {
        const src = sources[i % sources.length];
        const orb: EnergyOrb = { r: src.r, c: src.c, seg: before + i, start: T(clearAt) + i * 90, dur: 420 };
        this.orbs.push(orb);
      }
    });

    // Pulse waves
    let t = clearAt - 60;
    result.waves.forEach((wave, i) => {
      const buildAt = t, shockAt = t + 90;
      this.at(T(buildAt), () => {
        for (const p of wave.pulses) this.charges.push({ k: p, start: T(buildAt), dur: 90 * k });
      });
      this.at(T(shockAt), () => {
        for (const p of wave.pulses) this.shocks.push({ r: Math.floor(p / n), c: p % n, start: T(shockAt), dur: 380 * k, wave: i });
        this.kill(wave.cleared, T(shockAt) + 40 * k, 170 * k, result.boardAfterPlace, T(shockAt), 1 + i * 0.25);
        // bolts carry the energy to each Pulse this wave sets off
        const next = result.waves[i + 1];
        if (next) {
          for (const q of next.pulses) {
            const qr = Math.floor(q / n), qc = q % n;
            const parent = wave.pulses.find((pp) => Math.abs(Math.floor(pp / n) - qr) <= 1 && Math.abs((pp % n) - qc) <= 1) ?? wave.pulses[0];
            this.bolts.push({ fr: Math.floor(parent / n), fc: parent % n, tr: qr, tc: qc, start: T(shockAt) + 30 * k, dur: 200 * k, seed: q });
          }
        }
        this.hooks.onWave?.(i, wave, result);
        // 4+ Pulse chains get the frame celebration too (audiovisual only; the blast radius never changes).
        if (i === result.waves.length - 1 && result.chain >= 4) this.celebrate = { start: T(shockAt), dur: (result.chain >= 5 ? 950 : 750) * k };
        if (!this.reduced && (i >= 1 || wave.pulses.length > 1)) this.shake = { start: T(shockAt), dur: 200, amp: Math.min(1.5 + i * 1.2, 5) };
      });
      t = shockAt + 170;
    });
    this.finishWith(result, T(Math.max(t, clearAt + 150) + 80), now, opts);
  }

  /** Ends the sequence at `end`, or first plays the level-up phase when this move gained a level. */
  private finishWith(result: MoveResult, end: number, now: number, opts: PlayOptions) {
    const gained = (result.levelAfter ?? 1) > (result.levelBefore ?? 1);
    if (!gained) { this.at(end, () => this.complete()); return; }
    const k = this.reduced ? 0.6 : 1;
    const levelMs = (opts.levelMs ?? 950) * k, matMs = (opts.materialMs ?? 560) * k;
    const L0 = end;
    this.at(L0, () => {
      this.celebrate = { start: L0, dur: levelMs * 0.95, gold: true };
      this.hooks.onLevelUp?.(result);
      // Level-up energy: gold-and-cyan sparks from the top of the board into the meter.
      const lvlE = result.levelEnergy ?? 0;
      for (let i = 0; i < lvlE; i++) {
        this.orbs.push({ r: -0.4, c: 2 + i * 1.5, seg: (result.energyAfterLines ?? 0) + i, start: L0 + 260 * k + i * 90, dur: 440 * k, gold: true });
      }
    });
    let done = L0 + levelMs;
    if (opts.material && opts.material.from.id !== opts.material.to.id) {
      const m = opts.material;
      const ws = L0 + 320 * k;
      this.at(ws, () => { this.materialWave = { from: m.from, to: m.to, start: ws, dur: matMs, or: 3.5, oc: 3.5 }; });
      done = Math.max(done, ws + matMs + 120 * k);
    }
    void now;
    this.at(done, () => this.complete());
  }

  private at(at: number, fn: () => void) { this.events.push({ at, fn }); this.events.sort((a, b) => a.at - b.at); }

  private kill(cells: number[], start: number, dur: number, b: Board, brightFrom: number, intensity: number) {
    const n = b.size;
    for (const k of cells) {
      const cell = b.cells[k];
      if (!cell || this.hidden.has(k)) continue;
      this.hidden.add(k);
      this.dying.push({ k, cell, start, dur, brightFrom });
      if (this.reduced) continue;
      const count = Math.round((cell.pulse ? 12 : 7) * this.particleScale * intensity);
      const r = Math.floor(k / n), c = k % n;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.8 * intensity;
        this.particles.push({
          x: c + 0.2 + Math.random() * 0.6, y: r + 0.2 + Math.random() * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6,
          born: start, life: 260 + Math.random() * 260, size: 0.06 + Math.random() * 0.09,
          hue: cell.pulse ? 'cyan' : i % 3 === 0 ? 'white' : 'ti', spin: Math.random() * 6,
        });
      }
    }
  }

  private complete() {
    const r = this.current;
    if (!r) return;
    this.current = null;
    this.display = null;
    this.hidden = new Set();
    this.hooks.onDone?.(r);
  }

  /** Jump to the end (used when the app backgrounds or a new sequence must start). */
  finish() {
    while (this.events.length) this.events.shift()!.fn();
    for (const o of this.orbs) this.hooks.onEnergy?.(o.seg);
    this.orbs = [];
    this.pendingEnergy = 0;
    if (this.materialWave) { setMaterial(this.materialWave.to); this.materialWave = null; }
    this.complete();
  }

  update(now: number, dt: number) {
    while (this.events.length && this.events[0].at <= now) this.events.shift()!.fn();
    for (const [k, t0] of this.settles) if (now - t0 > 180) this.settles.delete(k);
    this.dying = this.dying.filter((d) => now < d.start + d.dur);
    this.shocks = this.shocks.filter((s) => now < s.start + s.dur);
    this.charges = this.charges.filter((c) => now < c.start + c.dur + 40);
    this.bolts = this.bolts.filter((b) => now < b.start + b.dur);
    this.sweeps = this.sweeps.filter((s) => now < s.start + s.dur);
    this.flares = this.flares.filter((f) => now < f.start + f.dur);
    this.floats = this.floats.filter((f) => now < f.start + f.dur);
    this.orbs = this.orbs.filter((o) => {
      if (now < o.start + o.dur) return true;
      this.pendingEnergy = Math.max(0, this.pendingEnergy - 1);
      this.arrivals.push({ seg: o.seg, t: now, gold: !!o.gold });
      this.hooks.onEnergy?.(o.seg);
      return false;
    });
    this.arrivals = this.arrivals.filter((a) => now < a.t + 1300);
    if (this.glowCells && now > this.glowCells.start + this.glowCells.dur) this.glowCells = null;
    if (this.celebrate && now > this.celebrate.start + this.celebrate.dur) this.celebrate = null;
    if (this.materialWave && now > this.materialWave.start + this.materialWave.dur) { setMaterial(this.materialWave.to); this.materialWave = null; }
    if (this.shake && now > this.shake.start + this.shake.dur) this.shake = null;
    const s = Math.min(dt, 50) / 1000;
    this.particles = this.particles.filter((p) => {
      if (now < p.born) return true;
      p.x += p.vx * s; p.y += p.vy * s; p.vy += 4 * s; p.vx *= 0.97; p.vy *= 0.97;
      return now < p.born + p.life;
    });
  }
}
