// Versioned save data for an unfinished game. Pure (de)serialisation; storage lives in platform/.
//
// v1 (Build 1): no rotation. v2 (Build 2): adds each piece's orientation, Rotation Energy and rotation stats.
// v1 saves migrate safely: pieces are unrotated, energy starts at the configured starting charges.

import { DEFAULT_CONFIG, type GameConfig } from './config';
import { freshStats, type GameState } from './game';
import { PIECES } from './pieces';

export const SAVE_VERSION = 2;

export interface SaveDataV2 {
  version: 2;
  savedAt: number;
  /** Active play time so far, in ms. */
  elapsedMs: number;
  /** Best score when this game started (for the "New Personal Best" moment after restore). */
  bestAtStart: number;
  state: GameState;
}

interface SaveDataV1 {
  version: 1;
  savedAt: number;
  elapsedMs: number;
  bestAtStart: number;
  state: Omit<GameState, 'energy'>;
}

export type SaveData = SaveDataV2;

export function serializeGame(state: GameState, elapsedMs: number, bestAtStart: number, now = Date.now()): string {
  const data: SaveDataV2 = { version: 2, savedAt: now, elapsedMs, bestAtStart, state };
  return JSON.stringify(data);
}

const ids = new Set(PIECES.map((p) => p.id));

/** Why a save was not restored, for the "your game was reset" explanation. */
export type SaveProblem = 'none' | 'missing' | 'corrupt' | 'unsupported' | 'finished';

/** Parses, migrates and validates a save. Returns null for anything corrupt, unknown or finished. */
export function deserializeGame(raw: string | null, cfg: GameConfig = DEFAULT_CONFIG): SaveData | null {
  return inspectSave(raw, cfg).data;
}

export function inspectSave(raw: string | null, cfg: GameConfig = DEFAULT_CONFIG): { data: SaveData | null; problem: SaveProblem } {
  if (!raw) return { data: null, problem: 'missing' };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { data: null, problem: 'corrupt' }; }
  const migrated = migrate(data, cfg);
  if (!migrated) return { data: null, problem: 'unsupported' };
  const s = migrated.state;
  if (!s || !s.board || !Array.isArray(s.board.cells) || s.board.cells.length !== s.board.size * s.board.size) return { data: null, problem: 'corrupt' };
  if (!Array.isArray(s.tray) || s.tray.some((p) => p && (!ids.has(p.defId) || ![0, 1, 2, 3].includes(p.rot ?? 0)))) return { data: null, problem: 'corrupt' };
  if (typeof s.rngState !== 'number' || typeof s.score !== 'number' || typeof s.energy !== 'number' || s.energy < 0) return { data: null, problem: 'corrupt' };
  if (s.over) return { data: null, problem: 'finished' };
  return { data: migrated, problem: 'none' };
}

/** Upgrade older save formats. Add a step here whenever SAVE_VERSION changes. */
function migrate(data: unknown, cfg: GameConfig): SaveData | null {
  if (!data || typeof data !== 'object') return null;
  const v = (data as { version?: number }).version;
  if (v === 2) {
    const d = data as SaveDataV2;
    return { ...d, state: { ...d.state, stats: { ...freshStats(), ...d.state.stats } } };
  }
  if (v === 1) {
    const d = data as SaveDataV1;
    if (!d.state || !Array.isArray(d.state.tray)) return null;
    return {
      version: 2, savedAt: d.savedAt, elapsedMs: d.elapsedMs, bestAtStart: d.bestAtStart,
      state: {
        ...d.state,
        tray: d.state.tray.map((p) => (p ? { ...p, rot: 0 } : null)),
        energy: cfg.rotation.startCharges,
        stats: { ...freshStats(), ...d.state.stats },
      },
    };
  }
  return null;
}
