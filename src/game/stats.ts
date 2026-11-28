// Lifetime statistics and Build 3 career progression, stored locally. Pure update functions; persistence is in
// platform/storage. Lifetime points are credited once per move: each credit records (game seed, move number), so
// restoring a game, reopening results or restarting the app can never count a move twice.

import type { GameMode, GameStats, MoveResult } from '../engine/game';

export type MaterialMode = 'progressive' | 'fixed';

export interface LifetimeStats {
  version: 1;
  bestScore: number;
  gamesPlayed: number;
  totalScore: number;
  totalLines: number;
  maxLinesAtOnce: number;
  /** Build 10: most rows (not columns) cleared by one placement. Starts at 0 for older careers (not recorded before). */
  maxRowsAtOnce: number;
  maxCombo: number;
  totalPulses: number;
  maxChain: number;
  totalPlayMs: number;
  /** Local dates (YYYY-MM-DD) with at least one placement. */
  days: string[];
  // Build 2
  totalRotations: number;
  energyEarned: number;
  energySpent: number;
  /** Most games played back to back in one app session. */
  maxGamesInSession: number;
  // Build 3 career
  highestLevel: number;
  /** Points from every scored move, credited as they happen (abandoned games included). */
  lifetimePoints: number;
  /** Permanently unlocked material ids. */
  unlockedMaterials: string[];
  /** Achievement id -> time earned (ms). */
  achievements: Record<string, number>;
  materialMode: MaterialMode;
  fixedMaterial: string;
  /** Contextual tips already shown (progress bar, level up, materials, unlocks). */
  tipsSeen: string[];
  /** Last move credited: guards lifetime totals against double counting. */
  lastCredit: { seed: number; moves: number } | null;
  // Build 4. `bestScore` is now the Classic record under the current ruleset (2); Builds 1–3 records are kept
  // separately and labelled, never compared with new ones.
  recordsRuleset: number;
  legacyBestScore: number;
  perfectClears: number;
  comboProtected: number;
  odActivations: number;
  odFreeRotations: number;
  /** Most points from one Overdrive activation. */
  odBestScore: number;
  /** Most lines cleared in one move during Overdrive (the largest Overdrive clear). */
  odMaxLines: number;
  odMaxChain: number;
  /** Daily summary, mirrored from the daily records so achievements and Statistics can read it. */
  dailyCompleted: number;
  currentStreak: number;
  longestStreak: number;
  bestDaily: number;
}

/** What kind of game a move or result came from (records are kept apart by mode and ruleset). */
export interface RecordContext {
  mode: GameMode;
  ruleset: number;
  /** The game's running stats after the move (for Overdrive maxima). */
  game?: GameStats;
}

const CLASSIC2: RecordContext = { mode: 'classic', ruleset: 2 };
const isCurrentClassic = (c: RecordContext) => c.mode !== 'daily' && c.ruleset >= 2;
const isLegacyClassic = (c: RecordContext) => c.mode !== 'daily' && c.ruleset < 2;

export const emptyStats = (): LifetimeStats => ({
  version: 1, bestScore: 0, gamesPlayed: 0, totalScore: 0, totalLines: 0, maxLinesAtOnce: 0, maxRowsAtOnce: 0,
  maxCombo: 0, totalPulses: 0, maxChain: 0, totalPlayMs: 0, days: [],
  totalRotations: 0, energyEarned: 0, energySpent: 0, maxGamesInSession: 0,
  highestLevel: 1, lifetimePoints: 0, unlockedMaterials: ['magenta'], achievements: {}, materialMode: 'progressive',
  fixedMaterial: 'magenta', tipsSeen: [], lastCredit: null,
  recordsRuleset: 2, legacyBestScore: 0, perfectClears: 0, comboProtected: 0, odActivations: 0, odFreeRotations: 0,
  odBestScore: 0, odMaxLines: 0, odMaxChain: 0, dailyCompleted: 0, currentStreak: 0, longestStreak: 0, bestDaily: 0,
});

export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Folds one resolved move into the lifetime stats (so records survive an abandoned game).
 * `credit` identifies the move (game seed and its move count after the move); a move already credited is ignored.
 */
