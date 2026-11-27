// Canvas art outside gameplay: the BLOQ wordmark, the home screen's animated blocks, the splash,
// the shareable results card and the app icon / launch art. All generated locally.

import { drawOrbIcon } from '../brand/cnmbuck-orb';
import { drawBlock, paintFrame, roundRect, setRenderScale, type MaterialLook } from '../render/blocks';

const MAGENTA_LOOK: MaterialLook = { id: 'magenta', color: '#D936AD', highlight: '#FF9BEA', shadow: '#64164F' };
import { THEME, rgba } from '../render/theme';

const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

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

/** The O: an illuminated energy ring around a small diamond core (the Pulse, abstracted). */
export function drawEnergyO(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, t = 0, glow = true) {
  const sw = R * 0.36;
  const breathe = 0.5 + 0.5 * Math.sin(t * 0.0025);
  g.save();
  // machined outer bezel
  g.lineWidth = sw + R * 0.1;
  g.strokeStyle = '#1E2C39';
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  // lit ring
  const ring = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  ring.addColorStop(0, THEME.pulseCore); ring.addColorStop(0.45, THEME.pulse); ring.addColorStop(1, '#1E8C99');
  if (glow) { g.shadowColor = THEME.pulse; g.shadowBlur = R * (0.5 + 0.2 * breathe); }
  g.lineWidth = sw * 0.62;
  g.strokeStyle = ring;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.shadowBlur = 0;
  // specular glint on the ring
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = sw * 0.14; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
  // diamond core
  const d = R * 0.3;
  if (glow) { g.shadowColor = THEME.pulse; g.shadowBlur = R * 0.4; }
  g.fillStyle = THEME.pulseCore;
  g.beginPath(); g.moveTo(cx, cy - d); g.lineTo(cx + d, cy); g.lineTo(cx, cy + d); g.lineTo(cx - d, cy); g.closePath(); g.fill();
  g.restore();
}

/** BLOQ wordmark: heavy machined-metal letters with the energy ring as the O. */
export function drawLogo(g: CanvasRenderingContext2D, cx: number, cy: number, fs: number, t = 0) {
  g.save();
  g.font = `900 ${fs}px ${FONT}`;
  g.textBaseline = 'alphabetic';
  const spacing = fs * 0.06;
  const capH = fs * 0.72;
  const baseY = cy + capH / 2;
  const R = capH * 0.47;
  const wB = g.measureText('B').width, wL = g.measureText('L').width, wQ = g.measureText('Q').width;
  const wO = R * 2 + capH * 0.16;
  const total = wB + wL + wO + wQ + spacing * 3;
  let x = cx - total / 2;
  const metal = g.createLinearGradient(0, cy - capH / 2, 0, cy + capH / 2);
  metal.addColorStop(0, '#F4FAFF'); metal.addColorStop(0.45, '#C3D6E2'); metal.addColorStop(0.55, '#8EA7B8'); metal.addColorStop(1, '#C9DAE5');
  const letter = (ch: string, w: number) => {
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = fs * 0.06; g.shadowOffsetY = fs * 0.03;
    g.fillStyle = metal; g.fillText(ch, x, baseY);
    g.shadowColor = 'transparent';
    g.lineWidth = Math.max(1, fs * 0.012); g.strokeStyle = 'rgba(12,19,29,0.55)'; g.strokeText(ch, x, baseY);
    x += w + spacing;
  };
  letter('B', wB);
  letter('L', wL);
  drawEnergyO(g, x + wO / 2, cy, R, t);
  x += wO + spacing;
  letter('Q', wQ);
  g.restore();
}

export function paintLogoCanvas(canvas: HTMLCanvasElement, t = 0) {
  const { g, w, h } = fit(canvas);
  g.clearRect(0, 0, w, h);
  drawLogo(g, w / 2, h / 2, Math.min(h * 0.78, w * 0.2), t);
}

// A small machined arrangement: blocks in the current material around a Pulse, with a slow scan of light and,
// every few seconds, a restrained Pulse discharge.
const ART = [
  '..XXX...',
  '.XXPX.X.',
  '...XXXX.',
  '..X.X...',
];

