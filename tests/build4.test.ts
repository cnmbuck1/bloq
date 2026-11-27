import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, LEGACY_RULESET_1, type GameConfig } from '../src/engine/config';
import { activateOverdrive, applyMove, newGame, overState, overdriveCharge, rotatePiece, rulesFor, stateIsOver, type GameState } from '../src/engine/game';
import { addDays, challengeId, dailyChallenge, dailyGame, generateChallenge, msUntilNextChallenge, validateChallenge } from '../src/engine/daily';
import { objectiveMet, searchSolution, verifySolution, type MissionDef } from '../src/engine/mission';
import { deserializeGame, serializeGame } from '../src/engine/save';
import { scoreMove } from '../src/engine/scoring';
import { boardFromArt } from '../src/game/boardArt';
import type { PieceInstance } from '../src/engine/board';
import { SCENARIOS } from '../src/dev/scenarios';

const C = DEFAULT_CONFIG;
const E = '........';
const p = (defId: string, pulseIndex = -1, rot = 0): PieceInstance => ({ defId, color: 0, pulseIndex, rot });
const at = (art: string[], tray: (PieceInstance | null)[], extra: Partial<GameState> = {}): GameState => {
  const s: GameState = { ...newGame(1, C, { board: boardFromArt(art), pulseChance: 0 }), tray, ...extra };
  s.over = stateIsOver(s, C);
  return s;
};
const mv = (s: GameState, slot: number, r: number, c: number, cfg = C) => {
  const o = applyMove(s, slot, r, c, cfg);
  if (!o.ok) throw new Error(o.reason);
  return o;
};
const withOd = (s: GameState, charge: number, active = 0): GameState => {
  const n: GameState = { ...s, od: { charge, active, freeLeft: C.overdrive.limitedFree, score: 0 } };
  n.over = stateIsOver(n, C);
  return n;
};

describe('ruleset 2 scoring', () => {
  it('uses the Build 4 values', () => {
    const b = scoreMove(C.scoring, { blocksPlaced: 4, lineCount: 2, pulsesActivated: 1, pulseCleared: 3, combo: 3 });
    // 40 + (400 + 100 + 75) × 2.0
    expect(b.total).toBe(40 + 1150);
    expect(scoreMove(C.scoring, { blocksPlaced: 1, lineCount: 5, pulsesActivated: 0, pulseCleared: 0, combo: 1 }).lines).toBe(1600);
  });

  it("matches the spec's Overdrive example: 40 + (400 + 100 + 75) × 2 = 1,190, ×2 = 2,380", () => {
    const b = scoreMove(C.scoring, { blocksPlaced: 4, lineCount: 2, pulsesActivated: 1, pulseCleared: 3, combo: 3, overdrive: 2 });
    expect(b.total).toBe(2380);
  });

  it('Perfect Board Clear: only when the resolved board is empty, once, never for a fresh board', () => {
    const s = at(['XXXXXXX.', E, E, E, E, E, E, E], [p('single'), p('single'), null]);
    expect(s.board.cells.some(Boolean)).toBe(true);
    const o = mv(s, 0, 0, 7);
    expect(o.result.perfect).toBe(true);
    expect(o.result.points.perfect).toBe(2000);
    expect(o.result.points.total).toBe(10 + 150 + 2000);
    expect(o.state.stats.perfectClears).toBe(1);
    // Placing on the now-empty board is not another Perfect Clear.
    expect(mv(o.state, 1, 3, 3).result.perfect).toBe(false);
    // A clear that leaves a block behind is not one either.
    expect(mv(at(['XXXXXXX.', E, E, E, E, E, E, 'X.......'], [p('single'), null, null]), 0, 0, 7).result.perfect).toBe(false);
  });

  it('legacy (ruleset 1) games keep the Build 1–3 scoring and thresholds', () => {
    const legacy = { ...at(['XXXXXXX.', E, E, E, E, E, E, 'X.......'], [p('single'), null, null]), ruleset: 1 };
    const o = mv(legacy, 0, 0, 7);
    expect(o.result.points.total).toBe(1 + 100);
    expect(rulesFor(C, legacy).progression.thresholds).toEqual(LEGACY_RULESET_1.thresholds);
    expect(rulesFor(C, { ruleset: 2 })).toBe(C);
  });
});

