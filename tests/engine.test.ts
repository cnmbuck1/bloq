import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type GameConfig } from '../src/engine/config';
import { canPlace, emptyBoard, findCompletedLines, fitsAnywhere, isGameOver, lineCells, previewLines, type PieceInstance } from '../src/engine/board';
import { applyMove, newGame, rotatePiece, type GameState } from '../src/engine/game';
import { generateTray } from '../src/engine/generator';
import { PIECES, pieceDef } from '../src/engine/pieces';
import { resolvePulses } from '../src/engine/pulse';
import { Rng } from '../src/engine/rng';
import { comboMultiplier, linePointsFor, scoreMove } from '../src/engine/scoring';
import { boardFromArt, boardToArt } from '../src/game/boardArt';
import { TUTORIAL_STEPS, tutorialState } from '../src/game/tutorial';

const cfg = DEFAULT_CONFIG;
const S = cfg.scoring;
const piece = (defId: string, pulseIndex = -1, color = 0): PieceInstance => ({ defId, color, pulseIndex });

function stateWith(art: string[], tray: (PieceInstance | null)[], extra: Partial<GameState> = {}): GameState {
  return { ...newGame(1, cfg, { board: boardFromArt(art), pulseChance: 0 }), tray, ...extra };
}

const EMPTY = ['........', '........', '........', '........', '........', '........', '........', '........'];

describe('piece library', () => {
  it('has every required shape with unique ids', () => {
    const ids = PIECES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['single', 'i2h', 'i2v', 'i3h', 'i3v', 'i4h', 'i4v', 'i5h', 'i5v', 'o2', 'o3', 'l3a', 'l5a', 'tu', 'sh', 'zh']) {
      expect(ids).toContain(id);
    }
    expect(pieceDef('o3').cells).toHaveLength(9);
    expect(pieceDef('l5a').cells).toHaveLength(5);
  });
});

describe('placement validation', () => {
  const b = boardFromArt(['X.......', '........', '........', '........', '........', '........', '........', '........']);
  it('accepts a legal placement', () => expect(canPlace(b, pieceDef('o2'), 1, 1)).toBe(true));
  it('rejects overlap with an existing block', () => expect(canPlace(b, pieceDef('o2'), 0, 0)).toBe(false));
  it('rejects pieces past the right and bottom edges', () => {
    expect(canPlace(b, pieceDef('i5h'), 0, 4)).toBe(false);
    expect(canPlace(b, pieceDef('i5h'), 0, 3)).toBe(true);
    expect(canPlace(b, pieceDef('i3v'), 6, 2)).toBe(false);
    expect(canPlace(b, pieceDef('i3v'), 5, 2)).toBe(true);
  });
  it('rejects negative positions', () => {
    expect(canPlace(b, pieceDef('single'), -1, 3)).toBe(false);
    expect(canPlace(b, pieceDef('single'), 3, -1)).toBe(false);
  });
  it('only checks the piece\'s own cells (gaps may overlap blocks)', () => {
    const g = boardFromArt(['.X......', '........', '........', '........', '........', '........', '........', '........']);
    expect(canPlace(g, pieceDef('l5a'), 0, 0)).toBe(true); // l5a = X.. / X.. / XXX, its gap sits on the block
  });
  it('applyMove rejects an illegal placement without changing state or combo', () => {
    const s = stateWith(['X.......', ...EMPTY.slice(1)], [piece('o2'), null, null], { combo: 2 });
    const out = applyMove(s, 0, 0, 0);
    expect(out.ok).toBe(false);
    expect(s.combo).toBe(2);
    expect(applyMove(s, 1, 3, 3)).toEqual({ ok: false, reason: 'empty-slot' });
  });
});

