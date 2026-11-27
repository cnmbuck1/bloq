import { describe, expect, it } from 'vitest';
import { shapeOf } from '../src/engine/board';
import { DEFAULT_CONFIG, type GameConfig } from '../src/engine/config';
import { applyMove, newGame, rotatePiece, stateIsOver, type GameState } from '../src/engine/game';
import { generateTray } from '../src/engine/generator';
import { pieceDef } from '../src/engine/pieces';
import { bandFor, levelForScore, levelProgress, levelThreshold, levelTitle, materialForLevel, materialsUnlockedAt, sizeClass } from '../src/engine/progression';
import { Rng } from '../src/engine/rng';
import { deserializeGame, serializeGame } from '../src/engine/save';
import { ACHIEVEMENTS, activeMaterial, grantProgress, nextMilestone } from '../src/game/achievements';
import { boardFromArt } from '../src/game/boardArt';
import { emptyStats, recordMove } from '../src/game/stats';
import { SCENARIOS } from '../src/dev/scenarios';

const P = DEFAULT_CONFIG.progression;
const cfgWith = (levelUpEnergy: GameConfig['progression']['levelUpEnergy']): GameConfig => ({ ...DEFAULT_CONFIG, progression: { ...P, levelUpEnergy } });
const scenario = (name: string): GameState => {
  const sc = SCENARIOS.find((s) => s.name === name);
  if (!sc) throw new Error(`missing ${name}`);
  const base = newGame(7, DEFAULT_CONFIG, { board: boardFromArt(sc.board), energy: sc.energy, score: sc.score });
  const st: GameState = { ...base, tray: sc.tray.map((p) => (p ? { ...p } : null)), energy: sc.energy, combo: sc.combo ?? 0 };
  st.over = stateIsOver(st);
  return st;
};
const move = (s: GameState, slot: number, row: number, col: number, cfg = DEFAULT_CONFIG) => {
  const o = applyMove(s, slot, row, col, cfg);
  if (!o.ok) throw new Error(`move rejected: ${o.reason}`);
  return o;
};

describe('level thresholds', () => {
  it('matches the spec table and titles', () => {
    const want = [0, 1000, 2500, 4500, 7000, 10000, 13500, 17500, 22000, 27000, 32500, 38500, 45000, 52000, 59500];
    want.forEach((t, i) => expect(levelThreshold(P, i + 1)).toBe(t));
    expect(levelTitle(P, 1)).toBe('Initiate');
    expect(levelTitle(P, 10)).toBe('Quantum Master');
    expect(levelTitle(P, 15)).toBe('Quantum Master VI');
  });

  it('is endless: each gap past Level 15 grows by 500', () => {
    expect(levelThreshold(P, 16)).toBe(67500);
    expect(levelThreshold(P, 17)).toBe(76000);
    expect(levelThreshold(P, 18)).toBe(85000);
    expect(levelTitle(P, 16)).toBe('Quantum Master VII');
    expect(levelTitle(P, 40)).toMatch(/^Quantum Master [IVXLC]+$/);
    for (let L = 1; L < 60; L++) expect(levelThreshold(P, L + 1)).toBeGreaterThan(levelThreshold(P, L));
  });

  it('levels and progress are relative to the current level', () => {
    expect(levelForScore(P, 999)).toBe(1);
    expect(levelForScore(P, 1000)).toBe(2);
    const p = levelProgress(P, 1850);
    expect(p).toMatchObject({ level: 2, title: 'Operator', start: 1000, next: 2500, remaining: 650 });
    expect(p.fraction).toBeCloseTo(850 / 1500);
    expect(levelProgress(P, 1000).fraction).toBe(0);
  });
});

