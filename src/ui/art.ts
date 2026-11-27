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

// Build 4 home art: a cinematic arrangement of dimensional blocks in the current material around a cyan Pulse core,
// slowly floating, with drifting cyan and gold particles, a scan of light and, every few seconds, a restrained Pulse
// discharge. Reduced motion draws one still frame.
const ART = [
  '..XX.X..',
  '.XXPXX..',
  '..XXXXX.',
  '...X.X..',
];
const MOTES = Array.from({ length: 26 }, (_, i) => {
  const h = (n: number) => { const x = Math.sin((i + 1) * 91.7 + n * 37.3) * 43758.5; return x - Math.floor(x); };
  return { x: h(1), y: h(2), r: 0.6 + h(3) * 1.6, sp: 0.15 + h(4) * 0.5, gold: h(5) > 0.72, ph: h(6) * 6.28 };
});

export function paintHomeArt(canvas: HTMLCanvasElement, t: number, reduced: boolean) {
  const { g, w, h } = fit(canvas);
  g.clearRect(0, 0, w, h);
  const cols = 8, rows = ART.length;
  const pitch = Math.min(w / (cols + 1.2), h / (rows + 1.1));
  const cell = pitch * 0.9;
  const ox = (w - cols * pitch) / 2, oy = (h - rows * pitch) / 2;
  const T = reduced ? 0 : t;
  // Soft light pool behind the cluster.
  const pr = ART.findIndex((l) => l.includes('P')), pc = ART[pr].indexOf('P');
  const pcx = ox + pc * pitch + pitch / 2, pcy = oy + pr * pitch + pitch / 2;
  const pool = g.createRadialGradient(pcx, pcy, 0, pcx, pcy, pitch * 4.5);
  pool.addColorStop(0, rgba(THEME.pulse, 0.16)); pool.addColorStop(0.5, rgba('#D936AD', 0.06)); pool.addColorStop(1, rgba(THEME.pulse, 0));
  g.fillStyle = pool; g.fillRect(0, 0, w, h);
  // Drifting particles (behind).
  for (const m of MOTES) {
    const y = ((m.y - (T * 0.00002 * m.sp * 10)) % 1 + 1) % 1;
    const x = m.x + Math.sin(T * 0.0004 * m.sp + m.ph) * 0.02;
    const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(T * 0.002 * m.sp + m.ph));
    g.fillStyle = rgba(m.gold ? THEME.gold : THEME.pulse, a * (m.gold ? 0.9 : 0.6));
    g.beginPath(); g.arc(x * w, y * h, m.r, 0, Math.PI * 2); g.fill();
  }
  const scan = reduced ? -10 : ((t % 5200) / 5200) * (cols + rows + 6) - 3;
  ART.forEach((line, r) => [...line].forEach((ch, c) => {
    if (ch === '.') return;
    // Each block floats on its own slow phase; nearer the core floats less.
    const bob = reduced ? 0 : Math.sin(T * 0.0016 + r * 1.3 + c * 0.7) * pitch * 0.05;
    const x = ox + c * pitch + (pitch - cell) / 2, y = oy + r * pitch + (pitch - cell) / 2 + bob;
    const near = Math.max(0, 1 - Math.abs(c + r - scan) / 1.6);
    drawBlock(g, x, y, cell, ch === 'P', t, reduced, { bright: near * 0.32 });
  }));
  // Gold accent glints on a couple of block edges.
  if (!reduced) {
    for (const [r, c, ph] of [[0, 2, 0], [2, 6, 2.1], [1, 1, 4.2]] as const) {
      const k = Math.max(0, Math.sin(t * 0.0012 + ph));
      if (k < 0.6) continue;
      const gx = ox + c * pitch + pitch * 0.25, gy = oy + r * pitch + pitch * 0.12;
      const sp = g.createRadialGradient(gx, gy, 0, gx, gy, pitch * 0.4);
      sp.addColorStop(0, rgba('#FFF3D1', (k - 0.6) * 2)); sp.addColorStop(1, rgba(THEME.gold, 0));
      g.fillStyle = sp; g.fillRect(gx - pitch * 0.4, gy - pitch * 0.4, pitch * 0.8, pitch * 0.8);
    }
  }
  if (reduced) return;
  // Pulse discharge: a cyan ring spreading over the 3x3 around the Pulse, once every 6.5 s.
  const phase = (t % 6500) / 6500;
  if (phase < 0.12) {
    const p = phase / 0.12;
    g.save();
    g.strokeStyle = rgba(THEME.pulse, 0.7 * (1 - p)); g.lineWidth = 2 + 3 * (1 - p);
    g.shadowColor = THEME.pulse; g.shadowBlur = 14;
    roundRect(g, pcx - pitch * 1.5 * p, pcy - pitch * 1.5 * p, pitch * 3 * p, pitch * 3 * p, pitch * 0.3 * p); g.stroke();
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
  level: number; title: string; material: MaterialLook & { name?: string }; message: string;
  /** Build 4 */
  overdrives?: number;
}