describe('line clearing', () => {
  it('clears a single completed row', () => {
    const s = stateWith(['XXXXX...', ...EMPTY.slice(1)], [piece('i3h'), piece('single'), null]);
    const out = applyMove(s, 0, 0, 5);
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.rows).toEqual([0]);
    expect(out.result.cols).toEqual([]);
    expect(boardToArt(out.state.board)[0]).toBe('........');
  });

  it('clears a row and a column simultaneously, counting the intersection once', () => {
    const art = ['.....X..', '.....X..', 'XXXXX.XX', '.....X..', '.....X..', '.....X..', '.....X..', '.....X..'];
    const s = stateWith(art, [piece('single'), piece('single'), null]);
    const out = applyMove(s, 0, 2, 5);
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.rows).toEqual([2]);
    expect(out.result.cols).toEqual([5]);
    expect(out.result.lineCells).toHaveLength(15); // 8 + 8 - 1
    expect(out.state.board.cells.every((c) => c === null)).toBe(true);
  });

  it('clears multiple rows at once', () => {
    const art = ['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', ...EMPTY.slice(3)];
    const s = stateWith(art, [piece('i3v'), piece('single'), null]);
    const out = applyMove(s, 0, 0, 7);
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.rows).toEqual([0, 1, 2]);
  });

  it('lineCells de-duplicates intersections across several lines', () => {
    const b = emptyBoard();
    expect(lineCells(b, [0, 1], [0, 1])).toHaveLength(8 * 2 + 8 * 2 - 4);
  });

  it('previews the lines a placement would complete', () => {
    const b = boardFromArt(['XXXXX...', ...EMPTY.slice(1)]);
    expect(previewLines(b, pieceDef('i3h'), 0, 5)).toEqual({ rows: [0], cols: [] });
    expect(previewLines(b, pieceDef('i3h'), 1, 5)).toEqual({ rows: [], cols: [] });
    expect(findCompletedLines(b)).toEqual({ rows: [], cols: [] });
  });
});

describe('pulse blocks', () => {
  it('a pulse in a cleared line clears its occupied neighbours', () => {
    const b = boardFromArt(['........', '........', '........', '.XXXXX..', 'XXXPXXXX', '.X...X..', '........', '........']);
    const lines = lineCells(b, [4], []);
    const r = resolvePulses(b, lines);
    expect(r.activated).toBe(1);
    // Neighbours of (4,3): row 3 cols 2-4 occupied (3), row 5 cols 2-4 empty.
    expect(r.waves).toHaveLength(1);
    expect(r.waves[0].cleared.sort()).toEqual([3 * 8 + 2, 3 * 8 + 3, 3 * 8 + 4].sort());
    expect(r.pulseCleared).toBe(3);
  });

  it('works at board edges and corners without wrapping', () => {
    // Pulse at (0,0) in a full row 0; (0,7)'s neighbourhood would wrap to (1,0) if indices were naive.
    const b = boardFromArt(['PXXXXXXX', 'XX.....X', '........', '........', '........', '........', '........', 'XXXXXXXX']);
    const r = resolvePulses(b, lineCells(b, [0], []));
    expect(r.waves[0].pulses).toEqual([0]);
    expect(r.waves[0].cleared.sort((a, z) => a - z)).toEqual([8, 9]); // (1,0),(1,1) only; (1,7) untouched
    const corner = boardFromArt(['........', '........', '........', '........', '........', '........', 'XXXXX.XX', 'XXXXXXXP']);
    const rc = resolvePulses(corner, lineCells(corner, [7], []));
    expect(rc.waves[0].cleared.sort((a, z) => a - z)).toEqual([6 * 8 + 6, 6 * 8 + 7]);
  });

  it('activates several pulses in the same line simultaneously', () => {
    const b = boardFromArt(['........', 'X......X', 'PXXXXXXP', 'X......X', '........', '........', '........', '........']);
    const r = resolvePulses(b, lineCells(b, [2], []));
    expect(r.waves).toHaveLength(1);
    expect(r.waves[0].pulses).toEqual([16, 23]);
    expect(r.activated).toBe(2);
    expect(r.pulseCleared).toBe(4);
  });

  it('cascades: a pulse caught in a blast activates in the next wave', () => {
    const b = boardFromArt(['........', '...XXX..', '..XXPX..', 'XXXPXXXX', '..XXX...', '........', '........', '........']);
    const r = resolvePulses(b, lineCells(b, [3], []));
    expect(r.waves).toHaveLength(2);
    expect(r.waves[0].pulses).toEqual([3 * 8 + 3]);
    expect(r.waves[1].pulses).toEqual([2 * 8 + 4]);
    expect(r.activated).toBe(2);
    // Wave 2 clears (1,3),(1,4),(1,5),(2,5); (2,3) was already cleared by wave 1.
    expect(r.waves[1].cleared.sort((a, z) => a - z)).toEqual([11, 12, 13, 21]);
  });

  it('long chains resolve fully and each pulse activates once', () => {
    // Pulses on a diagonal, each in the next one's blast; also adjacent to each other both ways.
    const b = boardFromArt(['PXXXXXXX', '.P......', '..P.....', '...P....', '....P...', '.....P..', '......P.', '.......P']);
    const r = resolvePulses(b, lineCells(b, [0], []));
    expect(r.activated).toBe(8);
    expect(r.waves).toHaveLength(8);
    const all = r.waves.flatMap((w) => w.pulses);
    expect(new Set(all).size).toBe(all.length);
  });

  it('never clears or scores a block twice', () => {
    const b = boardFromArt(['XXXXXXXX', 'PXXXXXXP', 'XXXXXXXX', ...EMPTY.slice(3)]);
    const lines = lineCells(b, [0, 1, 2], []);
    const r = resolvePulses(b, lines);
    expect(r.activated).toBe(2);
    expect(r.pulseCleared).toBe(0); // all neighbours already in cleared lines
    expect(new Set(r.allCleared).size).toBe(r.allCleared.length);
  });

  it('a dormant pulse outside cleared lines stays dormant', () => {
    const s = stateWith(['XXXXX...', '........', '...P....', ...EMPTY.slice(3)], [piece('i3h'), piece('single'), null]);
    const out = applyMove(s, 0, 0, 5);
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.chain).toBe(0);
    expect(out.state.board.cells[2 * 8 + 3]?.pulse).toBe(true);
  });
});

