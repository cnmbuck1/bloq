// Draws the board, the tray, the dragged piece, previews and effects onto one canvas.
// Reads game state; never changes it.

import { canPlace, previewLines, type Board, type PieceInstance } from '../engine/board';
import type { GameState } from '../engine/game';
import { fitsAnywhere } from '../engine/board';
import { pieceDef, type PieceDef } from '../engine/pieces';
import type { PlacementTarget } from '../game/session';
import { Animator } from './animator';
import { drawBlock, drawEmptyCell, roundRect, setRenderScale } from './blocks';
import { THEME, rgba } from './theme';

export interface Layout {
  W: number; H: number;
  bx: number; by: number; boardPx: number; pad: number;
  pitch: number; cell: number; gap: number;
  trayTop: number; trayH: number; slotW: number; trayCell: number;
}

export interface DragState {
  slot: number;
  piece: PieceInstance;
  def: PieceDef;
  pointerId: number;
  x: number; y: number;
  lift: number;
  start: number;
  /** Where the piece would land on release (null = off the board / no fit nearby). */
  target: { row: number; col: number } | null;
  overBoard: boolean;
  /** Cell under the piece's rounded position (for the invalid indicator). */
  raw: { row: number; col: number };
  lines: { rows: number[]; cols: number[] };
}

export interface ReturnAnim { slot: number; piece: PieceInstance; fromX: number; fromY: number; fromScale: number; start: number }

const RETURN_MS = 180;

export class GameView {
  readonly g: CanvasRenderingContext2D;
  layout!: Layout;
  animator = new Animator();
  drag: DragState | null = null;
  returning: ReturnAnim | null = null;
  tutorialTarget: PlacementTarget | null = null;
  reduced = false;
  /** Dims the board under the results transition. */
  fade = 0;
  private dpr = 1;

  constructor(readonly canvas: HTMLCanvasElement, private getState: () => GameState) {
    this.g = canvas.getContext('2d', { alpha: false })!;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(1, rect.width), H = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    setRenderScale(this.dpr);

    const side = 16;
    const maxBoard = Math.min(W - side * 2, 560);
    // Board takes ~70% of the height; tray + finger room the rest.
    const boardPx = Math.max(160, Math.min(maxBoard, (H - 20) / 1.45));
    const pad = Math.max(5, boardPx * 0.018);
    const pitch = (boardPx - pad * 2) / 8;
    const gap = Math.max(2, pitch * 0.075);
    const free = H - boardPx - boardPx * 0.4;
    const by = Math.max(6, free * 0.3);
    const bx = (W - boardPx) / 2;
    const trayTop = by + boardPx + Math.max(10, boardPx * 0.04);
    const trayH = Math.max(80, H - trayTop - 6);
    const slotW = Math.min(boardPx, W - side * 2) / 3;
    const trayCell = Math.min(pitch * 0.56, slotW / 5.3, (trayH * 0.8) / 5.3);
    this.layout = { W, H, bx, by, boardPx, pad, pitch, cell: pitch - gap, gap, trayTop, trayH, slotW, trayCell };
  }

  cellXY(r: number, c: number) {
    const L = this.layout;
    return { x: L.bx + L.pad + c * L.pitch + L.gap / 2, y: L.by + L.pad + r * L.pitch + L.gap / 2 };
  }

  slotCenter(slot: number) {
    const L = this.layout;
    const left = (L.W - L.slotW * 3) / 2;
    return { x: left + L.slotW * (slot + 0.5), y: L.trayTop + Math.min(L.trayH * 0.42, L.trayCell * 3.4) };
  }

  /** Which tray slot a point is in (generous: the whole column below the board). */
  slotAt(x: number, y: number): number {
    const L = this.layout;
    if (y < L.trayTop - L.pitch * 0.3) return -1;
    const left = (L.W - L.slotW * 3) / 2;
    const s = Math.floor((x - left) / L.slotW);
    return s >= 0 && s < 3 ? s : -1;
  }

  /** Board cell under a canvas point, or null. */
  cellAt(x: number, y: number) {
    const L = this.layout;
    const c = Math.floor((x - L.bx - L.pad) / L.pitch), r = Math.floor((y - L.by - L.pad) / L.pitch);
    return r >= 0 && c >= 0 && r < 8 && c < 8 ? { r, c } : null;
  }

