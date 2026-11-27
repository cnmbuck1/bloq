// Build 4 persistence: Daily records and streaks, the Game Center queue, separated records and new achievements.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as C } from '../src/engine/config';
import { applyMove, newGame } from '../src/engine/game';
import { boardFromArt } from '../src/game/boardArt';
import { ACHIEVEMENTS, grantProgress } from '../src/game/achievements';
import { emptyDailyRecords, monthCalendar, parseDailyRecords, recordDailyResult, recordDailyStart, streaks, type DailyRunSummary } from '../src/game/dailyRecords';
import { emptyStats, parseStats, recordGameEnd, recordMove, recordRotation, syncDaily } from '../src/game/stats';
import { pruneExpired, queueSubmission, type PendingSubmission } from '../src/platform/gameCenter';

const run = (score: number, extra: Partial<DailyRunSummary> = {}): DailyRunSummary =>
  ({ score, placements: 30, lines: 10, maxCombo: 2, maxChain: 1, overdrives: 1, fullRun: true, ...extra });

describe('Daily records', () => {
  it('keeps the first completed attempt separately and the best across replays', () => {
    let r = recordDailyStart(emptyDailyRecords(), '2026-11-27').records;
    let u = recordDailyResult(r, '2026-11-27', '2026-11-27#1', run(4000));
    expect(u.firstCompletion).toBe(true);
    expect(u.newBest).toBe(true);
    r = recordDailyStart(u.records, '2026-11-27').records;
    expect(recordDailyStart(r, '2026-11-27').replay).toBe(true);
    u = recordDailyResult(r, '2026-11-27', '2026-11-27#2', run(3000));
    expect(u.newBest).toBe(false);
    u = recordDailyResult(u.records, '2026-11-27', '2026-11-27#3', run(5200));
    expect(u.newBest).toBe(true);
    expect(u.previousBest).toBe(4000);
    const day = u.records.days['2026-11-27'];
    expect(day.best).toBe(5200);
    expect(day.first).toBe(4000);
    expect(day.attempts).toBe(2);
  });

  it('never records the same run twice (no duplicate rewards after a restore)', () => {
    const a = recordDailyResult(emptyDailyRecords(), '2026-11-27', '2026-11-27#1', run(4000));
    const b = recordDailyResult(a.records, '2026-11-27', '2026-11-27#1', run(9000));
    expect(b.counted).toBe(false);
    expect(b.records).toBe(a.records);
  });

  it('counts streaks without penalising an unfinished today, and resets after a missed day', () => {
    let r = emptyDailyRecords();
    for (const d of ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-24', '2026-11-25', '2026-11-26']) r = recordDailyResult(r, d, `${d}#1`, run(1000)).records;
    // Today (27th) not played yet: the streak through yesterday still stands.
    expect(streaks(r, '2026-11-27')).toMatchObject({ current: 3, longest: 3, completed: 6, thisMonth: 6 });
    r = recordDailyResult(r, '2026-11-27', '2026-11-27#1', run(2500)).records;
    expect(streaks(r, '2026-11-27')).toMatchObject({ current: 4, longest: 4, best: 2500 });
    // Missing a day ends the current streak; the longest is kept.
    expect(streaks(r, '2026-11-29').current).toBe(0);
    expect(streaks(r, '2026-11-29').longest).toBe(4);
  });

  it('handles month and year rollover', () => {
    let r = emptyDailyRecords();
    for (const d of ['2026-12-30', '2026-12-31', '2027-01-01']) r = recordDailyResult(r, d, `${d}#1`, run(1000)).records;
    expect(streaks(r, '2027-01-01')).toMatchObject({ current: 3, thisMonth: 1 });
  });

  it('builds a Monday-first calendar with completed, today, missed, future and before states', () => {
    let r = recordDailyResult(emptyDailyRecords(), '2026-11-24', 'a', run(1)).records;
    r = recordDailyResult(r, '2026-11-26', 'b', run(1)).records;
    const cal = monthCalendar(r, '2026-11-27', 2026, 11);
    expect(cal.leading).toBe(6); // 1 Nov 2026 is a Sunday
    expect(cal.days).toHaveLength(30);
    const st = (d: number) => cal.days[d - 1].state;
    expect([st(23), st(24), st(25), st(26), st(27), st(28)]).toEqual(['before', 'completed', 'missed', 'completed', 'today', 'future']);
  });

  it('survives corrupt storage', () => {
    expect(parseDailyRecords('{nope')).toEqual(emptyDailyRecords());
    expect(parseDailyRecords(JSON.stringify({ version: 9 }))).toEqual(emptyDailyRecords());
  });
});

describe('Game Center queue', () => {
  const q0: PendingSubmission[] = [];
  it('keeps only the best pending score per board and day', () => {
    let q = queueSubmission(q0, { board: 'classic', score: 5000, t: 1 });
    q = queueSubmission(q, { board: 'classic', score: 4000, t: 2 });
    q = queueSubmission(q, { board: 'classic', score: 7000, t: 3 });
    q = queueSubmission(q, { board: 'daily', score: 900, day: '2026-11-26', t: 4 });
    q = queueSubmission(q, { board: 'daily', score: 800, day: '2026-11-27', t: 5 });
    expect(q.filter((s) => s.board === 'classic')).toEqual([{ board: 'classic', score: 7000, t: 3 }]);
    expect(q.filter((s) => s.board === 'daily')).toHaveLength(2);
  });
  it('drops Daily scores whose day has passed, never sending them late', () => {
    const q: PendingSubmission[] = [
      { board: 'daily', score: 900, day: '2026-11-26', t: 1 }, { board: 'daily', score: 800, day: '2026-11-27', t: 2 }, { board: 'chain', score: 4, t: 3 },
    ];
    expect(pruneExpired(q, '2026-11-27').map((s) => s.score)).toEqual([800, 4]);
  });
});

describe('records by ruleset and mode', () => {
  const E = '........';
  const move = () => {
    const s = { ...newGame(1, C, { board: boardFromArt([E, E, E, E, E, E, 'X.......', 'XXXXX...']), pulseChance: 0 }), tray: [{ defId: 'i3h', color: 0, pulseIndex: -1, rot: 0 }, null, null] };
    const o = applyMove(s, 0, 7, 5, C);
    if (!o.ok) throw new Error(o.reason);
    return o.result;
  };
  it('migrates a Build 3 career best into the labelled legacy record', () => {
    const old = JSON.stringify({ ...emptyStats(), bestScore: 8000, recordsRuleset: undefined });
    const st = parseStats(old);
    expect(st.legacyBestScore).toBe(8000);
    expect(st.bestScore).toBe(0);
    // Already migrated: unchanged on the next load.
    expect(parseStats(JSON.stringify(st))).toMatchObject({ legacyBestScore: 8000, bestScore: 0 });
  });
  it('keeps Classic ruleset 2, Classic ruleset 1 and Daily records apart', () => {
    const r = move();
    let st = recordMove(emptyStats(), r, { seed: 1, moves: 1 }, '2026-11-27', { mode: 'classic', ruleset: 2 });
    expect(st.bestScore).toBe(r.scoreAfter);
    st = recordGameEnd(st, 50_000, { mode: 'classic', ruleset: 1 });
    expect(st.legacyBestScore).toBe(50_000);
    expect(st.bestScore).toBe(r.scoreAfter);
    st = recordGameEnd(st, 90_000, { mode: 'daily', ruleset: 2 });
    expect(st.bestScore).toBe(r.scoreAfter);
    expect(st.legacyBestScore).toBe(50_000);
    // Daily moves still count toward the career.
    const d = recordMove(emptyStats(), r, { seed: 9, moves: 1 }, '2026-11-27', { mode: 'daily', ruleset: 2 });
    expect(d.totalLines).toBe(1);
    expect(d.bestScore).toBe(0);
  });
  it('tracks Overdrive, perfect and protection career figures', () => {
    let st = recordRotation(emptyStats(), 0, true);
    expect(st.odFreeRotations).toBe(1);
    const r = { ...move(), perfect: true, comboProtected: false, odActive: true, chain: 3 };
    st = recordMove(st, r, { seed: 2, moves: 1 }, '2026-11-27', { mode: 'classic', ruleset: 2 });
    expect(st).toMatchObject({ perfectClears: 1, odMaxChain: 3, odMaxLines: 1 });
  });
});

describe('Build 4 achievements', () => {
  it('adds 13 achievements with stable ids', () => {
    const ids = ['overdrive-initiate', 'energy-master', 'maximum-reaction', 'critical-overdrive', 'precision-master', 'perfectionist', 'combo-guardian',
      'daily-initiate', 'daily-explorer', 'daily-specialist', 'daily-veteran', 'weekly-streak', 'monthly-streak'];
    for (const id of ids) expect(ACHIEVEMENTS.some((a) => a.id === id), id).toBe(true);
  });
  it('grants Daily and streak achievements once from the synced daily summary', () => {
    let st = syncDaily(emptyStats(), { completed: 7, current: 7, longest: 7, best: 3000 });
    const g = grantProgress(st, C, 1);
    const got = g.newAchievements.map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['daily-initiate', 'daily-explorer', 'daily-specialist', 'weekly-streak']));
    expect(got).not.toContain('daily-veteran');
    st = g.stats;
    expect(grantProgress(st, C, 2).newAchievements).toEqual([]);
  });
  it('keeps the longest streak even when the current one resets', () => {
    const st = syncDaily(syncDaily(emptyStats(), { completed: 8, current: 8, longest: 8, best: 1 }), { completed: 8, current: 0, longest: 3, best: 1 });
    expect(st.longestStreak).toBe(8);
    expect(st.currentStreak).toBe(0);
  });
});