describe('scoring', () => {
  it('uses the line table and extra-line value', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => linePointsFor(S, n))).toEqual([150, 400, 750, 1200, 1600, 2000]);
    expect(linePointsFor(S, 0)).toBe(0);
  });

  it('combo multipliers cap at 3x', () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => comboMultiplier(S, n))).toEqual([1, 1.5, 2, 2.5, 3, 3]);
  });

  it('applies the multiplier to line and pulse points but not placement', () => {
    const b = scoreMove(S, { blocksPlaced: 3, lineCount: 1, pulsesActivated: 1, pulseCleared: 3, combo: 2 });
    expect(b.total).toBe(30 + Math.round((150 + 100 + 75) * 1.5));
  });

  it('rounds to whole numbers', () => {
    const b = scoreMove({ ...S, pulseBlockCleared: 7 }, { blocksPlaced: 1, lineCount: 0, pulsesActivated: 0, pulseCleared: 1, combo: 2 });
    expect(Number.isInteger(b.total)).toBe(true);
  });

  it('scores a real move end to end', () => {
    const s = stateWith(['........', '........', '........', '.XXXXX..', 'XX..XXXX', '.XXXXX..', '........', '........'], [piece('i2h', 1), piece('single'), null]);
    const out = applyMove(s, 0, 4, 2);
    if (!out.ok) throw new Error('expected ok');
    // Ruleset 2: 2 placed (20) + 1 line (150) + 1 Pulse (100) + 6 neighbours (150)
    expect(out.result.points.total).toBe(20 + 150 + 100 + 150);
    expect(out.state.score).toBe(420);
  });
});

describe('combos', () => {
  const rowArt = ['XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', 'XXXXXXX.', ...EMPTY.slice(4)];
  it('increases on consecutive clearing moves; with protection off, resets on a non-clearing move', () => {
    const c0: GameConfig = { ...cfg, combo: { protection: 0 } };
    let s = stateWith(rowArt, [piece('single'), piece('single'), piece('single')]);
    const step = (slot: number, r: number, c: number) => {
      const out = applyMove(s, slot, r, c, c0);
      if (!out.ok) throw new Error(`move failed: ${out.reason}`);
      s = out.state; return out.result;
    };
    expect(step(0, 0, 7).combo).toBe(1);
    const second = step(1, 1, 7);
    expect(second.combo).toBe(2);
    expect(second.points.multiplier).toBe(1.5);
    expect(second.points.total).toBe(10 + 225);
    expect(step(2, 7, 0).combo).toBe(0); // no clear: reset
    expect(s.stats.maxCombo).toBe(2);
  });

  it('invalid attempts leave the combo alone', () => {
    const s = stateWith(rowArt, [piece('single'), null, null], { combo: 3 });
    const out = applyMove(s, 0, 0, 0);
    expect(out.ok).toBe(false);
    expect(s.combo).toBe(3);
  });
});