export function paintHomeArt(canvas: HTMLCanvasElement, t: number, reduced: boolean) {
  const { g, w, h } = fit(canvas);
  g.clearRect(0, 0, w, h);
  const cols = 8, rows = ART.length;
  const pitch = Math.min(w / (cols + 0.6), h / (rows + 0.6));
  const cell = pitch * 0.9;
  const ox = (w - cols * pitch) / 2, oy = (h - rows * pitch) / 2;
  const scan = reduced ? -10 : ((t % 5200) / 5200) * (cols + rows + 6) - 3;
  ART.forEach((line, r) => [...line].forEach((ch, c) => {
    const x = ox + c * pitch + (pitch - cell) / 2, y = oy + r * pitch + (pitch - cell) / 2;
    g.fillStyle = rgba(THEME.empty, 0.55);
    roundRect(g, x, y, cell, cell, cell * 0.14); g.fill();
    if (ch === '.') return;
    const near = Math.max(0, 1 - Math.abs(c + r - scan) / 1.6);
    drawBlock(g, x, y, cell, ch === 'P', t, reduced, { bright: near * 0.35 });
  }));
  if (reduced) return;
  // Pulse discharge: a cyan ring spreading over the 3x3 around the Pulse, once every 6.5 s.
  const phase = (t % 6500) / 6500;
  if (phase < 0.12) {
    const p = phase / 0.12;
    const pr = ART.findIndex((l) => l.includes('P')), pc = ART[pr].indexOf('P');
    const cx = ox + pc * pitch + pitch / 2, cy = oy + pr * pitch + pitch / 2;
    g.save();
    g.strokeStyle = rgba(THEME.pulse, 0.7 * (1 - p)); g.lineWidth = 2 + 3 * (1 - p);
    g.shadowColor = THEME.pulse; g.shadowBlur = 14;
    roundRect(g, cx - pitch * 1.5 * p, cy - pitch * 1.5 * p, pitch * 3 * p, pitch * 3 * p, pitch * 0.3 * p); g.stroke();
    g.restore();
  }
}

/** Materials menu preview: a 2×2 cluster in one material (locked ones are dimmed by the caller). */
export function paintMaterialSwatch(canvas: HTMLCanvasElement, m: MaterialLook, locked: boolean) {
  const { g, w, h } = fit(canvas);
  g.clearRect(0, 0, w, h);
  const pitch = Math.min(w, h) / 2.15, cell = pitch * 0.9;
  const ox = (w - pitch * 2) / 2, oy = (h - pitch * 2) / 2;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    drawBlock(g, ox + c * pitch + (pitch - cell) / 2, oy + r * pitch + (pitch - cell) / 2, cell, false, 0, true, { material: m, alpha: locked ? 0.35 : 1 });
  }
  if (locked) {
    // a small padlock over the swatch
    const cx = w / 2, cy = h / 2 + 2, s = Math.min(w, h) * 0.2;
    g.fillStyle = 'rgba(12,19,29,0.85)'; roundRect(g, cx - s, cy - s * 0.4, s * 2, s * 1.5, s * 0.3); g.fill();
    g.strokeStyle = THEME.textDim; g.lineWidth = Math.max(2, s * 0.25);
    g.beginPath(); g.arc(cx, cy - s * 0.4, s * 0.6, Math.PI, 0); g.stroke();
    g.fillStyle = THEME.textDim; g.beginPath(); g.arc(cx, cy + s * 0.3, s * 0.22, 0, Math.PI * 2); g.fill();
  }
}

export function paintSplash(canvas: HTMLCanvasElement) {
  const { g, w, h } = fit(canvas);
  g.fillStyle = THEME.bg; g.fillRect(0, 0, w, h);
  const size = Math.min(w, h) * 0.34;
  drawOrbIcon(g, size, w / 2 - size / 2, h / 2 - size * 0.75);
  g.fillStyle = THEME.text;
  g.font = `700 ${Math.round(size * 0.13)}px ${FONT}`;
  g.textBaseline = 'middle';
  const label = 'CNMBUCK STUDIOS';
  const sp = size * 0.03;
  const width = [...label].reduce((a, ch) => a + g.measureText(ch).width + sp, -sp);
  let x = w / 2 - width / 2;
  g.textAlign = 'left';
  for (const ch of label) { g.fillText(ch, x, h / 2 + size * 0.45); x += g.measureText(ch).width + sp; }
}

export interface ShareInfo {
  score: number; best: number; combo: number; chain: number; lines: number; newRecord: boolean;
  /** Build 3 */
  level: number; title: string; material: MaterialLook; message: string;
}

function background(g: CanvasRenderingContext2D, W: number, H: number) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, THEME.bg2); bg.addColorStop(1, THEME.bg);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, W * 0.75);
  glow.addColorStop(0, 'rgba(89,221,235,0.09)'); glow.addColorStop(1, 'rgba(89,221,235,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
}

