// Pulse Block resolution. Pure: takes a board and the cells cleared by lines, returns every wave.
//
// Rules:
// - Pulse Blocks in a cleared line activate (wave 0, all at once).
// - An activated pulse clears the occupied cells among its eight neighbours.
// - A dormant pulse cleared that way activates in the next wave.
// - Each pulse activates at most once; each block is cleared (and scored) at most once.
// - Waves continue until no new pulse activates.

import type { Board } from './board';

export interface PulseWave {
  /** Pulse cells activating in this wave. */
  pulses: number[];
  /** Cells this wave clears that were not already cleared (lines or earlier waves). */
  cleared: number[];
}

export interface PulseResolution {
  waves: PulseWave[];
  /** Total pulses activated across all waves (the chain size). */
  activated: number;
  /** Blocks cleared by pulses that were not part of a cleared line. */
  pulseCleared: number;
  /** All cells to remove: line cells plus pulse-cleared cells. */
  allCleared: number[];
}

export function resolvePulses(board: Board, lineCellIdx: readonly number[]): PulseResolution {
  const n = board.size;
  const cleared = new Set<number>(lineCellIdx);
  const activated = new Set<number>();
  const waves: PulseWave[] = [];

  let frontier = lineCellIdx.filter((k) => board.cells[k]?.pulse);
  while (frontier.length > 0) {
    frontier.forEach((k) => activated.add(k));
    const wave: PulseWave = { pulses: [...frontier].sort((a, z) => a - z), cleared: [] };
    const next: number[] = [];
    for (const k of wave.pulses) {
      const r = Math.floor(k / n), c = k % n;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          const kk = rr * n + cc;
          if (!board.cells[kk] || cleared.has(kk)) continue;
          cleared.add(kk);
          wave.cleared.push(kk);
          if (board.cells[kk]!.pulse && !activated.has(kk)) next.push(kk);
        }
      }
    }
    wave.cleared.sort((a, z) => a - z);
    waves.push(wave);
    frontier = next;
  }

  const pulseCleared = waves.reduce((s, w) => s + w.cleared.length, 0);
  return { waves, activated: activated.size, pulseCleared, allCleared: [...cleared].sort((a, z) => a - z) };
}
