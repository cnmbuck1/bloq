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

export interface Dying { k: number; cell: Cell; start: number; dur: number; brightFrom: number; /** Build 6: shard travel and push direction (cells). */ power?: number; dir?: [number, number]; od?: boolean }
/** Build 6: energy released by a clear, flying into the Overdrive meter (board cell units at launch). */
export interface Mote { r: number; c: number; start: number; dur: number; share: number; seed: number; gold: boolean }
export interface Shock { r: number; c: number; start: number; dur: number; wave: number }
export interface Charge { k: number; start: number; dur: number }
export interface Bolt { fr: number; fc: number; tr: number; tc: number; start: number; dur: number; seed: number }
export interface Sweep { kind: 'row' | 'col'; i: number; origin: number; start: number; dur: number; strength: number }
export interface Flare { r: number; c: number; start: number; dur: number }
export interface Particle { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number; hue: 'ti' | 'cyan' | 'white' | 'gold'; spin: number }
export interface FloatText { text: string; r: number; c: number; start: number; dur: number; big: boolean; /** Build 4: subtle placement points. */ minor?: boolean; gold?: boolean }
export interface EnergyOrb { r: number; c: number; seg: number; start: number; dur: number; gold?: boolean }
/** Build 3: a material change sweeps across the board from `origin` (cell units). */
export interface MaterialWave { from: MaterialLook; to: MaterialLook; start: number; dur: number; or: number; oc: number }

export interface AnimationHooks {
  onLines?(result: MoveResult): void;
  onWave?(index: number, wave: PulseWave, result: MoveResult): void;
  /** An energy orb reached the meter (one per restored charge). */
  onEnergy?(seg: number): void;
  /** Build 6: an Overdrive mote reached the meter. */
  onOdMote?(): void;
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
  /** Build 4: this move was played in Overdrive (gold-tinted, stronger clear and Pulse effects). */
  overdrive?: boolean;
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
  /** Build 6: Overdrive energy in flight, the charge it still owes the meter, and recent arrivals (meter flash). */
  motes: Mote[] = [];
  pendingOd = 0;
  odArrivals: number[] = [];
  /** Build 6: soft light left in the cleared lines (fades after the shards), and the placement energy pulse. */
  afterglow: { cells: number[]; start: number; dur: number; strength: number; od: boolean } | null = null;
  placePulse: { cells: number[]; start: number; dur: number } | null = null;
  /** Build 8: light travelling across individual crystals (placement catch-light; the view adds idle glints). */
  glints: { k: number; start: number; dur: number; strength: number }[] = [];
  /** Build 6: last time the board released energy (the background and perimeter brighten briefly). */
  energyAt = -1e9; energyAmt = 0;
  /** Frame celebration: cyan for 4+ lines, champagne gold for a level-up. */
  celebrate: { start: number; dur: number; gold?: boolean } | null = null;
  materialWave: MaterialWave | null = null;
  /** Build 4: placed cells' contact highlight, the Perfect Clear wave, Overdrive activation and board flashes. */
  contact: { cells: number[]; start: number; dur: number } | null = null;
  perfectWave: { start: number; dur: number } | null = null;
  odWave: { start: number; dur: number } | null = null;
  flash: { start: number; dur: number; color: string; amount: number } | null = null;
  /** The current sequence is an Overdrive move. */
  odMove = false;
  shake: { start: number; dur: number; amp: number } | null = null;
  /** Restored charges still in flight to the meter (the meter shows state energy minus these). */
  pendingEnergy = 0;
  /** Recent orb arrivals, for the meter's flash (gold for level-up energy). */
  arrivals: { seg: number; t: number; gold: boolean }[] = [];

  reduced = false;
  /** Build 6 reduced effects: half the particles, no screen-wide flash. */
  lowFx = false;
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
      || this.settles.size > 0 || !!this.shake || !!this.glowCells || this.orbs.length > 0 || this.bolts.length > 0 || !!this.celebrate || this.flares.length > 0 || !!this.materialWave || this.arrivals.length > 0
      || !!this.contact || !!this.perfectWave || !!this.odWave || !!this.flash || this.motes.length > 0 || !!this.afterglow || !!this.placePulse || this.odArrivals.length > 0 || this.glints.length > 0;
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
    // Build 8: the placed crystals catch the light once they have settled (staggered along the piece).
    if (!this.reduced) result.placed.forEach((p, i) => this.glints.push({ k: p, start: now + 110 + i * 22, dur: 420, strength: 1 }));
    this.odMove = !!opts.overdrive;
    // Contact highlight along the placed piece as it locks in (100–150 ms).
    this.contact = { cells: result.placed, start: now + 40, dur: 130 };
    // Build 6: a short energy pulse spreads under the placed piece (150–250 ms).
    this.placePulse = { cells: result.placed, start: now + 30, dur: 220 };
    // Restored charges stay off the meter until their energy arrives (lines first, then any level-up).
    this.pendingEnergy = result.energyGained + (result.levelEnergy ?? 0);

