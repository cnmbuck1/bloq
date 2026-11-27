// Fair piece generation.
// - Weighted random selection. Build 3: the mix of small (1–2 cells), medium (3–4) and large (5+) pieces follows
//   the player's level (config.difficulty), capped at a maximum level. Visible, documented, not hidden.
// - Repetition control: pieces seen recently or already in this tray are less likely.
// - Guarantee: if any library piece fits the board, at least one tray piece fits.
//   Nothing guarantees all three stay playable after the player's own choices.
// - Uses only the seeded Rng, so a seed + game state reproduces the same tray.

import type { GameConfig } from './config';
import type { Board, PieceInstance } from './board';
import { playability } from './rotation';
import { bandFor, sizeClass } from './progression';
import { PIECES, type PieceDef } from './pieces';
import type { Rng } from './rng';

export interface GenerateContext {
  score: number;
  /** Current level (Build 3 difficulty). Defaults to 1. */
  level?: number;
  /** Recently generated piece ids, oldest first. */
  recent: string[];
  /** Override for pulse chance (the tutorial uses 0; tests use 0 or 1). */
  pulseChance?: number;
  /** Rotation energy the player will have when this tray appears (for the playability guarantee). */
  energy?: number;
}

function weightsFor(cfg: GameConfig, pool: readonly PieceDef[], ctx: GenerateContext, inTray: string[]): number[] {
  const band = bandFor(cfg, ctx.level ?? 1);
  const g = cfg.generation;
  const nudge = cfg.difficulty.categoryWeights;
  // Each size class gets its band share, spread over its pieces by their base weights.
  const classTotal = { small: 0, medium: 0, large: 0 };
  for (const p of pool) classTotal[sizeClass(p.cells.length)] += p.weight;
  const recent = new Set(ctx.recent.slice(-g.recentWindow));
  return pool.map((p) => {
    const c = sizeClass(p.cells.length);
    let w = (band[c] * p.weight) / Math.max(1e-9, classTotal[c]);
    w *= nudge[p.category] ?? 1;
    if (recent.has(p.id)) w *= g.recentPenalty;
    if (inTray.includes(p.id)) w *= g.sameTrayPenalty;
    return w;
  });
}

// Build 2: standard blocks share one material, so pieces no longer get a random colour.
function instance(rng: Rng, p: PieceDef, pulseChance: number): PieceInstance {
  const pulseIndex = rng.next() < pulseChance ? rng.int(p.cells.length) : -1;
  return { defId: p.id, color: 0, pulseIndex, rot: 0 };
}

export function generateTray(cfg: GameConfig, board: Board, rng: Rng, ctx: GenerateContext, library: readonly PieceDef[] = PIECES): {
  tray: PieceInstance[]; recent: string[];
} {
  const pulseChance = ctx.pulseChance ?? cfg.generation.pulseChance;
  const chosen: PieceDef[] = [];
  for (let i = 0; i < cfg.traySize; i++) {
    const w = weightsFor(cfg, library, ctx, chosen.map((p) => p.id));
    chosen.push(library[Math.max(0, rng.weighted(w))]);
  }

  // Fairness guarantee: if nothing chosen is playable (as dealt, or after rotations the player can
  // afford) but something in the library would be, swap one slot for a playable piece (still weighted).
  // Pieces are always dealt unrotated; the generator never rotates for the player.
  const energy = ctx.energy ?? cfg.rotation.startCharges;
  const playable = (p: PieceDef) => playability(cfg.rotation, board, { defId: p.id, color: 0, pulseIndex: -1, rot: 0 }, energy) !== 'none';
  if (!chosen.some(playable)) {
    const fitting = library.filter(playable);
    if (fitting.length > 0) {
      const slot = rng.int(chosen.length);
      const others = chosen.filter((_, i) => i !== slot).map((p) => p.id);
      const w = weightsFor(cfg, fitting, ctx, others);
      chosen[slot] = fitting[Math.max(0, rng.weighted(w))];
    }
  }

  const tray = chosen.map((p) => instance(rng, p, pulseChance));
  const recent = [...ctx.recent, ...chosen.map((p) => p.id)].slice(-Math.max(cfg.generation.recentWindow, 1));
  return { tray, recent };
}