export function recordMove(s: LifetimeStats, r: MoveResult, credit?: { seed: number; moves: number }, day = localDay(), ctx: RecordContext = CLASSIC2): LifetimeStats {
  if (credit && s.lastCredit && s.lastCredit.seed === credit.seed && credit.moves <= s.lastCredit.moves) return s;
  const lines = r.rows.length + r.cols.length;
  const g = ctx.game;
  return {
    ...s,
    lastCredit: credit ?? s.lastCredit,
    lifetimePoints: s.lifetimePoints + r.points.total,
    highestLevel: ctx.mode === 'daily' ? s.highestLevel : Math.max(s.highestLevel, r.levelAfter ?? 1),
    bestScore: isCurrentClassic(ctx) ? Math.max(s.bestScore, r.scoreAfter) : s.bestScore,
    legacyBestScore: isLegacyClassic(ctx) ? Math.max(s.legacyBestScore, r.scoreAfter) : s.legacyBestScore,
    perfectClears: s.perfectClears + (r.perfect ? 1 : 0),
    comboProtected: s.comboProtected + (r.comboProtected ? 1 : 0),
    odBestScore: Math.max(s.odBestScore, g?.odBestScore ?? 0),
    odMaxLines: Math.max(s.odMaxLines, r.odActive ? lines : 0, g?.odMaxLines ?? 0),
    odMaxChain: Math.max(s.odMaxChain, r.odActive ? r.chain : 0, g?.odMaxChain ?? 0),
    totalLines: s.totalLines + lines,
    maxLinesAtOnce: Math.max(s.maxLinesAtOnce, lines),
    maxRowsAtOnce: Math.max(s.maxRowsAtOnce ?? 0, r.rows.length),
    maxCombo: Math.max(s.maxCombo, r.combo),
    totalPulses: s.totalPulses + r.chain,
    maxChain: Math.max(s.maxChain, r.chain),
    energyEarned: s.energyEarned + r.energyGained,
    days: s.days.includes(day) ? s.days : [...s.days, day],
  };
}

/** A finished (or abandoned) game. */
export function recordGameEnd(s: LifetimeStats, score: number, ctx: RecordContext = CLASSIC2): LifetimeStats {
  return {
    ...s, gamesPlayed: s.gamesPlayed + 1, totalScore: s.totalScore + score,
    bestScore: isCurrentClassic(ctx) ? Math.max(s.bestScore, score) : s.bestScore,
    legacyBestScore: isLegacyClassic(ctx) ? Math.max(s.legacyBestScore, score) : s.legacyBestScore,
  };
}

export function recordRotation(s: LifetimeStats, cost: number, free = false): LifetimeStats {
  return { ...s, totalRotations: s.totalRotations + 1, energySpent: s.energySpent + cost, odFreeRotations: s.odFreeRotations + (free ? 1 : 0) };
}

export function recordOverdriveActivation(s: LifetimeStats): LifetimeStats {
  return { ...s, odActivations: s.odActivations + 1 };
}

/** Copies the daily summary into the career (achievements and Statistics read it from here). */
export function syncDaily(s: LifetimeStats, d: { completed: number; current: number; longest: number; best: number }): LifetimeStats {
  return { ...s, dailyCompleted: d.completed, currentStreak: d.current, longestStreak: Math.max(s.longestStreak, d.longest), bestDaily: Math.max(s.bestDaily, d.best) };
}

export function recordSessionGames(s: LifetimeStats, gamesThisSession: number): LifetimeStats {
  return { ...s, maxGamesInSession: Math.max(s.maxGamesInSession, gamesThisSession) };
}

export function addPlayTime(s: LifetimeStats, ms: number): LifetimeStats {
  return { ...s, totalPlayMs: s.totalPlayMs + Math.max(0, ms) };
}

export const averageScore = (s: LifetimeStats) => (s.gamesPlayed ? Math.round(s.totalScore / s.gamesPlayed) : 0);
export const averageRotations = (s: LifetimeStats) => (s.gamesPlayed ? Math.round((s.totalRotations / s.gamesPlayed) * 10) / 10 : 0);
export const averageSessionMs = (s: LifetimeStats) => (s.gamesPlayed ? s.totalPlayMs / s.gamesPlayed : 0);

export function parseStats(raw: string | null): LifetimeStats {
  if (!raw) return emptyStats();
  try {
    const d = JSON.parse(raw);
    if (d && d.version === 1) {
      const st: LifetimeStats = { ...emptyStats(), ...d };
      // Build 3 and earlier careers: their best was set under ruleset 1, so it becomes the labelled legacy record.
      if (d.recordsRuleset === undefined) { st.legacyBestScore = d.bestScore ?? 0; st.bestScore = 0; st.recordsRuleset = 2; }
      return st;
    }
  } catch { /* fall through */ }
  return emptyStats();
}
