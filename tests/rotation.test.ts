import { describe, expect, it } from 'vitest';
import { shapeOf, type PieceInstance } from '../src/engine/board';
import { DEFAULT_CONFIG, type GameConfig, type RotationMode } from '../src/engine/config';
import { applyMove, newGame, rotatePiece, stateIsOver, type GameState } from '../src/engine/game';
import { generateTray } from '../src/engine/generator';
import { pieceDef, rotateShape } from '../src/engine/pieces';
import { Rng } from '../src/engine/rng';
import { arrangementKey, playability, reachableOrientations, rotationCost, rotationIsIdentity } from '../src/engine/rotation';
import { deserializeGame, serializeGame } from '../src/engine/save';
import { boardFromArt } from '../src/game/boardArt';
import { GameSession } from '../src/game/session';

const cfg = DEFAULT_CONFIG;
const withMode = (mode: RotationMode): GameConfig => ({ ...cfg, rotation: { ...cfg.rotation, mode } });
const p = (defId: string, pulseIndex = -1, rot = 0): PieceInstance => ({ defId, color: 0, pulseIndex, rot });
const EMPTY = Array(8).fill('........');

function stateWith(art: string[], tray: (PieceInstance | null)[], energy = 3, c: GameConfig = cfg): GameState {
  const s: GameState = { ...newGame(1, c, { board: boardFromArt(art), pulseChance: 0 }), tray, energy };
  s.over = stateIsOver(s, c);
  return s;
}

const cellsOf = (i: PieceInstance) => shapeOf(i).cells.map(([r, c]) => `${r},${c}`).sort();

describe('rotating shapes', () => {
  it('turns pieces 90° clockwise', () => {
    // l3a = X. / XX  ->  XX / X.
    expect(cellsOf(p('l3a', -1, 1))).toEqual(['0,0', '0,1', '1,0']);
    // tu = XXX / .X.  ->  .X / XX / .X   (pointing left)
    expect(cellsOf(p('tu', -1, 1))).toEqual(['0,1', '1,0', '1,1', '2,1']);
    expect(cellsOf(p('i3h', -1, 1))).toEqual(cellsOf(p('i3v')));
  });

  it('normalises coordinates and swaps the bounding box', () => {
    for (const id of ['l5a', 'sh', 'tu', 'i5h', 'l3c']) {
      const def = pieceDef(id);
      const r = rotateShape(def);
      expect(r.rows).toBe(def.cols);
      expect(r.cols).toBe(def.rows);
      for (const [rr, cc] of r.cells) {
        expect(rr).toBeGreaterThanOrEqual(0); expect(cc).toBeGreaterThanOrEqual(0);
        expect(rr).toBeLessThan(r.rows); expect(cc).toBeLessThan(r.cols);
      }
      expect(Math.min(...r.cells.map((c) => c[0]))).toBe(0);
      expect(Math.min(...r.cells.map((c) => c[1]))).toBe(0);
      // four turns are the identity
      expect(cellsOf({ ...p(id), rot: 4 })).toEqual(cellsOf(p(id)));
      expect(arrangementKey(rotateAll(p(id), 4))).toBe(arrangementKey(p(id)));
    }
  });

  it('carries the Pulse Block with the piece', () => {
    // i3h with the pulse on the right end: after one turn it is the bottom of a vertical line.
    const inst = p('i3h', 2, 1);
    const s = shapeOf(inst);
    expect(s.cells[2]).toEqual([2, 0]);
    // l3a pulse on the corner (index 1 = [1,0]) moves to [0,0].
    expect(shapeOf(p('l3a', 1, 1)).cells[1]).toEqual([0, 0]);
  });

  it('places the rotated arrangement, Pulse included', () => {
    let s = stateWith(EMPTY, [p('i3h', 0), null, null]);
    const r = rotatePiece(s, 0);
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
    const out = applyMove(s, 0, 2, 4);
    if (!out.ok) throw new Error(out.reason);
    expect(out.state.board.cells[2 * 8 + 4]).toEqual({ color: 0, pulse: true });
    expect(out.state.board.cells[3 * 8 + 4]).toEqual({ color: 0 });
    expect(out.state.board.cells[4 * 8 + 4]).toEqual({ color: 0 });
  });
});

