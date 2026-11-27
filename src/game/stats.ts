// Lifetime statistics, stored locally. Pure update functions; persistence is in platform/storage.

import type { MoveResult } from '../engine/game';

export interface LifetimeStats {
  version: 1;
  bestScore: number;
  gamesPlayed: number;
  totalScore: number;
  totalLines: number;
  maxLinesAtOnce: number;
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
}

export const emptyStats = (): LifetimeStats => ({
  version: 1, bestScore: 0, gamesPlayed: 0, totalScore: 0, totalLines: 0, maxLinesAtOnce: 0,
  maxCombo: 0, totalPulses: 0, maxChain: 0, totalPlayMs: 0, days: [],
  totalRotations: 0, energyEarned: 0, energySpent: 0, maxGamesInSession: 0,
});

export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Folds one resolved move into the lifetime stats (so records survive an abandoned game). */
export function recordMove(s: LifetimeStats, r: MoveResult, day = localDay()): LifetimeStats {
  const lines = r.rows.length + r.cols.length;
  return {
    ...s,
    bestScore: Math.max(s.bestScore, r.scoreAfter),
    totalLines: s.totalLines + lines,
    maxLinesAtOnce: Math.max(s.maxLinesAtOnce, lines),
    maxCombo: Math.max(s.maxCombo, r.combo),
    totalPulses: s.totalPulses + r.chain,
    maxChain: Math.max(s.maxChain, r.chain),
    energyEarned: s.energyEarned + r.energyGained,
    days: s.days.includes(day) ? s.days : [...s.days, day],
  };
}

/** A finished (or abandoned) game. */
export function recordGameEnd(s: LifetimeStats, score: number): LifetimeStats {
  return { ...s, gamesPlayed: s.gamesPlayed + 1, totalScore: s.totalScore + score, bestScore: Math.max(s.bestScore, score) };
}

export function recordRotation(s: LifetimeStats, cost: number): LifetimeStats {
  return { ...s, totalRotations: s.totalRotations + 1, energySpent: s.energySpent + cost };
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
    if (d && d.version === 1) return { ...emptyStats(), ...d };
  } catch { /* fall through */ }
  return emptyStats();
}
