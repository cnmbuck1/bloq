// Canvas art outside gameplay: the BLOQ wordmark, the home screen's animated blocks,
// the splash, and the shareable results card. All generated locally.

import { drawOrbIcon } from '../brand/cnmbuck-orb';
import { drawOrbWordmark } from '../brand/orb-wordmark';
import { drawBlock, roundRect, setRenderScale } from '../render/blocks';
import { THEME } from '../render/theme';

function fit(canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(1, r.width), h = Math.max(1, r.height);
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  setRenderScale(dpr);
  return { g, w, h };
}

/** BL(O)Q with the Cnmbuck Orb as the O (studio wordmark helper), plus a row of block-colour ticks beneath. */
export function drawLogo(g: CanvasRenderingContext2D, cx: number, cy: number, fs: number) {
  drawOrbWordmark(g, 'BL', 'Q', cx, cy, fs);
  const s = fs * 0.16, gap = s * 0.35;
  const total = THEME.blocks.length * s + (THEME.blocks.length - 1) * gap;
  THEME.blocks.forEach((col, i) => {
    g.fillStyle = col;
    roundRect(g, cx - total / 2 + i * (s + gap), cy + fs * 0.72, s, s, s * 0.25); g.fill();
  });
}

export function paintLogoCanvas(canvas: HTMLCanvasElement) {
  const { g, w, h } = fit(canvas);
  g.clearRect(0, 0, w, h);
  drawLogo(g, w / 2, h * 0.42, Math.min(h * 0.6, w * 0.22));
}

// A small arrangement that gently builds, glows and clears on a loop: a hint of what the game feels like.
const ART = [
  '..0001..',
  '.22P11..',
  '.2.334..',
  '...3P44.',
];

export function paintHomeArt(canvas: HTMLCanvasElement, t: number, reduced: boolean) {
  const { g, w, h } = fit(canvas);
  g.clearRect(0, 0, w, h);
  const cols = 8, rows = ART.length;
  const pitch = Math.min(w / (cols + 0.5), h / (rows + 0.6));
  const cell = pitch * 0.9;
  const ox = (w - cols * pitch) / 2, oy = (h - rows * pitch) / 2;
  const cycle = 4200;
  const phase = reduced ? 0.5 : (t % cycle) / cycle;
  ART.forEach((line, r) => [...line].forEach((ch, c) => {
    const x = ox + c * pitch, y = oy + r * pitch;
    g.fillStyle = THEME.empty;
    g.globalAlpha = 0.45;
    roundRect(g, x, y, cell, cell, cell * 0.17); g.fill();
    g.globalAlpha = 1;
    if (ch === '.') return;
    const wave = reduced ? 0 : Math.sin(phase * Math.PI * 2 - (c + r) * 0.55);
    const bob = reduced ? 0 : wave * pitch * 0.05;
    if (ch === 'P') drawBlock(g, x, y + bob, cell, 0, true, 1, 1, t, reduced);
    else drawBlock(g, x, y + bob, cell, Number(ch), false, 1, 1, t, reduced);
  }));
}

