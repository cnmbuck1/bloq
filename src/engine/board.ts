// Board state, placement validation, line detection and game-over detection.
// Boards are plain arrays so they copy, compare and save trivially.

import { orientedShape, pieceDef, PIECES, type PieceDef, type Shape } from './pieces';

export interface Cell {
  /** Colour index (cosmetic only; colour never changes the rules). */
  color: number;
  /** True for a dormant Pulse Block. */
  pulse?: boolean;
}

export interface Board {
  size: number;
  /** Row-major, length size*size. null = empty. */
  cells: (Cell | null)[];
}

/** A piece waiting in the tray. */
export interface PieceInstance {
  defId: string;
  /** Kept for save compatibility; Build 2 draws every standard block in one material. */
  color: number;
  /** Index into the definition's cells that holds the Pulse Block, or -1. */
  pulseIndex: number;
  /** Clockwise quarter turns applied by the player (0-3). Missing = 0 (Build 1 saves). */
  rot?: number;
}

/** The cells of a tray piece in its current orientation. */
export function shapeOf(inst: PieceInstance): Shape {
  return orientedShape(pieceDef(inst.defId), inst.rot ?? 0);
}

export const idx = (b: Board, r: number, c: number) => r * b.size + c;

export function emptyBoard(size = 8): Board {
  return { size, cells: new Array(size * size).fill(null) };
}

export function cloneBoard(b: Board): Board {
  return { size: b.size, cells: b.cells.map((c) => (c ? { ...c } : null)) };
}

/** True when every block of `piece` lands inside the board on an empty cell. */
export function canPlace(b: Board, piece: Shape, row: number, col: number): boolean {
  for (const [dr, dc] of piece.cells) {
    const r = row + dr, c = col + dc;
    if (r < 0 || c < 0 || r >= b.size || c >= b.size) return false;
    if (b.cells[idx(b, r, c)]) return false;
  }
  return true;
}

/** Can this piece go anywhere on the board? */
export function fitsAnywhere(b: Board, piece: Shape): boolean {
  for (let r = 0; r <= b.size - piece.rows; r++) {
    for (let c = 0; c <= b.size - piece.cols; c++) {
      if (canPlace(b, piece, r, c)) return true;
    }
  }
  return false;
}

/** Every legal position for a piece (used by tests, the dev tools and future hint/AI work). */
export function legalPositions(b: Board, piece: Shape): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r <= b.size - piece.rows; r++) {
    for (let c = 0; c <= b.size - piece.cols; c++) if (canPlace(b, piece, r, c)) out.push([r, c]);
  }
  return out;
}

/** Writes the piece into a copy of the board. Caller must check canPlace first. */
export function placePiece(b: Board, inst: PieceInstance, row: number, col: number): { board: Board; placed: number[] } {
  const piece = shapeOf(inst);
  const board = cloneBoard(b);
  const placed: number[] = [];
  piece.cells.forEach(([dr, dc], i) => {
    const k = idx(board, row + dr, col + dc);
    board.cells[k] = inst.pulseIndex === i ? { color: inst.color, pulse: true } : { color: inst.color };
    placed.push(k);
  });
  return { board, placed };
}

/** Full rows and columns. */
export function findCompletedLines(b: Board): { rows: number[]; cols: number[] } {
  const rows: number[] = [], cols: number[] = [];
  for (let r = 0; r < b.size; r++) {
    let full = true;
    for (let c = 0; c < b.size && full; c++) full = !!b.cells[idx(b, r, c)];
    if (full) rows.push(r);
  }
  for (let c = 0; c < b.size; c++) {
    let full = true;
    for (let r = 0; r < b.size && full; r++) full = !!b.cells[idx(b, r, c)];
    if (full) cols.push(c);
  }
  return { rows, cols };
}

/** Cell indices in the given rows and columns, each counted once (intersections included once). */
export function lineCells(b: Board, rows: number[], cols: number[]): number[] {
  const set = new Set<number>();
  for (const r of rows) for (let c = 0; c < b.size; c++) set.add(idx(b, r, c));
  for (const c of cols) for (let r = 0; r < b.size; r++) set.add(idx(b, r, c));
  return [...set].sort((a, z) => a - z);
}

/** Rows/columns this placement would complete (for the drag preview). Assumes the placement is legal. */
export function previewLines(b: Board, piece: Shape, row: number, col: number): { rows: number[]; cols: number[] } {
  const filled = new Set<number>();
  for (const [dr, dc] of piece.cells) filled.add(idx(b, row + dr, col + dc));
  const occ = (r: number, c: number) => !!b.cells[idx(b, r, c)] || filled.has(idx(b, r, c));
  const rows: number[] = [], cols: number[] = [];
  const touchedRows = new Set(piece.cells.map(([dr]) => row + dr));
  const touchedCols = new Set(piece.cells.map(([, dc]) => col + dc));
  for (const r of touchedRows) {
    let full = true;
    for (let c = 0; c < b.size && full; c++) full = occ(r, c);
    if (full) rows.push(r);
  }
  for (const c of touchedCols) {
    let full = true;
    for (let r = 0; r < b.size && full; r++) full = occ(r, c);
    if (full) cols.push(c);
  }
  return { rows: rows.sort((a, z) => a - z), cols: cols.sort((a, z) => a - z) };
}

/**
 * Game over without rotation: no remaining tray piece fits at any position in its current orientation.
 * Rotation-aware game over lives in rotation.ts (isGameOverWithRotation). An empty tray is never game over.
 */
export function isGameOver(b: Board, tray: (PieceInstance | null)[]): boolean {
  const remaining = tray.filter((p): p is PieceInstance => !!p);
  if (remaining.length === 0) return false;
  return !remaining.some((p) => fitsAnywhere(b, shapeOf(p)));
}

/** Library pieces that fit somewhere on the board. */
export function fittingPieces(b: Board, library: readonly PieceDef[] = PIECES): PieceDef[] {
  return library.filter((p) => fitsAnywhere(b, p));
}
