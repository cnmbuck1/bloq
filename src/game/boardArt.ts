// Build boards from text, for the tutorial, test scenarios and unit tests.
//   .  empty      X  block      P  pulse block      0-4  block of that colour

import { emptyBoard, type Board } from '../engine/board';

export function boardFromArt(art: string[], defaultColor = 0): Board {
  const size = art.length;
  const b = emptyBoard(size);
  art.forEach((line, r) => {
    if (line.length !== size) throw new Error(`Row ${r} has ${line.length} cells, expected ${size}`);
    [...line].forEach((ch, c) => {
      const k = r * size + c;
      if (ch === 'X') b.cells[k] = { color: (defaultColor + r + c) % 5 };
      else if (ch === 'P') b.cells[k] = { color: (defaultColor + r + c) % 5, pulse: true };
      else if (ch >= '0' && ch <= '4') b.cells[k] = { color: Number(ch) };
    });
  });
  return b;
}

export function boardToArt(b: Board): string[] {
  const out: string[] = [];
  for (let r = 0; r < b.size; r++) {
    let line = '';
    for (let c = 0; c < b.size; c++) {
      const cell = b.cells[r * b.size + c];
      line += !cell ? '.' : cell.pulse ? 'P' : 'X';
    }
    out.push(line);
  }
  return out;
}