/** Build 4 Daily share card. `rank` is set only when Game Center actually returned one. */
export interface DailyShareInfo { day: string; score: number; rank: number | null; streak: number; message: string; material: MaterialLook }

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

  const stat = (label: string, value: string, x: number, color: string) => {
    g.fillStyle = 'rgba(28,42,56,0.9)';
    roundRect(g, x - 128, 800, 256, 190, 28); g.fill();
    g.strokeStyle = rgba(THEME.gridBorder, 0.9); g.lineWidth = 2;
    roundRect(g, x - 128, 800, 256, 190, 28); g.stroke();
    g.fillStyle = THEME.textDim; g.font = `700 27px ${FONT}`;
    g.fillText(label, x, 852);
    g.fillStyle = color; g.font = `800 76px ${FONT}`;
    g.fillText(value, x, 930);
  };
  stat('CHAIN', info.chain ? `×${info.chain}` : '–', W / 2 - 272, THEME.pulse);
  stat('OVERDRIVE', `${info.overdrives ?? 0}`, W / 2, THEME.gold);
  // Material tile: the finish this game ended in, named in its own colour.
  g.fillStyle = 'rgba(28,42,56,0.9)';
  roundRect(g, W / 2 + 272 - 128, 800, 256, 190, 28); g.fill();
  g.strokeStyle = rgba(THEME.gridBorder, 0.9); g.lineWidth = 2;
  roundRect(g, W / 2 + 272 - 128, 800, 256, 190, 28); g.stroke();
  g.fillStyle = THEME.textDim; g.font = `700 27px ${FONT}`;
  g.fillText('MATERIAL', W / 2 + 272, 852);
  const words = (info.material.name ?? info.material.id).toUpperCase().split(' ');
  let fs = 40;
  g.font = `800 ${fs}px ${FONT}`;
  while (fs > 22 && Math.max(...words.map((w) => g.measureText(w).width)) > 220) { fs -= 2; g.font = `800 ${fs}px ${FONT}`; }
  g.fillStyle = info.material.highlight;
  words.forEach((w, i) => g.fillText(w, W / 2 + 272, 915 + (i - (words.length - 1) / 2) * (fs + 4)));

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

/** 1080×1350 Daily Challenge card: date, score, streak and a rank only when one was verified by Game Center. */
export function renderDailyShareCard(info: DailyShareInfo): HTMLCanvasElement {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  setRenderScale(1);
  background(g, W, H);
  const gold = g.createRadialGradient(W / 2, 700, 0, W / 2, 700, 600);
  gold.addColorStop(0, rgba(THEME.gold, 0.16)); gold.addColorStop(1, rgba(THEME.gold, 0));
  g.fillStyle = gold; g.fillRect(0, 250, W, 950);
  const frag = (x0: number, y0: number, art: string[]) => art.forEach((line, r) => [...line].forEach((ch, col) => {
    if (ch !== '.') drawBlock(g, x0 + col * 92, y0 + r * 92, 82, ch === 'P', 0, true, { alpha: 0.9, material: info.material });
  }));
  frag(48, 48, ['XX', 'P.']);
  frag(W - 48 - 174, 48, ['.X', 'XX']);
  drawLogo(g, W / 2, 250, 160);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = THEME.gold; g.font = `800 44px ${FONT}`;
  g.fillText('DAILY CHALLENGE', W / 2, 400);
  const [y, m, d] = info.day.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  g.fillStyle = THEME.textDim; g.font = `700 36px ${FONT}`;
  g.fillText(`${d} ${months[m - 1]} ${y}`, W / 2, 456);
  paintFrame(g, 110, 510, W - 220, 470, 40, 14, true);
  g.fillStyle = THEME.textDim; g.font = `700 34px ${FONT}`;
  g.fillText('SCORE', W / 2, 590);
  g.fillStyle = THEME.text; g.font = `900 160px ${FONT}`;
  g.fillText(info.score.toLocaleString('en-US'), W / 2, 700);
  const chips: [string, string][] = [[`${info.streak}`, info.streak === 1 ? 'DAY STREAK' : 'DAY STREAK']];
  if (info.rank) chips.unshift([`#${info.rank.toLocaleString('en-US')}`, 'GAME CENTER RANK']);
  chips.forEach(([v, l], i) => {
    const x = chips.length === 1 ? W / 2 : W / 2 + (i === 0 ? -200 : 200);
    g.fillStyle = THEME.gold; g.font = `900 64px ${FONT}`;
    g.fillText(v, x, 840);
    g.fillStyle = THEME.textDim; g.font = `700 26px ${FONT}`;
    g.fillText(l, x, 900);
  });
  g.fillStyle = THEME.text; g.font = `800 ${info.message.length > 30 ? 50 : 56}px ${FONT}`;
  g.fillText(info.message, W / 2, 1100);
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
