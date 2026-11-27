// Board-state simulation shared by the Daily Challenge validator, the balancing bot and the future Mission solver.
// Pure: every function takes a state and returns new states through the real engine (applyMove / rotatePiece).

import { canPlace, findCompletedLines, placePiece, shapeOf } from './board';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { activateOverdrive, applyMove, effectiveRotation, overdriveCharged, rotatePiece, type GameState, type MoveResult } from './game';
import { reachableOrientations } from './rotation';

/** One complete player action: optional turns of a tray piece, then a placement. */
export interface Plan { slot: number; turns: number; row: number; col: number; value: number }

/** Every legal placement, in every orientation the player can reach right now (energy and Overdrive aware). */
export function legalPlans(s: GameState, cfg: GameConfig = DEFAULT_CONFIG): Plan[] {
  const out: Plan[] = [];
  const { rc, energy } = effectiveRotation(cfg, s);
  s.tray.forEach((p, slot) => {
    if (!p) return;
    reachableOrientations(rc, p, energy).forEach((o, turns) => {
      const shape = shapeOf(o.inst);
      for (let r = 0; r <= s.board.size - shape.rows; r++) for (let c = 0; c <= s.board.size - shape.cols; c++) {
        if (canPlace(s.board, shape, r, c)) out.push({ slot, turns, row: r, col: c, value: 0 });
      }
    });
  });
  return out;
}

/**
 * The greedy heuristic used by the bots: most lines, Pulses in those lines, low and central placement, larger
 * pieces, and a small cost per Rotation Energy charge spent. Deliberately simple (no lookahead): real players plan.
 */
export function greedyPlan(s: GameState, cfg: GameConfig = DEFAULT_CONFIG): Plan | null {
  let best: Plan | null = null;
  const { rc, energy } = effectiveRotation(cfg, s);
  const n = s.board.size;
  s.tray.forEach((p, slot) => {
    if (!p) return;
    reachableOrientations(rc, p, energy).forEach((o, turns) => {
      const shape = shapeOf(o.inst);
      for (let r = 0; r <= n - shape.rows; r++) for (let c = 0; c <= n - shape.cols; c++) {
        if (!canPlace(s.board, shape, r, c)) continue;
        const { board } = placePiece(s.board, o.inst, r, c);
        const { rows, cols } = findCompletedLines(board);
        let pulse = 0;
        for (const rr of rows) for (let i = 0; i < n; i++) if (board.cells[rr * n + i]?.pulse) pulse++;
        for (const cc of cols) for (let i = 0; i < n; i++) if (board.cells[i * n + cc]?.pulse) pulse++;
        const v = (rows.length + cols.length) * 100 + pulse * 30 + r * 2 - Math.abs(c - (n - 1) / 2) + shape.cells.length - o.spent * 12;
        if (!best || v > best.value) best = { slot, turns, row: r, col: c, value: v };
      }
    });
  });
  return best;
}

/** Carry out a plan through the engine. Returns null if any step is refused. */
export function applyPlan(s: GameState, plan: Plan, cfg: GameConfig = DEFAULT_CONFIG): { state: GameState; result: MoveResult } | null {
  let cur = s;
  for (let t = 0; t < plan.turns; t++) {
    const ro = rotatePiece(cur, plan.slot, cfg);
    if (!ro.ok) return null;
    cur = ro.state;
  }
  const o = applyMove(cur, plan.slot, plan.row, plan.col, cfg);
  return o.ok ? { state: o.state, result: o.result } : null;
}

export interface BotRun { state: GameState; placements: number; results: MoveResult[]; overdrives: number; firstOverdriveMove: number }

/**
 * Plays greedily until game over or `maxMoves`. Overdrive policy: activate as soon as it's charged ("eager"),
 * or only when the board has no move without it ("rescue"), or never.
 */
export function playGreedy(start: GameState, cfg: GameConfig = DEFAULT_CONFIG, opts: { maxMoves?: number; overdrive?: 'eager' | 'rescue' | 'never' } = {}): BotRun {
  const maxMoves = opts.maxMoves ?? 2000;
  const policy = opts.overdrive ?? 'eager';
  let s = start;
  const results: MoveResult[] = [];
  let overdrives = 0, firstOverdriveMove = -1;
  while (!s.over && results.length < maxMoves) {
    if (policy !== 'never' && overdriveCharged(s)) {
      const plan = greedyPlan(s, cfg);
      if (policy === 'eager' || !plan) {
        const a = activateOverdrive(s, cfg);
        if (a.ok) { s = a.state; overdrives++; if (firstOverdriveMove < 0) firstOverdriveMove = results.length; }
      }
    }
    const plan = greedyPlan(s, cfg);
    if (!plan) break;
    const step = applyPlan(s, plan, cfg);
    if (!step) break;
    s = step.state;
    results.push(step.result);
  }
  return { state: s, placements: results.length, results, overdrives, firstOverdriveMove };
}