    const lines = result.rows.length + result.cols.length;
    if (lines === 0) {
      // Placement points: small and quiet for an ordinary move.
      if (this.showPoints && result.points.total > 0) {
        const n0 = result.boardAfterPlace.size;
        const r0 = result.placed.reduce((a, p) => a + Math.floor(p / n0), 0) / result.placed.length;
        const c0 = result.placed.reduce((a, p) => a + (p % n0), 0) / result.placed.length;
        this.floats.push({ text: `+${result.points.total.toLocaleString('en-US')}`, r: r0 - 0.2, c: c0, start: now + 60, dur: 620, big: false, minor: true, gold: this.odMove });
      }
      this.finishWith(result, T(100), now, opts);
      return;
    }

    const n = result.boardAfterPlace.size;
    const pr = result.placed.map((p) => Math.floor(p / n)), pc = result.placed.map((p) => p % n);
    const midR = pr.reduce((a, b) => a + b, 0) / pr.length, midC = pc.reduce((a, b) => a + b, 0) / pc.length;
    const multi = lines > 1;

    // Build 6 line clear.
    // 1. Anticipation: the completed lines light up and their crystals brighten (energy builds).
    // 2. Release: a shockwave runs out from the placed piece along each line; each crystal fractures as the front
    //    reaches it and its shards dissolve into light.
    // 3. Reward: points rise from the cleared area, released energy flies into the Overdrive meter, the lines keep
    //    a fading glow. 4. Recovery: everything is gone within about half a second; play is never held up.
    const strength = Math.min(1 + (lines - 1) * 0.45, 2.4);
    const od = this.odMove;
    this.glowCells = { cells: result.lineCells, start: T(0), dur: (multi ? 300 : 250) * k, strength };
    const sweepDur = (multi ? 230 : 200) * k;
    const shockAt0 = 60;
    for (const r of result.rows) this.sweeps.push({ kind: 'row', i: r, origin: midC, start: T(shockAt0), dur: sweepDur, strength });
    for (const c of result.cols) this.sweeps.push({ kind: 'col', i: c, origin: midR, start: T(shockAt0), dur: sweepDur, strength });
    if (result.rows.length && result.cols.length) {
      for (const r of result.rows) for (const c of result.cols) this.flares.push({ r, c, start: T(120), dur: 300 * k });
    }
    if (lines >= 4) this.celebrate = { start: T(60), dur: 750 * k };
    if (lines >= 4 && !this.reduced && !this.lowFx) this.flash = { start: T(140), dur: 360, color: od ? '#FFF3D1' : '#C6FFFF', amount: 0.1 + 0.03 * Math.min(4, lines - 3) };
    const clearAt = multi ? 240 : 190;
    // Each crystal breaks when the front reaches it: distance from the placement along its line.
    const power = 1 + Math.min(1.2, (lines - 1) * 0.3) + (od ? 0.25 : 0);
    const breakAt = new Map<number, { t: number; dir: [number, number] }>();
    const addLine = (cells: number[], along: (k: number) => number, origin: number, kind: 'row' | 'col') => {
      for (const kk of cells) {
        const pos = along(kk), dist = Math.abs(pos - origin);
        const t0 = shockAt0 + 40 + (dist / 8) * sweepDur / k * 0.9;
        const sgn = pos === origin ? 0 : Math.sign(pos - origin);
        const dir: [number, number] = kind === 'row' ? [sgn, 0] : [0, sgn];
        const prev = breakAt.get(kk);
        if (!prev || t0 < prev.t) breakAt.set(kk, { t: t0, dir });
      }
    };
    for (const r of result.rows) addLine(Array.from({ length: n }, (_, c) => r * n + c), (kk) => kk % n, midC, 'row');
    for (const c of result.cols) addLine(Array.from({ length: n }, (_, r) => r * n + c), (kk) => Math.floor(kk / n), midR, 'col');
    const b0 = result.boardAfterPlace;
    for (const kk of result.lineCells) {
      const cell = b0.cells[kk];
      const info = breakAt.get(kk);
      if (!cell || !info || this.hidden.has(kk)) continue;
      // Pulse Blocks in a line keep their own sequence (they fire with the wave timing below).
      if (cell.pulse) continue;
      this.hidden.add(kk);
      const start = T(info.t);
      this.dying.push({ k: kk, cell, start, dur: (multi ? 330 : 290) * k, brightFrom: T(0), power, dir: info.dir, od });
      this.at(start, () => this.shatter(kk, n, cell, power, od, start));
    }
    this.at(T(clearAt), () => {
      // Pulse Blocks in the lines break with the old timing (their wave follows); points and hooks as before.
      this.kill(result.lineCells, T(clearAt), 150 * k, result.boardAfterPlace, T(clearAt - 70), lines >= 3 ? 1.4 : 1);
      if (this.showPoints) this.floats.push({ text: `+${result.points.total.toLocaleString('en-US')}`, r: midR, c: midC, start: T(clearAt - 40), dur: 950, big: result.points.total >= 1000 || lines >= 2, gold: this.odMove || result.perfect });
      this.hooks.onLines?.(result);
      this.energyAt = T(clearAt - 60); this.energyAmt = Math.min(1, 0.35 + lines * 0.2 + (od ? 0.2 : 0));
      this.afterglow = { cells: result.lineCells, start: T(clearAt), dur: 420 * k, strength, od };
      if (!this.reduced && lines >= 3) this.shake = { start: T(clearAt), dur: 220, amp: Math.min(1.5 + lines * 0.6, 4.5) };
      // energy orbs: one per restored charge, from the cleared lines to the meter segments that light up
      const before = (result.energyAfterLines ?? result.energyAfter) - result.energyGained;
      const sources = [...result.rows.map((r) => ({ r, c: midC })), ...result.cols.map((c) => ({ r: midR, c }))];
      for (let i = 0; i < result.energyGained; i++) {
        const src = sources[i % sources.length];
        const orb: EnergyOrb = { r: src.r, c: src.c, seg: before + i, start: T(clearAt) + i * 90, dur: 420 };
        this.orbs.push(orb);
      }
      this.launchMotes(result, T(clearAt - 20));
    });

