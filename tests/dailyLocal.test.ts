import { describe, expect, it } from 'vitest';
import { addDays, challengeId, msUntilNextChallenge } from '../src/engine/daily';
import { labelShift, recordsByLabel, weekStrip, monthCalendar, emptyDailyRecords, type DailyRecords } from '../src/game/dailyRecords';

const done = (best: number) => ({ best, first: best, attempts: 1, completed: true, bestRun: null });

describe('Build 10 local daily dates', () => {
  it('labels a challenge with the local date it starts on', () => {
    expect(labelShift(300)).toBe(-1); // UTC-5: the reset lands at 7 PM the previous local day
    expect(labelShift(0)).toBe(0);
    expect(labelShift(-660)).toBe(0); // UTC+11: the reset lands at 11 AM the same local day
  });

  it('keeps the same challenge across local midnight and changes only at the shared reset (UTC-5)', () => {
    const at = (iso: string) => challengeId(Date.parse(iso));
    // 27 Nov 8 PM New York = 28 Nov 01:00 UTC; 28 Nov 1 AM New York = 28 Nov 06:00 UTC; same challenge.
    expect(at('2026-11-28T01:00:00Z')).toBe(at('2026-11-28T06:00:00Z'));
    // It changes at the shared reset (28 Nov 7 PM New York = 29 Nov 00:00 UTC).
    expect(at('2026-11-28T23:59:00Z')).toBe('2026-11-28');
    expect(at('2026-11-29T00:00:00Z')).toBe('2026-11-29');
    expect(msUntilNextChallenge(Date.parse('2026-11-28T23:59:00Z'))).toBe(60_000);
    // Shown as the local date it started on: 27 November.
    expect(addDays('2026-11-28', labelShift(300))).toBe('2026-11-27');
  });

  it('maps records, week strip and calendar consistently across a month boundary', () => {
    const r: DailyRecords = { ...emptyDailyRecords(), days: { '2026-11-29': done(100), '2026-12-01': done(300) } };
    const shift = -1;
    const byLabel = recordsByLabel(r, shift);
    expect(Object.keys(byLabel.days).sort()).toEqual(['2026-11-28', '2026-11-30']);
    // Current challenge 2026-12-02 is shown as 1 December (a Tuesday); its week runs 30 Nov to 6 Dec.
    const week = weekStrip(byLabel, addDays('2026-12-02', shift));
    expect(week.map((d) => d.day)).toEqual([30, 1, 2, 3, 4, 5, 6]);
    expect(week[0].state).toBe('completed');
    expect(week[1].isToday && week[1].state).toBe('today');
    expect(week[2].state).toBe('future');
    const nov = monthCalendar(byLabel, '2026-12-01', 2026, 11);
    expect(nov.days.find((d) => d.day === 28)!.state).toBe('completed');
    expect(nov.days.find((d) => d.day === 29)!.state).toBe('missed');
    expect(nov.days.find((d) => d.day === 30)!.state).toBe('completed');
  });
});
