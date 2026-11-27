// Build 3 lifetime achievements and permanent material unlocks.
// Every achievement is a threshold on a career figure, so it can show progress and can never be earned twice.
// Ids are stable strings, ready to map onto Game Center achievement ids later.

import type { GameConfig, MaterialDef } from '../engine/config';
import { materialsUnlockedAt } from '../engine/progression';
import type { LifetimeStats } from './stats';

export type AchievementIcon = 'line' | 'rotate' | 'pulse' | 'chain' | 'clear' | 'combo' | 'level' | 'games' | 'points' | 'material'
  | 'overdrive' | 'perfect' | 'shield' | 'daily' | 'streak';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: AchievementIcon;
  target: number;
  /** The career figure this achievement measures. */
  value: (s: LifetimeStats, cfg: GameConfig) => number;
}

/** Consecutive clearing moves needed to reach the top combo multiplier (3.0× with the default table). */
export function comboForMaxMultiplier(cfg: GameConfig): number {
  const m = cfg.scoring.comboMultipliers;
  const top = Math.max(...m);
  return m.indexOf(top) + 1;
}

const A = (id: string, name: string, description: string, icon: AchievementIcon, target: number, value: AchievementDef['value']): AchievementDef =>
  ({ id, name, description, icon, target, value });

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  A('first-contact', 'First Contact', 'Complete your first line', 'line', 1, (s) => s.totalLines),
  A('energy-operator', 'Energy Operator', 'Perform your first rotation', 'rotate', 1, (s) => s.totalRotations),
  A('pulse-initiate', 'Pulse Initiate', 'Activate your first Pulse Block', 'pulse', 1, (s) => s.totalPulses),
  A('double-reaction', 'Double Reaction', 'Trigger a two-Pulse chain', 'chain', 2, (s) => s.maxChain),
  A('chain-specialist', 'Chain Specialist', 'Trigger a three-Pulse chain', 'chain', 3, (s) => s.maxChain),
  A('critical-mass', 'Critical Mass', 'Trigger a five-Pulse chain', 'chain', 5, (s) => s.maxChain),
  A('double-impact', 'Double Impact', 'Clear two lines at once', 'clear', 2, (s) => s.maxLinesAtOnce),
  A('triple-threat', 'Triple Threat', 'Clear three lines at once', 'clear', 3, (s) => s.maxLinesAtOnce),
  A('quad-force', 'Quad Force', 'Clear four lines at once', 'clear', 4, (s) => s.maxLinesAtOnce),
  A('maximum-output', 'Maximum Output', 'Reach a 3.0× combo', 'combo', 1, (s, cfg) => (s.maxCombo >= comboForMaxMultiplier(cfg) ? 1 : 0)),
  A('technician', 'Technician', 'Reach Level 3', 'level', 3, (s) => s.highestLevel),
  A('strategist', 'Strategist', 'Reach Level 5', 'level', 5, (s) => s.highestLevel),
  A('mastermind', 'Mastermind', 'Reach Level 8', 'level', 8, (s) => s.highestLevel),
  A('quantum-master', 'Quantum Master', 'Reach Level 10', 'level', 10, (s) => s.highestLevel),
  A('quantum-evolution', 'Quantum Evolution', 'Reach Level 11', 'level', 11, (s) => s.highestLevel),
  A('veteran', 'Veteran', 'Complete 25 games', 'games', 25, (s) => s.gamesPlayed),
  A('dedicated', 'Dedicated', 'Complete 100 games', 'games', 100, (s) => s.gamesPlayed),
  A('million-point-club', 'Million Point Club', 'Earn 1,000,000 lifetime points', 'points', 1_000_000, (s) => s.lifetimePoints),
  A('material-collector', 'Material Collector', 'Unlock all six materials', 'material', 6, (s) => s.unlockedMaterials.length),
  // Build 4
  A('overdrive-initiate', 'Overdrive Initiate', 'Activate Overdrive', 'overdrive', 1, (s) => s.odActivations),
  A('energy-master', 'Energy Master', 'Activate Overdrive 25 times', 'overdrive', 25, (s) => s.odActivations),
  A('maximum-reaction', 'Maximum Reaction', 'Trigger a three-Pulse chain during Overdrive', 'chain', 3, (s) => s.odMaxChain),
  A('critical-overdrive', 'Critical Overdrive', 'Trigger a five-Pulse chain during Overdrive', 'chain', 5, (s) => s.odMaxChain),
  A('precision-master', 'Precision Master', 'Clear the whole board', 'perfect', 1, (s) => s.perfectClears),
  A('perfectionist', 'Perfectionist', 'Clear the whole board 10 times', 'perfect', 10, (s) => s.perfectClears),
  A('combo-guardian', 'Combo Guardian', 'Keep a combo alive with Combo Protection', 'shield', 1, (s) => s.comboProtected),
  A('daily-initiate', 'Daily Initiate', 'Complete a Daily Challenge', 'daily', 1, (s) => s.dailyCompleted),
  A('daily-explorer', 'Daily Explorer', 'Complete 3 Daily Challenges', 'daily', 3, (s) => s.dailyCompleted),
  A('daily-specialist', 'Daily Specialist', 'Complete 7 Daily Challenges', 'daily', 7, (s) => s.dailyCompleted),
  A('daily-veteran', 'Daily Veteran', 'Complete 30 Daily Challenges', 'daily', 30, (s) => s.dailyCompleted),
  A('weekly-streak', 'Weekly Streak', 'Complete the Daily Challenge 7 days in a row', 'streak', 7, (s) => s.longestStreak),
  A('monthly-streak', 'Monthly Streak', 'Complete the Daily Challenge 30 days in a row', 'streak', 30, (s) => s.longestStreak),
];