describe('advancement during play', () => {
  it('a line clear levels up and keeps board, tray, orientations, combo and score', () => {
    const s = scenario('Level-up through a line clear');
    s.tray[1] = { ...s.tray[1]!, rot: 1 };
    const o = move(s, 0, 7, 5);
    expect(o.result.levelBefore).toBe(1);
    expect(o.result.levelAfter).toBe(2);
    expect(o.state.level).toBe(2);
    expect(o.state.score).toBe(o.result.scoreAfter); // no points for levelling
    expect(o.result.points.total).toBe(o.result.scoreAfter - 950);
    expect(o.state.tray[1]).toEqual(s.tray[1]);
    expect(o.state.tray[2]).toEqual(s.tray[2]);
    expect(o.state.combo).toBe(1);
    expect(o.result.newTray).toBe(false);
  });

  it('a Pulse chain can level up', () => {
    const s = scenario('Level-up through a Pulse chain');
    const o = move(s, 0, 3, 2);
    expect(o.result.chain).toBeGreaterThanOrEqual(2);
    expect(o.result.levelAfter).toBe(2);
  });

  it('several levels in one move: all awarded, energy restored once', () => {
    const s = scenario('Multiple levels in one move');
    const o = move(s, 0, 0, 7);
    expect(o.result.rows.length).toBe(4);
    expect(o.result.levelBefore).toBe(1);
    expect(o.result.levelAfter).toBe(3);
    expect(o.state.energy).toBe(DEFAULT_CONFIG.rotation.maxCharges);
    expect(o.state.stats.energyFromLevels).toBe(o.result.levelEnergy);
    expect(o.result.levelEnergy).toBeLessThanOrEqual(DEFAULT_CONFIG.rotation.maxCharges);
  });

  it('level-up energy: full / one / none', () => {
    const s = scenario('Level-up with depleted energy');
    expect(s.energy).toBe(0);
    const full = move(s, 0, 7, 5, cfgWith('full'));
    expect(full.state.energy).toBe(3);
    expect(full.result.energyAfterLines).toBe(1);
    expect(full.result.levelEnergy).toBe(2);
    expect(move(s, 0, 7, 5, cfgWith('one')).state.energy).toBe(2);
    expect(move(s, 0, 7, 5, cfgWith('none')).state.energy).toBe(1);
  });

  it('full energy stays full (no overflow)', () => {
    const o = move(scenario('Level-up with full energy'), 0, 7, 5);
    expect(o.state.energy).toBe(3);
    expect(o.result.levelEnergy).toBe(0);
  });

  it('game over is checked after level-up energy', () => {
    const s = scenario('Game over prevented by level-up energy');
    expect(s.over).toBe(false);
    const saved = move(s, 0, 2, 3);
    expect(saved.result.rows.length + saved.result.cols.length).toBe(0);
    expect(saved.result.levelAfter).toBe(2);
    expect(saved.state.over).toBe(false);
    // Same move without level-up energy ends the game.
    expect(move(s, 0, 2, 3, cfgWith('none')).state.over).toBe(true);
    // And the remaining piece really needs the rotation.
    const r = rotatePiece(saved.state, 1);
    expect(r.ok).toBe(true);
  });

  it('the tutorial never levels', () => {
    const s = { ...scenario('Level-up through a line clear'), mode: 'tutorial' as const };
    expect(move(s, 0, 7, 5).result.levelAfter).toBe(1);
  });

  it('beyond Level 15', () => {
    const o = move(scenario('Beyond Level 15'), 0, 7, 5);
    expect(o.result.levelAfter).toBe(16);
  });

  it('a five-Pulse chain resolves', () => {
    expect(move(scenario('Five-Pulse chain'), 0, 3, 2).result.chain).toBe(5);
  });
});

describe('difficulty by level', () => {
  it('bands follow the spec and cap at Level 11', () => {
    expect(bandFor(DEFAULT_CONFIG, 1)).toMatchObject({ small: 40, medium: 45, large: 15 });
    expect(bandFor(DEFAULT_CONFIG, 4)).toMatchObject({ small: 30, medium: 50, large: 20 });
    expect(bandFor(DEFAULT_CONFIG, 6)).toMatchObject({ small: 25, medium: 45, large: 30 });
    expect(bandFor(DEFAULT_CONFIG, 8)).toMatchObject({ small: 20, medium: 45, large: 35 });
    expect(bandFor(DEFAULT_CONFIG, 10)).toMatchObject({ small: 15, medium: 45, large: 40 });
    expect(bandFor(DEFAULT_CONFIG, 11)).toEqual(bandFor(DEFAULT_CONFIG, 50));
    expect(bandFor(DEFAULT_CONFIG, 11)).toMatchObject({ small: 15, medium: 40, large: 45 });
  });

  it('generated size mix tracks the band (empty board, many trays)', () => {
    const mix = (level: number) => {
      const rng = new Rng(99), board = boardFromArt(Array(8).fill('........'));
      const n = { small: 0, medium: 0, large: 0 };
      let recent: string[] = [];
      for (let i = 0; i < 1500; i++) {
        const g = generateTray(DEFAULT_CONFIG, board, rng, { score: 0, level, recent, energy: 3 });
        recent = g.recent;
        for (const p of g.tray) if (p) n[sizeClass(pieceDef(p.defId).cells.length)]++;
      }
      const t = n.small + n.medium + n.large;
      return { small: n.small / t, large: n.large / t };
    };
    const l1 = mix(1), l11 = mix(11);
    expect(l1.small).toBeGreaterThan(l11.small + 0.1);
    expect(l11.large).toBeGreaterThan(l1.large + 0.15);
  });

  it('is deterministic for a seed and level', () => {
    const a = newGame(31337, DEFAULT_CONFIG, { score: 30000 });
    const b = newGame(31337, DEFAULT_CONFIG, { score: 30000 });
    expect(a.tray).toEqual(b.tray);
    expect(a.level).toBe(10);
  });

  it('a level-up changes only trays generated afterwards', () => {
    const s = scenario('Level-up through a line clear');
    const o = move(s, 0, 7, 5);
    expect(o.state.tray.slice(1)).toEqual(s.tray.slice(1));
    // When the last piece goes, the new tray is generated at the new level.
    const last = { ...s, tray: [s.tray[0], null, null] };
    const o2 = move(last, 0, 7, 5);
    expect(o2.result.newTray).toBe(true);
    const rng = new Rng(s.rngState);
    const expected = generateTray(DEFAULT_CONFIG, o2.state.board, rng, { score: o2.state.score, level: 2, recent: s.recent, energy: o2.state.energy });
    expect(o2.state.tray).toEqual(expected.tray);
    expect(shapeOf(o2.state.tray[0]!)).toBeTruthy();
  });
});