describe('Combo Protection', () => {
  const rows = ['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', E, E, E, E, 'X.......'];
  it('one setup move keeps the combo, a second resets it, a clear restores protection', () => {
    let s = at(rows, [p('single'), p('single'), p('single')]);
    let o = mv(s, 0, 0, 7); s = o.state;
    expect([o.result.combo, s.shield]).toEqual([1, 1]);
    o = mv(s, 1, 6, 0); s = o.state; // setup move
    expect(o.result.comboProtected).toBe(true);
    expect([o.result.combo, s.shield, o.result.points.multiplier]).toEqual([1, 0, 1]);
    o = mv(s, 2, 1, 7); s = o.state; // clear: combo rises, protection back
    expect([o.result.combo, s.shield, o.result.shieldRestored]).toEqual([2, 1, true]);
    expect(o.result.points.multiplier).toBe(1.5);
    // Two setup moves in a row: the second resets.
    s = { ...s, tray: [p('single'), p('single'), p('single')] };
    o = mv(s, 0, 5, 0); s = o.state;
    expect(o.result.comboProtected).toBe(true);
    o = mv(s, 1, 5, 1); s = o.state;
    expect([o.result.combo, o.result.comboProtected, s.shield]).toEqual([0, false, 0]);
    expect(s.stats.comboProtected).toBe(2);
  });

  it('invalid placements and rotations leave combo and protection alone', () => {
    const s = at(rows, [p('i3h'), null, null], { combo: 2, shield: 1 });
    expect(applyMove(s, 0, 0, 0).ok).toBe(false);
    const r = rotatePiece(s, 0);
    if (!r.ok) throw new Error(r.reason);
    expect([r.state.combo, r.state.shield]).toEqual([2, 1]);
  });

  it('configurable: off resets at once, 2 allows two setup moves', () => {
    const off: GameConfig = { ...C, combo: { protection: 0 } };
    const two: GameConfig = { ...C, combo: { protection: 2 } };
    let s = at(rows, [p('single'), p('single'), p('single')]);
    expect(mv(mv(s, 0, 0, 7, off).state, 1, 6, 0, off).result.combo).toBe(0);
    s = mv(s, 0, 0, 7, two).state;
    s = mv(s, 1, 6, 0, two).state;
    const third = mv(s, 2, 6, 1, two);
    expect([third.result.combo, third.result.comboProtected]).toEqual([1, true]);
  });

  it('a level-up does not reset the combo', () => {
    const s = at(rows, [p('single'), p('single'), null], { score: 1400, combo: 2, shield: 1 });
    const o = mv(s, 0, 0, 7);
    expect(o.result.levelAfter).toBe(2);
    expect(o.state.combo).toBe(3);
  });
});

describe('Overdrive charging', () => {
  it('uses one line reward per move plus Pulses, chain and perfect bonuses', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => overdriveCharge(C, n, 0, false))).toEqual([10, 25, 40, 60, 75, 90]);
    expect(overdriveCharge(C, 1, 2, false)).toBe(10 + 20);
    expect(overdriveCharge(C, 1, 3, false)).toBe(10 + 30 + 10);
    expect(overdriveCharge(C, 2, 0, true)).toBe(25 + 30);
    expect(overdriveCharge(C, 0, 0, false)).toBe(0);
  });

  it('plain placements and rotations earn nothing; the meter caps at 100 with no carry', () => {
    const s = withOd(at(['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', E, E, E, 'X.......'], [p('i4v'), p('single'), null]), 80);
    expect(mv(s, 1, 6, 3).result.odGained).toBe(0);
    const r = rotatePiece(s, 0);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.od!.charge).toBe(80);
    const o = mv(s, 0, 0, 7);
    expect(o.result.odChargeAfter).toBe(100);
    expect(o.result.odGained).toBe(20);
    expect(o.result.odReady).toBe(true);
  });

  it('never activates by itself and resets with a new game', () => {
    const s = withOd(at(['XXXXXXX.', E, E, E, E, E, E, 'X.......'], [p('single'), p('single'), null]), 100);
    const o = mv(s, 0, 0, 7);
    expect(o.state.od!.active).toBe(0);
    expect(o.state.od!.charge).toBe(100);
    expect(newGame(9).od!.charge).toBe(0);
  });
});

