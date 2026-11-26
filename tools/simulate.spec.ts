// Balancing simulation: a greedy bot plays many seeded games through the real engine.
// Skipped in normal test runs. Run with:  SIM=1 npx vitest run tools/simulate.spec.ts
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { canPlace, findCompletedLines, placePiece } from '../src/engine/board';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { applyMove, newGame, type GameState } from '../src/engine/game';
import { pieceDef } from '../src/engine/pieces';

/** Greedy: prefer moves that clear the most lines, then keep the board compact (low row, left). */
function bestMove(s: GameState) {
  let best: { slot: number; r: number; c: number; v: number } | null = null;
  s.tray.forEach((p, slot) => {
    if (!p) return;
    const d = pieceDef(p.defId);
    for (let r = 0; r <= 8 - d.rows; r++) for (let c = 0; c <= 8 - d.cols; c++) {
      if (!canPlace(s.board, d, r, c)) continue;
      const { board } = placePiece(s.board, p, r, c);
      const { rows, cols } = findCompletedLines(board);
      let pulseBonus = 0;
      for (const k of [...rows.flatMap((rr) => [...Array(8)].map((_, i) => rr * 8 + i)), ...cols.flatMap((cc) => [...Array(8)].map((_, i) => i * 8 + cc))]) if (board.cells[k]?.pulse) pulseBonus += 1;
      const v = (rows.length + cols.length) * 100 + pulseBonus * 30 + r * 2 - Math.abs(c - 3.5) + d.cells.length;
      if (!best || v > best.v) best = { slot, r, c, v };
    }
  });
  return best as { slot: number; r: number; c: number; v: number } | null;
}

describe.runIf(process.env.SIM)('balancing simulation', () => {
  it('plays 300 games', () => {
    const N = 300;
    const scores: number[] = [], moves: number[] = [], chains: number[] = [], pulses: number[] = [];
    const chainHist = new Map<number, number>();
    for (let seed = 1; seed <= N; seed++) {
      let s = newGame(seed, DEFAULT_CONFIG);
      while (!s.over && s.stats.moves < 2000) {
        const m = bestMove(s);
        if (!m) break;
        const o = applyMove(s, m.slot, m.r, m.c);
        if (!o.ok) break;
        if (o.result.chain) chainHist.set(o.result.chain, (chainHist.get(o.result.chain) ?? 0) + 1);
        s = o.state;
      }
      scores.push(s.score); moves.push(s.stats.moves); chains.push(s.stats.maxChain); pulses.push(s.stats.pulsesActivated);
    }
    const sorted = [...scores].sort((a, b) => a - b);
    const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
    writeFileSync(process.env.SIM_OUT ?? 'sim-results.json', JSON.stringify({
      games: N, avgScore: avg(scores), medianScore: sorted[N >> 1], p10: sorted[Math.floor(N * 0.1)], p90: sorted[Math.floor(N * 0.9)],
      avgMoves: avg(moves), avgPulsesActivated: avg(pulses), gamesWithChain2plus: chains.filter((c) => c >= 2).length,
      chainEvents: Object.fromEntries([...chainHist].sort((a, b) => a[0] - b[0])),
    }, null, 1));
  });
});
