import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/game';
import { deserializeGame, serializeGame } from '../src/engine/save';
import { boardFromArt } from '../src/game/boardArt';
import { GameSession } from '../src/game/session';
import { emptyStats, parseStats, recordGameEnd, recordMove } from '../src/game/stats';
import { applyMove } from '../src/engine/game';

const ART = ['XXXXXXX.', 'XXXXXXX.', ...Array(6).fill('........')];

describe('input lock during resolution', () => {
  it('rejects a second placement until the resolution sequence finishes', () => {
    const s = new GameSession({ ...newGame(1, undefined, { board: boardFromArt(ART) }), tray: [
      { defId: 'single', color: 0, pulseIndex: -1 }, { defId: 'single', color: 1, pulseIndex: -1 }, { defId: 'single', color: 2, pulseIndex: -1 },
    ] });
    expect(s.tryPlace(0, 0, 7)).not.toBeNull();
    expect(s.locked).toBe(true);
    const before = JSON.stringify(s.state);
    expect(s.tryPlace(1, 1, 7)).toBeNull();
    expect(s.lastRejection).toBe('locked');
    expect(JSON.stringify(s.state)).toBe(before);
    s.finishResolution();
    expect(s.tryPlace(1, 1, 7)).not.toBeNull();
    expect(s.state.combo).toBe(2);
  });

  it('an invalid drop does not lock input', () => {
    const s = new GameSession(newGame(3, undefined, { board: boardFromArt(ART) }));
    expect(s.tryPlace(0, 0, 0)).toBeNull();
    expect(s.locked).toBe(false);
  });

  it('tutorial mode only accepts the highlighted placement', () => {
    const s = new GameSession(newGame(3));
    s.requiredTarget = { slot: 0, row: 2, col: 2 };
    expect(s.tryPlace(0, 0, 0)).toBeNull();
    expect(s.lastRejection).toBe('not-target');
  });
});

describe('save and restore', () => {
  it('round-trips the full state, including the RNG, so play continues identically', () => {
    let a = newGame(2024);
    const o = applyMove(a, 0, 0, 0);
    if (o.ok) a = o.state;
    const raw = serializeGame(a, 12345, 900);
    const restored = deserializeGame(raw);
    expect(restored).not.toBeNull();
    expect(restored!.state).toEqual(a);
    expect(restored!.elapsedMs).toBe(12345);
    expect(restored!.bestAtStart).toBe(900);
    expect(restored!.version).toBe(2);
  });

  it('rejects corrupt, unknown-version and finished saves', () => {
    expect(deserializeGame(null)).toBeNull();
    expect(deserializeGame('{not json')).toBeNull();
    expect(deserializeGame(JSON.stringify({ version: 99, state: {} }))).toBeNull();
    const over = { ...newGame(1), over: true };
    expect(deserializeGame(serializeGame(over, 0, 0))).toBeNull();
    const bad = JSON.parse(serializeGame(newGame(1), 0, 0));
    bad.state.tray[0].defId = 'nope';
    expect(deserializeGame(JSON.stringify(bad))).toBeNull();
  });
});

describe('lifetime statistics', () => {
  it('records moves and game ends', () => {
    let st = emptyStats();
    let g = newGame(1, undefined, { board: boardFromArt(ART) });
    g = { ...g, tray: [{ defId: 'i2v', color: 0, pulseIndex: -1 }, null, null] };
    const o = applyMove(g, 0, 0, 7);
    if (!o.ok) throw new Error('expected ok');
    st = recordMove(st, o.result, '2026-11-26');
    st = recordMove(st, o.result, '2026-11-26');
    expect(st.totalLines).toBe(4);
    expect(st.maxLinesAtOnce).toBe(2);
    expect(st.days).toEqual(['2026-11-26']);
    st = recordGameEnd(st, 500);
    st = recordGameEnd(st, 300);
    expect(st.gamesPlayed).toBe(2);
    expect(st.bestScore).toBe(500);
    expect(parseStats(JSON.stringify(st))).toEqual(st);
    expect(parseStats('garbage')).toEqual(emptyStats());
  });
});