describe('Overdrive activation and play', () => {
  const art = ['XXXXXXX.', 'XXXXXXX.', E, E, E, E, E, 'X.......'];

  it('needs a full meter, is not a placement, and cannot stack', () => {
    const s = at(art, [p('single'), p('single'), p('single')]);
    expect(activateOverdrive(s)).toEqual({ ok: false, reason: 'not-charged' });
    const a = activateOverdrive(withOd(s, 100));
    if (!a.ok) throw new Error(a.reason);
    expect(a.state.od).toMatchObject({ charge: 0, active: 5 });
    expect(a.state.stats.moves).toBe(0);
    expect(a.state.stats.odActivations).toBe(1);
    expect(activateOverdrive({ ...a.state, od: { ...a.state.od!, charge: 100 } })).toEqual({ ok: false, reason: 'active' });
  });

  it('doubles the whole move score for five successful placements, then ends', () => {
    let s = withOd(at(art, [p('single'), p('single'), p('single')]), 0, 5);
    const o = mv(s, 0, 0, 7);
    expect(o.result.odActive).toBe(true);
    expect(o.result.points.total).toBe((10 + 150) * 2);
    expect(o.result.odGained).toBe(0); // no recharge while active
    s = o.state;
    expect(s.od!.active).toBe(4);
    // Invalid placements don't consume a move.
    expect(applyMove(s, 1, 1, 0).ok).toBe(false);
    for (const [slot, r, c] of [[1, 3, 0], [2, 3, 1]] as const) s = mv(s, slot, r, c).state;
    s = { ...s, tray: [p('single'), p('single'), p('single')] };
    s = mv(s, 0, 4, 0).state;
    expect(s.od!.active).toBe(1);
    const last = mv(s, 1, 1, 7);
    expect(last.result.odActive).toBe(true);
    expect(last.result.odEnded).toBe(true);
    expect(last.result.points.overdrive).toBe(2);
    expect(last.state.od!.active).toBe(0);
    const after = mv(last.state, 2, 4, 1);
    expect(after.result.odActive).toBe(false);
    expect(after.state.stats.odBestScore).toBeGreaterThan(0);
  });

  it('rotations are free while active, keep Rotation Energy, and cost again afterwards', () => {
    const s = withOd(at(art, [p('i3h'), null, null], { energy: 0 }), 0, 2);
    const r = rotatePiece(s, 0);
    if (!r.ok) throw new Error(r.reason);
    expect([r.cost, r.free, r.state.energy, r.state.stats.odFreeRotations]).toEqual([0, true, 0, 1]);
    expect(rotatePiece({ ...s, od: { ...s.od!, active: 0 } }, 0)).toEqual({ ok: false, reason: 'no-energy' });
  });

  it('limited and reduced rotation benefits', () => {
    const limited: GameConfig = { ...C, overdrive: { ...C.overdrive, rotation: 'limited', limitedFree: 1 } };
    let s = withOd(at(art, [p('i3h'), null, null], { energy: 1 }), 0, 3);
    s = { ...s, od: { ...s.od!, freeLeft: 1 } };
    const a = rotatePiece(s, 0, limited);
    if (!a.ok) throw new Error(a.reason);
    expect([a.cost, a.state.energy, a.state.od!.freeLeft]).toEqual([0, 1, 0]);
    const b = rotatePiece(a.state, 0, limited);
    if (!b.ok) throw new Error(b.reason);
    expect([b.cost, b.state.energy]).toEqual([1, 0]);
    const none: GameConfig = { ...C, overdrive: { ...C.overdrive, rotation: 'none' } };
    expect(rotatePiece({ ...s, energy: 0 }, 0, none)).toEqual({ ok: false, reason: 'no-energy' });
  });

  it('save and restore during Overdrive', () => {
    const s = withOd(at(art, [p('single'), p('single'), null]), 40, 3);
    const back = deserializeGame(serializeGame(s, 0, 0));
    expect(back!.state.od).toEqual(s.od);
    expect(back!.state.shield).toBe(s.shield);
  });
});

