// Development-only test scenarios: prepared boards, trays and energy that reproduce specific situations fast.
// Open them from Settings > Developer (development builds only; never in a release build).

import type { PieceInstance } from '../engine/board';
import type { LifetimeStats } from '../game/stats';

export interface Scenario {
  name: string; board: string[]; tray: (PieceInstance | null)[]; energy: number;
  /** Build 3: starting score (sets the level), combo streak, and career fields merged into local stats before the game. */
  score?: number; combo?: number; career?: Partial<LifetimeStats>;
  /** Shown when the scenario loads: what to do to see it. */
  hint?: string;
  group?: 'Build 2' | 'Build 3';
}

const p = (defId: string, pulseIndex = -1): PieceInstance => ({ defId, color: 0, pulseIndex, rot: 0 });
const E = '........';

/** Columns 1-7 are full except isolated holes; column 0 is open: only vertical pieces fit. */
const VERTICAL = ['.XXX.XXX', '.XXXXXX.', '.XX.XXXX', 'XXXXXX.X', 'XX.XXXXX', 'XXXXX.XX', 'X.XXXXXX', 'XXXX.XXX'];
const COLUMN6 = ['......X.', '......X.', '......X.', '......X.', '......X.', E, E, E];

const SCENARIOS_B2: Scenario[] = [
  { name: 'Single-line clear', board: [E, E, E, E, E, E, E, 'XXXXX...'], tray: [p('i3h'), p('o2'), p('single')], energy: 3 },
  { name: 'Row + column together', board: ['...X....', '...X....', '...X....', 'XXX.XXXX', '...X....', '...X....', '...X....', '...X....'], tray: [p('single'), p('i3h'), p('l3a')], energy: 3 },
  { name: 'Triple clear', board: ['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', E, E, E, E, E], tray: [p('i3v'), p('o2'), p('single')], energy: 1 },
  { name: 'Single Pulse', board: [E, E, E, '.XXXXX..', 'XX..XXXX', '.XXXXX..', E, E], tray: [p('i2h', 1), p('single'), p('o2')], energy: 3 },
  { name: 'Two-Pulse chain', board: [E, '...XXX..', '..XXPX..', 'XX..XXXX', '..XXX...', E, E, E], tray: [p('i2h', 1), p('single'), p('o2')], energy: 3 },
  { name: 'Chain reaction ×4', board: [E, '.XXX....', '.XPX....', 'XX.PXXXX', '...XPX..', '...XXPX.', '....XXX.', E], tray: [p('single'), p('i2h'), p('o2')], energy: 3 },
  { name: 'Pulse on an edge', board: [E, E, 'XX......', 'PXXXXXX.', 'XX......', E, E, E], tray: [p('single'), p('i2v'), p('o2')], energy: 3 },
  { name: 'Pulse in a corner', board: [E, E, E, E, E, E, 'XX......', 'PXXXXXX.'], tray: [p('single'), p('i2h'), p('l3a')], energy: 3 },
  { name: 'Rotate to complete a line', board: COLUMN6, tray: [p('i3h'), p('i4h'), p('l3a')], energy: 3 },
  { name: 'Rotate to avoid game over', board: VERTICAL, tray: [p('i3h'), p('o2'), p('l5a')], energy: 1 },
  { name: 'Not enough energy', board: COLUMN6, tray: [p('i3h'), p('single'), p('i2h')], energy: 0 },
  { name: 'Symmetrical pieces (free turns)', board: [E, E, E, E, E, E, E, E], tray: [p('o2'), p('o3'), p('single')], energy: 1 },
  { name: 'Symmetrical piece, off-centre Pulse', board: [E, E, E, E, E, E, E, E], tray: [p('o2', 0), p('o3', 4), p('o3', 0)], energy: 2 },
  { name: 'Maximum energy restore', board: ['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', E, E, E, E], tray: [p('i4v'), p('single'), p('o2')], energy: 0 },
  { name: 'Nearly full board', board: ['XXXX.XXX', 'XXX.XXXX', 'XX.XXX.X', 'X.XXX.XX', '.XXX.XXX', 'XXX.XXX.', 'XX.XXXX.', 'XXXXXXX.'], tray: [p('i3v'), p('o2'), p('o3')], energy: 1 },
  { name: 'No legal moves', board: VERTICAL, tray: [p('i3h'), p('o2'), p('o3')], energy: 0 },
].map((s) => ({ ...s, group: 'Build 2' as const }));

// ---------------------------------------------------------------- Build 3: levels, materials, career