  /** Recomputes the drop target for the current drag position. */
  updateDragTarget(board: Board) {
    const d = this.drag;
    if (!d) return;
    const L = this.layout;
    const s = this.dragScale(performance.now());
    const w = d.def.cols * L.pitch, h = d.def.rows * L.pitch;
    const cx = d.x, cy = d.y - d.lift * s;
    const fx = (cx - w / 2 - L.bx - L.pad) / L.pitch, fy = (cy - h / 2 - L.by - L.pad) / L.pitch;
    const rr = Math.round(fy), rc = Math.round(fx);
    d.raw = { row: rr, col: rc };
    d.overBoard = cx > L.bx - L.pitch && cx < L.bx + L.boardPx + L.pitch && cy > L.by - L.pitch && cy < L.by + L.boardPx + L.pitch * 0.6;
    d.target = null;
    d.lines = { rows: [], cols: [] };
    if (!d.overBoard) return;
    // Nearest legal position among the surrounding grid positions, within ~3/4 of a cell.
    const cands: [number, number, number][] = [];
    for (const r of [Math.floor(fy), Math.ceil(fy)]) for (const c of [Math.floor(fx), Math.ceil(fx)]) {
      cands.push([r, c, Math.hypot(r - fy, c - fx)]);
    }
    cands.sort((a, b) => a[2] - b[2]);
    for (const [r, c, dist] of cands) {
      if (dist > 0.75) break;
      if (canPlace(board, d.def, r, c)) {
        d.target = { row: r, col: c };
        d.lines = previewLines(board, d.def, r, c);
        return;
      }
    }
  }

  dragScale(now: number) {
    if (!this.drag) return 1;
    const t = Math.min(1, (now - this.drag.start) / 90);
    return 1 - (1 - t) * (1 - t);
  }

  get needsFrames() {
    const s = this.getState();
    const pulses = s.board.cells.some((c) => c?.pulse) || s.tray.some((p) => p && p.pulseIndex >= 0);
    return this.animator.active || !!this.drag || !!this.returning || (pulses && !this.reduced) || !!this.tutorialTarget;
  }

  render(now: number) {
    const g = this.g, L = this.layout, state = this.getState(), A = this.animator;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = THEME.bg;
    g.fillRect(0, 0, L.W, L.H);

    g.save();
    if (A.shake && !this.reduced) {
      const p = (now - A.shake.start) / A.shake.dur;
      const amp = A.shake.amp * (1 - p);
      g.translate(Math.sin(now * 0.09) * amp, Math.cos(now * 0.11) * amp * 0.6);
    }

    // Board panel and empty cells.
    g.fillStyle = THEME.boardPanel;
    roundRect(g, L.bx, L.by, L.boardPx, L.boardPx, L.pitch * 0.28); g.fill();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const { x, y } = this.cellXY(r, c);
      drawEmptyCell(g, x, y, L.cell);
    }

    const board = A.display ?? state.board;
    const d = this.drag;

    // Lines that the drag would complete: a soft wash so the player sees the payoff.
    const willClear = new Set<number>();
    if (d?.target) {
      for (const r of d.lines.rows) for (let c = 0; c < 8; c++) willClear.add(r * 8 + c);
      for (const c of d.lines.cols) for (let r = 0; r < 8; r++) willClear.add(r * 8 + c);
    }