describe('Overdrive-aware game over', () => {
  // Only a vertical 3 fits (column 0, rows 0–2); the tray has only horizontal 3s and no energy.
  const art = ['.XXX.XXX', '.XXXXXX.', '.XX.XXXX', 'XXXXXX.X', 'XX.XXXXX', 'XXXXX.XX', 'X.XXXXXX', 'XXXX.XXX'];
  it('a charged Overdrive holds off game over (OVERDRIVE AVAILABLE) but never activates itself', () => {
    const s = at(art, [p('i3h'), null, null], { energy: 0 });
    expect(overState(s).over).toBe(true);
    const charged = withOd(s, 100);
    expect(overState(charged)).toMatchObject({ over: false, odAvailable: true });
    expect(charged.od!.active).toBe(0);
    const a = activateOverdrive(charged);
    if (!a.ok) throw new Error(a.reason);
    expect(a.state.over).toBe(false);
    expect(rotatePiece(a.state, 0).ok).toBe(true);
  });

  it('active Overdrive counts free rotations; without any benefit it is still over', () => {
    expect(overState(withOd(at(art, [p('i3h'), null, null], { energy: 0 }), 0, 2)).over).toBe(false);
    const none: GameConfig = { ...C, overdrive: { ...C.overdrive, rotation: 'none' } };
    expect(overState(withOd(at(art, [p('i3h'), null, null], { energy: 0 }), 100), none).over).toBe(true);
  });

  it('nothing fits in any orientation: over even with a charged meter', () => {
    const full = art.map((r) => r.replace(/\./g, 'X')).map((r, i) => (i === 0 ? 'XXXXXX.X' : r));
    expect(overState(withOd(at(full, [p('o2'), null, null], { energy: 0 }), 100)).over).toBe(true);
  });
});

