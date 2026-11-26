// A game's name with the Cnmbuck Orb as its letter O.
// Copied unchanged from cnmbuck1/cnmbuckstudios-brand examples/orb-wordmark.ts (drawOrbWordmark only),
// with the import path pointed at this game's copy of the kit.
import { drawOrbIcon } from './cnmbuck-orb';

/**
 * Draw `before` + Orb + `after` centred at (cx, cy). `fs` is the font size in pixels.
 * Gravitor's launch image: drawOrbWordmark(g, 'GRAVIT', 'R', size / 2, size / 2, size * 0.05) on a 2732 square.
 */
export function drawOrbWordmark(g: CanvasRenderingContext2D, before: string, after: string, cx: number, cy: number, fs: number) {
  g.save();
  g.font = `800 ${fs}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  g.textBaseline = 'middle';
  const spacing = fs * 0.12;
  const measure = (s: string) => [...s].reduce((w, ch) => w + g.measureText(ch).width + spacing, 0);
  const orbBox = fs * 1.5; // drawOrbIcon fills ~0.76 of its box with the ball and glow
  const orbW = orbBox * 0.8;
  const total = measure(before) + orbW + measure(after) - spacing;
  let x = cx - total / 2;
  const text = (s: string) => {
    for (const ch of s) {
      g.shadowColor = '#0a8cff'; g.shadowBlur = fs * 0.35;
      g.fillStyle = '#eaf6ff'; g.fillText(ch, x, cy);
      g.shadowBlur = 0;
      x += g.measureText(ch).width + spacing;
    }
  };
  text(before);
  drawOrbIcon(g, orbBox, x + orbW / 2 - orbBox / 2, cy - orbBox / 2);
  x += orbW + spacing;
  text(after);
  g.restore();
}
