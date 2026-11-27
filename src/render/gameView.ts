// Draws the board, the Rotation Energy meter, the tray slots, the dragged piece, previews and effects
// onto one canvas. Reads game state; never changes it.

import { canPlace, previewLines, shapeOf, type Board, type PieceInstance } from '../engine/board';
import type { RotationConfig } from '../engine/config';
import type { GameState } from '../engine/game';
import type { Shape } from '../engine/pieces';
import { playability, type Playability } from '../engine/rotation';
import type { PlacementTarget } from '../game/session';
import { Animator } from './animator';
import { compartmentImage } from './gems';
import { blockStyle, drawBlock, drawBlockShards, drawGlint, isGemStyle, paintBoard8, paintPlatform8, paintPedestal, paintEmptyCell, paintFrame, roundRect, setRenderScale, currentMaterial, visualParams, type MaterialLook } from './blocks';
import { THEME, rgba } from './theme';

export interface Layout {
  W: number; H: number;
  bx: number; by: number; boardPx: number; frame: number; pad: number;
  pitch: number; cell: number; gap: number;
  energyY: number; energyH: number;
  trayTop: number; trayH: number; slotW: number; slotH: number; slotGap: number; trayLeft: number; trayCell: number;
  /** Build 4: tray width (the Overdrive meter and Rotation Energy share one row across it). */
  trayW: number;
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
  /** Build 4: Overdrive meter feedback (charge gained, ready, held-off game over) and the shield indicator. */
  odPulse = 0;
  odAvailable = false;
  /** Meter value being shown (animates up to the state's charge). */
  private odShown = 0;
  private bgCache: HTMLCanvasElement | null = null;
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