/** 1080×1350 results card (Instagram portrait). */
export function renderShareCard(info: ShareInfo): HTMLCanvasElement {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  setRenderScale(1);
  background(g, W, H);

  // A fragment of board in the top corners: machined blocks and a Pulse.
  const frag = (x0: number, y0: number, art: string[]) => art.forEach((line, r) => [...line].forEach((ch, col) => {
    if (ch !== '.') drawBlock(g, x0 + col * 92, y0 + r * 92, 82, ch === 'P', 0, true, { alpha: 0.9, material: info.material });
  }));
  frag(48, 48, ['XX', 'XP']);
  frag(W - 48 - 174, 48, ['XX', '.X']);
  frag(48, H - 48 - 82, ['XX']);
  frag(W - 48 - 174, H - 48 - 82, ['PX']);

  drawLogo(g, W / 2, 270, 170);

  // Material glow behind the panel: the player's current material carries the card's colour.
  const mg = g.createRadialGradient(W / 2, 730, 0, W / 2, 730, 560);
  mg.addColorStop(0, rgba(info.material.color, 0.22)); mg.addColorStop(1, rgba(info.material.color, 0));
  g.fillStyle = mg; g.fillRect(0, 300, W, 900);

  paintFrame(g, 110, 400, W - 220, 640, 40, 14, true);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = info.newRecord ? THEME.gold : THEME.textDim;
  g.font = `700 36px ${FONT}`;
  g.fillText(info.newRecord ? 'NEW PERSONAL BEST' : 'FINAL SCORE', W / 2, 480);
  g.fillStyle = THEME.text;
  g.font = `900 160px ${FONT}`;
  g.fillText(info.score.toLocaleString('en-US'), W / 2, 595);
  // Level reached, in champagne gold, with a material bar.
  g.fillStyle = THEME.gold; g.font = `800 40px ${FONT}`;
  g.fillText(`LEVEL ${info.level} — ${info.title.toUpperCase()}`, W / 2, 705);
  const bar = g.createLinearGradient(0, 735, 0, 751);
  bar.addColorStop(0, info.material.highlight); bar.addColorStop(0.55, info.material.color); bar.addColorStop(1, info.material.shadow);
  g.fillStyle = bar; roundRect(g, W / 2 - 220, 735, 440, 14, 7); g.fill();

  const stat = (label: string, value: string, x: number) => {
    g.fillStyle = 'rgba(28,42,56,0.9)';
    roundRect(g, x - 190, 800, 380, 190, 30); g.fill();
    g.strokeStyle = rgba(THEME.gridBorder, 0.9); g.lineWidth = 2;
    roundRect(g, x - 190, 800, 380, 190, 30); g.stroke();
    g.fillStyle = THEME.textDim; g.font = `700 30px ${FONT}`;
    g.fillText(label, x, 852);
    g.fillStyle = label.includes('CHAIN') ? THEME.pulse : info.material.highlight; g.font = `800 78px ${FONT}`;
    g.fillText(value, x, 930);
  };
  stat('BIGGEST CHAIN', info.chain ? `×${info.chain}` : '–', W / 2 - 205);
  stat('HIGHEST COMBO', info.combo ? `×${info.combo}` : '–', W / 2 + 205);

  g.fillStyle = THEME.text;
  g.font = `800 60px ${FONT}`;
  g.font = `800 ${info.message.length > 30 ? 50 : 58}px ${FONT}`;
  g.fillText(info.message, W / 2, 1120);

  drawOrbIcon(g, 64, W / 2 - 186, 1192);
  g.fillStyle = THEME.textDim; g.textAlign = 'left';
  g.font = `700 32px ${FONT}`;
  g.fillText('CNMBUCK STUDIOS', W / 2 - 112, 1225);
  return c;
}

/** App icon (opaque, square): the Cnmbuck Orb as hero, set into a machined BLOQ board corner. */
export function renderAppIcon(size = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  setRenderScale(1);
  background(g, size, size);
  const cell = size * 0.19, pitch = size * 0.215, o = size * 0.06;
  const blocks: [number, number, boolean][] = [[0, 0, false], [0, 1, false], [1, 0, false], [3, 3, false], [3, 4, true], [4, 3, false], [4, 4, false]];
  for (const [r, cc, p] of blocks) drawBlock(g, o + cc * pitch, o + r * pitch, cell, p, 0, true, { material: MAGENTA_LOOK });
  drawOrbIcon(g, size * 0.74, size * 0.13, size * 0.13);
  return c;
}

/** Launch screen (square, centre-safe): the BLOQ wordmark on graphite. */
export function renderLaunch(size = 2732): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  setRenderScale(1);
  background(g, size, size);
  drawLogo(g, size / 2, size / 2, size * 0.075);
  return c;
}
