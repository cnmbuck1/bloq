// Score calculation. Pure and driven entirely by ScoringConfig.
//
// Build 4 order: placement + (lines + Pulse activations + Pulse-cleared blocks + Perfect Clear) × combo,
// then × Overdrive on the whole result, then rounded once.

import type { ScoringConfig } from './config';

export interface ScoreBreakdown {
  placement: number;
  lines: number;
  pulse: number;
  /** Perfect Board Clear bonus (before multipliers). */
  perfect: number;
  multiplier: number;
  /** Overdrive multiplier (1 when inactive). */
  overdrive: number;
  /** round((placement + (lines + pulse + perfect) × multiplier) × overdrive) */
  total: number;
}

export function linePointsFor(cfg: ScoringConfig, lineCount: number): number {
  if (lineCount <= 0) return 0;
  const table = cfg.linePoints;
  const last = table.length - 1;
  if (lineCount <= last) return table[lineCount];
  return table[last] + (lineCount - last) * cfg.extraLinePoints;
}

/** combo = number of consecutive clearing moves including this one (1 = first). 0 = no clear. */
export function comboMultiplier(cfg: ScoringConfig, combo: number): number {
  if (combo <= 0) return 1;
  const m = cfg.comboMultipliers;
  return m[Math.min(combo, m.length) - 1];
}

export function scoreMove(cfg: ScoringConfig, args: {
  blocksPlaced: number; lineCount: number; pulsesActivated: number; pulseCleared: number; combo: number;
  perfect?: boolean; overdrive?: number;
}): ScoreBreakdown {
  const placement = args.blocksPlaced * cfg.perBlockPlaced;
  const lines = linePointsFor(cfg, args.lineCount);
  const pulse = args.pulsesActivated * cfg.pulseActivation + args.pulseCleared * cfg.pulseBlockCleared;
  const perfect = args.perfect ? (cfg.perfectClear ?? 0) : 0;
  // A clearing move's combo applies; a protected setup move earns placement points only, so its combo is moot.
  const multiplier = args.lineCount > 0 ? comboMultiplier(cfg, args.combo) : 1;
  const overdrive = args.overdrive ?? 1;
  const total = Math.round((placement + (lines + pulse + perfect) * multiplier) * overdrive);
  return { placement, lines, pulse, perfect, multiplier, overdrive, total };
}
