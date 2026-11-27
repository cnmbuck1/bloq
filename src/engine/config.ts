// All gameplay balancing lives here. The engine reads these values; nothing is hard-coded elsewhere.
// Tune freely for playtesting: the engine and tests take a config object, so a test build can pass its own.

import type { PieceCategory } from './pieces';

export interface ScoringConfig {
  /** Points per block placed (never multiplied by the combo). */
  perBlockPlaced: number;
  /** Points for clearing N lines in one placement, indexed by N (index 0 unused). */
  linePoints: number[];
  /** Points for each line beyond the last entry of linePoints. */
  extraLinePoints: number;
  /** Points for each Pulse Block that activates. */
  pulseActivation: number;
  /** Points for each block a pulse clears that was not already in a cleared line. */
  pulseBlockCleared: number;
  /** Combo multiplier by consecutive clearing move, index 0 = first clearing move. The last entry repeats. */
  comboMultipliers: number[];
}

export interface DifficultyTier {
  /** Tier applies once the current score reaches this value. */
  minScore: number;
  /** Multiplier on each category's base weight. Missing categories use 1. */
  categoryWeights: Partial<Record<PieceCategory, number>>;
}

export interface GenerationConfig {
  /** Chance that a generated piece contains one Pulse Block (0..1). */
  pulseChance: number;
  /** How many recently generated pieces count as "recent" for repetition control. */
  recentWindow: number;
  /** Weight multiplier for a piece generated within the recent window. */
  recentPenalty: number;
  /** Weight multiplier for a piece already in the tray being generated. */
  sameTrayPenalty: number;
  /** Difficulty tiers, sorted by minScore ascending. */
  tiers: DifficultyTier[];
}

export type RotationMode = 'none' | 'unlimited' | 'energy';

export interface RotationConfig {
  /** 'energy' is the Build 2 default; 'none' and 'unlimited' exist for playtest comparison (dev menu only). */
  mode: RotationMode;
  startCharges: number;
  maxCharges: number;
  /** Energy per 90° turn that changes the piece (identical-looking turns are free). */
  cost: number;
  /** Energy restored per completed line. Pulse-only removals restore nothing. */
  energyPerLine: number;
  /** Rotation animation length (presentation only). */
  animMs: number;
}

export interface GameConfig {
  boardSize: number;
  traySize: number;
  colors: number;
  scoring: ScoringConfig;
  generation: GenerationConfig;
  rotation: RotationConfig;
}

export const DEFAULT_CONFIG: GameConfig = {
  boardSize: 8,
  traySize: 3,
  colors: 5,
  scoring: {
    perBlockPlaced: 1,
    linePoints: [0, 100, 250, 450, 700],
    extraLinePoints: 250,
    pulseActivation: 50,
    pulseBlockCleared: 10,
    comboMultipliers: [1.0, 1.5, 2.0, 2.5, 3.0],
  },
  generation: {
    pulseChance: 0.12,
    recentWindow: 6,
    recentPenalty: 0.45,
    sameTrayPenalty: 0.2,
    tiers: [
      // Opening: friendlier small pieces and lines.
      { minScore: 0, categoryWeights: { single: 1.3, line2: 1.3, line3: 1.2, smallL: 1.2, line5: 0.6, square3: 0.5, bigL: 0.6 } },
      // Mid game: the neutral library weights.
      { minScore: 1500, categoryWeights: {} },
      // Late game: chunkier pieces show up more often, so planning matters more.
      { minScore: 5000, categoryWeights: { single: 0.7, line2: 0.8, line5: 1.25, square3: 1.3, bigL: 1.3, sz: 1.15 } },
      { minScore: 12000, categoryWeights: { single: 0.55, line2: 0.7, line5: 1.4, square3: 1.5, bigL: 1.45, sz: 1.25, t: 1.15 } },
    ],
  },
  rotation: {
    mode: 'energy',
    startCharges: 3,
    maxCharges: 3,
    cost: 1,
    energyPerLine: 1,
    animMs: 180,
  },
};