    // Build 7: the board is the largest square that fits: up to 93% of the width (a 3.5% gutter each side), with the
    // tray taking what remains below it, never less than it needs for comfortable dragging.
    // Build 8: 95% of the width (2.5% gutters), with a slimmer machined frame.
    const side = Math.max(8, W * 0.025);
    // Build 4: the board keeps its Build 3 size; Overdrive and Rotation Energy share one compact row, and the tray
    // takes the space the old footer tagline used, so tray pieces grow 15–20%.
    const energyH = Math.max(30, Math.min(40, H * 0.055));
    const minTray = Math.max(134, Math.min(170, H * 0.25));
    const boardPx = Math.max(180, Math.min(W - side * 2, 640, H - energyH - minTray - 6));
    const frame = Math.max(6, boardPx * 0.022);
    const pad = frame + Math.max(2, boardPx * 0.006);
    const pitch = (boardPx - pad * 2) / 8;
    const gap = Math.max(2, pitch * 0.08);
    const bx = (W - boardPx) / 2;
    const by = 4;
    const energyY = by + boardPx + 4;
    const trayTop = energyY + energyH;
    const trayH = Math.max(90, H - trayTop - 4);
    const slotGap = Math.max(8, boardPx * 0.025);
    // The tray may run a little wider than the board (up to the screen gutter) so pieces can grow.
    const trayW = Math.min(W - side * 2, boardPx * 1.16);
    const trayLeft = (W - trayW) / 2;
    const slotW = (trayW - slotGap * 2) / 3;
    const slotH = Math.min(trayH - 28, slotW * 1.2);
    // Miniature cell size based on 3-cell spans (most pieces); longer pieces shrink only as far as they must.
    const trayCell = Math.min(pitch * 0.93, (slotW * 0.95) / 3.1, ((slotH - ROTATE_OVERLAP) * 0.95) / 3);
    this.layout = { W, H, bx, by, boardPx, frame, pad, pitch, cell: pitch - gap, gap, energyY, energyH, trayTop, trayH, slotW, slotH, slotGap, trayLeft, trayCell, trayW };
    this.boardBg = null;
    this.bgCache = null;
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
    const x1 = L.W / 2 + 10, x2 = L.trayLeft + L.trayW - 4;
    const segGap = 6;
    const segW = Math.max(14, Math.min(34, ((x2 - x1) * 0.6 - (max - 1) * segGap) / max));
    const x0 = x2 - (max * segW + (max - 1) * segGap);
    return { x: x0 + i * (segW + segGap) + segW / 2, y: L.energyY + L.energyH / 2, w: segW, h: Math.min(12, L.energyH * 0.3), labelX: x1 };
  }

  /** Build 4: the Overdrive meter, left half of the energy row (also the tap target for activation). */
  odRect() {
    const L = this.layout;
    const x = L.trayLeft + 4, w = L.W / 2 - 10 - x;
    return { x, y: L.energyY + 2, w, h: L.energyH - 4 };
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
    const od = s.od && !this.reduced && (s.od.active > 0 || s.od.charge >= 100 || Math.abs(this.odShown - s.od.charge) > 0.5);
    return this.animator.active || !!this.drag || !!this.returning || this.rotating.size > 0 || !!this.drain || (pulses && !this.reduced) || !!this.tutorialTarget
      || performance.now() < this.denied + 500 || !!od || performance.now() < this.odPulse + 900;
  }

  /** Build 4: rotation rules in force (Overdrive changes them); set by the app. */
  effective: (s: GameState) => { rc: RotationConfig; energy: number } = (s) => ({ rc: this.rotation, energy: s.energy });

  playabilityOf(slot: number): Playability | null {
    const s = this.getState();
    const p = s.tray[slot];
    if (!p) return null;
    const e = this.effective(s);
    return playability(e.rc, s.board, p, e.energy);
  }

  private paintBoardBg() {
    const L = this.layout;
    const c = document.createElement('canvas');
    c.width = Math.ceil(L.W * this.dpr); c.height = Math.ceil((L.by + L.boardPx + 16) * this.dpr);
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const tile = compartmentImage();
    if (isGemStyle() && tile) {
      paintBoard8(g, L.bx, L.by, L.boardPx, L.frame, L.pitch * 0.26, L.pad, L.pitch, tile);
      this.boardBg = c;
      return;
    }
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
    this.drawBackground(now, state);

    g.save();
    if (A.shake && !this.reduced) {
      const p = (now - A.shake.start) / A.shake.dur;
      const amp = A.shake.amp * (1 - p);
      g.translate(Math.sin(now * 0.09) * amp, Math.cos(now * 0.11) * amp * 0.6);
    }

    if (!this.boardBg) this.paintBoardBg();
    g.drawImage(this.boardBg!, 0, 0, this.boardBg!.width / this.dpr, this.boardBg!.height / this.dpr);
    this.drawPerimeter(now, state);
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

    // Build 8 idle glints: now and then one stone catches the light (random stone and timing, at most two at once).
    if (isGemStyle() && !this.reduced && !this.lowFx && now >= this.nextGlint) {
      this.nextGlint = now + 1500 + Math.random() * 2800;
      const occupied: number[] = [];
      board.cells.forEach((c, k) => { if (c && !A.hidden.has(k)) occupied.push(k); });
      if (occupied.length && A.glints.filter((gl) => gl.strength < 1).length < 2) {
        A.glints.push({ k: occupied[Math.floor(Math.random() * occupied.length)], start: now, dur: 650, strength: 0.6 });
      }
    }

    // Placed blocks.
    const odOn = !!state.od && state.od.active > 0;
    const pp = A.placePulse;
    const charging = new Map<number, number>();
    for (const c of A.charges) if (now >= c.start) charging.set(c.k, Math.min(1, (now - c.start) / c.dur));
    for (let k = 0; k < 64; k++) {
      const cell = board.cells[k];
      if (!cell || A.hidden.has(k)) continue;
      const { x, y } = this.cellXY(Math.floor(k / 8), k % 8);
      let lift = 0, bright = 0, scale = 1, under = 0;
      if (pp && now >= pp.start && pp.cells.includes(k)) under = Math.sin(Math.PI * Math.min(1, (now - pp.start) / pp.dur)) * (this.reduced ? 0.5 : 1);
      const st = A.settles.get(k);
      if (st !== undefined) {
        // Build 8 settle (140 ms): the crystal comes down into its compartment (slightly large, as if nearer the
        // eye), compresses a touch as it seats, then rests; the contact shadow tightens under it.
        const t = Math.min(1, (now - st) / 140);
        lift = this.reduced ? 0 : (1 - t) * (1 - t) * 0.7;
        scale = this.reduced ? 1 : t < 0.55 ? 1.05 - 0.09 * (t / 0.55) : 0.96 + 0.04 * ((t - 0.55) / 0.45);
        bright = Math.max(0, 0.35 * (1 - (now - st) / 180));
      }
      if (A.glowCells && now >= A.glowCells.start && A.glowCells.cells.includes(k)) {
        const p = (now - A.glowCells.start) / A.glowCells.dur;
        bright = Math.max(bright, Math.min(1, p * 2.2) * 0.55 * Math.min(1.3, A.glowCells.strength));
      }
      if (willClear.has(k)) bright = Math.max(bright, 0.2 + (this.reduced ? 0 : 0.06 * Math.sin(now * 0.008)));
      if (d?.blast.has(k)) bright = Math.max(bright, 0.18);
      drawBlock(g, x, y, L.cell, cell.pulse, now, this.reduced, { lift, bright, scale, under, od: odOn && !cell.pulse, charge: charging.get(k) ?? (d?.firing.has(k) ? 0.6 : 0), material: this.matAt(Math.floor(k / 8), k % 8, now) });
      if (isGemStyle()) {
        for (const gl of A.glints) {
          if (gl.k !== k || now < gl.start) continue;
          drawGlint(g, x, y, L.cell, (now - gl.start) / gl.dur, !!cell.pulse, this.matAt(Math.floor(k / 8), k % 8, now) ?? currentMaterial(), gl.strength);
        }
        // Lines this drop would complete: a slow light runs along them through the stones (anticipation only).
        if (willClear.has(k) && !this.reduced) {
          const pos = d!.lines.rows.includes(Math.floor(k / 8)) ? k % 8 : Math.floor(k / 8);
          const ph = ((now / 900) % 1.6) - pos * 0.07;
          if (ph > 0 && ph < 1) drawGlint(g, x, y, L.cell, ph, !!cell.pulse, this.matAt(Math.floor(k / 8), k % 8, now) ?? currentMaterial(), 0.55);
        }
      }
      // Contact highlight: the piece's edges catch the light as it locks in (Build 8 uses the glint instead).
      const ct = A.contact;
      if (ct && now >= ct.start && ct.cells.includes(k) && !isGemStyle()) {
        const q = (now - ct.start) / ct.dur;
        g.strokeStyle = rgba(cell.pulse ? THEME.pulseCore : currentMaterial().highlight, 0.85 * (1 - q)); g.lineWidth = 1.6;
        roundRect(g, x + 0.8, y + 0.8, L.cell - 1.6, L.cell * 0.915 - 1.6, L.cell * 0.12); g.stroke();
      }
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
          // Build 6 valid preview: a ghost crystal sitting in the socket with soft light under it.
          const breathe = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.008);
          drawBlock(g, x, y, L.cell, d.piece.pulseIndex === i, now, true, { alpha: 0.42 + 0.08 * breathe, under: 0.55, od: odOn });
          g.strokeStyle = rgba(d.piece.pulseIndex === i ? THEME.pulse : currentMaterial().highlight, 0.45 + 0.2 * breathe); g.lineWidth = 1.4;
          roundRect(g, x + 1, y + 1, L.cell - 2, L.cell - 2, L.cell * 0.13); g.stroke();
        });
      } else if (d.overBoard) {
        for (const [dr, dc] of d.shape.cells) {
          const r = d.raw.row + dr, c = d.raw.col + dc;
          if (r < 0 || c < 0 || r > 7 || c > 7) continue;
          const { x, y } = this.cellXY(r, c);
          // Build 6 invalid preview: a muted red socket, calmer than Build 4 (no bright outline flare).
          // Build 8: calmer still: a faint warm-grey outline, no red fill.
          const gemLook = isGemStyle();
          g.fillStyle = gemLook ? 'rgba(210,190,190,0.05)' : rgba(THEME.invalid, 0.12);
          roundRect(g, x, y, L.cell, L.cell, L.cell * 0.13); g.fill();
          g.strokeStyle = gemLook ? 'rgba(225,180,180,0.38)' : rgba(THEME.invalid, 0.6); g.lineWidth = 1.4;
          roundRect(g, x + 1.5, y + 1.5, L.cell - 3, L.cell - 3, L.cell * 0.13); g.stroke();
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

    // Build 6 afterglow: the cleared sockets keep a fading light for a moment, so the eye reads where the line was.
    const ag = A.afterglow;
    if (ag && now >= ag.start) {
      const p = (now - ag.start) / ag.dur;
      const a = (1 - p) * (1 - p) * Math.min(1, 0.35 + 0.2 * ag.strength) * visualParams().wave;
      const col = ag.od ? THEME.gold : currentMaterial().highlight;
      for (const k of ag.cells) {
        const { x, y } = this.cellXY(Math.floor(k / 8), k % 8);
        const cx = x + L.cell / 2, cy = y + L.cell / 2;
        const rg = g.createRadialGradient(cx, cy, 0, cx, cy, L.cell * 0.75);
        rg.addColorStop(0, rgba(col, a * 0.5)); rg.addColorStop(1, rgba(col, 0));
        g.fillStyle = rg; g.fillRect(cx - L.cell, cy - L.cell, L.cell * 2, L.cell * 2);
      }
    }

    // Blocks leaving: brighten, then break up.
    for (const dy of A.dying) {
      const { x, y } = this.cellXY(Math.floor(dy.k / 8), dy.k % 8);
      if (now < dy.start) {
        const b = now >= dy.brightFrom ? Math.min(1, (now - dy.brightFrom) / Math.max(1, dy.start - dy.brightFrom)) : 0;
        drawBlock(g, x, y, L.cell, dy.cell.pulse, now, this.reduced, { bright: 0.3 + 0.6 * b, od: dy.od, under: b * 0.6 });
        // Build 8 energy build-up: light runs through the stone's facets just before it fractures.
        if (isGemStyle() && !this.reduced && b > 0) drawGlint(g, x, y, L.cell, b, !!dy.cell.pulse, currentMaterial(), 0.9);
        continue;
      }
      const p = (now - dy.start) / dy.dur;
      if (this.reduced || dy.cell.pulse) {
        drawBlock(g, x, y, L.cell, dy.cell.pulse, now, this.reduced, { scale: this.reduced ? 1 : 1 - p * 0.35, alpha: 1 - p, bright: 0.9 * (1 - p), od: dy.od });
      } else {
        drawBlockShards(g, x, y, L.cell, !!dy.cell.pulse, p, dy.k + dy.start * 0.001, { power: dy.power, dir: dy.dir, od: dy.od });
      }
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
      g.fillStyle = p.hue === 'cyan' ? THEME.pulse : p.hue === 'white' ? THEME.pulseCore : p.hue === 'gold' ? THEME.gold : currentMaterial().highlight;
      const s = p.size * L.pitch * (1 - life * 0.4);
      g.save(); g.translate(px, py); g.rotate(p.spin * life);
      if (isGemStyle()) {
        // Build 8: chips of gemstone (sharp triangles in the stone's colour with a lit facet), and tiny bright
        // flecks that flash briefly; no round particles.
        if (p.hue === 'white') {
          const k = s * 0.55 * (1 - life);
          g.fillStyle = 'rgba(255,255,255,0.95)';
          g.beginPath(); g.moveTo(0, -k * 1.6); g.lineTo(k * 0.45, 0); g.lineTo(0, k * 1.6); g.lineTo(-k * 0.45, 0); g.closePath(); g.fill();
        } else {
          const col = p.hue === 'cyan' ? THEME.pulse : p.hue === 'gold' ? THEME.gold : currentMaterial().color;
          const hi = p.hue === 'cyan' ? THEME.pulseCore : p.hue === 'gold' ? '#FFF3D1' : currentMaterial().highlight;
          const a = s * 0.9;
          g.fillStyle = col;
          g.beginPath(); g.moveTo(-a * 0.6, -a * 0.5); g.lineTo(a * 0.7, -a * 0.2); g.lineTo(-a * 0.1, a * 0.7); g.closePath(); g.fill();
          g.fillStyle = hi;
          g.beginPath(); g.moveTo(-a * 0.6, -a * 0.5); g.lineTo(a * 0.7, -a * 0.2); g.lineTo(a * 0.05, -a * 0.08); g.closePath(); g.fill();
        }
      } else g.fillRect(-s / 2, -s / 2, s, s);
      g.restore();
    }
    g.globalAlpha = 1;

    // Perfect Board Clear: a gold ring with a cyan inner edge expanding from the centre of the board.
    const pw = A.perfectWave;
    if (pw && now >= pw.start) {
      const p = Math.min(1, (now - pw.start) / pw.dur);
      const cx = L.bx + L.boardPx / 2, cy = L.by + L.boardPx / 2;
      const R = p * L.boardPx * 0.75;
      g.save();
      g.beginPath(); g.rect(L.bx, L.by, L.boardPx, L.boardPx); g.clip();
      const rg = g.createRadialGradient(cx, cy, Math.max(0, R - L.pitch * 1.4), cx, cy, R + 1);
      rg.addColorStop(0, rgba(THEME.pulse, 0)); rg.addColorStop(0.55, rgba(THEME.pulse, 0.35 * (1 - p)));
      rg.addColorStop(0.85, rgba(THEME.gold, 0.6 * (1 - p))); rg.addColorStop(1, rgba(THEME.gold, 0));
      g.fillStyle = rg; g.fillRect(L.bx, L.by, L.boardPx, L.boardPx);
      g.restore();
    }
    const fl = A.flash;
    if (fl && now >= fl.start && !this.reduced) {
      const p = (now - fl.start) / fl.dur;
      g.fillStyle = rgba(fl.color, fl.amount * (1 - p) * visualParams().wave);
      roundRect(g, L.bx + L.frame, L.by + L.frame, L.boardPx - L.frame * 2, L.boardPx - L.frame * 2, L.pitch * 0.25); g.fill();
    }

    // Points earned, near the cleared area.
    for (const f of A.floats) {
      if (now < f.start) continue;
      const p = (now - f.start) / f.dur;
      const px = L.bx + L.pad + (f.c + 0.5) * L.pitch, py = L.by + L.pad + (f.r + 0.5) * L.pitch - p * L.pitch * 0.9;
      const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      g.globalAlpha = f.minor ? fade * 0.75 : fade;
      g.font = `800 ${Math.round(L.pitch * (f.big ? 0.62 : f.minor ? 0.36 : 0.5))}px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = f.minor ? 3 : 4; g.strokeStyle = 'rgba(6,10,16,0.8)';
      g.strokeText(f.text, px, py);
      g.fillStyle = f.gold ? '#FFE7B0' : f.big ? THEME.pulseCore : f.minor ? THEME.textDim : THEME.text; g.fillText(f.text, px, py);
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
    this.drawOverdrive(now, state);
    const od = state.od;
    const free = !!od && od.active > 0 && this.odRotation === 'free';
    g.font = `700 ${Math.round(Math.min(10.5, L.energyH * 0.26))}px ${FONT}`;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    // "ENERGY FULL" for a moment after restored energy fills the meter.
    const arr = this.animator.arrivals;
    const justFull = rc.mode === 'energy' && shown >= max && arr.length > 0 && now < arr[arr.length - 1].t + 1200;
    const goldFull = justFull && arr.some((a) => a.gold);
    const label = rc.mode === 'unlimited' ? 'ROTATION ∞' : free ? 'FREE TURNS' : shown === 0 ? 'NO ENERGY' : justFull ? 'FULL' : 'ENERGY';
    g.fillStyle = denied > 0 ? THEME.invalid : free ? THEME.gold : justFull ? (goldFull ? THEME.gold : THEME.pulse) : shown === 0 && rc.mode === 'energy' ? rgba(THEME.textDim, 0.8) : THEME.textDim;
    if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.8px';
    // Narrow screens: a shorter label so it never runs into the Overdrive meter.
    let text = label;
    const right = s0.x - s0.w / 2 - 10;
    if (right - g.measureText(text).width < s0.labelX) text = free ? 'FREE' : label === 'NO ENERGY' ? 'EMPTY' : label === 'ROTATION ∞' ? '∞' : label;
    g.fillText(text, right + (denied ? Math.sin(now * 0.08) * 3 * denied : 0), s0.y);
    if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    if (rc.mode === 'unlimited') return;
    for (let i = 0; i < max; i++) {
      const c = this.segmentCenter(i, max);
      const x = c.x - c.w / 2, y = c.y - c.h / 2;
      // recessed slot
      g.fillStyle = '#0A1119';
      roundRect(g, x - 2, y - 2, c.w + 4, c.h + 4, (c.h + 4) / 2); g.fill();
      g.strokeStyle = free ? rgba(THEME.gold, 0.8) : i < shown ? rgba(THEME.pulse, 0.55) : '#3D5466'; g.lineWidth = 1.2;
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

  /** Overdrive rotation benefit (set by the app from the config). */
  odRotation: 'free' | 'limited' | 'reduced' | 'none' = 'free';
  odDuration = 5;

  /** Build 6: 0..1 Overdrive environment mix, eased so the change in and out is gradual. */
  private odEnv = 0;
  private lastBgT = 0;
  private dust: { x: number; y: number; vx: number; vy: number; born: number; life: number; r: number }[] = [];

  /**
   * Build 6 layered reactor background: (1) a cached base of deep graphite with a radial core behind the board and
   * a vignette; (2) a faint cached structure of concentric reactor rings and radial ribs; (3) live layers: two very
   * slow light drifts, rare dust motes, a bloom when a clear releases energy, a combo tint and the Overdrive warmth,
   * all eased so nothing flashes.
   */
  private drawBackground(now: number, state: GameState) {
    const g = this.g, L = this.layout;
    const cx = L.W / 2, cy = L.by + L.boardPx * 0.5;
    if (!this.bgCache) {
      const c = document.createElement('canvas');
      c.width = Math.ceil(L.W * this.dpr); c.height = Math.ceil(L.H * this.dpr);
      const b = c.getContext('2d')!;
      b.scale(this.dpr, this.dpr);
      b.fillStyle = '#080C13'; b.fillRect(0, 0, L.W, L.H);
      const lightK = visualParams().boardLight;
      const rg = b.createRadialGradient(cx, cy, 0, cx, cy, Math.max(L.W, L.H) * 0.8);
      rg.addColorStop(0, rgba('#251C3A', 0.95 * lightK)); rg.addColorStop(0.35, rgba('#16192A', 0.85)); rg.addColorStop(0.7, rgba('#0C111B', 0.6)); rg.addColorStop(1, 'rgba(8,12,19,0)');
      b.fillStyle = rg; b.fillRect(0, 0, L.W, L.H);
      // structure: concentric rings and ribs, barely visible
      b.save();
      b.strokeStyle = 'rgba(170,150,230,0.045)'; b.lineWidth = 1;
      const R0 = L.boardPx * 0.62;
      for (let i = 0; i < 6; i++) { b.beginPath(); b.arc(cx, cy, R0 + i * L.boardPx * 0.16, 0, Math.PI * 2); b.stroke(); }
      b.strokeStyle = 'rgba(170,150,230,0.03)';
      for (let i = 0; i < 24; i++) {
        const t = (i / 24) * Math.PI * 2;
        b.beginPath(); b.moveTo(cx + Math.cos(t) * R0, cy + Math.sin(t) * R0); b.lineTo(cx + Math.cos(t) * R0 * 2.6, cy + Math.sin(t) * R0 * 2.6); b.stroke();
      }
      b.restore();
      // vignette
      const vg = b.createRadialGradient(cx, L.H * 0.5, Math.min(L.W, L.H) * 0.35, cx, L.H * 0.5, Math.max(L.W, L.H) * 0.85);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      b.fillStyle = vg; b.fillRect(0, 0, L.W, L.H);
      this.bgCache = c;
    }
    g.drawImage(this.bgCache, 0, 0, L.W, L.H);
    const dt = Math.min(100, Math.max(0, now - (this.lastBgT || now))); this.lastBgT = now;
    const od = state.od;
    const odTarget = od && od.active > 0 ? 1 : 0;
    this.odEnv += (odTarget - this.odEnv) * (this.reduced ? 1 : Math.min(1, dt / 900));
    const reduced = this.reduced || this.lowFx;
    // slow light drifts
    if (!reduced) {
      for (let i = 0; i < 2; i++) {
        const t = now * 0.00007 + i * 3.1;
        const x = cx + Math.cos(t) * L.W * 0.35, y = cy + Math.sin(t * 1.3) * L.boardPx * 0.5;
        const R = L.boardPx * 0.7;
        const rg = g.createRadialGradient(x, y, 0, x, y, R);
        rg.addColorStop(0, rgba(i ? '#5A3C9C' : '#8A2E86', 0.07)); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.fillRect(x - R, y - R, R * 2, R * 2);
      }
      // rare dust motes (at most 10 alive)
      if (this.dust.length < 10 && Math.random() < dt / 900) {
        this.dust.push({ x: Math.random() * L.W, y: L.by + Math.random() * (L.H - L.by), vx: (Math.random() - 0.5) * 0.006, vy: -0.004 - Math.random() * 0.008, born: now, life: 4000 + Math.random() * 4000, r: 0.6 + Math.random() * 1.1 });
      }
      this.dust = this.dust.filter((p) => now < p.born + p.life);
      for (const p of this.dust) {
        const age = now - p.born, q = age / p.life;
        const a = Math.sin(Math.PI * q) * 0.35;
        g.fillStyle = rgba(this.odEnv > 0.5 ? THEME.gold : '#D9B8FF', a);
        g.beginPath(); g.arc(p.x + p.vx * age, p.y + p.vy * age, p.r, 0, Math.PI * 2); g.fill();
      }
    }
    // combo tint (more ambient energy on consecutive clears)
    const combo = state.combo ?? 0;
    this.comboEnv += (Math.min(1, combo / 5) - this.comboEnv) * Math.min(1, dt / 600);
    // energy release bloom
    const A = this.animator;
    const since = now - A.energyAt;
    const bloom = since >= 0 && since < 900 ? (1 - since / 900) * A.energyAmt : 0;
    const k = this.comboEnv * 0.08 + bloom * 0.14;
    if (k > 0.004) {
      const R = L.boardPx * 1.05;
      const rg = g.createRadialGradient(cx, cy, L.boardPx * 0.3, cx, cy, R);
      rg.addColorStop(0, rgba('#C04BD8', 0)); rg.addColorStop(0.55, rgba('#C04BD8', k)); rg.addColorStop(1, rgba('#C04BD8', 0));
      g.fillStyle = rg; g.fillRect(0, 0, L.W, L.H);
    }
    if (this.odEnv > 0.01) {
      // Overdrive: the reactor warms to champagne gold, breathing very slowly
      const breathe = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.0018);
      const rg = g.createRadialGradient(cx, cy, L.boardPx * 0.3, cx, cy, L.boardPx * 1.1);
      rg.addColorStop(0, rgba(THEME.gold, 0)); rg.addColorStop(0.6, rgba(THEME.gold, (0.07 + 0.04 * breathe) * visualParams().odLight * this.odEnv)); rg.addColorStop(1, rgba(THEME.gold, 0));
      g.fillStyle = rg; g.fillRect(0, 0, L.W, L.H);
    }
  }
  private comboEnv = 0;
  private nextGlint = 0;
  /** Reduced effects (Settings): no drifting light, no dust, fewer particles. */
  lowFx = false;

  /** The board perimeter reacts: cyan with a combo, champagne gold with Overdrive (ready: corners; active: traces). */
  private drawPerimeter(now: number, state: GameState) {
    const g = this.g, L = this.layout;
    const od = state.od;
    const active = !!od && od.active > 0;
    const ready = !!od && !active && od.charge >= 100;
    const combo = state.combo ?? 0;
    const inset = L.frame * 0.45, rr = L.pitch * 0.3;
    const x = L.bx + inset, y = L.by + inset, w = L.boardPx - inset * 2;
    g.save();
    if (combo >= 2 && !active) {
      g.strokeStyle = rgba(THEME.pulse, Math.min(0.55, 0.12 + combo * 0.08)); g.lineWidth = Math.max(1.5, L.frame * 0.28);
      g.shadowColor = THEME.pulse; g.shadowBlur = this.reduced ? 0 : 6 + combo * 2;
      roundRect(g, x, y, w, w, rr); g.stroke();
    }
    // Build 6: perimeter light on each energy release (clears), stronger for bigger clears.
    const since = now - this.animator.energyAt;
    if (since >= 0 && since < 700 && !active) {
      const q = 1 - since / 700;
      g.save();
      // Build 8: the perimeter answers in the board's own cyan (restrained; stronger for bigger clears).
      const gemLook = isGemStyle();
      g.strokeStyle = rgba(gemLook ? THEME.pulse : '#E070D8', (gemLook ? 0.6 : 0.45) * q * this.animator.energyAmt); g.lineWidth = Math.max(1.5, L.frame * 0.3);
      g.shadowColor = gemLook ? THEME.pulse : '#C04BD8'; g.shadowBlur = this.reduced ? 0 : 14 * q * (gemLook ? this.animator.energyAmt : 1);
      roundRect(g, x, y, w, w, rr); g.stroke();
      g.restore();
    }
    if (active || this.odEnv > 0.02) {
      const breathe = this.reduced ? 0.6 : 0.6 + 0.4 * Math.sin(now * 0.004);
      const W = visualParams().odLight * Math.max(active ? 0.15 : 0, this.odEnv);
      g.strokeStyle = rgba(THEME.gold, Math.min(1, 0.65 * breathe * W)); g.lineWidth = Math.max(2, L.frame * 0.36);
      g.shadowColor = THEME.gold; g.shadowBlur = this.reduced ? 0 : 12 * W;
      roundRect(g, x, y, w, w, rr); g.stroke();
      // Build 6: energy arcs crawl along the frame while Overdrive is live (regenerated ~11 times a second).
      if (!this.reduced && !this.lowFx && active) {
        const per = w * 4, tick = Math.floor(now / 90);
        const rnd = (i: number) => { const v = Math.sin(tick * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); };
        const pt = (d: number): [number, number] => { d = ((d % per) + per) % per; return d < w ? [x + d, y] : d < 2 * w ? [x + w, y + d - w] : d < 3 * w ? [x + 3 * w - d, y + w] : [x, y + 4 * w - d]; };
        g.save();
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (let k = 0; k < 3; k++) {
          const start = rnd(k) * per, len = L.pitch * (1.2 + rnd(k + 9) * 1.8);
          g.strokeStyle = rgba(k === 0 ? '#F3D9FF' : '#C46BFF', 0.75 * W); g.lineWidth = k === 0 ? 1.6 : 1.1;
          g.shadowColor = '#B14CFF'; g.shadowBlur = 10;
          g.beginPath();
          for (let i = 0; i <= 8; i++) {
            const [px, py] = pt(start + (len * i) / 8);
            const j = (rnd(k * 20 + i) - 0.5) * L.frame * 2.2 * (i === 0 || i === 8 ? 0 : 1);
            if (i === 0) g.moveTo(px + j, py + j); else g.lineTo(px + j, py - j);
          }
          g.stroke();
        }
        g.restore();
      }
      // Two light traces running round the frame.
      if (!this.reduced && active) {
        const per = w * 4;
        const pt = (d: number) => d < w ? [x + d, y] : d < 2 * w ? [x + w, y + d - w] : d < 3 * w ? [x + 3 * w - d, y + w] : [x, y + 4 * w - d];
        for (let i = 0; i < 2; i++) {
          const [px, py] = pt(((now * 0.12) + i * per / 2) % per);
          const rg = g.createRadialGradient(px, py, 0, px, py, L.pitch * 0.9);
          rg.addColorStop(0, rgba('#FFF3D1', 0.9 * W)); rg.addColorStop(1, rgba(THEME.gold, 0));
          g.fillStyle = rg; g.fillRect(px - L.pitch, py - L.pitch, L.pitch * 2, L.pitch * 2);
        }
      }
    } else if (ready) {
      const breathe = this.reduced ? 0.7 : 0.55 + 0.45 * Math.sin(now * 0.005);
      g.strokeStyle = rgba(THEME.gold, 0.85 * breathe); g.lineWidth = Math.max(2, L.frame * 0.3); g.lineCap = 'round';
      g.shadowColor = THEME.gold; g.shadowBlur = this.reduced ? 0 : 10;
      const seg = w * 0.12;
      const line = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
      line(x + rr, y, x + rr + seg, y); line(x + w - rr - seg, y, x + w - rr, y);
      line(x + rr, y + w, x + rr + seg, y + w); line(x + w - rr - seg, y + w, x + w - rr, y + w);
      line(x, y + rr, x, y + rr + seg); line(x, y + w - rr - seg, x, y + w - rr);
      line(x + w, y + rr, x + w, y + rr + seg); line(x + w, y + w - rr - seg, x + w, y + w - rr);
    }
    g.restore();
    // Overdrive activation: a bright gold front sweeping the whole perimeter once.
    const ow = this.animator.odWave;
    if (ow && now >= ow.start) {
      const p = Math.min(1, (now - ow.start) / ow.dur);
      g.save();
      g.strokeStyle = rgba('#FFF3D1', 0.9 * (1 - p)); g.lineWidth = Math.max(2, L.frame * 0.5) * (1 + p);
      g.shadowColor = THEME.gold; g.shadowBlur = this.reduced ? 0 : 18;
      const grow = p * L.pitch * 0.4;
      roundRect(g, x - grow, y - grow, w + grow * 2, w + grow * 2, rr + grow); g.stroke();
      g.restore();
    }
  }

  /**
   * Overdrive meter: fills magenta → violet → champagne gold. Ready: full gold with a sheen and READY. Active: the
   * remaining Overdrive placements as gold segments. A held-off game over makes it pulse (OVERDRIVE AVAILABLE).
   */
  private drawOverdrive(now: number, state: GameState) {
    const od = state.od;
    if (!od || state.mode === 'tutorial') return;
    const g = this.g, L = this.layout;
    const R = this.odRect();
    // Build 6: charge still in flight (motes) is shown only when it arrives.
    const target = od.active > 0 ? 0 : Math.max(0, od.charge - this.animator.pendingOd);
    // The meter climbs smoothly to its new value.
    this.odShown = this.reduced ? target : this.odShown + (target - this.odShown) * 0.18;
    if (Math.abs(this.odShown - target) < 0.5 || target < this.odShown - 1) this.odShown = target;
    const fs = Math.round(Math.min(10.5, L.energyH * 0.26));
    g.font = `800 ${fs}px ${FONT}`;
    g.textBaseline = 'middle'; g.textAlign = 'left';
    if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.8px';
    const active = od.active > 0, ready = !active && od.charge >= 100;
    const cy = R.y + R.h / 2;
    const narrow = R.w < 150;
    const label = active ? (narrow ? `×${this.odMult}` : `OVERDRIVE ×${this.odMult}`) : 'OVERDRIVE';
    g.fillStyle = active || ready ? THEME.gold : THEME.textDim;
    g.fillText(label, R.x, cy);
    const lw = g.measureText(label).width + 8;
    if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    const bx = R.x + lw, bw = Math.max(30, R.x + R.w - bx), bh = Math.min(12, L.energyH * 0.3), by = cy - bh / 2;
    // recessed track
    g.fillStyle = '#0A1119'; roundRect(g, bx - 2, by - 2, bw + 4, bh + 4, (bh + 4) / 2); g.fill();
    g.strokeStyle = ready || active ? rgba(THEME.gold, 0.75) : '#3D5466'; g.lineWidth = 1.2;
    roundRect(g, bx - 1.5, by - 1.5, bw + 3, bh + 3, (bh + 3) / 2); g.stroke();
    if (active) {
      const n = Math.max(1, this.odDuration), gap = 3, sw = (bw - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const lit = i < od.active;
        const sx = bx + i * (sw + gap);
        g.save();
        if (lit) { g.shadowColor = THEME.gold; g.shadowBlur = this.reduced ? 0 : 8; }
        const grad = g.createLinearGradient(0, by, 0, by + bh);
        grad.addColorStop(0, lit ? '#FFF3D1' : '#1A2430'); grad.addColorStop(1, lit ? '#C9A055' : '#121C26');
        g.fillStyle = grad; roundRect(g, sx, by, sw, bh, bh / 2); g.fill();
        g.restore();
      }
      return;
    }
    const f = Math.max(0, Math.min(1, this.odShown / 100));
    if (f > 0) {
      g.save();
      roundRect(g, bx, by, Math.max(bh, bw * f), bh, bh / 2); g.clip();
      const grad = g.createLinearGradient(bx, 0, bx + bw, 0);
      if (ready) { grad.addColorStop(0, '#C9A055'); grad.addColorStop(0.5, '#FFF3D1'); grad.addColorStop(1, THEME.gold); }
      else { grad.addColorStop(0, '#D936AD'); grad.addColorStop(0.6, '#8855E8'); grad.addColorStop(1, THEME.gold); }
      g.fillStyle = grad; g.fillRect(bx, by, bw, bh);
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(bx, by + 1, bw, Math.max(1, bh * 0.22));
      if (ready && !this.reduced) {
        const sx = bx + ((now * 0.12) % (bw + 40)) - 20;
        const sh = g.createLinearGradient(sx - 20, 0, sx + 20, 0);
        sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.65)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = sh; g.fillRect(bx, by, bw, bh);
      }
      g.restore();
    }
    if (ready) {
      g.font = `900 ${Math.max(8, bh - 2)}px ${FONT}`; g.textAlign = 'center';
      g.fillStyle = '#2A1C00'; g.fillText('READY', bx + bw / 2, cy + 0.5);
    }
    // Gained-charge pulse, and the held-off game over (OVERDRIVE AVAILABLE) ring.
    const lastHit = this.animator.odArrivals.length ? this.animator.odArrivals[this.animator.odArrivals.length - 1] : -1e9;
    const absorb = now < lastHit + 500 ? 1 - (now - lastHit) / 500 : 0;
    // Near full (80%+): a slow breathing outline says it is almost ready.
    const near = !ready && od.charge >= 80 && !this.reduced ? 0.25 + 0.2 * Math.sin(now * 0.006) : 0;
    const pulse = Math.max(absorb * 0.9, near, now < this.odPulse + 700 && !this.animator.motes.length && absorb === 0 ? 1 - (now - this.odPulse) / 700 : 0);
    const avail = this.odAvailable ? 0.5 + 0.5 * Math.sin(now * 0.008) : 0;
    const a = Math.max(pulse, avail);
    if (a > 0 && !this.reduced) {
      g.save();
      g.strokeStyle = rgba(THEME.gold, a); g.lineWidth = 2; g.shadowColor = THEME.gold; g.shadowBlur = 10;
      roundRect(g, bx - 4, by - 4, bw + 8, bh + 8, (bh + 8) / 2); g.stroke();
      g.restore();
    }
  }

  odMult = 2;

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
    // Build 6: Overdrive charge motes fly from the cleared cells into the meter's fill edge.
    if (state.od) {
      const R = this.odRect();
      const tx = R.x + R.w * 0.35 + R.w * 0.6 * Math.min(1, this.odShown / 100), ty = R.y + R.h / 2;
      for (const m of this.animator.motes) {
        if (now < m.start) continue;
        const p = Math.min(1, (now - m.start) / m.dur);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const from = this.cellXY(m.r, m.c);
        const fx = from.x + L.cell / 2, fy = from.y + L.cell / 2;
        const side = Math.sin(m.seed) * L.pitch * 1.6;
        const mx = (fx + tx) / 2 + side, my = Math.min(fy, ty) - L.pitch * (0.6 + 0.4 * Math.cos(m.seed));
        const x = (1 - e) * (1 - e) * fx + 2 * (1 - e) * e * mx + e * e * tx;
        const y = (1 - e) * (1 - e) * fy + 2 * (1 - e) * e * my + e * e * ty;
        const col = m.gold ? THEME.gold : '#E04BC0';
        const Rr = 3 + 2.5 * (1 - p);
        // short trail
        for (let t = 3; t >= 1; t--) {
          const q = Math.max(0, e - t * 0.04);
          const qx = (1 - q) * (1 - q) * fx + 2 * (1 - q) * q * mx + q * q * tx, qy = (1 - q) * (1 - q) * fy + 2 * (1 - q) * q * my + q * q * ty;
          g.fillStyle = rgba(col, 0.18 * (4 - t) / 3);
          g.beginPath(); g.arc(qx, qy, Rr * (1 - t * 0.2), 0, Math.PI * 2); g.fill();
        }
        const rg = g.createRadialGradient(x, y, 0, x, y, Rr * 2.4);
        rg.addColorStop(0, '#FFFFFF'); rg.addColorStop(0.3, rgba(col, 0.95)); rg.addColorStop(1, rgba(col, 0));
        g.fillStyle = rg; g.fillRect(x - Rr * 2.4, y - Rr * 2.4, Rr * 4.8, Rr * 4.8);
      }
    }
  }

  /** Material for a standard block at (r, c) while a material wave sweeps the board (undefined = current). */
  private matAt(r: number, c: number, now: number): MaterialLook | undefined {
    const w = this.animator.materialWave;
    if (!w) return undefined;
    const p = Math.max(0, (now - w.start) / w.dur);
    const maxD = Math.hypot(4, 4);
    return Math.hypot(r - w.or, c - w.oc) / maxD <= p * 1.1 ? w.to : w.from;
  }

  /** Build 6: when each tray slot last received a new piece (materialise animation). */
  private trayBorn: number[] = [-1e9, -1e9, -1e9];
  private trayFilled = [true, true, true];
  /** Marks a slot as freshly filled when it goes from empty to holding a piece (tray refill). */
  private noteTray(state: GameState, now: number) {
    for (let i = 0; i < 3; i++) {
      const has = !!state.tray[i];
      if (has && !this.trayFilled[i]) this.trayBorn[i] = now;
      this.trayFilled[i] = has;
    }
  }

  private drawPiece(piece: PieceInstance, shape: Shape, cx: number, cy: number, pitch: number, alpha: number, now: number, angle = 0, material?: MaterialLook, extra: { muted?: boolean; od?: boolean; bright?: number; under?: number } = {}) {
    const L = this.layout;
    const gapRatio = L.gap / L.pitch;
    const cell = pitch * (1 - gapRatio);
    const w = shape.cols * pitch, h = shape.rows * pitch;
    const g = this.g;
    if (angle) { g.save(); g.translate(cx, cy); g.rotate(angle); g.translate(-cx, -cy); }
    shape.cells.forEach(([dr, dc], i) => {
      const x = cx - w / 2 + dc * pitch + (pitch - cell) / 2, y = cy - h / 2 + dr * pitch + (pitch - cell) / 2;
      drawBlock(g, x, y, cell, piece.pulseIndex === i, now, this.reduced, { alpha, material, ...extra });
    });
    if (angle) g.restore();
  }

  private drawTray(now: number, state: GameState) {
    const g = this.g;
    this.noteTray(state, now);
    for (let i = 0; i < 3; i++) {
      const r = this.slotRect(i);
      const p = state.tray[i];
      const tutorialHidden = state.mode === 'tutorial' && this.tutorialTarget?.slot !== i;
      const empty = !p || tutorialHidden;
      if (blockStyle() === 'b8') paintPlatform8(g, r.x, r.y, r.w, r.h, empty ? 0 : 1);
      else if (blockStyle() === 'b6') paintPedestal(g, r.x, r.y, r.w, r.h, empty ? 0 : 1);
      else paintFrame(g, r.x, r.y, r.w, r.h, 14, 4, false);
      if (empty) {
        // a faint dashed socket marks an empty slot
        g.strokeStyle = rgba(THEME.gridBorder, 0.6); g.lineWidth = 1; g.setLineDash([4, 5]);
        roundRect(g, r.x + 12, r.y + 12, r.w - 24, r.h - 24, 10); g.stroke(); g.setLineDash([]);
        continue;
      }
      if (this.drag?.slot === i || this.returning?.slot === i) continue;
      const shape = shapeOf(p!);
      const eff = this.effective(state);
      const play = this.animator.busy ? 'now' : playability(eff.rc, state.board, p!, eff.energy);
      // Build 6: unavailable pieces keep their material but are muted, not see-through.
      const alpha = play === 'now' ? 1 : play === 'after-rotation' ? 0.78 : 0.62;
      const muted = play !== 'now';
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
      // new pieces materialise: a short rise and brighten after the tray refills
      const born = this.trayBorn[i];
      const mt = this.reduced ? 1 : Math.min(1, (now - born) / 260);
      const odOn = !!state.od && state.od.active > 0;
      this.drawPiece(p!, shape, c.x, c.y + (1 - mt) * 8, this.trayCellFor(shape), alpha * (0.2 + 0.8 * mt), now, angle, trayMat, { muted, od: odOn, bright: (1 - mt) * 0.6, under: play === 'now' ? 0.18 : 0 });
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
      // Build 6 selected/dragged: lifted, brighter, with light under each crystal.
      const sel = this.reduced ? 1 : Math.min(1, (now - d.start) / 110);
      const st = this.getState();
      this.drawPiece(d.piece, d.shape, d.x, d.y - d.lift * s, pitch, 1, now, 0, undefined, { bright: 0.18 * sel, under: 0.5 * sel, od: !!st.od && st.od.active > 0 });
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
