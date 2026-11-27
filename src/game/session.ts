// A running game: wraps the pure engine with the input lock that keeps the player from placing or
// rotating while a clearing sequence is still playing. No rendering in here.

import { DEFAULT_CONFIG, type GameConfig } from '../engine/config';
import { activateOverdrive, applyMove, rotatePiece, type GameState, type MoveResult, type RotateOutcome } from '../engine/game';

export interface PlacementTarget { slot: number; row: number; col: number; /** Tutorial: required orientation. */ rot?: number }

export type PlaceRejection = 'locked' | 'over' | 'empty-slot' | 'blocked' | 'not-target';
export type RotateRejection = 'locked' | 'over' | 'empty-slot' | 'disabled' | 'no-energy';
export type OverdriveRejection = 'locked' | 'over' | 'disabled' | 'active' | 'not-charged';

export class GameSession {
  state: GameState;
  /** True from a successful placement until the UI says the resolution sequence finished. */
  locked = false;
  /** Tutorial only: the one placement the step accepts. */
  requiredTarget: PlacementTarget | null = null;
  /** Tutorial only: whether the step lets the player rotate. */
  rotationAllowed = true;
  lastRejection: PlaceRejection | RotateRejection | OverdriveRejection | null = null;

  constructor(state: GameState, readonly cfg: GameConfig = DEFAULT_CONFIG) {
    this.state = state;
  }

  /** Attempts a placement. Returns the resolution to animate, or null if rejected (no penalty, combo and energy untouched). */
  tryPlace(slot: number, row: number, col: number): MoveResult | null {
    if (this.locked) return this.reject('locked');
    const t = this.requiredTarget;
    if (t && (t.slot !== slot || t.row !== row || t.col !== col || (t.rot !== undefined && (this.state.tray[slot]?.rot ?? 0) !== t.rot))) return this.reject('not-target');
    const out = applyMove(this.state, slot, row, col, this.cfg);
    if (!out.ok) return this.reject(out.reason);
    this.state = out.state;
    this.locked = true;
    this.lastRejection = null;
    return out.result;
  }

  /** Attempts a clockwise rotation of a tray piece. Rejected while a sequence resolves. */
  tryRotate(slot: number): Extract<RotateOutcome, { ok: true }> | null {
    if (this.locked) return this.reject('locked');
    if (!this.rotationAllowed) return this.reject('disabled');
    const out = rotatePiece(this.state, slot, this.cfg);
    if (!out.ok) return this.reject(out.reason);
    this.state = out.state;
    this.lastRejection = null;
    return out;
  }

  /** Build 4: activates a fully charged Overdrive. Not a placement; refused while a sequence resolves. */
  tryActivateOverdrive(): GameState | null {
    if (this.locked) return this.reject('locked');
    const out = activateOverdrive(this.state, this.cfg);
    if (!out.ok) return this.reject(out.reason);
    this.state = out.state;
    this.lastRejection = null;
    return out.state;
  }

  /** Called by the animation controller when the sequence for the last move has fully played. */
  finishResolution() { this.locked = false; }

  private reject(r: PlaceRejection | RotateRejection | OverdriveRejection): null { this.lastRejection = r; return null; }
}
