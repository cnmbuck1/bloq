// Input controller: turns pointer events on the game canvas into piece drags and drops.
// Touch lifts the piece above the finger so the landing spot stays visible; a mouse keeps it near the cursor.

import { pieceDef } from '../engine/pieces';
import type { GameState } from '../engine/game';
import type { GameView } from '../render/gameView';

export interface InputHandlers {
  canPick(): boolean;
  onPick(slot: number): void;
  /** Returns true if the placement was accepted. */
  onDrop(slot: number, row: number, col: number): boolean;
  onInvalidDrop(slot: number, overBoard: boolean): void;
  /** Dev board editor: a tap on a cell. */
  onCellTap?(r: number, c: number): void;
  editMode?(): boolean;
  wake(): void;
}

export class InputController {
  constructor(private canvas: HTMLCanvasElement, private view: GameView, private getState: () => GameState, private h: InputHandlers) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('lostpointercapture', this.cancel);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pos(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down = (e: PointerEvent) => {
    if (this.view.drag) return; // one finger at a time
    const { x, y } = this.pos(e);
    if (this.h.editMode?.()) {
      const cell = this.view.cellAt(x, y);
      if (cell) this.h.onCellTap?.(cell.r, cell.c);
      this.h.wake();
      return;
    }
    if (!this.h.canPick()) return;
    const slot = this.view.slotAt(x, y);
    if (slot < 0) return;
    const piece = this.getState().tray[slot];
    if (!piece) return;
    e.preventDefault();
    const def = pieceDef(piece.defId);
    const L = this.view.layout;
    const touch = e.pointerType !== 'mouse';
    const lift = touch ? (def.rows * L.pitch) / 2 + L.pitch * 1.1 : (def.rows * L.pitch) * 0.15;
    this.view.returning = null;
    this.view.drag = {
      slot, piece, def, pointerId: e.pointerId, x, y, lift, start: performance.now(),
      target: null, overBoard: false, raw: { row: -9, col: -9 }, lines: { rows: [], cols: [] },
    };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    this.view.updateDragTarget(this.getState().board);
    this.h.onPick(slot);
    this.h.wake();
  };

  private move = (e: PointerEvent) => {
    const d = this.view.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const { x, y } = this.pos(e);
    d.x = x; d.y = y;
    this.view.updateDragTarget(this.getState().board);
    this.h.wake();
  };

  private up = (e: PointerEvent) => {
    const d = this.view.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const { x, y } = this.pos(e);
    d.x = x; d.y = y;
    this.view.updateDragTarget(this.getState().board);
    this.release(true);
  };

  private cancel = (e: Event) => {
    const d = this.view.drag;
    if (!d) return;
    if (e instanceof PointerEvent && e.pointerId !== d.pointerId) return;
    this.release(false);
  };

  private release(allowDrop: boolean) {
    const d = this.view.drag;
    if (!d) return;
    this.view.drag = null;
    if (allowDrop && d.target && this.h.onDrop(d.slot, d.target.row, d.target.col)) { this.h.wake(); return; }
    const L = this.view.layout;
    const s = this.view.dragScale(performance.now());
    this.view.returning = {
      slot: d.slot, piece: d.piece, fromX: d.x, fromY: d.y - d.lift * s,
      fromScale: L.trayCell + (L.pitch - L.trayCell) * s, start: performance.now(),
    };
    this.h.onInvalidDrop(d.slot, allowDrop && d.overBoard);
    this.h.wake();
  }
}