export function achievementProgress(a: AchievementDef, s: LifetimeStats, cfg: GameConfig): { value: number; target: number; done: boolean } {
  const value = Math.min(a.target, a.value(s, cfg));
  return { value, target: a.target, done: !!s.achievements[a.id] || value >= a.target };
}

export interface ProgressUpdate {
  stats: LifetimeStats;
  newMaterials: MaterialDef[];
  newAchievements: AchievementDef[];
}

/**
 * Grants anything the career has now earned: materials for the highest level reached, then achievements.
 * Idempotent: running it again on its own output grants nothing.
 */
export function grantProgress(s: LifetimeStats, cfg: GameConfig, now = Date.now()): ProgressUpdate {
  const have = new Set(s.unlockedMaterials);
  const newMaterials = cfg.materials.filter((m) => materialsUnlockedAt(cfg.materials, s.highestLevel).includes(m.id) && !have.has(m.id));
  let stats: LifetimeStats = newMaterials.length
    ? { ...s, unlockedMaterials: cfg.materials.filter((m) => have.has(m.id) || newMaterials.includes(m)).map((m) => m.id) }
    : s;
  const newAchievements = ACHIEVEMENTS.filter((a) => !stats.achievements[a.id] && a.value(stats, cfg) >= a.target);
  if (newAchievements.length) {
    const achievements = { ...stats.achievements };
    for (const a of newAchievements) achievements[a.id] = now;
    stats = { ...stats, achievements };
  }
  return { stats, newMaterials, newAchievements };
}

/** The material the player sees at a level: progressive follows the level; fixed uses their unlocked choice. */
export function activeMaterial(cfg: GameConfig, s: Pick<LifetimeStats, 'materialMode' | 'fixedMaterial' | 'unlockedMaterials'>, level: number): MaterialDef {
  if (s.materialMode === 'fixed' && s.unlockedMaterials.includes(s.fixedMaterial)) {
    const m = cfg.materials.find((x) => x.id === s.fixedMaterial);
    if (m) return m;
  }
  let m = cfg.materials[0];
  for (const x of cfg.materials) if (level >= x.minLevel) m = x;
  return m;
}

/** One upcoming career goal for the results screen (never one already done). */
export function nextMilestone(s: LifetimeStats, cfg: GameConfig): string | null {
  const nextMat = cfg.materials.find((m) => !s.unlockedMaterials.includes(m.id));
  if (nextMat) return `Reach Level ${nextMat.minLevel} to unlock ${nextMat.name}`;
  for (const a of ACHIEVEMENTS) {
    const p = achievementProgress(a, s, cfg);
    if (p.done) continue;
    if (a.icon === 'games') return `Complete ${a.target - p.value} more game${a.target - p.value === 1 ? '' : 's'} to earn ${a.name}`;
    if (a.icon === 'points') return `${(a.target - p.value).toLocaleString('en-US')} lifetime points to the ${a.name}`;
    return `${a.description} to earn ${a.name}`;
  }
  return null;
}
