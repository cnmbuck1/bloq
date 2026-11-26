// Versioned save data for an unfinished game. Pure (de)serialisation; storage lives in platform/.

import type { GameState } from './game';
import { PIECES } from './pieces';

export const SAVE_VERSION = 1;

export interface SaveDataV1 {
  version: 1;
  savedAt: number;
  /** Active play time so far, in ms. */
  elapsedMs: number;
  /** Best score when this game started (for the "New Personal Best" moment after restore). */
  bestAtStart: number;
  state: GameState;
}

export type SaveData = SaveDataV1;

export function serializeGame(state: GameState, elapsedMs: number, bestAtStart: number, now = Date.now()): string {
  const data: SaveDataV1 = { version: SAVE_VERSION, savedAt: now, elapsedMs, bestAtStart, state };
  return JSON.stringify(data);
}

const ids = new Set(PIECES.map((p) => p.id));

/** Parses and validates a save. Returns null for anything corrupt, unknown or finished. */
export function deserializeGame(raw: string | null): SaveData | null {
  if (!raw) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  const migrated = migrate(data);
  if (!migrated) return null;
  const s = migrated.state;
  if (!s || !s.board || !Array.isArray(s.board.cells) || s.board.cells.length !== s.board.size * s.board.size) return null;
  if (!Array.isArray(s.tray) || s.tray.some((p) => p && !ids.has(p.defId))) return null;
  if (typeof s.rngState !== 'number' || typeof s.score !== 'number') return null;
  if (s.over) return null;
  return migrated;
}

/** Upgrade older save formats here when SAVE_VERSION changes. */
function migrate(data: unknown): SaveData | null {
  if (!data || typeof data !== 'object') return null;
  const v = (data as { version?: number }).version;
  if (v === 1) return data as SaveDataV1;
  return null;
}