describe('materials', () => {
  const M = DEFAULT_CONFIG.materials;
  it('tiers follow the level', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 30].map((l) => materialForLevel(M, l).id))
      .toEqual(['magenta', 'magenta', 'violet', 'violet', 'emerald', 'emerald', 'amber', 'amber', 'crimson', 'crimson', 'platinum', 'platinum']);
    expect(materialsUnlockedAt(M, 4)).toEqual(['magenta', 'violet']);
  });

  it('unlocks are permanent and granted once', () => {
    const s = { ...emptyStats(), highestLevel: 5 };
    const g = grantProgress(s, DEFAULT_CONFIG, 1);
    expect(g.newMaterials.map((m) => m.id)).toEqual(['violet', 'emerald']);
    expect(g.stats.unlockedMaterials).toEqual(['magenta', 'violet', 'emerald']);
    const again = grantProgress(g.stats, DEFAULT_CONFIG, 2);
    expect(again.newMaterials).toEqual([]);
    expect(again.newAchievements).toEqual([]);
    expect(again.stats).toBe(g.stats);
  });

  it('fixed mode uses the chosen unlocked material at any level; locked choices fall back', () => {
    const s = { materialMode: 'fixed' as const, fixedMaterial: 'emerald', unlockedMaterials: ['magenta', 'violet', 'emerald'] };
    expect(activeMaterial(DEFAULT_CONFIG, s, 1).id).toBe('emerald');
    expect(activeMaterial(DEFAULT_CONFIG, s, 11).id).toBe('emerald');
    expect(activeMaterial(DEFAULT_CONFIG, { ...s, fixedMaterial: 'platinum' }, 3).id).toBe('violet');
    expect(activeMaterial(DEFAULT_CONFIG, { ...s, materialMode: 'progressive' }, 9).id).toBe('crimson');
  });
});

describe('career and achievements', () => {
  it('there are 19 achievements with unique ids', () => {
    expect(ACHIEVEMENTS).toHaveLength(19);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(19);
  });

  it('lifetime points are never credited twice for the same move (restore, reopen, crash)', () => {
    const s = scenario('Level-up through a line clear');
    const o = move(s, 0, 7, 5);
    const credit = { seed: s.seed, moves: o.state.stats.moves };
    let st = recordMove(emptyStats(), o.result, credit, '2026-11-27');
    const once = st.lifetimePoints;
    st = recordMove(st, o.result, credit, '2026-11-27');
    expect(st.lifetimePoints).toBe(once);
    expect(st.totalLines).toBe(1);
    expect(st.highestLevel).toBe(2);
  });

  it('one move can earn several achievements, each only once', () => {
    const s = scenario('Multiple achievements at once');
    const o = move(s, 0, 0, 7);
    const st = recordMove(emptyStats(), o.result, { seed: 1, moves: 1 });
    const g = grantProgress(st, DEFAULT_CONFIG, 5);
    expect(g.newAchievements.map((a) => a.id).sort()).toEqual(['double-impact', 'first-contact', 'pulse-initiate', 'triple-threat']);
    expect(grantProgress(g.stats, DEFAULT_CONFIG, 6).newAchievements).toEqual([]);
  });

  it('next milestone is never something already done', () => {
    const s = { ...emptyStats(), highestLevel: 11 };
    const g = grantProgress(s, DEFAULT_CONFIG, 1).stats;
    const m = nextMilestone(g, DEFAULT_CONFIG);
    expect(m).not.toMatch(/Level 3|Technician|Material Collector/);
    expect(nextMilestone(emptyStats(), DEFAULT_CONFIG)).toBe('Reach Level 3 to unlock Electric Violet');
  });
});

describe('persistence', () => {
  it('a v3 save restores the level mid-progress', () => {
    const o = move(scenario('Level-up through a line clear'), 0, 7, 5);
    const back = deserializeGame(serializeGame(o.state, 1000, 0));
    expect(back!.state.level).toBe(2);
    expect(back!.state).toEqual(o.state);
  });

  it('a v2 save migrates with the level its score has reached (no level-up replayed)', () => {
    const g = newGame(5);
    const { level: _drop, ...v2state } = { ...g, score: 4600 };
    const raw = JSON.stringify({ version: 2, savedAt: 0, elapsedMs: 0, bestAtStart: 0, state: v2state });
    const back = deserializeGame(raw);
    expect(back!.version).toBe(3);
    expect(back!.state.level).toBe(4);
    expect(back!.state.energy).toBe(g.energy);
  });

  it('rejects a v3 save with an invalid level', () => {
    const bad = JSON.parse(serializeGame(newGame(1), 0, 0));
    bad.state.level = 0;
    expect(deserializeGame(JSON.stringify(bad))).toBeNull();
  });
});
