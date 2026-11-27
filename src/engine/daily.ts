// Build 4 Daily Challenge: one deterministic configuration per UTC day, identical for every player.
// Unlike Classic, the whole piece sequence is generated in advance and never adapts to the player's board, so
// everyone faces the same pieces in the same order (they may still choose which tray piece to place first).

import { emptyBoard, findCompletedLines, type Board, type PieceInstance } from './board';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { newGame, type GameState } from './game';
import { generateTray } from './generator';
import { pieceDef } from './pieces';
import { Rng, seedFromString } from './rng';
import { legalPlans, playGreedy } from './sim';

export interface DailyChallenge {
  /** UTC date, YYYY-MM-DD. Also the challenge identifier. */
  id: string;
  ruleset: number;
  /** Which generation attempt passed validation (0 = first). */
  attempt: number;
  seed: number;
  board: Board;
  sequence: PieceInstance[];
  startEnergy: number;
  startOverdrive: number;
  placementLimit: number;
  pulseChance: number;
}

/** The challenge id for a moment in time: the UTC calendar date. */
export function challengeId(d: Date | number = Date.now()): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Milliseconds until the next UTC midnight (the next challenge). */
export function msUntilNextChallenge(now: number = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

/** Adds whole days to a challenge id. */
export function addDays(id: string, days: number): string {
  const [y, m, d] = id.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A sparse random starting board with no completed line, sometimes with one Pulse Block. */
function startingBoard(rng: Rng, cfg: GameConfig): Board {
  const [lo, hi] = cfg.daily.startBlocks;
  const n = cfg.boardSize;
  for (;;) {
    const b = emptyBoard(n);
    const count = lo + rng.int(hi - lo + 1);
    // Blocks lean toward the lower half, like a game a few moves in.
    let placed = 0;
    while (placed < count) {
      const r = Math.min(n - 1, Math.floor(n / 2 + rng.next() * rng.next() * n * 0.9 - n * 0.25));
      const c = rng.int(n);
      const k = Math.max(0, r) * n + c;
      if (b.cells[k]) continue;
      b.cells[k] = { color: 0 };
      placed++;
    }
    if (rng.next() < 0.6) {
      const filled = b.cells.map((c, k) => (c ? k : -1)).filter((k) => k >= 0);
      b.cells[filled[rng.int(filled.length)]] = { color: 0, pulse: true };
    }
    const l = findCompletedLines(b);
    if (l.rows.length + l.cols.length === 0) return b;
  }
}

/** Generates attempt `attempt` of a day's challenge. Deterministic for (id, attempt, ruleset, daily config). */
export function generateChallenge(id: string, cfg: GameConfig = DEFAULT_CONFIG, attempt = 0): DailyChallenge {
  const seed = seedFromString(`bloq-daily|${id}|r${cfg.ruleset}|a${attempt}`);
  const rng = new Rng(seed);
  const board = startingBoard(rng, cfg);
  // A fixed size mix, generated on an empty board so nothing depends on any player's state.
  const seqCfg: GameConfig = { ...cfg, difficulty: { ...cfg.difficulty, bands: [{ minLevel: 1, ...cfg.daily.band }] } };
  const limit = cfg.daily.placementLimit;
  const sequence: PieceInstance[] = [];
  let recent: string[] = [];
  const blank = emptyBoard(cfg.boardSize);
  while (sequence.length < Math.ceil(limit / cfg.traySize) * cfg.traySize) {
    const g = generateTray(seqCfg, blank, rng, { score: 0, level: 1, recent, pulseChance: cfg.daily.pulseChance, energy: cfg.daily.startEnergy });
    recent = g.recent;
    sequence.push(...g.tray);
  }
  return {
    id, ruleset: cfg.ruleset, attempt, seed, board, sequence,
    startEnergy: cfg.daily.startEnergy, startOverdrive: cfg.daily.startOverdrive, placementLimit: limit, pulseChance: cfg.daily.pulseChance,
  };
}

export function dailyGame(ch: DailyChallenge, cfg: GameConfig = DEFAULT_CONFIG): GameState {
  return newGame(ch.seed, cfg, {
    board: { size: ch.board.size, cells: ch.board.cells.map((c) => (c ? { ...c } : null)) },
    energy: ch.startEnergy, overdrive: ch.startOverdrive, pulseChance: ch.pulseChance, mode: 'daily', ruleset: ch.ruleset,
    daily: { id: ch.id, limit: ch.placementLimit, sequence: ch.sequence.map((p) => ({ ...p })) },
  });
}

export interface ChallengeReport { ok: boolean; problems: string[]; botScore: number; botPlacements: number; botOverdrives: number }

/** Minimum placements the greedy bot must survive for a challenge to count as playable (not broken). */
export const MIN_BOT_PLACEMENTS = 18;

/**
 * Development validation: a valid board and pieces, at least one opening move, and a greedy bot that gets well
 * into the challenge. Rejects broken (bot stuck early) and trivial (bot clears the board at the start) configurations.
 */
export function validateChallenge(ch: DailyChallenge, cfg: GameConfig = DEFAULT_CONFIG): ChallengeReport {
  const problems: string[] = [];
  const n = cfg.boardSize;
  if (ch.board.size !== n || ch.board.cells.length !== n * n) problems.push('board size');
  const l = findCompletedLines(ch.board);
  if (l.rows.length + l.cols.length) problems.push('starting board has a completed line');
  for (const p of ch.sequence) {
    try { const d = pieceDef(p.defId); if (p.pulseIndex >= d.cells.length) problems.push(`bad Pulse index on ${p.defId}`); } catch { problems.push(`unknown piece ${p.defId}`); }
  }
  if (ch.sequence.length < ch.placementLimit) problems.push('sequence shorter than the placement limit');
  const start = dailyGame(ch, cfg);
  if (legalPlans(start, cfg).length === 0) problems.push('no opening move');
  const run = playGreedy(start, cfg, { maxMoves: ch.placementLimit });
  if (run.placements < Math.min(MIN_BOT_PLACEMENTS, ch.placementLimit)) problems.push(`bot stuck after ${run.placements} placements`);
  if (run.results.slice(0, 2).some((r) => r.perfect)) problems.push('trivial: board clears immediately');
  return { ok: problems.length === 0, problems, botScore: run.state.score, botPlacements: run.placements, botOverdrives: run.overdrives };
}

/** The day's published challenge: the first generated attempt that passes validation (deterministic). */
export function dailyChallenge(id: string, cfg: GameConfig = DEFAULT_CONFIG): DailyChallenge {
  let first: DailyChallenge | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const ch = generateChallenge(id, cfg, attempt);
    first ??= ch;
    if (validateChallenge(ch, cfg).ok) return ch;
  }
  return first!;
}
