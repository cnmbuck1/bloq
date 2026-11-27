// The Classic Mode game: one immutable state and one pure move function.
// applyMove computes the whole resolution (placement, lines, pulse waves, score, new tray, game over)
// in one step and returns a new state. Animations replay the returned MoveResult; they never touch state,
// so an interrupted or skipped animation cannot corrupt the board.

import { DEFAULT_CONFIG, type GameConfig } from './config';
import {
  canPlace, emptyBoard, findCompletedLines, lineCells, placePiece, shapeOf,
  type Board, type PieceInstance,
} from './board';
import { generateTray } from './generator';
import { isGameOverWithRotation, rotated, rotationAllowed, rotationCost } from './rotation';
import { resolvePulses, type PulseWave } from './pulse';
import { Rng } from './rng';
import { scoreMove, type ScoreBreakdown } from './scoring';

export type GameMode = 'classic' | 'tutorial';

export interface GameStats {
  moves: number;
  linesCleared: number;
  maxLinesAtOnce: number;
  maxCombo: number;
  pulsesActivated: number;
  maxChain: number;
  blocksPlaced: number;
  rotations: number;
  energySpent: number;
  energyEarned: number;
}

export interface GameState {
  mode: GameMode;
  seed: number;
  rngState: number;
  board: Board;
  tray: (PieceInstance | null)[];
  /** Recently generated piece ids (repetition control). */
  recent: string[];
  score: number;
  /** Consecutive clearing moves so far (0 = none). */
  combo: number;
  /** Rotation Energy charges available. */
  energy: number;
  stats: GameStats;
  over: boolean;
  /** Pulse chance override (tutorial / tests). undefined = config. */
  pulseChance?: number;
}

export interface MoveResult {
  slot: number;
  piece: PieceInstance;
  row: number;
  col: number;
  placed: number[];
  /** Board right after placement, before anything clears (what animations start from). */
  boardAfterPlace: Board;
  rows: number[];
  cols: number[];
  lineCells: number[];
  waves: PulseWave[];
  chain: number;
  points: ScoreBreakdown;
  combo: number;
  scoreBefore: number;
  scoreAfter: number;
  /** Rotation Energy restored by this move's completed lines (after the cap). */
  energyGained: number;
  energyAfter: number;
  newTray: boolean;
  gameOver: boolean;
}

export type MoveOutcome =
  | { ok: true; state: GameState; result: MoveResult }
  | { ok: false; reason: 'over' | 'empty-slot' | 'blocked' };

export type RotateOutcome =
  | { ok: true; state: GameState; cost: number; piece: PieceInstance }
  | { ok: false; reason: 'over' | 'empty-slot' | 'disabled' | 'no-energy' };

export const freshStats = (): GameStats => ({
  moves: 0, linesCleared: 0, maxLinesAtOnce: 0, maxCombo: 0, pulsesActivated: 0, maxChain: 0, blocksPlaced: 0,
  rotations: 0, energySpent: 0, energyEarned: 0,
});

/** Rotation-aware game over for a state. */
export function stateIsOver(s: Pick<GameState, 'board' | 'tray' | 'energy'>, cfg: GameConfig = DEFAULT_CONFIG): boolean {
  return isGameOverWithRotation(cfg.rotation, s.board, s.tray, s.energy);
}

export function newGame(seed: number, cfg: GameConfig = DEFAULT_CONFIG, opts: { board?: Board; pulseChance?: number; mode?: GameMode; energy?: number } = {}): GameState {
  const rng = new Rng(seed);
  const board = opts.board ?? emptyBoard(cfg.boardSize);
  const energy = opts.energy ?? cfg.rotation.startCharges;
  const { tray, recent } = generateTray(cfg, board, rng, { score: 0, recent: [], pulseChance: opts.pulseChance, energy });
  const state: GameState = {
    mode: opts.mode ?? 'classic', seed, rngState: rng.state, board, tray, recent, score: 0, combo: 0, energy,
    stats: freshStats(), over: false, pulseChance: opts.pulseChance,
  };
  state.over = stateIsOver(state, cfg);
  return state;
}

