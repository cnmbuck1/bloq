// Build 4 Game Center layer. On iPhone it talks to a small native Capacitor plugin (ios/App/App/GameCenterPlugin.swift,
// not yet verified on a device); everywhere else Game Center is unavailable and BLOQ shows personal records instead.
// Sign-in is optional and never blocks play. Scores wait in a local queue while offline and are sent when possible.
// A rank is only ever shown when Game Center actually returned it. Developer sessions never submit.

import { Capacitor, registerPlugin } from '@capacitor/core';

export type LeaderboardKey = 'classic' | 'level' | 'chain' | 'daily';

/** Game Center leaderboard ids. Classic score and level are per ruleset, so ruleset 1 records never mix in. */
export const LEADERBOARDS: Record<LeaderboardKey, { id: string; name: string }> = {
  classic: { id: 'bloq.classic.score.r2', name: 'Classic High Score' },
  level: { id: 'bloq.classic.level.r2', name: 'Highest Level' },
  chain: { id: 'bloq.chain.largest', name: 'Largest Chain Reaction' },
  // A recurring leaderboard in App Store Connect, resetting daily at 00:00 UTC to match the challenge day.
  daily: { id: 'bloq.daily.score', name: 'Daily Challenge' },
};

export interface PendingSubmission {
  board: LeaderboardKey;
  score: number;
  /** Daily only: the challenge day the score belongs to. */
  day?: string;
  t: number;
}

/** Adds a submission, keeping only the best pending score per board (and per day for the Daily). */
export function queueSubmission(q: PendingSubmission[], s: PendingSubmission): PendingSubmission[] {
  const same = (p: PendingSubmission) => p.board === s.board && (p.day ?? '') === (s.day ?? '');
  const existing = q.find(same);
  if (existing && existing.score >= s.score) return q;
  return [...q.filter((p) => !same(p)), s];
}

/** Daily scores only count on their own day: anything queued for an earlier day is dropped, never sent late. */
export function pruneExpired(q: PendingSubmission[], today: string): PendingSubmission[] {
  return q.filter((p) => p.board !== 'daily' || p.day === today);
}

export interface RankEntry { rank: number; name: string; score: number; local?: boolean }
export interface BoardView { key: LeaderboardKey; entries: RankEntry[]; player: RankEntry | null }

interface NativeGameCenter {
  authenticate(): Promise<{ authenticated: boolean; name?: string }>;
  submitScore(o: { leaderboardId: string; score: number }): Promise<void>;
  loadEntries(o: { leaderboardId: string; scope: 'global' | 'friends'; count: number }): Promise<{ entries: RankEntry[]; player: RankEntry | null }>;
  showDashboard(o: { leaderboardId?: string }): Promise<void>;
}

const plugin = Capacitor.isNativePlatform() ? registerPlugin<NativeGameCenter>('GameCenter') : null;

let authed = false;
let playerName: string | null = null;
let authAttempt: Promise<boolean> | null = null;

export const gameCenterSupported = () => !!plugin;
export const gameCenterSignedIn = () => authed;
export const gameCenterPlayer = () => playerName;

/** Optional sign-in. Resolves false (never throws) when unavailable, declined or offline. */
export function authenticate(): Promise<boolean> {
  if (!plugin) return Promise.resolve(false);
  if (authed) return Promise.resolve(true);
  authAttempt ??= plugin.authenticate().then((r) => { authed = !!r.authenticated; playerName = r.name ?? null; return authed; })
    .catch(() => false).finally(() => { authAttempt = null; });
  return authAttempt;
}

/**
 * Sends what it can from the queue and returns what is left. Daily entries for past days are dropped first.
 * Failures leave entries queued for the next try.
 */
export async function flushQueue(q: PendingSubmission[], today: string): Promise<PendingSubmission[]> {
  let left = pruneExpired(q, today);
  if (!plugin || !left.length || !(await authenticate())) return left;
  for (const s of [...left]) {
    try {
      await plugin.submitScore({ leaderboardId: LEADERBOARDS[s.board].id, score: Math.round(s.score) });
      left = left.filter((p) => p !== s);
    } catch { /* offline or rejected: keep it queued */ }
  }
  return left;
}

/** Leaderboard entries from Game Center, or null when they could not be retrieved (show personal records instead). */
export async function loadBoard(key: LeaderboardKey, scope: 'global' | 'friends' = 'global'): Promise<BoardView | null> {
  if (!plugin || !(await authenticate())) return null;
  try {
    const r = await plugin.loadEntries({ leaderboardId: LEADERBOARDS[key].id, scope, count: 10 });
    return { key, entries: r.entries, player: r.player };
  } catch { return null; }
}

export function openDashboard(key?: LeaderboardKey) {
  plugin?.showDashboard({ leaderboardId: key ? LEADERBOARDS[key].id : undefined }).catch(() => {});
}
