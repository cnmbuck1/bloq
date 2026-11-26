// The Classic Mode game: one immutable state and one pure move function.
// applyMove computes the whole resolution (placement, lines, pulse waves, score, new tray, game over)
// in one step and returns a new state. Animations replay the returned MoveResult; they never touch state,
// so an interrupted or skipped animation cannot corrupt the board.

import { DEFAULT_CONFIG, type GameConfig } from './config';
import {
  canPlace, emptyBoard, findCompletedLines, isGameOver, lineCells, placePiece,
  type Board, type PieceInstance,
} from './board';
import { generateTray } from './generator';
import { pieceDef } from './pieces';
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
  newTray: boolean;
  gameOver: boolean;
}

export type MoveOutcome =
  | { ok: true; state: GameState; result: MoveResult }
  | { ok: false; reason: 'over' | 'empty-slot' | 'blocked' };

const freshStats = (): GameStats => ({
  moves: 0, linesCleared: 0, maxLinesAtOnce: 0, maxCombo: 0, pulsesActivated: 0, maxChain: 0, blocksPlaced: 0,
});

export function newGame(seed: number, cfg: GameConfig = DEFAULT_CONFIG, opts: { board?: Board; pulseChance?: number; mode?: GameMode } = {}): GameState {
  const rng = new Rng(seed);
  const board = opts.board ?? emptyBoard(cfg.boardSize);
  const { tray, recent } = generateTray(cfg, board, rng, { score: 0, recent: [], pulseChance: opts.pulseChance });
  const state: GameState = {
    mode: opts.mode ?? 'classic', seed, rngState: rng.state, board, tray, recent, score: 0, combo: 0,
    stats: freshStats(), over: false, pulseChance: opts.pulseChance,
  };
  state.over = isGameOver(board, tray);
  return state;
}

export function applyMove(state: GameState, slot: number, row: number, col: number, cfg: GameConfig = DEFAULT_CONFIG): MoveOutcome {
  if (state.over) return { ok: false, reason: 'over' };
  const piece = state.tray[slot];
  if (!piece) return { ok: false, reason: 'empty-slot' };
  const def = pieceDef(piece.defId);
  if (!canPlace(state.board, def, row, col)) return { ok: false, reason: 'blocked' };

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

  let tray = state.tray.slice();
  tray[slot] = null;
  let recent = state.recent;
  let rngState = state.rngState;
  const score = state.score + points.total;
  const newTray = tray.every((p) => !p);
  if (newTray) {
    const rng = new Rng(rngState);
    const gen = generateTray(cfg, board, rng, { score, recent, pulseChance: state.pulseChance });
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
  };
  // Game over is checked on the fully resolved board, after every clear and chain.
  const over = isGameOver(board, tray);
  const next: GameState = { ...state, board, tray, recent, rngState, score, combo, stats, over };

  return {
    ok: true,
    state: next,
    result: {
      slot, piece, row, col, placed, boardAfterPlace: afterPlace, rows, cols, lineCells: lines,
      waves: pulse.waves, chain: pulse.activated, points, combo, scoreBefore: state.score, scoreAfter: score,
      newTray, gameOver: over,
    },
  };
}
