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
  group?: 'Build 2' | 'Build 3' | 'Build 4' | 'Build 4 showcase';
  /** Build 4: Overdrive charge (0..100) and active placements left; Combo Protection left. */
  od?: { charge: number; active?: number };
  shield?: number;
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

/** A block stays in the top-left corner so these clears aren't Perfect Board Clears (Build 4 bonus). */
const LINE_READY = ['X.......', E, E, E, E, E, E, 'XXXXX...'];
const QUAD = ['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', E, E, E, 'X.......'];
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
  { name: 'Just below Level 2', board: [E, E, E, E, E, E, E, E], tray: [p('single'), p('o2'), p('i3h')], energy: 3, score: 1470, hint: 'A single block keeps you below; a 4-block piece reaches Level 2' },
  { name: 'Just below Level 3', board: LINE_READY, tray: [p('single'), p('o2'), p('i3h')], energy: 1, score: 3850, hint: 'Clear the bottom row with the i3 to reach Level 3 (Electric Violet)' },
  { name: 'Level-up through a line clear', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 1350, hint: 'Place the i3 at the end of the bottom row' },
  { name: 'Level-up through a Pulse chain', board: [E, '...XXX..', '..XXPX..', 'XX..XXXX', '..XXX...', E, E, E], tray: [p('i2h', 1), p('single'), p('o2')], energy: 1, score: 1200, hint: 'Fill the gap in row 4 with the Pulse piece' },
  { name: 'Multiple levels in one move', board: QUAD, tray: [p('i4v'), p('single'), p('o2')], energy: 1, score: 1000, combo: 4, hint: 'Quad clear at ×3.0: Level 1 to Level 3 in one move, one celebration' },
  { name: 'First material unlock', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 3850, career: { ...FRESH, highestLevel: 2, tipsSeen: ['progress', 'levelup'] }, hint: 'Career reset to Level 2: clearing the row unlocks Electric Violet for good' },
  { name: 'Previously unlocked transition', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 3850, career: { highestLevel: 6, unlockedMaterials: ALL_MATS.slice(0, 3), materialMode: 'progressive' }, hint: 'Violet is already yours: the wave plays, no unlock banner' },
  { name: 'Fixed material mode', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 3850, career: { highestLevel: 6, unlockedMaterials: ALL_MATS.slice(0, 3), materialMode: 'fixed', fixedMaterial: 'emerald' }, hint: 'Emerald fixed: Level 3 arrives with no material change' },
  { name: 'Level-up with depleted energy', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 0, score: 1350, hint: 'Energy 0: watch the gold restore after the line' },
  { name: 'Level-up with full energy', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 3, score: 1350, hint: 'Energy already full: ENERGY FULL, no wasted animation' },
  { name: 'Game over prevented by level-up energy', board: SAVED_BY_LEVEL, tray: [p('o2'), p('i3h'), p('i3h')], energy: 0, score: 1490, hint: 'Place the square in the 2×2 hole: Level 2 refills energy so the i3s can turn' },
  { name: 'High-level piece generation (Level 9)', board: [E, E, E, E, E, E, E, E], tray: [null, null, p('single')], energy: 3, score: 40000, hint: 'Place the single: the next tray uses the Level 9 mix (15/45/40)' },
  { name: 'Maximum difficulty (Level 11)', board: [E, E, E, E, E, E, E, E], tray: [null, null, p('single')], energy: 3, score: 60000, hint: 'Quantum Platinum; trays use the capped 15/40/45 mix' },
  { name: 'Five-Pulse chain', board: FIVE_CHAIN, tray: [p('single'), p('i2h'), p('o2')], energy: 3, score: 0, hint: 'Single in row 4, column 3' },
  { name: 'Multiple achievements at once', board: ['XXXPXXX.', 'XXXXXXX.', 'XXXXXXX.', E, E, E, E, 'X.......'], tray: [p('i3v'), p('o2'), p('single')], energy: 1, career: FRESH, hint: 'Career counters reset: one triple clear with a Pulse earns four achievements' },
  { name: 'Save and restore during a level-up', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 0, score: 1350, hint: 'Clear the row, then close the app mid-celebration and continue' },
  { name: 'Save and restore after an unlock', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 3850, career: { ...FRESH, highestLevel: 2, tipsSeen: ['progress', 'levelup'] }, hint: 'Unlock Violet, then close the app and continue: it stays unlocked' },
  { name: 'Beyond Level 15', board: LINE_READY, tray: [p('i3h'), p('o2'), p('single')], energy: 1, score: 127400, hint: 'Clear the row to reach Level 16, Quantum Master VII (127,500)' },
] satisfies Scenario[]).map((s): Scenario => ({ ...s, group: 'Build 3' }));

// ---------------------------------------------------------------- Build 4: Overdrive, Combo Protection, Perfect Clear