/** Rotate a tray piece 90° clockwise, paying Rotation Energy when the turn changes the piece. */
export function rotatePiece(state: GameState, slot: number, cfg: GameConfig = DEFAULT_CONFIG): RotateOutcome {
  if (state.over) return { ok: false, reason: 'over' };
  const piece = state.tray[slot];
  if (!piece) return { ok: false, reason: 'empty-slot' };
  if (cfg.rotation.mode === 'none') return { ok: false, reason: 'disabled' };
  if (!rotationAllowed(cfg.rotation, piece, state.energy)) return { ok: false, reason: 'no-energy' };
  const cost = rotationCost(cfg.rotation, piece);
  const next = rotated(piece);
  const tray = state.tray.slice();
  tray[slot] = next;
  const energy = state.energy - cost;
  const stats = { ...state.stats, rotations: state.stats.rotations + 1, energySpent: state.stats.energySpent + cost };
  const s: GameState = { ...state, tray, energy, stats };
  s.over = stateIsOver(s, cfg);
  return { ok: true, state: s, cost, piece: next };
}

export function applyMove(state: GameState, slot: number, row: number, col: number, cfg: GameConfig = DEFAULT_CONFIG): MoveOutcome {
  if (state.over) return { ok: false, reason: 'over' };
  const piece = state.tray[slot];
  if (!piece) return { ok: false, reason: 'empty-slot' };
  if (!canPlace(state.board, shapeOf(piece), row, col)) return { ok: false, reason: 'blocked' };

  const { board: afterPlace, placed } = placePiece(state.board, piece, row, col);
  const { rows, cols } = findCompletedLines(afterPlace);
  const lines = lineCells(afterPlace, rows, cols);
  const pulse = resolvePulses(afterPlace, lines);
  const lineCount = rows.length + cols.length;

  const combo = lineCount > 0 ? state.combo + 1 : 0;
  const points = scoreMove(cfg.scoring, {
    blocksPlaced: placed.length, lineCount, pulsesActivated: pulse.activated, pulseCleared: pulse.pulseCleared, combo,
  });

  const board: Board = { size: afterPlace.size, cells: afterPlace.cells.slice() };
  for (const k of pulse.allCleared) board.cells[k] = null;

  // Rotation Energy: one charge back per completed line (Pulse-only removals restore nothing), capped.
  const rc = cfg.rotation;
  const energy = rc.mode === 'energy' ? Math.min(rc.maxCharges, state.energy + lineCount * rc.energyPerLine) : state.energy;
  const energyGained = energy - state.energy;

  let tray = state.tray.slice();
  tray[slot] = null;
  let recent = state.recent;
  let rngState = state.rngState;
  const score = state.score + points.total;
  const newTray = tray.every((p) => !p);
  if (newTray) {
    const rng = new Rng(rngState);
    const gen = generateTray(cfg, board, rng, { score, recent, pulseChance: state.pulseChance, energy });
    tray = gen.tray; recent = gen.recent; rngState = rng.state;
  }

  const s = state.stats;
  const stats: GameStats = {
    moves: s.moves + 1,
    linesCleared: s.linesCleared + lineCount,
    maxLinesAtOnce: Math.max(s.maxLinesAtOnce, lineCount),
    maxCombo: Math.max(s.maxCombo, combo),
    pulsesActivated: s.pulsesActivated + pulse.activated,
    maxChain: Math.max(s.maxChain, pulse.activated),
    blocksPlaced: s.blocksPlaced + placed.length,
    rotations: s.rotations ?? 0,
    energySpent: s.energySpent ?? 0,
    energyEarned: (s.energyEarned ?? 0) + energyGained,
  };
  // Game over is checked on the fully resolved board, after every clear, chain and energy restore,
  // against every remaining piece in every orientation the player can afford.
  const next: GameState = { ...state, board, tray, recent, rngState, score, combo, energy, stats, over: false };
  const over = stateIsOver(next, cfg);
  next.over = over;

  return {
    ok: true,
    state: next,
    result: {
      slot, piece, row, col, placed, boardAfterPlace: afterPlace, rows, cols, lineCells: lines,
      waves: pulse.waves, chain: pulse.activated, points, combo, scoreBefore: state.score, scoreAfter: score,
      energyGained, energyAfter: energy, newTray, gameOver: over,
    },
  };
}
