// Block drawing: soft rounded tiles with gentle depth, cached as sprites per colour and size
// so a full board costs 64 drawImage calls a frame.

import { THEME, rgba, shade } from './theme';

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

const cache = new Map<string, HTMLCanvasElement>();
let dpr = 1;
let highContrast = false;

export function setRenderScale(scale: number) { if (scale !== dpr) { dpr = scale; cache.clear(); } }
export function setHighContrast(on: boolean) { if (on !== highContrast) { highContrast = on; cache.clear(); } }

/** Paints one block tile filling (0,0)-(s,s). `pulse` paints the white/cyan Pulse body (the core is drawn live). */
function paintBlock(g: CanvasRenderingContext2D, s: number, color: string, pulse: boolean) {
  const r = s * 0.17;
  const depth = Math.max(1.5, s * 0.07);
  const top = pulse ? THEME.pulseWhite : color;
  // Depth: a darker base peeking out below the face.
  g.fillStyle = pulse ? '#0EA5C6' : shade(color, -0.38);
  roundRect(g, 0, depth * 0.4, s, s - depth * 0.4, r); g.fill();
  // Face.
  const face = g.createLinearGradient(0, 0, 0, s - depth);
  if (pulse) {
    face.addColorStop(0, '#FFFFFF'); face.addColorStop(0.55, '#BFF6FF'); face.addColorStop(1, '#5FE3FA');
  } else {
    face.addColorStop(0, shade(top, 0.2)); face.addColorStop(0.5, top); face.addColorStop(1, shade(top, -0.1));
  }
  g.fillStyle = face;
  roundRect(g, 0, 0, s, s - depth, r); g.fill();
  // Soft top highlight.
  const hi = g.createLinearGradient(0, 0, 0, s * 0.5);
  hi.addColorStop(0, 'rgba(255,255,255,0.38)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  roundRect(g, s * 0.08, s * 0.06, s * 0.84, s * 0.4, r * 0.8); g.fill();
  // Outline for clean separation (stronger in high contrast).
  g.lineWidth = highContrast ? Math.max(2, s * 0.06) : Math.max(1, s * 0.025);
  g.strokeStyle = highContrast ? '#0B1020' : rgba('#000000', 0.22);
  roundRect(g, g.lineWidth / 2, g.lineWidth / 2, s - g.lineWidth, s - depth * 0.6, r); g.stroke();
}

function sprite(color: string, size: number, pulse: boolean): HTMLCanvasElement {
  const key = `${color}|${Math.round(size * 4)}|${pulse ? 1 : 0}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    const px = Math.ceil(size * dpr);
    c.width = px; c.height = px;
    const g = c.getContext('2d')!;
    g.scale(px / size, px / size);
    paintBlock(g, size, color, pulse);
    cache.set(key, c);
  }
  return c;
}

/** Draws a block at (x,y) with size s. scale/alpha are for animation. */
export function drawBlock(g: CanvasRenderingContext2D, x: number, y: number, s: number, colorIdx: number, pulse = false, scale = 1, alpha = 1, t = 0, reduced = false) {
  if (scale <= 0 || alpha <= 0) return;
  const color = THEME.blocks[colorIdx % THEME.blocks.length];
  const ss = s * scale;
  const ox = x + (s - ss) / 2, oy = y + (s - ss) / 2;
  if (alpha < 1) g.globalAlpha = alpha;
  g.drawImage(sprite(color, s, pulse), ox, oy, ss, ss);
  if (pulse) drawPulseCore(g, ox, oy, ss, t, reduced);
  if (alpha < 1) g.globalAlpha = 1;
}

/** The energy core: a diamond (shape, not just colour, identifies a Pulse Block) that gently breathes. */
export function drawPulseCore(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, reduced = false) {
  const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.0032);
  const cx = x + s / 2, cy = y + s / 2 - s * 0.03;
  const d = s * (0.2 + 0.025 * breathe);
  // glow
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, s * 0.48);
  glow.addColorStop(0, `rgba(34,228,255,${0.35 + 0.25 * breathe})`); glow.addColorStop(1, 'rgba(34,228,255,0)');
  g.fillStyle = glow; g.fillRect(x, y, s, s);
  // diamond: dark rim for contrast, cyan fill, white heart
  const diamond = (k: number) => { g.beginPath(); g.moveTo(cx, cy - d * k); g.lineTo(cx + d * k, cy); g.lineTo(cx, cy + d * k); g.lineTo(cx - d * k, cy); g.closePath(); };
  g.fillStyle = '#075E77'; diamond(1.22); g.fill();
  g.fillStyle = THEME.pulseCyan; diamond(1); g.fill();
  g.fillStyle = `rgba(255,255,255,${0.75 + 0.25 * breathe})`; diamond(0.45); g.fill();
}

export function drawEmptyCell(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = THEME.empty;
  roundRect(g, x, y, s, s, s * 0.17); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.12)';
  roundRect(g, x, y + s * 0.6, s, s * 0.4, s * 0.17); g.fill();
}