function rotateAll(i: PieceInstance, n: number) { return { ...i, rot: ((i.rot ?? 0) + n) % 4 }; }

describe('symmetry', () => {
  it('identical-looking turns are detected and free', () => {
    for (const id of ['single', 'o2', 'o3']) {
      expect(rotationIsIdentity(p(id))).toBe(true);
      expect(rotationCost(cfg.rotation, p(id))).toBe(0);
    }
    for (const id of ['i2h', 'i5v', 'l3a', 'tu', 'sh']) expect(rotationCost(cfg.rotation, p(id))).toBe(1);
  });

  it('a symmetric shape with an off-centre Pulse does change, so it costs', () => {
    expect(rotationIsIdentity(p('o2', 0))).toBe(false);
    expect(rotationCost(cfg.rotation, p('o2', 3))).toBe(1);
    // o3 with the pulse in the exact centre is still identical.
    expect(rotationIsIdentity(p('o3', 4))).toBe(true);
    expect(rotationIsIdentity(p('single', 0))).toBe(true);
  });

  it('a free turn spends nothing even at zero energy', () => {
    const s = stateWith(EMPTY, [p('o2'), null, null], 0);
    const r = rotatePiece(s, 0);
    if (!r.ok) throw new Error(r.reason);
    expect(r.cost).toBe(0);
    expect(r.state.energy).toBe(0);
  });
});

describe('Rotation Energy', () => {
  it('spends one charge per turn and refuses to go below zero', () => {
    let s = stateWith(EMPTY, [p('i2h'), null, null], 2);
    for (const expected of [1, 0]) {
      const r = rotatePiece(s, 0);
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
      expect(s.energy).toBe(expected);
    }
    expect(rotatePiece(s, 0)).toEqual({ ok: false, reason: 'no-energy' });
    expect(s.energy).toBe(0);
    expect(s.stats.rotations).toBe(2);
    expect(s.stats.energySpent).toBe(2);
  });

  it('refuses rotations that are not allowed', () => {
    const s = stateWith(EMPTY, [p('i2h'), null, null]);
    expect(rotatePiece(s, 1)).toEqual({ ok: false, reason: 'empty-slot' });
    expect(rotatePiece(s, 0, withMode('none'))).toEqual({ ok: false, reason: 'disabled' });
    expect(rotatePiece({ ...s, over: true }, 0)).toEqual({ ok: false, reason: 'over' });
  });

  it('unlimited mode never spends energy', () => {
    const c = withMode('unlimited');
    let s = stateWith(EMPTY, [p('i2h'), null, null], 0, c);
    for (let i = 0; i < 6; i++) { const r = rotatePiece(s, 0, c); if (!r.ok) throw new Error(r.reason); s = r.state; }
    expect(s.energy).toBe(0);
  });

  it('restores one charge per completed line', () => {
    const s = stateWith(['XXXXXXX.', ...EMPTY.slice(1)], [p('single'), p('single'), null], 1);
    const out = applyMove(s, 0, 0, 7);
    if (!out.ok) throw new Error(out.reason);
    expect(out.result.energyGained).toBe(1);
    expect(out.state.energy).toBe(2);
  });

  it('restores one per line for multiple lines, capped at the maximum', () => {
    const art = ['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', ...EMPTY.slice(3)];
    const s = stateWith(art, [p('i3v'), p('single'), null], 0);
    const out = applyMove(s, 0, 0, 7);
    if (!out.ok) throw new Error(out.reason);
    expect(out.result.energyGained).toBe(3);
    const s2 = stateWith(art, [p('i3v'), p('single'), null], 2);
    const out2 = applyMove(s2, 0, 0, 7);
    if (!out2.ok) throw new Error(out2.reason);
    expect(out2.state.energy).toBe(3);
    expect(out2.result.energyGained).toBe(1);
  });

  it('blocks removed only by a Pulse restore nothing', () => {
    // One line with a Pulse that blasts 6 more blocks: still exactly one charge back.
    const art = ['........', '........', '........', '.XXXXX..', 'XX..XXXX', '.XXXXX..', '........', '........'];
    const s = stateWith(art, [p('i2h', 1), p('single'), null], 0);
    const out = applyMove(s, 0, 4, 2);
    if (!out.ok) throw new Error(out.reason);
    expect(out.result.chain).toBe(1);
    expect(out.result.energyGained).toBe(1);
  });

  it('a placement that clears nothing restores nothing', () => {
    const s = stateWith(EMPTY, [p('single'), p('single'), null], 1);
    const out = applyMove(s, 0, 0, 0);
    if (!out.ok) throw new Error(out.reason);
    expect(out.state.energy).toBe(1);
  });

  it('starts each game with the configured charges', () => {
    expect(newGame(5).energy).toBe(3);
    expect(newGame(5, { ...cfg, rotation: { ...cfg.rotation, startCharges: 1 } }).energy).toBe(1);
  });

  it('rotation does not change score or combo', () => {
    const s = { ...stateWith(EMPTY, [p('i2h'), null, null]), score: 500, combo: 2 };
    const r = rotatePiece(s, 0);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.score).toBe(500);
    expect(r.state.combo).toBe(2);
  });
});