const STRAY = 'X.......';
const THREE_CHAIN = [E, '...XXP..', '..XXPX..', 'XX..XXXX', '..XXX...', E, E, STRAY];
const TRIPLE = ['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', E, E, E, E, STRAY];
const DECO4 = ['........', '.X......', 'XX...P..', 'XXX..XX.', 'XPXX.XXX', 'XXXX.XXP', '.XXXXX.X', 'XXX.XXXX'];
/** Dense board with no complete line; a single at (7,7) completes row 7 only. */
const DENSE = ['XX.XXXXX', 'X.XXPXXX', 'XXXX.XXX', '.XXXXXX.', 'XXXXX.XX', 'XPXXXX.X', 'XXX.XXXX', 'XXXXXXX.'];

const SHOWCASE: Scenario[] = ([
  { name: 'Showcase: three-Pulse chain', board: THREE_CHAIN, tray: [p('i2h', 1), p('single'), p('o2')], energy: 3, score: 2400, hint: 'Domino with the Pulse into row 3, columns 2-3' },
  { name: 'Showcase: five-Pulse chain', board: [...FIVE_CHAIN.slice(0, 7), STRAY], tray: [p('single'), p('i2h'), p('o2')], energy: 3, score: 5200, hint: 'Single in row 4, column 3' },
  { name: 'Showcase: Overdrive activation', board: DECO4, tray: [p('i3h'), p('o2'), p('l3a')], energy: 2, score: 9800, combo: 2, od: { charge: 100 }, hint: 'Tap the gold Overdrive meter' },
  { name: 'Showcase: Overdrive triple clear', board: TRIPLE, tray: [p('i3v'), p('o2'), p('single')], energy: 1, score: 6400, combo: 2, od: { charge: 0, active: 4 }, hint: 'Vertical 3 in column 7, rows 0-2: triple clear at 2× points' },
  { name: 'Showcase: Perfect Clear', board: [E, E, E, E, E, E, E, 'XXXXX...'], tray: [p('i3h'), p('o2'), p('single')], energy: 3, score: 3000, hint: 'Finish the bottom row: the board empties for +2,000' },
  { name: 'Showcase: major level advancement', board: [...QUAD.slice(0, 7), STRAY], tray: [p('i4v'), p('single'), p('o2')], energy: 1, score: 6000, combo: 4, od: { charge: 0, active: 3 }, hint: 'Quad clear in Overdrive at the top combo: Level 3 to Level 5' },
  { name: 'Showcase: full-board material transition', board: DENSE, tray: [p('single'), p('o2'), p('i3h')], energy: 2, score: 11900, hint: 'Single at row 7, column 7: Level 5, Emerald sweeps the board' },
] satisfies Scenario[]).map((s): Scenario => ({ ...s, group: 'Build 4 showcase' }));

const BUILD4: Scenario[] = ([
  { name: 'Combo Protection', board: [E, E, E, E, '...XX...', E, E, STRAY], tray: [p('o2'), p('single'), p('i3h')], energy: 3, score: 2000, combo: 3, shield: 1, hint: 'Place a piece that clears nothing: the combo holds (×2.0)' },
  { name: 'Combo Protection already spent', board: [E, E, E, E, '...XX...', E, E, STRAY], tray: [p('o2'), p('single'), p('i3h')], energy: 3, score: 2000, combo: 3, shield: 0, hint: 'A non-clearing move now resets the combo' },
  { name: 'Overdrive ready', board: DECO4, tray: [p('i3h'), p('o2'), p('single')], energy: 2, score: 4200, od: { charge: 100 }, hint: 'The meter is full: activate it when you like' },
  { name: 'Overdrive nearly charged', board: TRIPLE, tray: [p('i3v'), p('o2'), p('single')], energy: 2, score: 4200, od: { charge: 80 }, hint: 'A triple clear (+40%) fills the meter' },
  { name: 'Overdrive holds off game over', board: VERTICAL, tray: [p('i3h'), p('o2'), p('o3')], energy: 0, score: 3000, od: { charge: 100 }, hint: 'No move without rotation: OVERDRIVE AVAILABLE. Activate, then rotate the 3 for free' },
  { name: 'Overdrive final placement', board: TRIPLE, tray: [p('i3v'), p('o2'), p('single')], energy: 1, score: 6400, od: { charge: 0, active: 1 }, hint: 'The last Overdrive placement resolves fully, then Overdrive ends' },
  { name: 'Perfect Clear with a Pulse', board: [E, E, E, E, E, E, E, 'XXXXX.XX'], tray: [p('i2v', 1), p('single'), p('o2')], energy: 3, score: 1000, hint: 'Vertical 2 with the Pulse into column 5, rows 6-7' },
] satisfies Scenario[]).map((s): Scenario => ({ ...s, group: 'Build 4' }));

export const SCENARIOS: Scenario[] = [...SHOWCASE, ...BUILD4, ...BUILD3, ...SCENARIOS_B2];
