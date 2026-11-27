// Build 4: data structures and evaluation for a future Mission Mode (Build 5). No missions or campaign ship yet.
// A mission is a hand-designed puzzle: fixed board, fixed piece sequence, an objective, and a validated solution.

import type { Board, PieceInstance } from './board';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { newGame, type GameState, type MoveResult } from './game';
import { applyPlan, legalPlans, type Plan } from './sim';

export type MissionObjective =
  | { type: 'clear-lines'; target: number }
  | { type: 'multi-clear'; target: number }
  | { type: 'pulse-chain'; target: number }
  | { type: 'clear-board' }
  | { type: 'score'; target: number }
  | { type: 'overdrive-combo'; lines: number };

export interface MissionDef {
  id: string;
  board: Board;
  sequence: PieceInstance[];
  startEnergy: number;
  startOverdrive: number;
  placementLimit: number;
  objective: MissionObjective;
  /** 1 (easy) to 5. */
  difficulty: number;
  /** Optional star thresholds, e.g. placements used or score. */
  stars?: number[];
  /** A sequence of plans proven to meet the objective. */
  solution?: Plan[];
}

export function missionGame(m: MissionDef, cfg: GameConfig = DEFAULT_CONFIG): GameState {
  return newGame(1, cfg, {
    board: { size: m.board.size, cells: m.board.cells.map((c) => (c ? { ...c } : null)) },
    energy: m.startEnergy, overdrive: m.startOverdrive, mode: 'daily',
    daily: { id: `mission:${m.id}`, limit: m.placementLimit, sequence: m.sequence.map((p) => ({ ...p })) },
  });
}

/** Has this run of results met the objective? */
export function objectiveMet(o: MissionObjective, state: GameState, results: MoveResult[]): boolean {
  switch (o.type) {
    case 'clear-lines': return state.stats.linesCleared >= o.target;
    case 'multi-clear': return results.some((r) => r.rows.length + r.cols.length >= o.target);
    case 'pulse-chain': return results.some((r) => r.chain >= o.target);
    case 'clear-board': return results.some((r) => r.perfect);
    case 'score': return state.score >= o.target;
    case 'overdrive-combo': return results.some((r) => r.odActive && r.rows.length + r.cols.length >= o.lines);
  }
}

/** Replays a solution and reports whether it is legal and meets the objective. */
export function verifySolution(m: MissionDef, cfg: GameConfig = DEFAULT_CONFIG): boolean {
  if (!m.solution) return false;
  let s = missionGame(m, cfg);
  const results: MoveResult[] = [];
  for (const p of m.solution) {
    const step = applyPlan(s, p, cfg);
    if (!step) return false;
    s = step.state; results.push(step.result);
  }
  return objectiveMet(m.objective, s, results);
}

/** Small depth-limited search for a solution (enough for short designed puzzles; a foundation for a real solver). */
export function searchSolution(m: MissionDef, cfg: GameConfig = DEFAULT_CONFIG, maxDepth = 3, budget = 20000): Plan[] | null {
  let visits = 0;
  const go = (s: GameState, results: MoveResult[], path: Plan[]): Plan[] | null => {
    if (objectiveMet(m.objective, s, results)) return path;
    if (path.length >= maxDepth || s.over || ++visits > budget) return null;
    for (const p of legalPlans(s, cfg)) {
      const step = applyPlan(s, p, cfg);
      if (!step) continue;
      const r = go(step.state, [...results, step.result], [...path, p]);
      if (r) return r;
    }
    return null;
  };
  return go(missionGame(m, cfg), [], []);
}
