// Build 3 level progression: score thresholds, titles, progress, materials and difficulty bands.
// Pure functions over the config; nothing here knows about rendering.

import type { DifficultyBand, GameConfig, MaterialDef, ProgressionConfig } from './config';

/** Cumulative score needed to reach `level` (level 1 = 0). Endless: past the table each gap grows by extraGapStep. */
export function levelThreshold(p: ProgressionConfig, level: number): number {
  const t = p.thresholds;
  if (level <= 1) return 0;
  if (level <= t.length) return t[level - 1];
  const n = t.length;
  const lastGap = n >= 2 ? t[n - 1] - t[n - 2] : 1000;
  const k = level - n;
  return t[n - 1] + k * lastGap + (p.extraGapStep * k * (k + 1)) / 2;
}

/** The level a cumulative score has reached. */
export function levelForScore(p: ProgressionConfig, score: number): number {
  let level = 1;
  while (levelThreshold(p, level + 1) <= score) level++;
  return level;
}

const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n: number): string {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

export function levelTitle(p: ProgressionConfig, level: number): string {
  if (level >= 1 && level <= p.titles.length) return p.titles[level - 1];
  return `${p.beyondTitle} ${roman(Math.max(1, level - p.beyondTitleOffset))}`;
}

export interface LevelProgress {
  level: number;
  title: string;
  /** Score where the current level began. */
  start: number;
  /** Score where the next level begins. */
  next: number;
  /** Progress through the current level, 0..1 (relative to its own start, not to zero). */
  fraction: number;
  remaining: number;
}

export function levelProgress(p: ProgressionConfig, score: number): LevelProgress {
  const level = levelForScore(p, score);
  const start = levelThreshold(p, level), next = levelThreshold(p, level + 1);
  return {
    level, title: levelTitle(p, level), start, next,
    fraction: Math.max(0, Math.min(1, (score - start) / Math.max(1, next - start))),
    remaining: Math.max(0, next - score),
  };
}

/** The material progressive mode shows at a level (the last one whose minLevel has been reached). */
export function materialForLevel(materials: readonly MaterialDef[], level: number): MaterialDef {
  let m = materials[0];
  for (const x of materials) if (level >= x.minLevel) m = x;
  return m;
}

/** Materials permanently unlocked by having reached `highestLevel`. */
export function materialsUnlockedAt(materials: readonly MaterialDef[], highestLevel: number): string[] {
  return materials.filter((m) => highestLevel >= m.minLevel).map((m) => m.id);
}

/** The piece-size mix for a level (capped at difficulty.maxLevel). */
export function bandFor(cfg: GameConfig, level: number): DifficultyBand {
  const L = Math.min(Math.max(1, level), cfg.difficulty.maxLevel);
  let band = cfg.difficulty.bands[0];
  for (const b of cfg.difficulty.bands) if (L >= b.minLevel) band = b;
  return band;
}

export type SizeClass = 'small' | 'medium' | 'large';
export const sizeClass = (cells: number): SizeClass => (cells <= 2 ? 'small' : cells <= 4 ? 'medium' : 'large');
