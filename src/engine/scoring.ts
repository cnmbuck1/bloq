// Score calculation. Pure and driven entirely by ScoringConfig.

import type { ScoringConfig } from './config';

export interface ScoreBreakdown {
  placement: number;
  lines: number;
  pulse: number;
  multiplier: number;
  /** placement + round((lines + pulse) * multiplier) */
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
}): ScoreBreakdown {
  const placement = args.blocksPlaced * cfg.perBlockPlaced;
  const lines = linePointsFor(cfg, args.lineCount);
  const pulse = args.pulsesActivated * cfg.pulseActivation + args.pulseCleared * cfg.pulseBlockCleared;
  const multiplier = comboMultiplier(cfg, args.combo);
  return { placement, lines, pulse, multiplier, total: placement + Math.round((lines + pulse) * multiplier) };
}
