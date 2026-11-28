import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { achievementProgress, achievementWeight, achievementsInOrder, ACHIEVEMENTS, grantProgress, nextMaterial, STARTER_ACHIEVEMENTS } from '../src/game/achievements';
import { emptyDailyRecords, recordDailyResult, streaks } from '../src/game/dailyRecords';
import { emptyStats, parseStats, syncDaily } from '../src/game/stats';

const byId = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;
const run = (score: number) => ({ score, placements: 30, lines: 4, maxCombo: 1, maxChain: 0, odActivations: 0, ms: 1000 } as never);

describe('Build 10 starter achievements', () => {
  it('lists the starter set first', () => {
    expect(achievementsInOrder().slice(0, 5).map((a) => a.id)).toEqual([...STARTER_ACHIEVEMENTS]);
  });

  it('credits Level 7 and Overdrive from saved stats, once', () => {
    const s = { ...emptyStats(), highestLevel: 8, odActivations: 3 };
    const g = grantProgress(s, DEFAULT_CONFIG, 1);
    const ids = g.newAchievements.map((a) => a.id);
    expect(ids).toContain('solar-ascent');
    expect(ids).toContain('overdrive-initiate');
    expect(grantProgress(g.stats, DEFAULT_CONFIG, 2).newAchievements).toEqual([]);
  });

  it('an older career without the row stat loads and does not earn the two-row achievement', () => {
    const old = JSON.stringify({ version: 1, recordsRuleset: 2, maxLinesAtOnce: 4 });
    const s = parseStats(old);
    expect(achievementProgress(byId('two-rows'), s, DEFAULT_CONFIG).done).toBe(false);
  });

  it('replaying the same Daily counts once toward three distinct Daily Challenges', () => {
    let r = emptyDailyRecords();
    r = recordDailyResult(r, '2026-11-26', 'a', run(100)).records;
    r = recordDailyResult(r, '2026-11-26', 'b', run(300)).records; // replay, better score
    r = recordDailyResult(r, '2026-11-27', 'c', run(200)).records;
    const sk = streaks(r, '2026-11-27');
    const s = syncDaily(emptyStats(), { completed: sk.completed, current: sk.current, longest: sk.longest, best: sk.best });
    const p = achievementProgress(byId('daily-explorer'), s, DEFAULT_CONFIG);
    expect([p.value, p.target, p.done]).toEqual([2, 3, false]);
    expect(byId('daily-explorer').unit).toBe('Daily Challenges');
    expect(achievementProgress(byId('daily-initiate'), s, DEFAULT_CONFIG).done).toBe(true);
  });

  it('names the next locked material with its level', () => {
    const s = grantProgress({ ...emptyStats(), highestLevel: 6 }, DEFAULT_CONFIG, 1).stats;
    const m = nextMaterial(s, DEFAULT_CONFIG)!;
    expect(`${m.name} at Level ${m.minLevel}`).toBe('Solar Amber at Level 7');
  });

  it('ranks harder unlocks above first-time basics', () => {
    expect(achievementWeight(byId('solar-ascent'))).toBeGreaterThan(achievementWeight(byId('first-contact')));
    expect(achievementWeight(byId('two-rows'))).toBeGreaterThan(achievementWeight(byId('pulse-initiate')));
  });
});