describe('rotation-aware playability and game over', () => {
  // Only vertical space: column 0 is free, everything else is full except isolated holes.
  const vertical = ['.XXX.XXX', '.XXXXXX.', '.XX.XXXX', 'XXXXXX.X', 'XX.XXXXX', 'XXXXX.XX', 'X.XXXXXX', 'XXXX.XXX'];

  it('reachable orientations respect the energy available', () => {
    expect(reachableOrientations(cfg.rotation, p('tu'), 0)).toHaveLength(1);
    expect(reachableOrientations(cfg.rotation, p('tu'), 1)).toHaveLength(2);
    expect(reachableOrientations(cfg.rotation, p('tu'), 3)).toHaveLength(4);
    expect(reachableOrientations(cfg.rotation, p('i2h'), 3)).toHaveLength(2); // only two distinct
    expect(reachableOrientations(withMode('unlimited').rotation, p('tu'), 0)).toHaveLength(4);
    expect(reachableOrientations(withMode('none').rotation, p('tu'), 3)).toHaveLength(1);
  });

  it('classifies pieces as playable now, after rotation, or not at all', () => {
    const b = boardFromArt(vertical);
    expect(playability(cfg.rotation, b, p('i3v'), 0)).toBe('now');
    expect(playability(cfg.rotation, b, p('i3h'), 1)).toBe('after-rotation');
    expect(playability(cfg.rotation, b, p('i3h'), 0)).toBe('none');
    expect(playability(withMode('none').rotation, b, p('i3h'), 3)).toBe('none');
  });

  it('is not game over while an affordable rotation still fits', () => {
    const withEnergy = stateWith(vertical, [p('i3h'), null, null], 1);
    expect(withEnergy.over).toBe(false);
    const broke = stateWith(vertical, [p('i3h'), null, null], 0);
    expect(broke.over).toBe(true);
  });

  it('a move that spends the last charge and leaves only unrotatable fits ends the game after resolution', () => {
    let s = stateWith(vertical, [p('i2h'), p('i3h'), null], 1);
    const r = rotatePiece(s, 0); // i2h -> i2v costs the last charge
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
    const out = applyMove(s, 0, 0, 0); // (0,0),(1,0): no line completes
    if (!out.ok) throw new Error(out.reason);
    expect(out.result.rows.length + out.result.cols.length).toBe(0);
    expect(out.state.energy).toBe(0);
    expect(out.state.over).toBe(true); // i3h would fit only after a rotation it can't afford
  });

  it('the generator keeps a playable piece, counting affordable rotations but never rotating for you', () => {
    const b = boardFromArt(vertical);
    for (let seed = 1; seed < 150; seed++) {
      const g = generateTray(cfg, b, new Rng(seed), { score: 0, recent: [], energy: 1 });
      expect(g.tray.every((t) => (t.rot ?? 0) === 0)).toBe(true);
      expect(g.tray.some((t) => playability(cfg.rotation, b, t, 1) !== 'none')).toBe(true);
    }
  });
});

