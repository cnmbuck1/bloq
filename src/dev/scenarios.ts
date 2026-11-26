// Development-only test scenarios: prepared boards, trays and energy that reproduce specific situations fast.
// Open them from Settings > Developer (development builds only; never in a release build).

import type { PieceInstance } from '../engine/board';

export interface Scenario { name: string; board: string[]; tray: (PieceInstance | null)[]; energy: number }

const p = (defId: string, pulseIndex = -1): PieceInstance => ({ defId, color: 0, pulseIndex, rot: 0 });
const E = '........';

/** Columns 1-7 are full except isolated holes; column 0 is open: only vertical pieces fit. */
const VERTICAL = ['.XXX.XXX', '.XXXXXX.', '.XX.XXXX', 'XXXXXX.X', 'XX.XXXXX', 'XXXXX.XX', 'X.XXXXXX', 'XXXX.XXX'];
const COLUMN6 = ['......X.', '......X.', '......X.', '......X.', '......X.', E, E, E];

export const SCENARIOS: Scenario[] = [
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
];