const LINE_READY = [E, E, E, E, E, E, E, 'XXXXX...'];
const QUAD = ['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', E, E, E, E];
/** Column 0 rows 0-2 take a vertical 3; one 2×2 hole (rows 2-3, cols 3-4) completes no line. No horizontal run of 3. */
const SAVED_BY_LEVEL = ['.X.XX.XX', '.X.XXX.X', '.XX..XXX', 'XXX..X.X', 'X.XXXX.X', 'XX.XXX..', 'X.XX.XXX', 'XXX.XX.X'];
const FIVE_CHAIN = [E, '.XXX....', '.XPX....', 'XX.PXXXX', '...XPX..', '...XXPX.', '....XXPX', E];
/** A fresh career: nothing earned yet (used where a scenario should trigger first-time unlocks or achievements). */
const FRESH: Partial<LifetimeStats> = {
  highestLevel: 1, unlockedMaterials: ['magenta'], materialMode: 'progressive', fixedMaterial: 'magenta', achievements: {},
  totalLines: 0, totalPulses: 0, totalRotations: 0, maxChain: 0, maxLinesAtOnce: 0, maxCombo: 0, tipsSeen: [],
};
const ALL_MATS = ['magenta', 'violet', 'emerald', 'amber', 'crimson', 'platinum'];

const BUILD3: Scenario[] = ([
  { name: 'New game at Level 1', board: [E, E, E, E, E, E, E, E], tray: [p('i3h'), p('o2'), p('l3a')], energy: 3, hint: 'Level 1, Magenta, 0 / 1,000' },
  { name: 'Just below Level 2', board: [E, E, E, E, E, E, E, E], tray: [p('single'), p('o2'), p('i3h')], energy: 3, score: 990, hint: 'A single block keeps you below; a 4-block piece reaches Level 2' },
  { name: 'Just below Level 3', board: LINE_READY, tray: [p('single'), p('o2'), p('i3h')], energy: 1, score: 2420, hint: 'Clear the bottom row with the i3 to reach Level 3 (Electric Violet)' },
  { name: 'Level-up through a line clear', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 950, hint: 'Place the i3 at the end of the bottom row' },
  { name: 'Level-up through a Pulse chain', board: [E, '...XXX..', '..XXPX..', 'XX..XXXX', '..XXX...', E, E, E], tray: [p('i2h', 1), p('single'), p('o2')], energy: 1, score: 800, hint: 'Fill the gap in row 4 with the Pulse piece' },
  { name: 'Multiple levels in one move', board: QUAD, tray: [p('i4v'), p('single'), p('o2')], energy: 1, score: 950, combo: 4, hint: 'Quad clear at ×3.0: Level 1 to Level 3 in one move, one celebration' },
  { name: 'First material unlock', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 2420, career: { ...FRESH, highestLevel: 2, tipsSeen: ['progress', 'levelup'] }, hint: 'Career reset to Level 2: clearing the row unlocks Electric Violet for good' },
  { name: 'Previously unlocked transition', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 2420, career: { highestLevel: 6, unlockedMaterials: ALL_MATS.slice(0, 3), materialMode: 'progressive' }, hint: 'Violet is already yours: the wave plays, no unlock banner' },
  { name: 'Fixed material mode', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 2420, career: { highestLevel: 6, unlockedMaterials: ALL_MATS.slice(0, 3), materialMode: 'fixed', fixedMaterial: 'emerald' }, hint: 'Emerald fixed: Level 3 arrives with no material change' },
  { name: 'Level-up with depleted energy', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 0, score: 950, hint: 'Energy 0: watch the gold restore after the line' },
  { name: 'Level-up with full energy', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 3, score: 950, hint: 'Energy already full: ENERGY FULL, no wasted animation' },
  { name: 'Game over prevented by level-up energy', board: SAVED_BY_LEVEL, tray: [p('o2'), p('i3h'), p('i3h')], energy: 0, score: 998, hint: 'Place the square in the 2×2 hole: Level 2 refills energy so the i3s can turn' },
  { name: 'High-level piece generation (Level 9)', board: [E, E, E, E, E, E, E, E], tray: [null, null, p('single')], energy: 3, score: 22000, hint: 'Place the single: the next tray uses the Level 9 mix (15/45/40)' },
  { name: 'Maximum difficulty (Level 11)', board: [E, E, E, E, E, E, E, E], tray: [null, null, p('single')], energy: 3, score: 32500, hint: 'Quantum Platinum; trays use the capped 15/40/45 mix' },
  { name: 'Five-Pulse chain', board: FIVE_CHAIN, tray: [p('single'), p('i2h'), p('o2')], energy: 3, score: 0, hint: 'Single in row 4, column 3' },
  { name: 'Multiple achievements at once', board: ['XXXPXXX.', 'XXXXXXX.', 'XXXXXXX.', E, E, E, E, E], tray: [p('i3v'), p('o2'), p('single')], energy: 1, career: FRESH, hint: 'Career counters reset: one triple clear with a Pulse earns four achievements' },
  { name: 'Save and restore during a level-up', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 0, score: 950, hint: 'Clear the row, then close the app mid-celebration and continue' },
  { name: 'Save and restore after an unlock', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 2420, career: { ...FRESH, highestLevel: 2, tipsSeen: ['progress', 'levelup'] }, hint: 'Unlock Violet, then close the app and continue: it stays unlocked' },
  { name: 'Beyond Level 15', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 67400, hint: 'Clear the row to reach Level 16, Quantum Master VII (67,500)' },
] satisfies Scenario[]).map((s): Scenario => ({ ...s, group: 'Build 3' }));

export const SCENARIOS: Scenario[] = [...BUILD3, ...SCENARIOS_B2];