describe('seeded generation', () => {
  it('the same seed reproduces the same sequence of trays', () => {
    const run = (seed: number) => {
      const rng = new Rng(seed);
      let recent: string[] = [];
      const out: string[] = [];
      for (let i = 0; i < 20; i++) {
        const g = generateTray(cfg, emptyBoard(), rng, { score: i * 500, recent });
        recent = g.recent;
        out.push(g.tray.map((p) => `${p.defId}:${p.color}:${p.pulseIndex}`).join(','));
      }
      return out;
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it('identical games with identical moves stay identical', () => {
    const play = () => {
      let s = newGame(777);
      for (let i = 0; i < 30 && !s.over; i++) {
        const slot = s.tray.findIndex((p) => p && fitsAnywhere(s.board, pieceDef(p.defId)));
        if (slot < 0) break;
        const def = pieceDef(s.tray[slot]!.defId);
        let done = false;
        for (let r = 0; r < 8 && !done; r++) for (let c = 0; c < 8 && !done; c++) {
          if (canPlace(s.board, def, r, c)) { const o = applyMove(s, slot, r, c); if (o.ok) { s = o.state; done = true; } }
        }
      }
      return s;
    };
    expect(play()).toEqual(play());
  });

  it('pulse frequency follows the config (about 12%) with at most one per piece', () => {
    const rng = new Rng(9);
    let pulses = 0, total = 0;
    for (let i = 0; i < 3000; i++) {
      const g = generateTray(cfg, emptyBoard(), rng, { score: 0, recent: [] });
      for (const p of g.tray) { total++; if (p.pulseIndex >= 0) { pulses++; expect(p.pulseIndex).toBeLessThan(pieceDef(p.defId).cells.length); } }
    }
    expect(pulses / total).toBeGreaterThan(0.1);
    expect(pulses / total).toBeLessThan(0.14);
    const none = generateTray({ ...cfg, generation: { ...cfg.generation, pulseChance: 0 } }, emptyBoard(), rng, { score: 0, recent: [] });
    expect(none.tray.every((p) => p.pulseIndex === -1)).toBe(true);
  });

  it('limits repetition within a tray', () => {
    const rng = new Rng(5);
    let triples = 0;
    for (let i = 0; i < 2000; i++) {
      const t = generateTray(cfg, emptyBoard(), rng, { score: 0, recent: [] }).tray;
      if (t[0].defId === t[1].defId && t[1].defId === t[2].defId) triples++;
    }
    expect(triples).toBe(0);
  });

  it('guarantees a playable piece whenever the board supports one', () => {
    // Only a single cell is free: just the single block fits.
    const tight = boardFromArt(['XXXXXXX.', 'XXXXXX.X', 'X.XXXXXX', 'XXXX.XXX', 'XXXXXXXX', 'X.XXXX.X', 'XXX.XXXX', '.XXXXXXX']
      .map((l, i) => (i === 4 ? 'XXXXXXX.' : l)));
    for (let seed = 1; seed < 200; seed++) {
      const g = generateTray(cfg, tight, new Rng(seed), { score: 0, recent: [] });
      expect(g.tray.some((p) => fitsAnywhere(tight, pieceDef(p.defId)))).toBe(true);
    }
  });

  it('higher levels shift weights toward bigger pieces', () => {
    const count = (level: number) => {
      const rng = new Rng(3); let big = 0;
      for (let i = 0; i < 2000; i++) for (const p of generateTray(cfg, emptyBoard(), rng, { score: 0, level, recent: [] }).tray) {
        if (['o3', 'l5a', 'l5b', 'l5c', 'l5d', 'i5h', 'i5v'].includes(p.defId)) big++;
      }
      return big;
    };
    expect(count(11)).toBeGreaterThan(count(1));
  });
});

describe('game over', () => {
  const nearlyFull = ['XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XX.XXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXX..'];
  it('is over only when no remaining piece fits anywhere', () => {
    const b = boardFromArt(nearlyFull);
    expect(isGameOver(b, [piece('o2'), piece('i3h'), null])).toBe(true);
    expect(isGameOver(b, [piece('o2'), piece('i2h'), null])).toBe(false); // i2h fits at (7,6)
    expect(isGameOver(b, [null, null, piece('single')])).toBe(false);
  });

  it('an empty tray is never game over', () => expect(isGameOver(boardFromArt(nearlyFull), [null, null, null])).toBe(false));

  it('is evaluated after clears, so a move that frees space is not game over', () => {
    // Placing i2h at (7,6) completes row 7, freeing a whole row; the 1x5 that would not fit now does.
    const s = stateWith(nearlyFull, [piece('i2h'), piece('i5h'), null]);
    const out = applyMove(s, 0, 7, 6);
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.rows).toContain(7);
    expect(out.result.gameOver).toBe(false);
  });

  it('ends the game when the remaining pieces cannot fit after resolution', () => {
    // Isolated holes only: no 2x2 space anywhere, and filling one hole completes no line.
    const holes = ['.XXX.XXX', 'XXX.XXX.', 'XX.XXX.X', 'X.XXX.XX', '.XXX.XXX', 'XXX.XXX.', 'XX.XXX.X', 'X.XXX.XX'];
    const s = stateWith(holes, [piece('single'), piece('o2'), null]);
    expect(s.over).toBe(false);
    const out = applyMove(s, 0, 0, 0);
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.rows.length + out.result.cols.length).toBe(0);
    expect(out.state.over).toBe(true);
    expect(out.result.gameOver).toBe(true);
    expect(applyMove(out.state, 1, 0, 4)).toEqual({ ok: false, reason: 'over' });
  });

  it('refills the tray once all three are placed', () => {
    const s = stateWith(EMPTY, [piece('single'), null, null]);
    const out = applyMove(s, 0, 0, 0);
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.newTray).toBe(true);
    expect(out.state.tray.every((p) => p)).toBe(true);
  });
});