describe('session lock and persistence', () => {
  it('rotation is refused while a clearing sequence resolves', () => {
    const s = new GameSession(stateWith(['XXXXXXX.', ...EMPTY.slice(1)], [p('single'), p('i2h'), null]));
    expect(s.tryPlace(0, 0, 7)).not.toBeNull();
    expect(s.tryRotate(1)).toBeNull();
    expect(s.lastRejection).toBe('locked');
    s.finishResolution();
    expect(s.tryRotate(1)).not.toBeNull();
  });

  it('tutorial steps can forbid rotation and require an orientation', () => {
    const s = new GameSession(stateWith(EMPTY, [null, p('i3h'), null]));
    s.rotationAllowed = false;
    expect(s.tryRotate(1)).toBeNull();
    s.rotationAllowed = true;
    s.requiredTarget = { slot: 1, row: 5, col: 6, rot: 1 };
    expect(s.tryPlace(1, 5, 6)).toBeNull(); // not rotated yet, and it doesn't fit there horizontally anyway
    expect(s.tryRotate(1)).not.toBeNull();
    expect(s.tryPlace(1, 5, 6)).not.toBeNull();
  });

  it('saves and restores rotated pieces and the remaining energy', () => {
    let s = stateWith(EMPTY, [p('tu', 2), p('l5a'), p('i2h')], 3);
    for (const slot of [0, 0, 2]) { const r = rotatePiece(s, slot); if (!r.ok) throw new Error(r.reason); s = r.state; }
    const restored = deserializeGame(serializeGame(s, 1000, 0));
    expect(restored?.state.tray.map((t) => t?.rot)).toEqual([2, 0, 1]);
    expect(restored?.state.energy).toBe(0);
    expect(restored?.state.stats.rotations).toBe(3);
    expect(restored?.state).toEqual(s);
  });

  it('migrates a Build 1 save: unrotated pieces, starting energy, records kept', () => {
    const s = newGame(9);
    const { energy: _e, ...v1state } = s;
    const v1 = JSON.stringify({ version: 1, savedAt: 1, elapsedMs: 5000, bestAtStart: 1234, state: { ...v1state, tray: s.tray.map((t) => t && { defId: t.defId, color: 3, pulseIndex: t.pulseIndex }) } });
    const m = deserializeGame(v1);
    expect(m?.version).toBe(3);
    expect(m?.state.energy).toBe(3);
    expect(m?.state.tray.every((t) => !t || t.rot === 0)).toBe(true);
    expect(m?.bestAtStart).toBe(1234);
    expect(m?.state.stats.rotations).toBe(0);
  });

  it('rejects a save with an impossible orientation or negative energy', () => {
    const bad = JSON.parse(serializeGame(newGame(2), 0, 0));
    bad.state.tray[0].rot = 7;
    expect(deserializeGame(JSON.stringify(bad))).toBeNull();
    const neg = JSON.parse(serializeGame(newGame(2), 0, 0));
    neg.state.energy = -1;
    expect(deserializeGame(JSON.stringify(neg))).toBeNull();
  });
});