    // Perfect Board Clear: a gold-and-cyan wave from the centre once the last block has gone (800–1200 ms).
    const perfectAt = (result.waves.length ? clearAt - 60 + result.waves.length * 260 : clearAt) + 120;
    if (result.perfect) {
      this.at(T(perfectAt), () => {
        this.perfectWave = { start: T(perfectAt), dur: (this.reduced ? 600 : 1000) * k };
        this.flash = { start: T(perfectAt), dur: 420, color: '#FFF3D1', amount: 0.22 };
        this.celebrate = { start: T(perfectAt), dur: 900 * k, gold: true };
        if (!this.reduced) this.burst(3.5, 3.5, 46, 'gold', T(perfectAt));
      });
    }

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
        // 5+ chains: a cinematic board-wide flash on the final wave.
        if (i === result.waves.length - 1 && result.chain >= 5) this.flash = { start: T(shockAt), dur: 380, color: '#C6FFFF', amount: 0.16 };
        if (!this.reduced && (i >= 1 || wave.pulses.length > 1)) this.shake = { start: T(shockAt), dur: 200, amp: Math.min(1.5 + i * 1.2, 5) };
      });
      t = shockAt + 170;
    });
    this.finishWith(result, T(Math.max(t, clearAt + 150, result.perfect ? perfectAt + 700 : 0) + 80), now, opts);
  }

  /** Build 4: Overdrive activation (600–900 ms): a gold wave round the board and a soft flash. Not a move. */
  overdrive(now: number) {
    const dur = this.reduced ? 450 : 780;
    this.odWave = { start: now, dur };
    this.celebrate = { start: now, dur, gold: true };
    this.flash = { start: now, dur: 360, color: '#E6C47E', amount: 0.14 };
    if (!this.reduced) {
      for (const [r, c] of [[0, 0], [0, 7], [7, 0], [7, 7]]) this.burst(r + 0.5, c + 0.5, 10, 'gold', now + 120);
    }
  }

  /** Build 6: a crystal shatters: a few bright crystal chips and fine sparks (bounded). */
  private shatter(k: number, n: number, cell: Cell, power: number, od: boolean, start: number) {
    if (this.reduced || this.particles.length > (this.lowFx ? 220 : 560)) return;
    if (this.lowFx && (k & 1)) return;
    const r = Math.floor(k / n), c = k % n;
    const count = Math.round((5 + 3 * power) * this.particleScale);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.4 + Math.random() * 2.6 * power;
      this.particles.push({
        x: c + 0.5 + (Math.random() - 0.5) * 0.5, y: r + 0.5 + (Math.random() - 0.5) * 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.8,
        born: start, life: 240 + Math.random() * 260, size: 0.04 + Math.random() * 0.07,
        hue: cell.pulse ? 'cyan' : i % 4 === 0 ? 'white' : od && i % 2 === 1 ? 'gold' : 'ti', spin: Math.random() * 8,
      });
    }
  }

  /** Build 6: the clear's Overdrive charge leaves the board as motes that the meter absorbs on arrival. */
  private launchMotes(result: MoveResult, start: number) {
    this.pendingOd = 0;
    const gained = result.odGained ?? 0;
    if (gained <= 0 || result.odActive) return;
    const n = result.boardAfterPlace.size;
    const src = result.lineCells.length ? result.lineCells : result.placed;
    const count = Math.max(3, Math.min(12, Math.round(gained / 4)));
    this.pendingOd = gained;
    for (let i = 0; i < count; i++) {
      const kk = src[Math.floor((i / count) * src.length)];
      this.motes.push({ r: Math.floor(kk / n), c: kk % n, start: start + i * 22, dur: (this.reduced ? 260 : 460) + Math.random() * 120, share: gained / count, seed: Math.random() * 100, gold: (result.odChargeAfter ?? 0) >= 100 });
    }
  }

  private burst(r: number, c: number, count: number, hue: Particle['hue'], start: number) {
    for (let i = 0; i < Math.round(count * this.particleScale); i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
      this.particles.push({ x: c, y: r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.8, born: start, life: 420 + Math.random() * 420, size: 0.05 + Math.random() * 0.08, hue: i % 3 === 0 ? 'cyan' : hue, spin: Math.random() * 6 });
    }
    // Keep particle counts bounded on long chains.
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
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
      if (this.particles.length > 600) continue;
      const count = Math.round((cell.pulse ? 12 : 7) * this.particleScale * intensity * (this.odMove ? 1.3 : 1));
      const r = Math.floor(k / n), c = k % n;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.8 * intensity;
        this.particles.push({
          x: c + 0.2 + Math.random() * 0.6, y: r + 0.2 + Math.random() * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6,
          born: start, life: 260 + Math.random() * 260, size: 0.06 + Math.random() * 0.09,
          hue: cell.pulse ? 'cyan' : i % 3 === 0 ? 'white' : this.odMove && i % 3 === 1 ? 'gold' : 'ti', spin: Math.random() * 6,
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
    this.motes = []; this.pendingOd = 0;
    if (this.materialWave) { setMaterial(this.materialWave.to); this.materialWave = null; }
    this.complete();
  }

  update(now: number, dt: number) {
    while (this.events.length && this.events[0].at <= now) this.events.shift()!.fn();
    for (const [k, t0] of this.settles) if (now - t0 > 200) this.settles.delete(k);
    if (this.glints.length) this.glints = this.glints.filter((gl) => now < gl.start + gl.dur);
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
    this.motes = this.motes.filter((m) => {
      if (now < m.start + m.dur) return true;
      this.pendingOd = Math.max(0, this.pendingOd - m.share);
      this.odArrivals.push(now);
      this.hooks.onOdMote?.();
      return false;
    });
    if (!this.motes.length) this.pendingOd = 0;
    this.odArrivals = this.odArrivals.filter((t) => now < t + 500);
    if (this.afterglow && now > this.afterglow.start + this.afterglow.dur) this.afterglow = null;
    if (this.placePulse && now > this.placePulse.start + this.placePulse.dur) this.placePulse = null;
    if (this.glowCells && now > this.glowCells.start + this.glowCells.dur) this.glowCells = null;
    if (this.celebrate && now > this.celebrate.start + this.celebrate.dur) this.celebrate = null;
    if (this.materialWave && now > this.materialWave.start + this.materialWave.dur) { setMaterial(this.materialWave.to); this.materialWave = null; }
    if (this.shake && now > this.shake.start + this.shake.dur) this.shake = null;
    if (this.contact && now > this.contact.start + this.contact.dur) this.contact = null;
    if (this.perfectWave && now > this.perfectWave.start + this.perfectWave.dur) this.perfectWave = null;
    if (this.odWave && now > this.odWave.start + this.odWave.dur) this.odWave = null;
    if (this.flash && now > this.flash.start + this.flash.dur) this.flash = null;
    const s = Math.min(dt, 50) / 1000;
    this.particles = this.particles.filter((p) => {
      if (now < p.born) return true;
      p.x += p.vx * s; p.y += p.vy * s; p.vy += 4 * s; p.vx *= 0.97; p.vy *= 0.97;
      return now < p.born + p.life;
    });
  }
}
