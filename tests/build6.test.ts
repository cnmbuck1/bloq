import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { dailyChallenge, msUntilNextChallenge } from '../src/engine/daily';

describe('Build 6 Daily refinements', () => {
  it('the landing preview shows exactly the board the Start button plays', () => {
    const a = dailyChallenge('2026-11-27', DEFAULT_CONFIG), b = dailyChallenge('2026-11-27', DEFAULT_CONFIG);
    expect(a.board.cells).toEqual(b.board.cells);
    expect(a.board.cells.some(Boolean)).toBe(true);
  });

  it('the countdown reaches zero exactly at midnight UTC', () => {
    expect(msUntilNextChallenge(Date.parse('2026-11-27T23:59:59.000Z'))).toBe(1000);
    expect(msUntilNextChallenge(Date.parse('2026-11-28T00:00:00.000Z'))).toBe(24 * 3600 * 1000);
    expect(msUntilNextChallenge(Date.parse('2026-11-27T14:20:00.000Z'))).toBe((9 * 60 + 40) * 60 * 1000);
  });
});
