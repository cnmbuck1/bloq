// Draws the board, the Rotation Energy meter, the tray slots, the dragged piece, previews and effects
// onto one canvas. Reads game state; never changes it.

import { canPlace, previewLines, shapeOf, type Board, type PieceInstance } from '../engine/board';
import type { RotationConfig } from '../engine/config';
import type { GameState } from '../engine/game';
import type { Shape } from '../engine/pieces';
import { playability, type Playability } from '../engine/rotation';
import type { PlacementTarget } from '../game/session';
import { Animator } from './animator';
import { drawBlock, paintEmptyCell, paintFrame, roundRect, setRenderScale, currentMaterial, visualParams, type MaterialLook } from './blocks';
import { THEME, rgba } from './theme';

export interface Layout {
  W: number; H: number;
  bx: number; by: number; boardPx: number; frame: number; pad: number;
  pitch: number; cell: number; gap: number;
  energyY: number; energyH: number;
  trayTop: number; trayH: number; slotW: number; slotH: number; slotGap: number; trayLeft: number; trayCell: number;
}

export interface DragState {
  slot: number;
  piece: PieceInstance;
  shape: Shape;
  pointerId: number;
  x: number; y: number;
  lift: number;
  start: number;
  target: { row: number; col: number } | null;
  overBoard: boolean;
  raw: { row: number; col: number };
  lines: { rows: number[]; cols: number[] };
  /** Cells an immediate Pulse activation would blast (preview), and the Pulses that would fire. */
  blast: Set<number>;
  firing: Set<number>;
}

export interface ReturnAnim { slot: number; piece: PieceInstance; fromX: number; fromY: number; fromCell: number; start: number }

const RETURN_MS = 170;
const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

/** How far each rotate button (44px, centred 6px below the slot's bottom edge) reaches into its slot, plus a margin. */
const ROTATE_OVERLAP = 18;

export class GameView {
  readonly g: CanvasRenderingContext2D;
  layout!: Layout;
  animator = new Animator();
  drag: DragState | null = null;
  returning: ReturnAnim | null = null;
  tutorialTarget: PlacementTarget | null = null;
  reduced = false;
  rotation!: RotationConfig;
  /** Dims the board under the results transition. */
  fade = 0;
  /** Slot rotation animations: slot -> start time. */
  rotating = new Map<number, number>();
  /** Meter feedback: a segment draining (rotation) or a denied attempt. */
  drain: { seg: number; start: number } | null = null;
  denied = 0;
  private dpr = 1;
  private boardBg: HTMLCanvasElement | null = null;

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

