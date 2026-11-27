// Rotation Energy. Pure rules for rotating tray pieces, what a rotation costs, which orientations the
// player can afford, and rotation-aware playability / game over.
//
// - A rotation is a 90° clockwise turn of a tray piece. No mirroring.
// - A turn that leaves the arrangement identical (shape AND Pulse position) is free.
// - Modes: 'none' (no rotation), 'unlimited' (free), 'energy' (default: costs charges).

import { fitsAnywhere, shapeOf, type Board, type PieceInstance } from './board';
import type { RotationConfig } from './config';

/** A string that is equal for two instances exactly when they occupy the same cells with the Pulse in the same place. */
export function arrangementKey(inst: PieceInstance): string {
  const s = shapeOf(inst);
  const cells = s.cells.map(([r, c]) => `${r},${c}`).sort().join(' ');
  const p = inst.pulseIndex >= 0 ? s.cells[inst.pulseIndex] : null;
  return p ? `${cells}|${p[0]},${p[1]}` : cells;
}

export function rotated(inst: PieceInstance): PieceInstance {
  return { ...inst, rot: (((inst.rot ?? 0) + 1) % 4) };
}

/** True when a clockwise turn would produce a visibly identical piece. */
export function rotationIsIdentity(inst: PieceInstance): boolean {
  return arrangementKey(rotated(inst)) === arrangementKey(inst);
}

/** Energy a single clockwise turn of this piece costs under the config. */
export function rotationCost(cfg: RotationConfig, inst: PieceInstance): number {
  if (cfg.mode !== 'energy') return 0;
  return rotationIsIdentity(inst) ? 0 : cfg.cost;
}

export function rotationAllowed(cfg: RotationConfig, inst: PieceInstance, energy: number): boolean {
  if (cfg.mode === 'none') return false;
  return rotationCost(cfg, inst) <= energy;
}

/**
 * Every distinct arrangement the player can reach from `inst` with `energy`, including the current one,
 * with the energy each costs. Never assumes orientations the player can't pay for.
 */
export function reachableOrientations(cfg: RotationConfig, inst: PieceInstance, energy: number): { inst: PieceInstance; spent: number }[] {
  const out: { inst: PieceInstance; spent: number }[] = [{ inst, spent: 0 }];
  if (cfg.mode === 'none') return out;
  const seen = new Set([arrangementKey(inst)]);
  let cur = inst, spent = 0;
  for (let i = 0; i < 3; i++) {
    spent += rotationCost(cfg, cur);
    cur = rotated(cur);
    if (cfg.mode === 'energy' && spent > energy) break;
    const key = arrangementKey(cur);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ inst: cur, spent });
  }
  return out;
}

export type Playability = 'now' | 'after-rotation' | 'none';

/** Can this piece be placed as it is, only after an affordable rotation, or not at all? */
export function playability(cfg: RotationConfig, b: Board, inst: PieceInstance, energy: number): Playability {
  if (fitsAnywhere(b, shapeOf(inst))) return 'now';
  for (const o of reachableOrientations(cfg, inst, energy).slice(1)) if (fitsAnywhere(b, shapeOf(o.inst))) return 'after-rotation';
  return 'none';
}

/** Game over only when no remaining piece fits in its current or any affordable orientation. */
export function isGameOverWithRotation(cfg: RotationConfig, b: Board, tray: (PieceInstance | null)[], energy: number): boolean {
  const remaining = tray.filter((p): p is PieceInstance => !!p);
  if (remaining.length === 0) return false;
  return !remaining.some((p) => playability(cfg, b, p, energy) !== 'none');
}
