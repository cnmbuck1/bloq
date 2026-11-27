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

/** Build 3: piece mix by level. Shares are relative (they needn't add to 1). */
export interface DifficultyBand {
  /** Band applies from this level up (until the next band). */
  minLevel: number;
  /** 1–2 cell pieces. */
  small: number;
  /** 3–4 cell pieces. */
  medium: number;
  /** 5+ cell pieces. */
  large: number;
}

export interface DifficultyConfig {
  /** Sorted by minLevel ascending; the first band must start at level 1. */
  bands: DifficultyBand[];
  /** Difficulty stops rising past this level (levels keep counting). */
  maxLevel: number;
  /** Optional nudges on top of the size mix, per category (1 = neutral). */
  categoryWeights: Partial<Record<PieceCategory, number>>;
}

export type LevelUpEnergy = 'full' | 'one' | 'none';

export interface ProgressionConfig {
  /** Cumulative score needed for each level; index 0 is level 1 (always 0). */
  thresholds: number[];
  /** Title per level, same indexing as thresholds. */
  titles: string[];
  /** Past the table, each level's gap grows by this much more than the previous gap. */
  extraGapStep: number;
  /** Past the table, titles read `${beyondTitle} ${roman(level - beyondTitleOffset)}`. */
  beyondTitle: string;
  beyondTitleOffset: number;
  /** Rotation Energy restored when a level is gained (once per move, however many levels). */
  levelUpEnergy: LevelUpEnergy;
}

export interface MaterialDef {
  id: string;
  name: string;
  color: string;
  highlight: string;
  shadow: string;
  /** Progressive mode uses this material from this level; reaching it also unlocks it for good. */
  minLevel: number;
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
  scoring: ScoringConfig;
  generation: GenerationConfig;
  rotation: RotationConfig;
  progression: ProgressionConfig;
  difficulty: DifficultyConfig;
  materials: MaterialDef[];
}

export const DEFAULT_CONFIG: GameConfig = {
  boardSize: 8,
  traySize: 3,
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
  },
  rotation: {
    mode: 'energy',
    startCharges: 3,
    maxCharges: 3,
    cost: 1,
    energyPerLine: 1,
    animMs: 180,
  },
  progression: {
    thresholds: [0, 1000, 2500, 4500, 7000, 10000, 13500, 17500, 22000, 27000, 32500, 38500, 45000, 52000, 59500],
    titles: [
      'Initiate', 'Operator', 'Technician', 'Specialist', 'Strategist', 'Architect', 'Engineer', 'Mastermind', 'Elite',
      'Quantum Master', 'Quantum Master II', 'Quantum Master III', 'Quantum Master IV', 'Quantum Master V', 'Quantum Master VI',
    ],
    extraGapStep: 500,
    beyondTitle: 'Quantum Master',
    beyondTitleOffset: 9,
    levelUpEnergy: 'full',
  },
  difficulty: {
    bands: [
      { minLevel: 1, small: 40, medium: 45, large: 15 },
      { minLevel: 3, small: 30, medium: 50, large: 20 },
      { minLevel: 5, small: 25, medium: 45, large: 30 },
      { minLevel: 7, small: 20, medium: 45, large: 35 },
      { minLevel: 9, small: 15, medium: 45, large: 40 },
      { minLevel: 11, small: 15, medium: 40, large: 45 },
    ],
    maxLevel: 11,
    categoryWeights: {},
  },
  materials: [
    { id: 'magenta', name: 'Magenta', color: '#D936AD', highlight: '#FF9BEA', shadow: '#64164F', minLevel: 1 },
    { id: 'violet', name: 'Electric Violet', color: '#8855E8', highlight: '#CDB3FF', shadow: '#33186E', minLevel: 3 },
    { id: 'emerald', name: 'Emerald', color: '#19BC91', highlight: '#94F7D9', shadow: '#08513F', minLevel: 5 },
    { id: 'amber', name: 'Solar Amber', color: '#E6A32D', highlight: '#FFDE96', shadow: '#6A420C', minLevel: 7 },
    { id: 'crimson', name: 'Crimson', color: '#E34268', highlight: '#FFA6BA', shadow: '#681127', minLevel: 9 },
    { id: 'platinum', name: 'Quantum Platinum', color: '#C3D5E5', highlight: '#FFFFFF', shadow: '#4F6273', minLevel: 11 },
  ],
};
