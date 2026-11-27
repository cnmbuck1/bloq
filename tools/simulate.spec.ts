// Balancing simulation: a greedy bot plays seeded Classic games through the real engine.
// Build 4 compares one variable at a time against the default configuration (spec section 38).
// Skipped in normal test runs. Run with:  SIM=1 npx vitest run tools/simulate.spec.ts   (SIM_GAMES=300 by default)
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { DEFAULT_CONFIG, type GameConfig } from '../src/engine/config';
import { newGame } from '../src/engine/game';
import { addDays, dailyChallenge, dailyGame } from '../src/engine/daily';
import { playGreedy } from '../src/engine/sim';

const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0);
const pct = (n: number, d: number) => `${Math.round((n / Math.max(1, d)) * 1000) / 10}%`;

function run(name: string, cfg: GameConfig, N: number) {
  const scores: number[] = [], moves: number[] = [], levels: number[] = [], ods: number[] = [], firstOd: number[] = [];
  const lvl2: number[] = [], perfects: number[] = [], protectedMoves: number[] = [], rotations: number[] = [];
  for (let seed = 1; seed <= N; seed++) {
    const r = playGreedy(newGame(seed, cfg), cfg, { overdrive: 'eager' });
    const s = r.state;
    scores.push(s.score); moves.push(r.placements); levels.push(s.level); ods.push(r.overdrives);
    if (r.firstOverdriveMove >= 0) firstOd.push(r.firstOverdriveMove);
    const l2 = r.results.findIndex((x) => x.levelAfter >= 2);
    if (l2 >= 0) lvl2.push(l2 + 1);
    perfects.push(s.stats.perfectClears); protectedMoves.push(s.stats.comboProtected); rotations.push(s.stats.rotations);
  }
  const sorted = [...scores].sort((a, b) => a - b);
  const reach = (L: number) => pct(levels.filter((l) => l >= L).length, N);
  return {
    name, games: N, avgScore: avg(scores), medianScore: sorted[N >> 1], p10: sorted[Math.floor(N * 0.1)], p90: sorted[Math.floor(N * 0.9)],
    avgPlacements: avg(moves), medianPlacements: [...moves].sort((a, b) => a - b)[N >> 1],
    avgLevel: avg(levels), reach: { L2: reach(2), L3: reach(3), L5: reach(5), L7: reach(7), L10: reach(10) },
    placementsToLevel2: avg(lvl2),
    gamesWithOverdrive: pct(ods.filter((o) => o > 0).length, N), overdrivesPerGame: avg(ods), placementsToFirstOverdrive: avg(firstOd),
    perfectClearsPerGame: avg(perfects), protectedMovesPerGame: avg(protectedMoves), rotationsPerGame: avg(rotations),
  };
}

const V = (patch: (c: GameConfig) => void): GameConfig => { const c = structuredClone(DEFAULT_CONFIG); patch(c); return c; };

describe.runIf(process.env.SIM)('balancing simulation', () => {
  it('compares one variable at a time', () => {
    const N = Number(process.env.SIM_GAMES ?? 300);
    const variants: [string, GameConfig][] = [
      ['default (OD 5 moves ×2 free turns, protection 1, level-up full, Pulse 12%)', DEFAULT_CONFIG],
      ['no Overdrive', V((c) => { c.overdrive.enabled = false; })],
      ['combo protection off', V((c) => { c.combo.protection = 0; })],
      ['combo protection 2', V((c) => { c.combo.protection = 2; })],
      ['Overdrive 3 moves', V((c) => { c.overdrive.duration = 3; })],
      ['Overdrive 7 moves', V((c) => { c.overdrive.duration = 7; })],
      ['Overdrive ×1.5', V((c) => { c.overdrive.multiplier = 1.5; })],
      ['Overdrive ×2.5', V((c) => { c.overdrive.multiplier = 2.5; })],
      ['Overdrive no rotation benefit', V((c) => { c.overdrive.rotation = 'none'; })],
      ['level-up energy one', V((c) => { c.progression.levelUpEnergy = 'one'; })],
      ['level-up energy none', V((c) => { c.progression.levelUpEnergy = 'none'; })],
      ['Pulse 15%', V((c) => { c.generation.pulseChance = 0.15; })],
    ];
    const classic = variants.map(([n, c]) => run(n, c, N));
    // Daily: 60 consecutive challenges, greedy bot.
    const daily = [...Array(60)].map((_, i) => {
      const ch = dailyChallenge(addDays('2026-11-27', i));
      const r = playGreedy(dailyGame(ch), DEFAULT_CONFIG, { maxMoves: ch.placementLimit });
      return { id: ch.id, score: r.state.score, placements: r.placements, overdrives: r.overdrives };
    });
    const dailySummary = {
      challenges: daily.length, avgScore: avg(daily.map((d) => d.score)), minScore: Math.min(...daily.map((d) => d.score)),
      maxScore: Math.max(...daily.map((d) => d.score)), finishedAll30: daily.filter((d) => d.placements >= 30).length,
      avgPlacements: avg(daily.map((d) => d.placements)), avgOverdrives: avg(daily.map((d) => d.overdrives)),
    };
    writeFileSync(process.env.SIM_OUT ?? 'sim-results.json', JSON.stringify({ classic, daily: dailySummary }, null, 1));
  }, 1_800_000);
});
