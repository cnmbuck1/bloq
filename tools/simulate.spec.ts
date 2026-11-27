// Balancing simulation: a greedy bot plays many seeded games through the real engine, once per rotation mode.
// Skipped in normal test runs. Run with:  SIM=1 npx vitest run tools/simulate.spec.ts
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { canPlace, findCompletedLines, placePiece, shapeOf } from '../src/engine/board';
import { DEFAULT_CONFIG, type GameConfig, type RotationMode } from '../src/engine/config';
import { applyMove, newGame, rotatePiece, type GameState } from '../src/engine/game';
import { reachableOrientations } from '../src/engine/rotation';

interface Plan { slot: number; turns: number; r: number; c: number; v: number }

/**
 * Greedy over every affordable orientation: prefer moves that clear the most lines, then keep the board compact.
 * Energy is worth keeping, so a rotation must earn its cost (a small penalty per charge spent).
 */
function bestMove(s: GameState, cfg: GameConfig): Plan | null {
  let best: Plan | null = null;
  s.tray.forEach((p, slot) => {
    if (!p) return;
    reachableOrientations(cfg.rotation, p, s.energy).forEach((o, turns) => {
      const shape = shapeOf(o.inst);
      for (let r = 0; r <= 8 - shape.rows; r++) for (let c = 0; c <= 8 - shape.cols; c++) {
        if (!canPlace(s.board, shape, r, c)) continue;
        const { board } = placePiece(s.board, o.inst, r, c);
        const { rows, cols } = findCompletedLines(board);
        let pulseBonus = 0;
        for (const k of [...rows.flatMap((rr) => [...Array(8)].map((_, i) => rr * 8 + i)), ...cols.flatMap((cc) => [...Array(8)].map((_, i) => i * 8 + cc))]) if (board.cells[k]?.pulse) pulseBonus += 1;
        const v = (rows.length + cols.length) * 100 + pulseBonus * 30 + r * 2 - Math.abs(c - 3.5) + shape.cells.length - o.spent * 12;
        if (!best || v > best.v) best = { slot, turns, r, c, v };
      }
    });
  });
  return best;
}

function runMode(mode: RotationMode, N: number) {
  // SIM_ROT='{"maxCharges":2,"startCharges":2}' tries other Rotation Energy settings.
  const extra = process.env.SIM_ROT ? JSON.parse(process.env.SIM_ROT) : {};
  const cfg: GameConfig = { ...DEFAULT_CONFIG, rotation: { ...DEFAULT_CONFIG.rotation, ...extra, mode } };
  const scores: number[] = [], moves: number[] = [], chains: number[] = [], pulses: number[] = [], rotations: number[] = [];
  let starvedTurns = 0, totalTurns = 0;
  const chainHist = new Map<number, number>();
  for (let seed = 1; seed <= N; seed++) {
    let s = newGame(seed, cfg);
    while (!s.over && s.stats.moves < 2000) {
      const m = bestMove(s, cfg);
      if (!m) break;
      totalTurns++;
      if (mode === 'energy' && s.energy === 0) starvedTurns++;
      for (let t = 0; t < m.turns; t++) {
        const ro = rotatePiece(s, m.slot, cfg);
        if (!ro.ok) throw new Error(`rotation refused: ${ro.reason}`);
        s = ro.state;
      }
      const o = applyMove(s, m.slot, m.r, m.c, cfg);
      if (!o.ok) break;
      if (o.result.chain) chainHist.set(o.result.chain, (chainHist.get(o.result.chain) ?? 0) + 1);
      s = o.state;
    }
    scores.push(s.score); moves.push(s.stats.moves); chains.push(s.stats.maxChain); pulses.push(s.stats.pulsesActivated); rotations.push(s.stats.rotations);
  }
  const sorted = [...scores].sort((a, b) => a - b);
  const avg = (a: number[]) => Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10;
  return {
    mode, games: N, avgScore: avg(scores), medianScore: sorted[N >> 1], p10: sorted[Math.floor(N * 0.1)], p90: sorted[Math.floor(N * 0.9)],
    avgMoves: avg(moves), avgRotations: avg(rotations), rotationsPerMove: Math.round((avg(rotations) / avg(moves)) * 1000) / 1000,
    turnsAtZeroEnergy: mode === 'energy' ? Math.round((starvedTurns / totalTurns) * 1000) / 10 + '%' : 'n/a',
    avgPulsesActivated: avg(pulses), gamesWithChain2plus: chains.filter((c) => c >= 2).length,
    chainEvents: Object.fromEntries([...chainHist].sort((a, b) => a[0] - b[0])),
  };
}

describe.runIf(process.env.SIM)('balancing simulation', () => {
  it('plays 300 games per rotation mode', () => {
    const N = Number(process.env.SIM_GAMES ?? 300);
    const out = (['none', 'energy', 'unlimited'] as RotationMode[]).map((m) => runMode(m, N));
    writeFileSync(process.env.SIM_OUT ?? 'sim-results.json', JSON.stringify(out, null, 1));
  }, 600_000);
});
