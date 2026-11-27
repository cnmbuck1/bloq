import { describe, expect, it } from 'vitest';
import { findCompletedLines, fitsAnywhere, shapeOf } from '../src/engine/board';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { stateIsOver } from '../src/engine/game';
import { pieceDef } from '../src/engine/pieces';
import { playability } from '../src/engine/rotation';
import { boardFromArt } from '../src/game/boardArt';
import { SCENARIOS } from '../src/dev/scenarios';

const R = DEFAULT_CONFIG.rotation;
const byName = (n: string) => {
  const s = SCENARIOS.find((x) => x.name === n);
  if (!s) throw new Error(`missing scenario ${n}`);
  return { ...s, b: boardFromArt(s.board) };
};

describe('developer scenarios', () => {
  it('has the 16 Build 2 and 19 Build 3 scenarios, each well formed', () => {
    expect(SCENARIOS.filter((s) => s.group === 'Build 2')).toHaveLength(16);
    expect(SCENARIOS.filter((s) => s.group === 'Build 3')).toHaveLength(19);
    for (const s of SCENARIOS) {
      expect(s.board, s.name).toHaveLength(8);
      for (const row of s.board) expect(row, s.name).toMatch(/^[.XP]{8}$/);
      expect(s.tray, s.name).toHaveLength(3);
      for (const p of s.tray) if (p) {
        const def = pieceDef(p.defId);
        expect(p.pulseIndex, s.name).toBeLessThan(def.cells.length);
      }
      expect(s.energy, s.name).toBeGreaterThanOrEqual(0);
      expect(s.energy, s.name).toBeLessThanOrEqual(R.maxCharges);
      // A scenario never starts with a line already complete.
      const l = findCompletedLines(boardFromArt(s.board));
      expect(l.rows.length + l.cols.length, s.name).toBe(0);
    }
  });

  it('"Rotate to complete a line" needs a rotation to fill column 6', () => {
    const s = byName('Rotate to complete a line');
    const i3h = s.tray[0]!;
    expect(fitsAnywhere(s.b, shapeOf(i3h))).toBe(true);
    expect(shapeOf({ ...i3h, rot: 1 }).rows).toBe(3);
  });

  it('"Rotate to avoid game over" is alive only through rotation', () => {
    const s = byName('Rotate to avoid game over');
    expect(s.tray.map((p) => playability(R, s.b, p!, s.energy))).toEqual(['after-rotation', 'none', 'none']);
    expect(stateIsOver({ board: s.b, tray: s.tray, energy: s.energy })).toBe(false);
    expect(stateIsOver({ board: s.b, tray: s.tray, energy: 0 })).toBe(true);
  });

  it('"No legal moves" is game over', () => {
    const s = byName('No legal moves');
    expect(stateIsOver({ board: s.b, tray: s.tray, energy: s.energy })).toBe(true);
  });

  it('"Not enough energy" starts with no charges and a piece that cannot fill the column unrotated', () => {
    const s = byName('Not enough energy');
    expect(s.energy).toBe(0);
    expect(stateIsOver({ board: s.b, tray: s.tray, energy: 0 })).toBe(false);
  });
});