describe('Daily Challenge', () => {
  it('uses UTC dates for ids and the countdown', () => {
    expect(challengeId(Date.UTC(2026, 10, 27, 23, 59))).toBe('2026-11-27');
    expect(challengeId(Date.UTC(2026, 10, 28, 0, 0))).toBe('2026-11-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(msUntilNextChallenge(Date.UTC(2026, 10, 27, 23, 0))).toBe(3600_000);
  });

  it('is identical for everyone: board, sequence and Pulse positions', () => {
    const a = dailyChallenge('2026-11-27'), b = dailyChallenge('2026-11-27');
    expect(a).toEqual(b);
    expect(a.sequence.length).toBeGreaterThanOrEqual(30);
    expect(dailyChallenge('2026-11-28').sequence).not.toEqual(a.sequence);
  });

  it('the piece sequence never adapts to the board', () => {
    const ch = dailyChallenge('2026-11-27');
    const g1 = dailyGame(ch);
    // Play two different first trays: the next tray dealt is the same.
    const deal = (order: [number, number, number][]) => {
      let s = g1;
      for (const [slot] of order) {
        const piece = s.tray[slot]!;
        let placed = false;
        for (let r = 0; r < 8 && !placed; r++) for (let c = 0; c < 8 && !placed; c++) {
          const o = applyMove(s, slot, r, c);
          if (o.ok) { s = o.state; placed = true; }
        }
        if (!placed) throw new Error(`could not place ${piece.defId}`);
      }
      return s.tray;
    };
    expect(deal([[0, 0, 0], [1, 0, 0], [2, 0, 0]])).toEqual(deal([[2, 0, 0], [1, 0, 0], [0, 0, 0]]));
    expect(deal([[0, 0, 0], [1, 0, 0], [2, 0, 0]])).toEqual(ch.sequence.slice(3, 6));
  });

  it('ends at the placement limit, with no level-ups', () => {
    const cfg: GameConfig = { ...C, daily: { ...C.daily, placementLimit: 3 } };
    const ch = generateChallenge('2026-11-27', cfg);
    let s = dailyGame(ch, cfg);
    expect(s.mode).toBe('daily');
    let last;
    for (let i = 0; i < 3; i++) {
      let done = false;
      for (let slot = 0; slot < 3 && !done; slot++) for (let r = 0; r < 8 && !done; r++) for (let c = 0; c < 8 && !done; c++) {
        if (!s.tray[slot]) continue;
        const o = applyMove(s, slot, r, c, cfg);
        if (o.ok) { s = o.state; last = o.result; done = true; }
      }
    }
    expect(last!.limitReached).toBe(true);
    expect(s.over).toBe(true);
    expect(s.level).toBe(1);
  });

  it('validation passes for the next 60 days and rejects a broken configuration', () => {
    for (let i = 0; i < 60; i++) {
      const ch = dailyChallenge(addDays('2026-11-27', i));
      expect(validateChallenge(ch).ok, ch.id).toBe(true);
    }
    const ch = dailyChallenge('2026-11-27');
    const broken = { ...ch, board: boardFromArt(['XXXXXXXX', ...Array(7).fill(E)]) };
    expect(validateChallenge(broken).ok).toBe(false);
    expect(validateChallenge({ ...ch, sequence: ch.sequence.slice(0, 5) }).problems).toContain('sequence shorter than the placement limit');
  });

  it('daily saves round-trip with their sequence position', () => {
    const s = dailyGame(dailyChallenge('2026-11-27'));
    const back = deserializeGame(serializeGame(s, 0, 0));
    expect(back!.state.daily).toEqual(s.daily);
    expect(back!.state.mode).toBe('daily');
  });
});

describe('Mission Mode foundation', () => {
  it('verifies and searches solutions for a designed puzzle', () => {
    const m: MissionDef = {
      id: 'demo', board: boardFromArt(['XXXXXXX.', 'XXXXXXX.', E, E, E, E, E, E]), sequence: [p('i2v'), p('single'), p('single')],
      startEnergy: 0, startOverdrive: 0, placementLimit: 3, objective: { type: 'clear-board' }, difficulty: 1,
      solution: [{ slot: 0, turns: 0, row: 0, col: 7, value: 0 }],
    };
    expect(verifySolution(m)).toBe(true);
    expect(searchSolution(m)).not.toBeNull();
    expect(verifySolution({ ...m, solution: [{ slot: 1, turns: 0, row: 0, col: 7, value: 0 }] })).toBe(false);
    expect(objectiveMet({ type: 'score', target: 1 }, newGame(1), [])).toBe(false);
  });
});

describe('Build 4 showcase and test scenarios', () => {
  const load = (name: string) => {
    const sc = SCENARIOS.find((x) => x.name === name)!;
    expect(sc, name).toBeTruthy();
    const base = newGame(7, C, { board: boardFromArt(sc.board), energy: sc.energy, score: sc.score, pulseChance: 0 });
    const s: GameState = {
      ...base, tray: sc.tray.map((q) => (q ? { ...q } : null)), energy: sc.energy, combo: sc.combo ?? 0,
      shield: sc.shield ?? (sc.combo ? C.combo.protection : 0),
      od: sc.od ? { charge: sc.od.charge, active: sc.od.active ?? 0, freeLeft: C.overdrive.limitedFree, score: 0 } : base.od,
    };
    s.over = stateIsOver(s, C);
    return s;
  };
  it('three- and five-Pulse chains', () => {
    expect(mv(load('Showcase: three-Pulse chain'), 0, 3, 2).result.chain).toBe(3);
    expect(mv(load('Showcase: five-Pulse chain'), 0, 3, 2).result.chain).toBe(5);
  });
  it('Overdrive showcases', () => {
    const a = activateOverdrive(load('Showcase: Overdrive activation'));
    expect(a.ok).toBe(true);
    const t = mv(load('Showcase: Overdrive triple clear'), 0, 0, 7).result;
    expect(t.rows.length).toBe(3);
    expect(t.points.overdrive).toBe(2);
    const big = mv(load('Showcase: major level advancement'), 0, 0, 7).result;
    expect(big.levelBefore).toBe(3);
    expect(big.levelAfter).toBeGreaterThanOrEqual(5);
    const last = mv(load('Overdrive final placement'), 0, 0, 7).result;
    expect(last.odEnded).toBe(true);
  });
  it('perfect clears and the material transition', () => {
    expect(mv(load('Showcase: Perfect Clear'), 0, 7, 5).result.perfect).toBe(true);
    expect(mv(load('Perfect Clear with a Pulse'), 0, 6, 5).result.perfect).toBe(true);
    const m = mv(load('Showcase: full-board material transition'), 0, 7, 7).result;
    expect(m.levelAfter).toBe(5);
    expect(m.rows).toEqual([7]);
    expect(m.cols).toEqual([]);
  });
  it('Combo Protection and the held-off game over', () => {
    const kept = mv(load('Combo Protection'), 1, 0, 0).result;
    expect(kept.comboProtected).toBe(true);
    expect(kept.combo).toBe(3);
    expect(mv(load('Combo Protection already spent'), 1, 0, 0).result.combo).toBe(0);
    const held = load('Overdrive holds off game over');
    expect(held.over).toBe(false);
    expect(overState(held, C).odAvailable).toBe(true);
  });
});
