// Build 5 Daily landing: the seven-day strip and the history screen's personal records.
import { describe, expect, it } from 'vitest';
import { bestDays, emptyDailyRecords, monthCalendar, recordDailyResult, weekStrip, type DailyRunSummary } from '../src/game/dailyRecords';

const run = (score: number): DailyRunSummary => ({ score, placements: 30, lines: 10, maxCombo: 2, maxChain: 1, overdrives: 1, fullRun: true });

describe('weekStrip', () => {
  let r = emptyDailyRecords();
  for (const [d, s] of [['2026-11-20', 900], ['2026-11-23', 4000], ['2026-11-24', 7000], ['2026-11-26', 5200]] as const) r = recordDailyResult(r, d, `${d}#1`, run(s)).records;
  it('covers Monday to Sunday of the current week with the calendar states', () => {
    const w = weekStrip(r, '2026-11-27'); // a Friday
    expect(w.map((d) => d.id)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    expect(w.map((d) => d.state)).toEqual(['completed', 'completed', 'missed', 'completed', 'today', 'future', 'future']);
    expect(w.filter((d) => d.isToday).map((d) => d.dow)).toEqual([4]);
  });
  it('agrees with the month calendar for every day it shows', () => {
    const cal = monthCalendar(r, '2026-11-27', 2026, 11);
    for (const d of weekStrip(r, '2026-11-27')) expect(cal.days[d.day - 1].state).toBe(d.state);
  });
  it('keeps today marked once completed, and crosses month and year boundaries', () => {
    const done = recordDailyResult(r, '2026-11-27', 'x', run(100)).records;
    const t = weekStrip(done, '2026-11-27').find((d) => d.isToday)!;
    expect(t.state).toBe('completed');
    expect(weekStrip(r, '2027-01-01').map((d) => d.id)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });
  it('lists the best days, highest first', () => {
    expect(bestDays(r, 3)).toEqual([{ id: '2026-11-24', best: 7000 }, { id: '2026-11-26', best: 5200 }, { id: '2026-11-23', best: 4000 }]);
    expect(bestDays(emptyDailyRecords())).toEqual([]);
  });
});
