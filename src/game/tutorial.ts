// The interactive first-time tutorial: five guided placements, each on a prepared board.
// Each step accepts only its highlighted placement, so it cannot go off script.

import type { PieceInstance } from '../engine/board';
import { freshStats, type GameState } from '../engine/game';
import { boardFromArt } from './boardArt';
import type { PlacementTarget } from './session';

export interface TutorialStep {
  title: string;
  hint: string;
  board: string[];
  tray: (PieceInstance | null)[];
  target: PlacementTarget;
  /** Rotation Energy at the start of the step. */
  energy?: number;
  /** Whether the rotate control works in this step (only the rotation step). */
  rotate?: boolean;
  /** Shown after the step resolves, before the next one. */
  outro?: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Drag the piece onto the glowing cells',
    hint: 'Touch, drag, release.',
    board: ['........', '........', '........', '........', '........', '........', '........', '........'],
    tray: [null, { defId: 'o2', color: 0, pulseIndex: -1 }, null],
    target: { slot: 1, row: 3, col: 3 },
  },
  {
    title: 'Fill a row to clear it',
    hint: 'Complete rows and columns vanish.',
    board: ['........', '........', '........', '........', '........', 'XXXXX...', '........', '........'],
    tray: [null, { defId: 'i3h', color: 2, pulseIndex: -1 }, null],
    target: { slot: 1, row: 5, col: 5 },
  },
  {
    title: 'Rows and columns clear together',
    hint: 'One block can finish both.',
    board: ['.....X..', '.....X..', 'XXXXX.XX', '.....X..', '.....X..', '.....X..', '.....X..', '.....X..'],
    tray: [null, { defId: 'single', color: 3, pulseIndex: -1 }, null],
    target: { slot: 1, row: 2, col: 5 },
  },
  {
    title: 'Meet the Pulse Block',
    hint: 'When its line clears, it blasts the 8 cells around it.',
    board: ['........', '........', '........', '.XXXXX..', 'XX..XXXX', '.XXXXX..', '........', '........'],
    tray: [null, { defId: 'i2h', color: 1, pulseIndex: 1 }, null],
    target: { slot: 1, row: 4, col: 2 },
  },
  {
    title: 'Chain reaction',
    hint: 'A pulse that hits another pulse sets it off too.',
    board: ['........', '...XXX..', '..XXPX..', 'XX..XXXX', '..XXX...', '........', '........', '........'],
    tray: [null, { defId: 'i2h', color: 4, pulseIndex: 1 }, null],
    target: { slot: 1, row: 3, col: 2 },
  },
  {
    title: 'Rotate with energy',
    hint: 'Tap ⟳ to turn the piece. Each turn uses 1 energy.',
    board: ['......X.', '......X.', '......X.', '......X.', '......X.', '........', '........', '........'],
    tray: [null, { defId: 'i3h', color: 0, pulseIndex: -1 }, null],
    target: { slot: 1, row: 5, col: 6, rot: 1 },
    energy: 1,
    rotate: true,
    outro: 'The line gave your energy back.',
  },
  {
    title: 'Clear lines to recharge',
    hint: 'Each line restores 1 energy, up to 3. Spend it wisely.',
    board: ['........', '........', '........', '........', '........', '........', 'XXX.XXXX', 'XXX.XXXX'],
    tray: [null, { defId: 'i2v', color: 0, pulseIndex: -1 }, null],
    target: { slot: 1, row: 6, col: 3 },
    energy: 0,
  },
];

export function tutorialState(step: TutorialStep): GameState {
  return {
    mode: 'tutorial', seed: 1, rngState: 1, board: boardFromArt(step.board), tray: step.tray.map((p) => (p ? { ...p, rot: 0 } : null)),
    recent: [], score: 0, combo: 0, energy: step.energy ?? 3, over: false, pulseChance: 0,
    stats: freshStats(),
  };
}
