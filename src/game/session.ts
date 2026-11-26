// A running game: wraps the pure engine with the input lock that keeps the player from placing
// another piece while a clearing sequence is still playing. No rendering in here.

import { DEFAULT_CONFIG, type GameConfig } from '../engine/config';
import { applyMove, type GameState, type MoveResult } from '../engine/game';

export interface PlacementTarget { slot: number; row: number; col: number }

export type PlaceRejection = 'locked' | 'over' | 'empty-slot' | 'blocked' | 'not-target';

export class GameSession {
  state: GameState;
  /** True from a successful placement until the UI says the resolution sequence finished. */
  locked = false;
  /** Tutorial only: the one placement the step accepts. */
  requiredTarget: PlacementTarget | null = null;
  lastRejection: PlaceRejection | null = null;

  constructor(state: GameState, readonly cfg: GameConfig = DEFAULT_CONFIG) {
    this.state = state;
  }

  /** Attempts a placement. Returns the resolution to animate, or null if rejected (no penalty, combo untouched). */
  tryPlace(slot: number, row: number, col: number): MoveResult | null {
    if (this.locked) return this.reject('locked');
    const t = this.requiredTarget;
    if (t && (t.slot !== slot || t.row !== row || t.col !== col)) return this.reject('not-target');
    const out = applyMove(this.state, slot, row, col, this.cfg);
    if (!out.ok) return this.reject(out.reason);
    this.state = out.state;
    this.locked = true;
    this.lastRejection = null;
    return out.result;
  }

  /** Called by the animation controller when the sequence for the last move has fully played. */
  finishResolution() { this.locked = false; }

  private reject(r: PlaceRejection): null { this.lastRejection = r; return null; }
}