    // Tutorial target glow.
    if (this.tutorialTarget && !A.busy) {
      const tp = state.tray[this.tutorialTarget.slot];
      if (tp) {
        const def = pieceDef(tp.defId);
        const a = 0.25 + 0.2 * (this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.005));
        for (const [dr, dc] of def.cells) {
          const { x, y } = this.cellXY(this.tutorialTarget.row + dr, this.tutorialTarget.col + dc);
          g.fillStyle = `rgba(34,228,255,${a})`;
          roundRect(g, x, y, L.cell, L.cell, L.cell * 0.17); g.fill();
          g.strokeStyle = 'rgba(180,245,255,0.9)'; g.lineWidth = 2;
          roundRect(g, x + 1, y + 1, L.cell - 2, L.cell - 2, L.cell * 0.17); g.stroke();
        }
      }
    }

    // Placed blocks.
    for (let k = 0; k < 64; k++) {
      const cell = board.cells[k];
      if (!cell || A.hidden.has(k)) continue;
      const { x, y } = this.cellXY(Math.floor(k / 8), k % 8);
      let scale = 1;
      const pop = A.pops.get(k);
      if (pop !== undefined && !this.reduced) {
        const t = Math.min(1, (now - pop) / 160);
        scale = 1 + 0.12 * Math.sin(t * Math.PI);
      }
      drawBlock(g, x, y, L.cell, cell.color, cell.pulse, scale, 1, now, this.reduced);
      if (willClear.has(k)) {
        g.fillStyle = 'rgba(255,255,255,0.28)';
        roundRect(g, x, y, L.cell, L.cell, L.cell * 0.17); g.fill();
      }
    }

    // Drag preview: ghost at the landing spot, or a red outline where it can't go.
    if (d) {
      if (d.target) {
        for (const k of willClear) {
          if (board.cells[k]) continue;
          const { x, y } = this.cellXY(Math.floor(k / 8), k % 8);
          g.fillStyle = 'rgba(255,255,255,0.12)';
          roundRect(g, x, y, L.cell, L.cell, L.cell * 0.17); g.fill();
        }
        d.def.cells.forEach(([dr, dc], i) => {
          const { x, y } = this.cellXY(d.target!.row + dr, d.target!.col + dc);
          drawBlock(g, x, y, L.cell, d.piece.color, d.piece.pulseIndex === i, 1, 0.42, now, true);
          g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2;
          roundRect(g, x + 1, y + 1, L.cell - 2, L.cell - 2, L.cell * 0.17); g.stroke();
        });
      } else if (d.overBoard) {
        g.strokeStyle = THEME.invalid; g.lineWidth = 2.5;
        g.setLineDash([5, 4]);
        for (const [dr, dc] of d.def.cells) {
          const r = d.raw.row + dr, c = d.raw.col + dc;
          if (r < 0 || c < 0 || r > 7 || c > 7) continue;
          const { x, y } = this.cellXY(r, c);
          roundRect(g, x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.17); g.stroke();
        }
        g.setLineDash([]);
      }
    }

    this.drawEffects(now);
    g.restore();

    if (this.fade > 0) {
      g.fillStyle = rgba(THEME.bg, this.fade * 0.6);
      g.fillRect(0, 0, L.W, L.H);
    }

    this.drawTray(now, state);
    this.drawDragged(now);
  }

  private drawEffects(now: number) {
    const g = this.g, L = this.layout, A = this.animator;

    // 1. completed-line highlight
    if (A.glowCells && now >= A.glowCells.start) {
      const p = (now - A.glowCells.start) / A.glowCells.dur;
      const a = Math.sin(Math.min(1, p) * Math.PI) * 0.75;
      for (const k of A.glowCells.cells) {
        if (A.hidden.has(k)) continue;
        const { x, y } = this.cellXY(Math.floor(k / 8), k % 8);
        g.fillStyle = `rgba(255,255,255,${a * 0.55})`;
        roundRect(g, x, y, L.cell, L.cell, L.cell * 0.17); g.fill();
      }
    }

    // 2. energy sweep: a bright band travelling out from the placement along each line
    for (const s of A.sweeps) {
      if (now < s.start) continue;
      const p = (now - s.start) / s.dur;
      const reach = p * 9;
      const fade = 1 - p;
      for (let i = 0; i < 8; i++) {
        const dist = Math.abs(i - s.origin);
        const near = 1 - Math.min(1, Math.abs(dist - reach * 0.55) / 1.6);
        if (near <= 0) continue;
        const r = s.kind === 'row' ? s.i : i, c = s.kind === 'row' ? i : s.i;
        const { x, y } = this.cellXY(r, c);
        g.fillStyle = `rgba(200,250,255,${near * fade * 0.8})`;
        roundRect(g, x - 1, y - 1, L.cell + 2, L.cell + 2, L.cell * 0.2); g.fill();
      }
    }

    // 3. blocks leaving the board
    for (const dy of A.dying) {
      if (now < dy.start) {
        const { x, y } = this.cellXY(Math.floor(dy.k / 8), dy.k % 8);
        drawBlock(g, x, y, L.cell, dy.cell.color, dy.cell.pulse, 1, 1, now, this.reduced);
        continue;
      }
      const p = (now - dy.start) / dy.dur;
      const { x, y } = this.cellXY(Math.floor(dy.k / 8), dy.k % 8);
      drawBlock(g, x, y, L.cell, dy.cell.color, dy.cell.pulse, this.reduced ? 1 : 1 - p * 0.6, 1 - p, now, this.reduced);
      if (p < 0.5) {
        g.fillStyle = `rgba(255,255,255,${(0.5 - p) * 1.1})`;
        roundRect(g, x, y, L.cell, L.cell, L.cell * 0.17); g.fill();
      }
    }

    // 4. pulse shockwaves
    for (const s of A.shocks) {
      if (now < s.start) continue;
      const p = (now - s.start) / s.dur;
      const { x, y } = this.cellXY(s.r, s.c);
      const cx = x + L.cell / 2, cy = y + L.cell / 2;
      const rad = this.reduced ? L.pitch * 1.5 : L.pitch * (0.4 + 1.4 * (1 - Math.pow(1 - p, 3)));
      g.strokeStyle = `rgba(34,228,255,${(1 - p) * 0.9})`;
      g.lineWidth = L.pitch * 0.16 * (1 - p) + 1;
      g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = `rgba(255,255,255,${(1 - p) * 0.7})`;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(cx, cy, rad * 0.8, 0, Math.PI * 2); g.stroke();
      // the 3x3 blast area
      const a = (1 - p) * 0.22;
      g.fillStyle = `rgba(34,228,255,${a})`;
      const { x: ax, y: ay } = this.cellXY(Math.max(0, s.r - 1), Math.max(0, s.c - 1));
      const { x: bx2, y: by2 } = this.cellXY(Math.min(7, s.r + 1), Math.min(7, s.c + 1));
      roundRect(g, ax, ay, bx2 + L.cell - ax, by2 + L.cell - ay, L.cell * 0.25); g.fill();
    }

    // 5. particles (board-cell units)
    for (const p of A.particles) {
      if (now < p.born) continue;
      const life = (now - p.born) / p.life;
      const px = L.bx + L.pad + p.x * L.pitch, py = L.by + L.pad + p.y * L.pitch;
      g.globalAlpha = Math.max(0, 1 - life);
      g.fillStyle = p.color;
      const s = p.size * L.pitch * (1 - life * 0.5);
      roundRect(g, px - s / 2, py - s / 2, s, s, s * 0.25); g.fill();
    }
    g.globalAlpha = 1;

    // 6. floating score
    for (const f of A.floats) {
      if (now < f.start) continue;
      const p = (now - f.start) / f.dur;
      const px = L.bx + L.pad + (f.c + 0.5) * L.pitch, py = L.by + L.pad + (f.r + 0.5) * L.pitch - p * L.pitch * 1.2;
      g.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      g.font = `800 ${Math.round(L.pitch * 0.55)}px -apple-system, "SF Pro Rounded", "Helvetica Neue", Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 4; g.strokeStyle = 'rgba(10,14,26,0.75)';
      g.strokeText(f.text, px, py);
      g.fillStyle = '#FFFFFF'; g.fillText(f.text, px, py);
      g.globalAlpha = 1;
    }
  }

  private drawPiece(piece: PieceInstance, cx: number, cy: number, cell: number, gapRatio: number, alpha: number, now: number) {
    const def = pieceDef(piece.defId);
    const pitch = cell / (1 - gapRatio);
    const w = def.cols * pitch, h = def.rows * pitch;
    def.cells.forEach(([dr, dc], i) => {
      const x = cx - w / 2 + dc * pitch + (pitch - cell) / 2, y = cy - h / 2 + dr * pitch + (pitch - cell) / 2;
      drawBlock(this.g, x, y, cell, piece.color, piece.pulseIndex === i, 1, alpha, now, this.reduced);
    });
  }

  private drawTray(now: number, state: GameState) {
    const L = this.layout;
    const gapRatio = L.gap / L.pitch;
    for (let i = 0; i < 3; i++) {
      const p = state.tray[i];
      if (!p) continue;
      // Tutorial: only the step's own piece is ever shown.
      if (state.mode === 'tutorial' && this.tutorialTarget?.slot !== i) continue;
      if (this.drag?.slot === i) continue;
      if (this.returning?.slot === i) continue;
      const { x, y } = this.slotCenter(i);
      const fits = fitsAnywhere(state.board, pieceDef(p.defId));
      this.drawPiece(p, x, y, L.trayCell * (1 - gapRatio), gapRatio, fits || this.animator.busy ? 1 : 0.32, now);
    }
  }

  private drawDragged(now: number) {
    const L = this.layout;
    const gapRatio = L.gap / L.pitch;
    const d = this.drag;
    if (d) {
      const s = this.dragScale(now);
      const cell = (L.trayCell + (L.pitch - L.trayCell) * s) * (1 - gapRatio);
      this.g.save();
      this.g.shadowColor = 'rgba(0,0,0,0.45)'; this.g.shadowBlur = 18; this.g.shadowOffsetY = 8;
      this.drawPiece(d.piece, d.x, d.y - d.lift * s, cell, gapRatio, 1, now);
      this.g.restore();
    }
    const r = this.returning;
    if (r) {
      const t = Math.min(1, (now - r.start) / RETURN_MS);
      const e = 1 - Math.pow(1 - t, 3);
      const to = this.slotCenter(r.slot);
      const scale = r.fromScale + (L.trayCell - r.fromScale) * e;
      this.drawPiece(r.piece, r.fromX + (to.x - r.fromX) * e, r.fromY + (to.y - r.fromY) * e, scale * (1 - gapRatio), gapRatio, 1, now);
      if (t >= 1) this.returning = null;
    }
  }
}