    const side = 12;
    // Board ~61% of the canvas, meter ~7%, tray the rest (Build 3: tray pieces 10–15% larger than Build 2).
    const energyH = Math.max(34, Math.min(48, H * 0.072));
    const minTray = Math.max(112, H * 0.29);
    const boardPx = Math.max(180, Math.min(W - side * 2, 600, H - energyH - minTray - 8, H * 0.625));
    const frame = Math.max(6, boardPx * 0.026);
    const pad = frame + Math.max(3, boardPx * 0.008);
    const pitch = (boardPx - pad * 2) / 8;
    const gap = Math.max(2, pitch * 0.08);
    const bx = (W - boardPx) / 2;
    const by = 4;
    const energyY = by + boardPx + 4;
    const trayTop = energyY + energyH;
    const trayH = Math.max(90, H - trayTop - 4);
    const slotGap = Math.max(8, boardPx * 0.025);
    // The tray may run a little wider than the board (up to the screen gutter) so pieces can grow.
    const trayW = Math.min(W - side * 2, boardPx * 1.14);
    const trayLeft = (W - trayW) / 2;
    const slotW = (trayW - slotGap * 2) / 3;
    const slotH = Math.min(trayH - 28, slotW * 1.2);
    // Miniature cell size based on 3-cell spans (most pieces); longer pieces shrink only as far as they must.
    const trayCell = Math.min(pitch * 0.8, (slotW * 0.92) / 3.2, ((slotH - ROTATE_OVERLAP) * 0.93) / 3);
    this.layout = { W, H, bx, by, boardPx, frame, pad, pitch, cell: pitch - gap, gap, energyY, energyH, trayTop, trayH, slotW, slotH, slotGap, trayLeft, trayCell };
    this.boardBg = null;
  }

  cellXY(r: number, c: number) {
    const L = this.layout;
    return { x: L.bx + L.pad + c * L.pitch + L.gap / 2, y: L.by + L.pad + r * L.pitch + L.gap / 2 };
  }

  slotRect(slot: number) {
    const L = this.layout;
    const x = L.trayLeft + slot * (L.slotW + L.slotGap);
    return { x, y: L.trayTop + 2, w: L.slotW, h: L.slotH };
  }

  slotCenter(slot: number) {
    const r = this.slotRect(slot);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  /** Where a tray piece is centred: the part of the slot above its rotate button. */
  pieceCenter(slot: number) {
    const r = this.slotRect(slot);
    return { x: r.x + r.w / 2, y: r.y + (r.h - ROTATE_OVERLAP) / 2 + 2 };
  }

  /** Mini cell size for a piece in the tray (same for every piece unless a 5-long piece needs less). */
  trayCellFor(shape: Shape) {
    const L = this.layout;
    return Math.min(L.trayCell, (L.slotW * 0.9) / shape.cols, ((L.slotH - ROTATE_OVERLAP) * 0.9) / shape.rows);
  }

  /** Where each rotate button sits (canvas coords): centred on the bottom edge of its slot. */
  rotateButtonCenter(slot: number) {
    const r = this.slotRect(slot);
    return { x: r.x + r.w / 2, y: r.y + r.h + 6 };
  }

  /** Centre of energy meter segment i (canvas coords). */
  segmentCenter(i: number, max: number) {
    const L = this.layout;
    const segW = Math.min(44, L.boardPx * 0.11), segGap = 8;
    const labelW = Math.min(150, L.boardPx * 0.4);
    const total = labelW + max * segW + (max - 1) * segGap;
    const x0 = L.W / 2 - total / 2 + labelW;
    return { x: x0 + i * (segW + segGap) + segW / 2, y: L.energyY + L.energyH / 2, w: segW, h: Math.min(14, L.energyH * 0.34), labelX: L.W / 2 - total / 2 };
  }

  /** Which tray slot a point is in (generous: the whole column below the meter). */
  slotAt(x: number, y: number): number {
    const L = this.layout;
    if (y < L.trayTop - 4) return -1;
    for (let i = 0; i < 3; i++) {
      const r = this.slotRect(i);
      if (x >= r.x - L.slotGap / 2 && x <= r.x + r.w + L.slotGap / 2) return i;
    }
    return -1;
  }

  cellAt(x: number, y: number) {
    const L = this.layout;
    const c = Math.floor((x - L.bx - L.pad) / L.pitch), r = Math.floor((y - L.by - L.pad) / L.pitch);
    return r >= 0 && c >= 0 && r < 8 && c < 8 ? { r, c } : null;
  }

  /** Recomputes the drop target (and previews) for the current drag position. */
  updateDragTarget(board: Board) {
    const d = this.drag;
    if (!d) return;
    const L = this.layout;
    const s = this.dragScale(performance.now());
    const w = d.shape.cols * L.pitch, h = d.shape.rows * L.pitch;
    const cx = d.x, cy = d.y - d.lift * s;
    const fx = (cx - w / 2 - L.bx - L.pad) / L.pitch, fy = (cy - h / 2 - L.by - L.pad) / L.pitch;
    d.raw = { row: Math.round(fy), col: Math.round(fx) };
    d.overBoard = cx > L.bx - L.pitch && cx < L.bx + L.boardPx + L.pitch && cy > L.by - L.pitch && cy < L.by + L.boardPx + L.pitch * 0.6;
    d.target = null;
    d.lines = { rows: [], cols: [] };
    d.blast = new Set(); d.firing = new Set();
    if (!d.overBoard) return;
    const cands: [number, number, number][] = [];
    for (const r of [Math.floor(fy), Math.ceil(fy)]) for (const c of [Math.floor(fx), Math.ceil(fx)]) cands.push([r, c, Math.hypot(r - fy, c - fx)]);
    cands.sort((a, b) => a[2] - b[2]);
    for (const [r, c, dist] of cands) {
      if (dist > 0.75) break;
      if (canPlace(board, d.shape, r, c)) {
        d.target = { row: r, col: c };
        d.lines = previewLines(board, d.shape, r, c);
        this.previewPulse(board, d);
        return;
      }
    }
  }

  /** Immediate Pulse preview: which Pulses a drop would fire and which neighbours the first wave would clear. */
  private previewPulse(board: Board, d: DragState) {
    if (!d.target || (!d.lines.rows.length && !d.lines.cols.length)) return;
    const occ = new Map<number, { pulse: boolean }>();
    board.cells.forEach((c, k) => { if (c) occ.set(k, { pulse: !!c.pulse }); });
    d.shape.cells.forEach(([dr, dc], i) => occ.set((d.target!.row + dr) * 8 + d.target!.col + dc, { pulse: d.piece.pulseIndex === i }));
    const inLine = new Set<number>();
    for (const r of d.lines.rows) for (let c = 0; c < 8; c++) inLine.add(r * 8 + c);
    for (const c of d.lines.cols) for (let r = 0; r < 8; r++) inLine.add(r * 8 + c);
    for (const k of inLine) {
      if (!occ.get(k)?.pulse) continue;
      d.firing.add(k);
      const r = Math.floor(k / 8), c = k % 8;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if ((dr || dc) && rr >= 0 && cc >= 0 && rr < 8 && cc < 8) {
          const kk = rr * 8 + cc;
          if (occ.has(kk) && !inLine.has(kk)) d.blast.add(kk);
        }
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
    return this.animator.active || !!this.drag || !!this.returning || this.rotating.size > 0 || !!this.drain || (pulses && !this.reduced) || !!this.tutorialTarget || performance.now() < this.denied + 500;
  }

  playabilityOf(slot: number): Playability | null {
    const s = this.getState();
    const p = s.tray[slot];
    if (!p) return null;
    return playability(this.rotation, s.board, p, s.energy);
  }

  private paintBoardBg() {
    const L = this.layout;
    const c = document.createElement('canvas');
    c.width = Math.ceil(L.W * this.dpr); c.height = Math.ceil((L.by + L.boardPx + 16) * this.dpr);
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    paintFrame(g, L.bx, L.by, L.boardPx, L.boardPx, L.pitch * 0.32, L.frame, true);
    for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
      const { x, y } = this.cellXY(r, col);
      paintEmptyCell(g, x, y, L.cell);
    }
    this.boardBg = c;
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

    if (!this.boardBg) this.paintBoardBg();
    g.drawImage(this.boardBg!, 0, 0, this.boardBg!.width / this.dpr, this.boardBg!.height / this.dpr);
    this.drawCelebration(now);

    const board = A.display ?? state.board;
    const d = this.drag;
    const willClear = new Set<number>();
    if (d?.target) {
      for (const r of d.lines.rows) for (let c = 0; c < 8; c++) willClear.add(r * 8 + c);
      for (const c of d.lines.cols) for (let r = 0; r < 8; r++) willClear.add(r * 8 + c);
    }

    // Tutorial target glow.
    if (this.tutorialTarget && !A.busy) {
      const tp = state.tray[this.tutorialTarget.slot];
      if (tp) {
        const shape = shapeOf({ ...tp, rot: this.tutorialTarget.rot ?? tp.rot });
        const a = 0.2 + 0.18 * (this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.005));
        for (const [dr, dc] of shape.cells) {
          const { x, y } = this.cellXY(this.tutorialTarget.row + dr, this.tutorialTarget.col + dc);
          g.fillStyle = rgba(THEME.pulse, a);
          roundRect(g, x, y, L.cell, L.cell, L.cell * 0.14); g.fill();
          g.strokeStyle = rgba(THEME.pulseCore, 0.85); g.lineWidth = 1.5;
          roundRect(g, x + 1, y + 1, L.cell - 2, L.cell - 2, L.cell * 0.14); g.stroke();
        }
      }
    }

    // Lines a drop would complete: a cool wash under the blocks.
    for (const k of willClear) {
      const { x, y } = this.cellXY(Math.floor(k / 8), k % 8);
      g.fillStyle = rgba(THEME.pulse, 0.17);
      roundRect(g, x - 1, y - 1, L.cell + 2, L.cell + 2, L.cell * 0.16); g.fill();
    }

    // Placed blocks.
    const charging = new Map<number, number>();
    for (const c of A.charges) if (now >= c.start) charging.set(c.k, Math.min(1, (now - c.start) / c.dur));
    for (let k = 0; k < 64; k++) {
      const cell = board.cells[k];
      if (!cell || A.hidden.has(k)) continue;
      const { x, y } = this.cellXY(Math.floor(k / 8), k % 8);
      let lift = 0, bright = 0, scale = 1;
      const st = A.settles.get(k);
      if (st !== undefined) {
        const t = Math.min(1, (now - st) / 110);
        lift = this.reduced ? 0 : (1 - t) * 0.9;
        scale = this.reduced ? 1 : 1 + 0.05 * (1 - t);
        bright = Math.max(0, 0.45 * (1 - (now - st) / 180));
      }
      if (A.glowCells && now >= A.glowCells.start && A.glowCells.cells.includes(k)) {
        const p = (now - A.glowCells.start) / A.glowCells.dur;
        bright = Math.max(bright, Math.min(1, p * 2.2) * 0.55 * Math.min(1.3, A.glowCells.strength));
      }
      if (willClear.has(k)) bright = Math.max(bright, 0.22);
      if (d?.blast.has(k)) bright = Math.max(bright, 0.18);
      drawBlock(g, x, y, L.cell, cell.pulse, now, this.reduced, { lift, bright, scale, charge: charging.get(k) ?? (d?.firing.has(k) ? 0.6 : 0), material: this.matAt(Math.floor(k / 8), k % 8, now) });
      if (d?.blast.has(k)) {
        g.strokeStyle = rgba(THEME.pulse, 0.85); g.lineWidth = 1.5; g.setLineDash([3, 3]);
        roundRect(g, x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.14); g.stroke(); g.setLineDash([]);
      }
    }

    // Drag preview.
    if (d) {
      if (d.target) {
        // Pulse preview: the 3x3 reach of each Pulse this drop would fire (immediate wave only).
        for (const k of d.firing) {
          const r = Math.floor(k / 8), c = k % 8;
          const a = this.cellXY(Math.max(0, r - 1), Math.max(0, c - 1)), b = this.cellXY(Math.min(7, r + 1), Math.min(7, c + 1));
          g.strokeStyle = rgba(THEME.pulse, 0.6); g.lineWidth = 1.5;
          roundRect(g, a.x - 2, a.y - 2, b.x + L.cell - a.x + 4, b.y + L.cell - a.y + 4, L.cell * 0.22); g.stroke();
        }
        d.shape.cells.forEach(([dr, dc], i) => {
          const { x, y } = this.cellXY(d.target!.row + dr, d.target!.col + dc);
          drawBlock(g, x, y, L.cell, d.piece.pulseIndex === i, now, true, { alpha: 0.38 });
          g.strokeStyle = rgba(THEME.pulse, 0.9); g.lineWidth = 2;
          roundRect(g, x + 1, y + 1, L.cell - 2, L.cell - 2, L.cell * 0.14); g.stroke();
        });
      } else if (d.overBoard) {
        for (const [dr, dc] of d.shape.cells) {
          const r = d.raw.row + dr, c = d.raw.col + dc;
          if (r < 0 || c < 0 || r > 7 || c > 7) continue;
          const { x, y } = this.cellXY(r, c);
          g.fillStyle = rgba(THEME.invalid, 0.16);
          roundRect(g, x, y, L.cell, L.cell, L.cell * 0.14); g.fill();
          g.strokeStyle = rgba(THEME.invalid, 0.85); g.lineWidth = 2;
          roundRect(g, x + 1.5, y + 1.5, L.cell - 3, L.cell - 3, L.cell * 0.14); g.stroke();
        }
      }
    }

    this.drawEffects(now);
    g.restore();

    if (this.fade > 0) {
      g.fillStyle = rgba(THEME.bg, this.fade * 0.6);
      g.fillRect(0, 0, L.W, L.H);
    }

    this.drawEnergy(now, state);
    this.drawTray(now, state);
    this.drawOrbs(now, state);
    this.drawDragged(now);
  }

  private drawCelebration(now: number) {
    const c = this.animator.celebrate;
    if (!c || now < c.start) return;
    const g = this.g, L = this.layout;
    const p = (now - c.start) / c.dur;
    const a = Math.sin(Math.min(1, p) * Math.PI);
    // A running light around the frame, plus a gentle glow over the well.
    const per = L.boardPx * 4;
    const pos = (p * per * 1.2) % per;
    const pt = (d: number) => d < L.boardPx ? [L.bx + d, L.by] : d < 2 * L.boardPx ? [L.bx + L.boardPx, L.by + d - L.boardPx] : d < 3 * L.boardPx ? [L.bx + 3 * L.boardPx - d, L.by + L.boardPx] : [L.bx, L.by + 4 * L.boardPx - d];
    g.save();
    const col = c.gold ? THEME.gold : THEME.pulse, core = c.gold ? '#FFF3D1' : THEME.pulseCore;
    const W = visualParams().wave;
    g.strokeStyle = rgba(col, Math.min(1, 0.5 * a * W)); g.lineWidth = L.frame * 0.5;
    roundRect(g, L.bx + L.frame * 0.3, L.by + L.frame * 0.3, L.boardPx - L.frame * 0.6, L.boardPx - L.frame * 0.6, L.pitch * 0.3); g.stroke();
    for (let i = 0; i < 4; i++) {
      const [x, y] = pt((pos + (i * per) / 4) % per);
      const rg = g.createRadialGradient(x, y, 0, x, y, L.pitch * 1.2);
      rg.addColorStop(0, rgba(core, Math.min(1, 0.8 * a * W))); rg.addColorStop(1, rgba(col, 0));
      g.fillStyle = rg; g.fillRect(x - L.pitch * 1.2, y - L.pitch * 1.2, L.pitch * 2.4, L.pitch * 2.4);
    }
    g.restore();
  }

  private drawEffects(now: number) {
    const g = this.g, L = this.layout, A = this.animator;

    // Energy sweep: a bright band travels out from the placement along each completed line.
    for (const s of A.sweeps) {
      if (now < s.start) continue;
      const p = (now - s.start) / s.dur;
      const head = p * 9;
      for (let i = 0; i < 8; i++) {
        const dist = Math.abs(i - s.origin);
        const near = 1 - Math.min(1, Math.abs(dist - head * 0.6) / (1.2 + 0.4 * s.strength));
        if (near <= 0) continue;
        const r = s.kind === 'row' ? s.i : i, c = s.kind === 'row' ? i : s.i;
        const { x, y } = this.cellXY(r, c);
        g.fillStyle = rgba(THEME.pulseCore, Math.min(1, near * (1 - p * 0.6) * Math.min(0.9, 0.5 * s.strength) * visualParams().wave));
        roundRect(g, x - 1, y - 1, L.cell + 2, L.cell + 2, L.cell * 0.18); g.fill();
      }
      // thin energy rail along the whole line
      const a = this.cellXY(s.kind === 'row' ? s.i : 0, s.kind === 'row' ? 0 : s.i);
      const b = this.cellXY(s.kind === 'row' ? s.i : 7, s.kind === 'row' ? 7 : s.i);
      g.strokeStyle = rgba(THEME.pulse, 0.5 * (1 - p) * Math.min(1.5, s.strength));
      g.lineWidth = 1.5 + s.strength;
      g.beginPath(); g.moveTo(a.x + L.cell / 2, a.y + L.cell / 2); g.lineTo(b.x + L.cell / 2, b.y + L.cell / 2); g.stroke();
    }

    // Material transition: a bright front in the new material sweeps out from the centre of the board.
    const mw = A.materialWave;
    if (mw && now >= mw.start) {
      const p = Math.min(1, (now - mw.start) / mw.dur);
      const c0 = this.cellXY(mw.or, mw.oc);
      const cx = c0.x + L.cell / 2, cy = c0.y + L.cell / 2;
      const R = p * 1.1 * Math.hypot(4, 4) * L.pitch;
      const band = L.pitch * 0.9;
      g.save();
      g.beginPath(); g.rect(L.bx + L.pad, L.by + L.pad, L.pitch * 8, L.pitch * 8); g.clip();
      const rg = g.createRadialGradient(cx, cy, Math.max(0, R - band), cx, cy, R + band * 0.3);
      const a = Math.min(1, 0.55 * visualParams().wave) * (1 - p * 0.5);
      rg.addColorStop(0, rgba(mw.to.highlight, 0)); rg.addColorStop(0.75, rgba(mw.to.highlight, a)); rg.addColorStop(1, rgba(mw.to.color, 0));
      g.fillStyle = rg; g.fillRect(L.bx, L.by, L.boardPx, L.boardPx);
      g.restore();
    }

    // Intersection flares where a row and a column clear together.
    for (const f of A.flares) {
      if (now < f.start) continue;
      const p = (now - f.start) / f.dur;
      const { x, y } = this.cellXY(f.r, f.c);
      const cx = x + L.cell / 2, cy = y + L.cell / 2, R = L.pitch * (0.6 + 0.8 * p);
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      rg.addColorStop(0, rgba(THEME.pulseCore, 0.7 * (1 - p))); rg.addColorStop(1, rgba(THEME.pulse, 0));
      g.fillStyle = rg; g.fillRect(cx - R, cy - R, R * 2, R * 2);
    }

    // Blocks leaving: brighten, then break up.
    for (const dy of A.dying) {
      const { x, y } = this.cellXY(Math.floor(dy.k / 8), dy.k % 8);
      if (now < dy.start) {
        const b = now >= dy.brightFrom ? Math.min(1, (now - dy.brightFrom) / Math.max(1, dy.start - dy.brightFrom)) : 0;
        drawBlock(g, x, y, L.cell, dy.cell.pulse, now, this.reduced, { bright: 0.3 + 0.6 * b });
        continue;
      }
      const p = (now - dy.start) / dy.dur;
      drawBlock(g, x, y, L.cell, dy.cell.pulse, now, this.reduced, { scale: this.reduced ? 1 : 1 - p * 0.35, alpha: 1 - p, bright: 0.9 * (1 - p) });
    }

    // Pulse shockwaves: a ring that grows to exactly the 3x3 blast area, never beyond it.
    for (const s of A.shocks) {
      if (now < s.start) continue;
      const p = (now - s.start) / s.dur;
      const e = 1 - Math.pow(1 - Math.min(1, p * 1.6), 3);
      const a = this.cellXY(Math.max(0, s.r - 1), Math.max(0, s.c - 1)), b = this.cellXY(Math.min(7, s.r + 1), Math.min(7, s.c + 1));
      const { x, y } = this.cellXY(s.r, s.c);
      const cx = x + L.cell / 2, cy = y + L.cell / 2;
      const left = cx + (a.x - cx) * e, top = cy + (a.y - cy) * e;
      const right = cx + (b.x + L.cell - cx) * e, bottom = cy + (b.y + L.cell - cy) * e;
      const strength = 1 + s.wave * 0.35;
      g.fillStyle = rgba(THEME.pulse, 0.16 * (1 - p) * strength);
      roundRect(g, left, top, right - left, bottom - top, L.cell * 0.25); g.fill();
      g.save();
      g.shadowColor = THEME.pulse; g.shadowBlur = this.reduced ? 0 : 10 * strength;
      g.strokeStyle = rgba(THEME.pulseCore, 0.9 * (1 - p)); g.lineWidth = (2 + 1.2 * s.wave) * (1 - p) + 0.8;
      roundRect(g, left, top, right - left, bottom - top, L.cell * 0.25); g.stroke();
      g.restore();
      // core flash
      const fr = L.pitch * 0.7 * (1 - p);
      if (fr > 0) {
        const rg = g.createRadialGradient(cx, cy, 0, cx, cy, fr + 1);
        rg.addColorStop(0, rgba(THEME.pulseCore, 0.9 * (1 - p))); rg.addColorStop(1, rgba(THEME.pulse, 0));
        g.fillStyle = rg; g.fillRect(cx - fr, cy - fr, fr * 2, fr * 2);
      }
    }

    // Energy bolts from a firing Pulse to the next Pulse in the chain.
    for (const b of A.bolts) {
      if (now < b.start) continue;
      const p = (now - b.start) / b.dur;
      const f = this.cellXY(b.fr, b.fc), t = this.cellXY(b.tr, b.tc);
      const fx = f.x + L.cell / 2, fy = f.y + L.cell / 2, tx = t.x + L.cell / 2, ty = t.y + L.cell / 2;
      const reach = Math.min(1, p * 2.2);
      g.save();
      g.shadowColor = THEME.pulse; g.shadowBlur = this.reduced ? 0 : 8;
      g.strokeStyle = rgba(THEME.pulseCore, 1 - p * 0.7); g.lineWidth = 2;
      g.beginPath(); g.moveTo(fx, fy);
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        const u = (i / steps) * reach;
        const jit = i === steps ? 0 : (Math.sin(b.seed * 13 + i * 7 + now * 0.05) * L.pitch * 0.12);
        g.lineTo(fx + (tx - fx) * u + (ty - fy === 0 ? 0 : jit), fy + (ty - fy) * u + (tx - fx === 0 ? 0 : jit));
      }
      g.stroke();
      g.restore();
    }

    // Shards.
    for (const p of A.particles) {
      if (now < p.born) continue;
      const life = (now - p.born) / p.life;
      const px = L.bx + L.pad + p.x * L.pitch, py = L.by + L.pad + p.y * L.pitch;
      g.globalAlpha = Math.max(0, 1 - life);
      g.fillStyle = p.hue === 'cyan' ? THEME.pulse : p.hue === 'white' ? THEME.pulseCore : currentMaterial().highlight;
      const s = p.size * L.pitch * (1 - life * 0.4);
      g.save(); g.translate(px, py); g.rotate(p.spin * life);
      g.fillRect(-s / 2, -s / 2, s, s);
      g.restore();
    }
    g.globalAlpha = 1;

    // Points earned, near the cleared area.
    for (const f of A.floats) {
      if (now < f.start) continue;
      const p = (now - f.start) / f.dur;
      const px = L.bx + L.pad + (f.c + 0.5) * L.pitch, py = L.by + L.pad + (f.r + 0.5) * L.pitch - p * L.pitch * 0.9;
      g.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      g.font = `800 ${Math.round(L.pitch * (f.big ? 0.62 : 0.5))}px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 4; g.strokeStyle = 'rgba(6,10,16,0.8)';
      g.strokeText(f.text, px, py);
      g.fillStyle = f.big ? THEME.pulseCore : THEME.text; g.fillText(f.text, px, py);
      g.globalAlpha = 1;
    }
  }

  private drawEnergy(now: number, state: GameState) {
    const g = this.g, L = this.layout, rc = this.rotation;
    if (rc.mode === 'none') return;
    const max = rc.maxCharges;
    const shown = Math.max(0, state.energy - this.animator.pendingEnergy);
    const s0 = this.segmentCenter(0, max);
    const denied = now < this.denied + 500 ? 1 - (now - this.denied) / 500 : 0;
    g.font = `700 ${Math.round(Math.min(11, L.energyH * 0.27))}px ${FONT}`;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    // "ENERGY FULL" for a moment after restored energy fills the meter.
    const arr = this.animator.arrivals;
    const justFull = rc.mode === 'energy' && shown >= max && arr.length > 0 && now < arr[arr.length - 1].t + 1200;
    const goldFull = justFull && arr.some((a) => a.gold);
    const label = rc.mode === 'unlimited' ? 'ROTATION  ∞' : shown === 0 ? 'NO ENERGY' : justFull ? 'ENERGY FULL' : 'ROTATION ENERGY';
    g.fillStyle = denied > 0 ? THEME.invalid : justFull ? (goldFull ? THEME.gold : THEME.pulse) : shown === 0 && rc.mode === 'energy' ? rgba(THEME.textDim, 0.8) : THEME.textDim;
    if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '1.5px';
    g.fillText(label, s0.x - s0.w / 2 - 14 + (denied ? Math.sin(now * 0.08) * 3 * denied : 0), s0.y);
    if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    if (rc.mode === 'unlimited') return;
    for (let i = 0; i < max; i++) {
      const c = this.segmentCenter(i, max);
      const x = c.x - c.w / 2, y = c.y - c.h / 2;
      // recessed slot
      g.fillStyle = '#0A1119';
      roundRect(g, x - 2, y - 2, c.w + 4, c.h + 4, (c.h + 4) / 2); g.fill();
      g.strokeStyle = i < shown ? rgba(THEME.pulse, 0.55) : '#3D5466'; g.lineWidth = 1.2;
      roundRect(g, x - 1.5, y - 1.5, c.w + 3, c.h + 3, (c.h + 3) / 2); g.stroke();
      if (i >= shown) {
        // depleted: a dark inset groove, clearly different from a charged cell
        g.fillStyle = '#121C26'; roundRect(g, x + 1, y + 1, c.w - 2, c.h - 2, (c.h - 2) / 2); g.fill();
      }
      let lit = i < shown ? 1 : 0;
      if (this.drain && this.drain.seg === i) {
        const p = (now - this.drain.start) / 260;
        if (p >= 1) this.drain = null; else lit = Math.max(lit, 1 - p);
      }
      if (lit > 0) {
        g.save();
        g.globalAlpha = lit;
        g.shadowColor = THEME.pulse; g.shadowBlur = this.reduced ? 0 : 10;
        const grad = g.createLinearGradient(x, y, x, y + c.h);
        grad.addColorStop(0, THEME.pulseCore); grad.addColorStop(0.5, THEME.pulse); grad.addColorStop(1, '#2AA9B8');
        g.fillStyle = grad;
        roundRect(g, x, y, c.w, c.h, c.h / 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.55)';
        roundRect(g, x + c.h * 0.4, y + 1, c.w - c.h * 0.8, Math.max(1, c.h * 0.22), 1); g.fill();
        g.restore();
      }
      // Arrival flash: cyan for line energy, gold-and-cyan for level-up energy.
      const hit = arr.find((a) => a.seg === i && now < a.t + 600);
      if (hit && !this.reduced) {
        const q = (now - hit.t) / 600;
        g.save();
        g.strokeStyle = rgba(hit.gold ? THEME.gold : THEME.pulseCore, 1 - q); g.lineWidth = 2;
        g.shadowColor = hit.gold ? THEME.gold : THEME.pulse; g.shadowBlur = 12;
        const grow = 3 + q * 5;
        roundRect(g, x - grow, y - grow, c.w + grow * 2, c.h + grow * 2, (c.h + grow * 2) / 2); g.stroke();
        g.restore();
      }
      if (denied > 0) {
        g.strokeStyle = rgba(THEME.invalid, denied); g.lineWidth = 1.5;
        roundRect(g, x - 2, y - 2, c.w + 4, c.h + 4, (c.h + 4) / 2); g.stroke();
      }
    }
  }

  private drawOrbs(now: number, state: GameState) {
    const g = this.g, L = this.layout;
    for (const o of this.animator.orbs) {
      if (now < o.start) continue;
      const p = Math.min(1, (now - o.start) / o.dur);
      const e = p * p * (3 - 2 * p);
      const from = this.cellXY(o.r, o.c);
      const fx = from.x + L.cell / 2, fy = from.y + L.cell / 2;
      const to = this.segmentCenter(Math.min(o.seg, this.rotation.maxCharges - 1), this.rotation.maxCharges);
      const mx = (fx + to.x) / 2 + (to.x > fx ? 30 : -30), my = Math.min(fy, to.y) - 10;
      const x = (1 - e) * (1 - e) * fx + 2 * (1 - e) * e * mx + e * e * to.x;
      const y = (1 - e) * (1 - e) * fy + 2 * (1 - e) * e * my + e * e * to.y;
      const R = 7;
      const rg = g.createRadialGradient(x, y, 0, x, y, R * 2);
      // Level-up energy is champagne gold with a cyan halo; line energy is cyan.
      rg.addColorStop(0, o.gold ? '#FFF6DC' : rgba(THEME.pulseCore, 1)); rg.addColorStop(0.4, o.gold ? rgba(THEME.gold, 0.9) : rgba(THEME.pulse, 0.8)); rg.addColorStop(1, rgba(THEME.pulse, 0));
      g.fillStyle = rg; g.fillRect(x - R * 2, y - R * 2, R * 4, R * 4);
    }
    void state;
  }

  /** Material for a standard block at (r, c) while a material wave sweeps the board (undefined = current). */
  private matAt(r: number, c: number, now: number): MaterialLook | undefined {
    const w = this.animator.materialWave;
    if (!w) return undefined;
    const p = Math.max(0, (now - w.start) / w.dur);
    const maxD = Math.hypot(4, 4);
    return Math.hypot(r - w.or, c - w.oc) / maxD <= p * 1.1 ? w.to : w.from;
  }

  private drawPiece(piece: PieceInstance, shape: Shape, cx: number, cy: number, pitch: number, alpha: number, now: number, angle = 0, material?: MaterialLook) {
    const L = this.layout;
    const gapRatio = L.gap / L.pitch;
    const cell = pitch * (1 - gapRatio);
    const w = shape.cols * pitch, h = shape.rows * pitch;
    const g = this.g;
    if (angle) { g.save(); g.translate(cx, cy); g.rotate(angle); g.translate(-cx, -cy); }
    shape.cells.forEach(([dr, dc], i) => {
      const x = cx - w / 2 + dc * pitch + (pitch - cell) / 2, y = cy - h / 2 + dr * pitch + (pitch - cell) / 2;
      drawBlock(g, x, y, cell, piece.pulseIndex === i, now, this.reduced, { alpha, material });
    });
    if (angle) g.restore();
  }

  private drawTray(now: number, state: GameState) {
    const g = this.g;
    for (let i = 0; i < 3; i++) {
      const r = this.slotRect(i);
      const p = state.tray[i];
      const tutorialHidden = state.mode === 'tutorial' && this.tutorialTarget?.slot !== i;
      const empty = !p || tutorialHidden;
      paintFrame(g, r.x, r.y, r.w, r.h, 14, 4, false);
      if (empty) {
        // a faint dashed socket marks an empty slot
        g.strokeStyle = rgba(THEME.gridBorder, 0.6); g.lineWidth = 1; g.setLineDash([4, 5]);
        roundRect(g, r.x + 12, r.y + 12, r.w - 24, r.h - 24, 10); g.stroke(); g.setLineDash([]);
        continue;
      }
      if (this.drag?.slot === i || this.returning?.slot === i) continue;
      const shape = shapeOf(p!);
      const play = this.animator.busy ? 'now' : playability(this.rotation, state.board, p!, state.energy);
      const alpha = play === 'now' ? 1 : play === 'after-rotation' ? 0.62 : 0.3;
      let angle = 0;
      const rs = this.rotating.get(i);
      if (rs !== undefined) {
        const t = Math.min(1, (now - rs) / this.rotation.animMs);
        const e = 1 - Math.pow(1 - t, 3);
        angle = -Math.PI / 2 * (1 - e);
        if (t >= 1) this.rotating.delete(i);
        // a little energy discharge around the slot while it turns
        if (!this.reduced && t < 1) {
          g.save();
          g.strokeStyle = rgba(THEME.pulse, 0.5 * (1 - t)); g.lineWidth = 2;
          g.shadowColor = THEME.pulse; g.shadowBlur = 8;
          roundRect(g, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 12); g.stroke();
          g.restore();
        }
      }
      const c = this.pieceCenter(i);
      // The tray changes material as the wave finishes crossing the board.
      const mw = this.animator.materialWave;
      const trayMat = mw ? ((now - mw.start) / mw.dur >= 0.85 ? mw.to : mw.from) : undefined;
      this.drawPiece(p!, shape, c.x, c.y, this.trayCellFor(shape), alpha, now, angle, trayMat);
    }
  }

  private drawDragged(now: number) {
    const L = this.layout;
    const d = this.drag;
    if (d) {
      const s = this.dragScale(now);
      const small = this.trayCellFor(d.shape);
      const pitch = small + (L.pitch - small) * s;
      this.g.save();
      this.g.shadowColor = 'rgba(0,0,0,0.55)'; this.g.shadowBlur = 22; this.g.shadowOffsetY = 12;
      this.drawPiece(d.piece, d.shape, d.x, d.y - d.lift * s, pitch, 1, now);
      this.g.restore();
    }
    const r = this.returning;
    if (r) {
      const t = Math.min(1, (now - r.start) / RETURN_MS);
      const e = 1 - Math.pow(1 - t, 3);
      const to = this.pieceCenter(r.slot);
      const shape = shapeOf(r.piece);
      const pitch = r.fromCell + (this.trayCellFor(shape) - r.fromCell) * e;
      this.drawPiece(r.piece, shape, r.fromX + (to.x - r.fromX) * e, r.fromY + (to.y - r.fromY) * e, pitch, 1, now);
      if (t >= 1) this.returning = null;
    }
  }
}