export function paintSplash(canvas: HTMLCanvasElement) {
  const { g, w, h } = fit(canvas);
  g.fillStyle = THEME.bg; g.fillRect(0, 0, w, h);
  const size = Math.min(w, h) * 0.34;
  drawOrbIcon(g, size, w / 2 - size / 2, h / 2 - size * 0.75);
  g.fillStyle = '#EAF2FF';
  g.font = `700 ${Math.round(size * 0.13)}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const label = 'CNMBUCK STUDIOS';
  // letter-spaced
  const sp = size * 0.03;
  const width = [...label].reduce((a, ch) => a + g.measureText(ch).width + sp, -sp);
  let x = w / 2 - width / 2;
  g.textAlign = 'left';
  for (const ch of label) { g.fillText(ch, x, h / 2 + size * 0.45); x += g.measureText(ch).width + sp; }
}

export interface ShareInfo { score: number; best: number; combo: number; chain: number; lines: number; newRecord: boolean }

/** 1080×1350 results card (Instagram portrait). */
export function renderShareCard(info: ShareInfo): HTMLCanvasElement {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  setRenderScale(1);
  g.fillStyle = THEME.bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.7);
  glow.addColorStop(0, 'rgba(66,181,245,0.18)'); glow.addColorStop(1, 'rgba(20,28,46,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);

  // scattered blocks along the top and bottom edges
  const deco = [[0, 0, 0], [1, 0, 1], [0, 1, 2], [7, 0, 3], [8, 0, 4], [8, 1, 0], [0, 11.6, 4], [1, 11.6, 3], [8, 11.6, 1], [7, 11.6, 2], [8, 10.6, 0]];
  for (const [cx, cy, col] of deco) drawBlock(g, 40 + cx * 116, 30 + cy * 105, 100, col, false, 1, 0.9);
  drawBlock(g, 40 + 1 * 116, 30 + 1 * 105, 100, 0, true, 1, 1, 0, true);

  drawLogo(g, W / 2, 300, 150);

  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = THEME.textDim;
  g.font = '700 40px -apple-system, "Helvetica Neue", Arial, sans-serif';
  g.fillText(info.newRecord ? 'NEW PERSONAL BEST' : 'SCORE', W / 2, 520);
  g.fillStyle = '#FFFFFF';
  g.font = '900 190px -apple-system, "Helvetica Neue", Arial, sans-serif';
  g.fillText(info.score.toLocaleString('en-US'), W / 2, 650);

  const stat = (label: string, value: string, x: number) => {
    g.fillStyle = '#1E2940';
    roundRect(g, x - 220, 790, 440, 190, 36); g.fill();
    g.fillStyle = THEME.textDim; g.font = '700 32px -apple-system, "Helvetica Neue", Arial, sans-serif';
    g.fillText(label, x, 840);
    g.fillStyle = '#FFFFFF'; g.font = '800 76px -apple-system, "Helvetica Neue", Arial, sans-serif';
    g.fillText(value, x, 920);
  };
  stat('BEST COMBO', `×${info.combo}`, W / 2 - 240);
  stat('BIGGEST CHAIN', `×${info.chain}`, W / 2 + 240);

  g.fillStyle = '#FFFFFF';
  g.font = '800 58px -apple-system, "Helvetica Neue", Arial, sans-serif';
  g.fillText('Can you beat my score?', W / 2, 1080);

  drawOrbIcon(g, 70, W / 2 - 190, 1155);
  g.fillStyle = THEME.textDim; g.textAlign = 'left';
  g.font = '700 34px -apple-system, "Helvetica Neue", Arial, sans-serif';
  g.fillText('CNMBUCK STUDIOS', W / 2 - 112, 1191);
  return c;
}

/** App icon (opaque, square): the Orb as hero on BLOQ navy, sitting in a corner of blocks. */
export function renderAppIcon(size = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  setRenderScale(1);
  g.fillStyle = THEME.bg; g.fillRect(0, 0, size, size);
  const glow = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.6);
  glow.addColorStop(0, 'rgba(66,181,245,0.22)'); glow.addColorStop(1, 'rgba(20,28,46,0)');
  g.fillStyle = glow; g.fillRect(0, 0, size, size);
  const cell = size * 0.2, pitch = size * 0.22, o = size * 0.06;
  const blocks: [number, number, number][] = [[0, 0, 0], [1, 0, 1], [0, 1, 2], [3, 3, 3], [3, 4, 4], [4, 3, 0], [4, 4, 1]];
  for (const [r, cc, col] of blocks) drawBlock(g, o + cc * pitch, o + r * pitch, cell, col, false, 1, 0.95);
  drawOrbIcon(g, size * 0.78, size * 0.11, size * 0.11);
  return c;
}

/** Launch screen (square, centre-safe): BL(O)Q wordmark on navy. */
export function renderLaunch(size = 2732): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  setRenderScale(1);
  g.fillStyle = THEME.bg; g.fillRect(0, 0, size, size);
  drawLogo(g, size / 2, size / 2, size * 0.06);
  return c;
}
