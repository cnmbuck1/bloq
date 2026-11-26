// Piece definitions. Every orientation is its own definition (pieces don't rotate in Build 1).
// Shapes are drawn as rows of text: X = block, . = gap. Add or retune pieces here only.

export type PieceCategory =
  | 'single' | 'line2' | 'line3' | 'line4' | 'line5'
  | 'square2' | 'square3' | 'smallL' | 'bigL' | 't' | 'sz';

export interface PieceDef {
  id: string;
  category: PieceCategory;
  /** Base weight before difficulty tiers and repetition control. */
  weight: number;
  /** [row, col] offsets from the piece's top-left. */
  cells: ReadonlyArray<readonly [number, number]>;
  rows: number;
  cols: number;
}

function def(id: string, category: PieceCategory, weight: number, art: string[]): PieceDef {
  const cells: [number, number][] = [];
  art.forEach((line, r) => [...line].forEach((ch, c) => { if (ch === 'X') cells.push([r, c]); }));
  return { id, category, weight, cells, rows: art.length, cols: Math.max(...art.map((l) => l.length)) };
}

export const PIECES: readonly PieceDef[] = [
  def('single', 'single', 4, ['X']),

  def('i2h', 'line2', 4, ['XX']),
  def('i2v', 'line2', 4, ['X', 'X']),
  def('i3h', 'line3', 4, ['XXX']),
  def('i3v', 'line3', 4, ['X', 'X', 'X']),
  def('i4h', 'line4', 3.5, ['XXXX']),
  def('i4v', 'line4', 3.5, ['X', 'X', 'X', 'X']),
  def('i5h', 'line5', 2.5, ['XXXXX']),
  def('i5v', 'line5', 2.5, ['X', 'X', 'X', 'X', 'X']),

  def('o2', 'square2', 5, ['XX', 'XX']),
  def('o3', 'square3', 2.5, ['XXX', 'XXX', 'XXX']),

  def('l3a', 'smallL', 2, ['X.', 'XX']),
  def('l3b', 'smallL', 2, ['.X', 'XX']),
  def('l3c', 'smallL', 2, ['XX', 'X.']),
  def('l3d', 'smallL', 2, ['XX', '.X']),

  def('l5a', 'bigL', 1.4, ['X..', 'X..', 'XXX']),
  def('l5b', 'bigL', 1.4, ['..X', '..X', 'XXX']),
  def('l5c', 'bigL', 1.4, ['XXX', 'X..', 'X..']),
  def('l5d', 'bigL', 1.4, ['XXX', '..X', '..X']),

  def('tu', 't', 1.6, ['XXX', '.X.']),
  def('td', 't', 1.6, ['.X.', 'XXX']),
  def('tl', 't', 1.6, ['X.', 'XX', 'X.']),
  def('tr', 't', 1.6, ['.X', 'XX', '.X']),

  def('sh', 'sz', 1.5, ['.XX', 'XX.']),
  def('sv', 'sz', 1.5, ['X.', 'XX', '.X']),
  def('zh', 'sz', 1.5, ['XX.', '.XX']),
  def('zv', 'sz', 1.5, ['.X', 'XX', 'X.']),
];

const BY_ID = new Map(PIECES.map((p) => [p.id, p]));

export function pieceDef(id: string): PieceDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown piece: ${id}`);
  return d;
}
