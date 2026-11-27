// Versioned save data for an unfinished game. Pure (de)serialisation; storage lives in platform/.
//
// v1 (Build 1): no rotation. v2 (Build 2): adds each piece's orientation, Rotation Energy and rotation stats.
// v1 saves migrate safely: pieces are unrotated, energy starts at the configured starting charges.
// v3 (Build 3): adds the current level. v2 saves migrate: the level is the one their score has reached
// (no level-up is replayed, so no energy or unlock is awarded twice).
// v4 (Build 4): scoring ruleset, Combo Protection, Overdrive, Daily Challenge progress. v1–v3 saves migrate as
// ruleset 1: they finish under the Build 1–3 scoring and thresholds they started with, and never mix with new records.

import { DEFAULT_CONFIG, LEGACY_RULESET_1, type GameConfig } from './config';
import { freshOverdrive, freshStats, type GameState } from './game';
import { PIECES } from './pieces';
import { levelForScore } from './progression';

export const SAVE_VERSION = 4;

export interface SaveDataV4 {
  version: 4;
  savedAt: number;
  elapsedMs: number;
  bestAtStart: number;
  state: GameState;
}

interface SaveDataV3 {
  version: 3;
  savedAt: number;
  /** Active play time so far, in ms. */
  elapsedMs: number;
  /** Best score when this game started (for the "New Personal Best" moment after restore). */
  bestAtStart: number;
  state: GameState;
}

interface SaveDataV2 {
  version: 2;
  savedAt: number;
  elapsedMs: number;
  bestAtStart: number;
  state: Omit<GameState, 'level'>;
}

interface SaveDataV1 {
  version: 1;
  savedAt: number;
  elapsedMs: number;
  bestAtStart: number;
  state: Omit<GameState, 'energy' | 'level'>;
}

export type SaveData = SaveDataV4;

export function serializeGame(state: GameState, elapsedMs: number, bestAtStart: number, now = Date.now()): string {
  const data: SaveDataV4 = { version: 4, savedAt: now, elapsedMs, bestAtStart, state };
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
  if (typeof s.level !== 'number' || s.level < 1 || !Number.isInteger(s.level)) return { data: null, problem: 'corrupt' };
  const od = s.od;
  if (!od || typeof od.charge !== 'number' || od.charge < 0 || od.charge > 100 || !Number.isInteger(od.active) || od.active < 0) return { data: null, problem: 'corrupt' };
  if (s.daily && (!Array.isArray(s.daily.sequence) || s.daily.sequence.some((p) => !ids.has(p.defId)) || typeof s.daily.seqPos !== 'number')) return { data: null, problem: 'corrupt' };
  if (s.over) return { data: null, problem: 'finished' };
  return { data: migrated, problem: 'none' };
}

/** Build 1–3 games: legacy ruleset, no Overdrive charge yet, protection starts empty. */
const toV4 = (d: { savedAt: number; elapsedMs: number; bestAtStart: number }, state: Omit<GameState, 'ruleset' | 'od' | 'shield'>): SaveDataV4 => ({
  version: 4, savedAt: d.savedAt, elapsedMs: d.elapsedMs, bestAtStart: d.bestAtStart,
  state: { ...state, ruleset: 1, shield: 0, od: freshOverdrive(), stats: { ...freshStats(), ...state.stats } } as GameState,
});

const legacyLevel = (cfg: GameConfig, st: { mode: string; score: number }) =>
  st.mode === 'classic' && typeof st.score === 'number'
    ? levelForScore({ ...cfg.progression, thresholds: LEGACY_RULESET_1.thresholds, extraGapStep: LEGACY_RULESET_1.extraGapStep }, st.score) : 1;

/** Upgrade older save formats. Add a step here whenever SAVE_VERSION changes. */
function migrate(data: unknown, cfg: GameConfig): SaveData | null {
  if (!data || typeof data !== 'object') return null;
  const v = (data as { version?: number }).version;
  if (v === 4) {
    const d = data as SaveDataV4;
    if (!d.state) return null;
    return { ...d, state: { ...d.state, od: d.state.od ?? freshOverdrive(), stats: { ...freshStats(), ...d.state.stats } } };
  }
  if (v === 3) {
    const d = data as SaveDataV3;
    if (!d.state) return null;
    return toV4(d, d.state);
  }
  if (v === 2) {
    const d = data as SaveDataV2;
    if (!d.state) return null;
    return toV4(d, { ...d.state, level: legacyLevel(cfg, d.state) });
  }
  if (v === 1) {
    const d = data as SaveDataV1;
    if (!d.state || !Array.isArray(d.state.tray)) return null;
    return toV4(d, {
      ...d.state,
      tray: d.state.tray.map((p) => (p ? { ...p, rot: 0 } : null)),
      energy: cfg.rotation.startCharges,
      level: legacyLevel(cfg, d.state),
    });
  }
  return null;
}
