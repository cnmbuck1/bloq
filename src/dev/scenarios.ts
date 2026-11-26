// Development-only test scenarios: prepared boards and trays that reproduce unusual situations fast.
// Open them from Settings > Developer (tap the version label five times to show the section).

import type { PieceInstance } from '../engine/board';

export interface Scenario { name: string; board: string[]; tray: PieceInstance[] }

const p = (defId: string, color = 0, pulseIndex = -1): PieceInstance => ({ defId, color, pulseIndex });

export const SCENARIOS: Scenario[] = [
  {
    name: 'Chain reaction ×4',
    board: ['........', '.111....', '.1P1....', 'XX.PXXXX', '...2P2..', '...22P2.', '....222.', '........'],
    tray: [p('single', 3), p('i2h', 1), p('o2', 2)],
  },
  {
    name: 'Row + column cross',
    board: ['...X....', '...X....', '...X....', 'XXX.XXXX', '...X....', '...X....', '...X....', '...X....'],
    tray: [p('single', 0), p('i3h', 2), p('l3a', 4)],
  },
  {
    name: 'Triple clear',
    board: ['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', '........', '........', '........', '........', '........'],
    tray: [p('i3v', 1), p('o2', 3), p('single', 0)],
  },
  {
    name: 'Pulses on the edges',
    board: ['PXXXXXX.', 'XX....XX', '........', 'X.......', 'P.......', 'X.......', 'XX....XX', 'PXXXXXX.'],
    tray: [p('single', 2), p('single', 4), p('i3v', 0)],
  },
  {
    name: 'Nearly game over',
    board: ['XXXX.XXX', 'XXX.XXXX', 'XX.XXX.X', 'X.XXX.XX', '.XXX.XXX', 'XXX.XXX.', 'XX.XXXX.', 'XXXXXXX.'],
    tray: [p('i3v', 1), p('o2', 0), p('o3', 3)],
  },
  {
    name: 'Empty board',
    board: ['........', '........', '........', '........', '........', '........', '........', '........'],
    tray: [p('o3', 0, 4), p('i5h', 1, 2), p('l5a', 2)],
  },
];
