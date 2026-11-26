// Animation controller. Replays a MoveResult as a timed sequence of visual events.
// It only reads the result: the engine state was already committed atomically, so skipping,
// interrupting or backgrounding mid-animation can never corrupt the board.

import type { Board, Cell } from '../engine/board';
import type { MoveResult } from '../engine/game';
import type { PulseWave } from '../engine/pulse';
import { THEME } from './theme';

export interface Dying { k: number; cell: Cell; start: number; dur: number }
export interface Shock { r: number; c: number; start: number; dur: number; wave: number }
export interface Sweep { kind: 'row' | 'col'; i: number; origin: number; start: number; dur: number }
export interface Particle { x: number; y: number; vx: number; vy: number; born: number; life: number; color: string; size: number }
export interface FloatText { text: string; r: number; c: number; start: number; dur: number }

export interface AnimationHooks {
  onLines?(result: MoveResult): void;
  onWave?(index: number, wave: PulseWave, result: MoveResult): void;
  onDone?(result: MoveResult): void;
}

export class Animator {
  /** Board to draw while a sequence runs (null = draw the live state). */
  display: Board | null = null;
  hidden = new Set<number>();
  pops = new Map<number, number>();
  glowCells: { cells: number[]; start: number; dur: number } | null = null;
  dying: Dying[] = [];
  shocks: Shock[] = [];
  sweeps: Sweep[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];
  shake: { start: number; dur: number; amp: number } | null = null;
  reduced = false;
  /** Floating "+points" text (off in the tutorial, which has no score). */
  showPoints = true;

  private events: { at: number; fn: () => void }[] = [];
  private current: MoveResult | null = null;
  private hooks: AnimationHooks = {};

  get busy() { return this.current !== null; }
  /** True while anything is still moving on screen (keeps the render loop alive). */
  get active() {
    return this.busy || this.dying.length > 0 || this.particles.length > 0 || this.shocks.length > 0 || this.floats.length > 0 || this.pops.size > 0 || !!this.shake || !!this.glowCells;
  }

  play(result: MoveResult, now: number, hooks: AnimationHooks) {
    this.finish(); // never overlap sequences
    this.current = result;
    this.hooks = hooks;
    this.display = result.boardAfterPlace;
    this.hidden = new Set();
    const k = this.reduced ? 0.65 : 1;
    const T = (ms: number) => now + ms * k;
    for (const p of result.placed) this.pops.set(p, now);

    const lines = result.rows.length + result.cols.length;
    if (lines === 0) {
      this.at(T(110), () => this.complete());
      return;
    }

    const n = result.boardAfterPlace.size;
    const pr = result.placed.map((p) => Math.floor(p / n)), pc = result.placed.map((p) => p % n);
    const midR = pr.reduce((a, b) => a + b, 0) / pr.length, midC = pc.reduce((a, b) => a + b, 0) / pc.length;

    // 1. highlight completed lines, 2. energy sweep outward from the placed piece
    this.glowCells = { cells: result.lineCells, start: T(40), dur: 330 * k };
    for (const r of result.rows) this.sweeps.push({ kind: 'row', i: r, origin: midC, start: T(70), dur: 260 * k });
    for (const c of result.cols) this.sweeps.push({ kind: 'col', i: c, origin: midR, start: T(70), dur: 260 * k });

    // 3. remove blocks, 4. update score
    const clearAt = 340;
    this.at(T(clearAt), () => {
      this.kill(result.lineCells, T(clearAt), 250 * k, result.boardAfterPlace);
      if (this.showPoints) this.floats.push({ text: `+${result.points.total}`, r: midR, c: midC, start: T(clearAt), dur: 900 });
      this.hooks.onLines?.(result);
      if (!this.reduced && lines >= 3) this.shake = { start: T(clearAt), dur: 260, amp: Math.min(2 + lines, 6) };
    });

    // 5. pulse chain waves
    let t = clearAt + 120;
    result.waves.forEach((wave, i) => {
      const at = t;
      this.at(T(at), () => {
        for (const p of wave.pulses) this.shocks.push({ r: Math.floor(p / n), c: p % n, start: T(at), dur: 460 * k, wave: i });
        this.kill(wave.cleared, T(at) + 50 * k, 240 * k, result.boardAfterPlace);
        this.hooks.onWave?.(i, wave, result);
        if (!this.reduced && (i >= 1 || wave.pulses.length > 1)) this.shake = { start: T(at), dur: 220, amp: Math.min(2 + i * 1.5, 7) };
      });
      t += 220;
    });
    this.at(T(t + 140), () => this.complete());
  }

  private at(at: number, fn: () => void) { this.events.push({ at, fn }); this.events.sort((a, b) => a.at - b.at); }

  private kill(cells: number[], start: number, dur: number, b: Board) {
    const n = b.size;
    for (const k of cells) {
      const cell = b.cells[k];
      if (!cell || this.hidden.has(k)) continue;
      this.hidden.add(k);
      this.dying.push({ k, cell, start, dur });
      const count = this.reduced ? 1 : cell.pulse ? 10 : 5;
      const color = cell.pulse ? THEME.pulseCyan : THEME.blocks[cell.color % THEME.blocks.length];
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3.5;
        this.particles.push({
          x: (k % n) + 0.5, y: Math.floor(k / n) + 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
          born: start, life: 420 + Math.random() * 380, color, size: 0.1 + Math.random() * 0.12,
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
    this.complete();
  }

  update(now: number, dt: number) {
    while (this.events.length && this.events[0].at <= now) this.events.shift()!.fn();
    for (const [k, t0] of this.pops) if (now - t0 > 160) this.pops.delete(k);
    this.dying = this.dying.filter((d) => now < d.start + d.dur);
    this.shocks = this.shocks.filter((s) => now < s.start + s.dur);
    this.sweeps = this.sweeps.filter((s) => now < s.start + s.dur);
    this.floats = this.floats.filter((f) => now < f.start + f.dur);
    if (this.glowCells && now > this.glowCells.start + this.glowCells.dur) this.glowCells = null;
    if (this.shake && now > this.shake.start + this.shake.dur) this.shake = null;
    const s = Math.min(dt, 50) / 1000;
    this.particles = this.particles.filter((p) => {
      if (now < p.born) return true;
      p.x += p.vx * s; p.y += p.vy * s; p.vy += 9 * s; p.vx *= 0.985;
      return now < p.born + p.life;
    });
  }
}