describe('tutorial script', () => {
  it('every step\'s target is legal and teaches what it says', () => {
    const results = TUTORIAL_STEPS.map((step) => {
      let st = tutorialState(step);
      for (let i = 0; i < (step.target.rot ?? 0); i++) {
        const r = rotatePiece(st, step.target.slot);
        if (!r.ok) throw new Error(`step "${step.title}" rotation refused: ${r.reason}`);
        st = r.state;
      }
      const out = applyMove(st, step.target.slot, step.target.row, step.target.col);
      if (!out.ok) throw new Error(`step "${step.title}" target illegal`);
      return out.result;
    });
    expect(results[0].rows.length + results[0].cols.length).toBe(0);
    expect(results[1].rows).toEqual([5]);
    expect(results[2].rows.length + results[2].cols.length).toBe(2);
    expect(results[3].chain).toBe(1);
    expect(results[4].chain).toBe(2);
    // Rotation step: one charge spent on the turn, one restored by the completed column.
    expect(results[5].cols).toEqual([6]);
    expect(results[5].energyAfter).toBe(1);
    // Recharge step: two lines restore two charges from empty.
    expect(results[6].rows).toEqual([6, 7]);
    expect(results[6].energyGained).toBe(2);
  });
});

describe('dev scenarios', () => {
  it('the chain scenario produces a four-pulse cascade that clears the board', async () => {
    const { SCENARIOS } = await import('../src/dev/scenarios');
    const sc = SCENARIOS.find((x) => x.name.startsWith('Chain'))!;
    const out = applyMove(stateWith(sc.board, sc.tray), 0, 3, 2);
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.chain).toBe(4);
    expect(out.result.waves.map((w) => w.pulses.length)).toEqual([1, 2, 1]);
    expect(out.state.board.cells.every((c) => !c)).toBe(true);
  });
});

describe('config', () => {
  it('scoring values can be changed without touching the engine', () => {
    const custom: GameConfig = { ...cfg, scoring: { ...cfg.scoring, linePoints: [0, 1000] } };
    const s = stateWith(['XXXXX...', ...EMPTY.slice(1, 7), 'X.......'], [piece('i3h'), piece('single'), null]);
    const out = applyMove(s, 0, 0, 5, custom);
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.points.total).toBe(30 + 1000);
  });
});
