// Materials. Standard blocks are anodized metal tiles (Build 3: magenta first, then the level's material): a bevelled
// rim lit from the top left, a slightly recessed brushed face and a soft contact shadow. Pulse Blocks are dark glass with an illuminated cyan rim
// and a diamond energy core (shape, not only colour, identifies them). Everything static is cached as
// sprites; only the Pulse core is drawn live.

import { THEME, mix, rgba } from './theme';

/** What the renderer needs from a material (see config.materials). */
export interface MaterialLook { id: string; color: string; highlight: string; shadow: string }

/** Developer-tunable look (Settings > Developer). 1 = the shipped default. */
export interface VisualParams { brightness: number; reflectivity: number; edge: number; pulseGlow: number; wave: number }
export const DEFAULT_VISUALS: VisualParams = { brightness: 1, reflectivity: 1, edge: 1, pulseGlow: 1, wave: 1 };
let visuals: VisualParams = { ...DEFAULT_VISUALS };
export function setVisualParams(v: VisualParams) { visuals = { ...v }; cache.clear(); }
export const visualParams = () => visuals;

const MAGENTA: MaterialLook = { id: 'magenta', color: '#D936AD', highlight: '#FF9BEA', shadow: '#64164F' };
let current: MaterialLook = MAGENTA;
/** The material standard blocks use unless a draw call passes its own (material transitions). */
export function setMaterial(m: MaterialLook) { current = m; }
export const currentMaterial = () => current;

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
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
export const isHighContrast = () => highContrast;

/** Deterministic noise for the brushed texture (same pattern every time). */
function hash(i: number) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

const MARGIN = 0.16; // sprite padding (fraction of s) for the contact shadow

function paintMetal(g: CanvasRenderingContext2D, s: number, m: MaterialLook) {
  const r = s * 0.14;
  const bevel = Math.max(1.5, s * 0.085);
  const v = visuals;
  const lift = (c: string, t: number) => (t >= 0 ? mix(c, '#FFFFFF', Math.min(1, t)) : mix(c, '#000000', Math.min(1, -t)));
  const base = lift(m.color, (v.brightness - 1) * 0.6);
  // Contact shadow: soft, offset down-right with the light.
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = s * 0.12; g.shadowOffsetY = s * 0.06; g.shadowOffsetX = s * 0.02;
  g.fillStyle = m.shadow;
  roundRect(g, 0, 0, s, s, r); g.fill();
  g.restore();
  // Bevelled rim: bright highlight top-left, deep shade bottom-right.
  const rim = g.createLinearGradient(0, 0, s, s);
  rim.addColorStop(0, mix(m.highlight, '#FFFFFF', 0.25 * v.edge)); rim.addColorStop(0.32, m.highlight);
  rim.addColorStop(0.6, mix(base, m.shadow, 0.35)); rim.addColorStop(1, mix(m.shadow, '#000000', 0.25));
  g.fillStyle = rim;
  roundRect(g, 0, 0, s, s, r); g.fill();
  // Recessed anodized face: shaded at the top edge (under the rim), glowing slightly toward the bottom.
  const fx = bevel, fy = bevel, fw = s - bevel * 2, fh = s - bevel * 2, fr = r * 0.6;
  const face = g.createLinearGradient(0, fy, 0, fy + fh);
  face.addColorStop(0, mix(base, m.shadow, 0.45)); face.addColorStop(0.2, mix(base, m.shadow, 0.12));
  face.addColorStop(0.7, base); face.addColorStop(1, mix(base, m.highlight, 0.28));
  g.fillStyle = face;
  roundRect(g, fx, fy, fw, fh, fr); g.fill();
  // Brushed texture: fine horizontal strokes, very low contrast.
  g.save();
  roundRect(g, fx, fy, fw, fh, fr); g.clip();
  const lines = Math.max(6, Math.round(fh / 1.6));
  for (let i = 0; i < lines; i++) {
    const y = fy + (i + 0.5) * (fh / lines);
    const a = 0.02 + hash(i) * 0.045;
    g.strokeStyle = hash(i + 50) > 0.5 ? `rgba(255,255,255,${a})` : `rgba(20,0,20,${a})`;
    g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(fx + hash(i + 9) * fw * 0.2, y); g.lineTo(fx + fw - hash(i + 3) * fw * 0.2, y); g.stroke();
  }
  // Reflective sheen: a diagonal band of light across the upper face.
  const sheen = g.createLinearGradient(fx, fy, fx + fw, fy + fh);
  const R = 0.22 * v.reflectivity;
  sheen.addColorStop(0, `rgba(255,255,255,${R})`); sheen.addColorStop(0.38, `rgba(255,255,255,${R * 0.12})`);
  sheen.addColorStop(0.5, `rgba(255,255,255,${R * 0.35})`); sheen.addColorStop(0.62, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen; g.fillRect(fx, fy, fw, fh);
  g.restore();
  // Inner edge of the recess: shadow on top, catch-light on the bottom.
  g.lineWidth = Math.max(0.8, s * 0.02);
  g.strokeStyle = rgba(m.shadow, 0.6);
  g.beginPath(); g.moveTo(fx + fr, fy + 0.5); g.lineTo(fx + fw - fr, fy + 0.5); g.stroke();
  g.strokeStyle = rgba(m.highlight, 0.45 * v.edge);
  g.beginPath(); g.moveTo(fx + fr, fy + fh - 0.5); g.lineTo(fx + fw - fr, fy + fh - 0.5); g.stroke();
  // Crisp highlight along the outer top and left edges.
  g.strokeStyle = `rgba(255,255,255,${Math.min(1, 0.6 * v.edge)})`;
  g.lineWidth = Math.max(0.8, s * 0.02);
  g.beginPath(); g.moveTo(r, 0.8); g.lineTo(s - r, 0.8); g.stroke();
  g.strokeStyle = `rgba(255,255,255,${Math.min(1, 0.25 * v.edge)})`;
  g.beginPath(); g.moveTo(0.8, r); g.lineTo(0.8, s - r); g.stroke();
  if (highContrast) {
    g.strokeStyle = '#FFFFFF'; g.lineWidth = Math.max(1.5, s * 0.045);
    roundRect(g, g.lineWidth / 2, g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth, r); g.stroke();
  }
}

function paintPulseBody(g: CanvasRenderingContext2D, s: number) {
  const r = s * 0.14;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = s * 0.12; g.shadowOffsetY = s * 0.06;
  g.fillStyle = '#0A2A33';
  roundRect(g, 0, 0, s, s, r); g.fill();
  g.restore();
  // Glass body with a bevel: lit rim, darker recessed centre (more depth than Build 2).
  const body = g.createLinearGradient(0, 0, 0, s);
  body.addColorStop(0, '#1B6170'); body.addColorStop(0.5, '#0E3A46'); body.addColorStop(1, '#082029');
  g.fillStyle = body;
  roundRect(g, 0, 0, s, s, r); g.fill();
  const well = g.createRadialGradient(s / 2, s * 0.55, 0, s / 2, s * 0.55, s * 0.5);
  well.addColorStop(0, 'rgba(4,20,26,0.55)'); well.addColorStop(1, 'rgba(4,20,26,0)');
  g.fillStyle = well; roundRect(g, s * 0.12, s * 0.12, s * 0.76, s * 0.76, r * 0.6); g.fill();
  // Illuminated cyan perimeter, brighter in Build 3, with an inner ice-white line.
  g.save();
  g.shadowColor = THEME.pulse; g.shadowBlur = s * 0.2 * visuals.pulseGlow;
  g.strokeStyle = THEME.pulse; g.lineWidth = Math.max(1.8, s * 0.075);
  roundRect(g, g.lineWidth / 2 + 0.5, g.lineWidth / 2 + 0.5, s - g.lineWidth - 1, s - g.lineWidth - 1, r * 0.9); g.stroke();
  g.restore();
  g.strokeStyle = rgba(THEME.pulseCore, 0.7); g.lineWidth = Math.max(0.8, s * 0.02);
  const ii = Math.max(1.8, s * 0.075) + 1.2;
  roundRect(g, ii, ii, s - ii * 2, s - ii * 2, r * 0.7); g.stroke();
  // Glass reflection.
  const refl = g.createLinearGradient(0, 0, s, s);
  refl.addColorStop(0, 'rgba(255,255,255,0.18)'); refl.addColorStop(0.4, 'rgba(255,255,255,0.03)'); refl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = refl;
  roundRect(g, s * 0.1, s * 0.1, s * 0.8, s * 0.4, r * 0.6); g.fill();
  if (highContrast) {
    g.strokeStyle = '#FFFFFF'; g.lineWidth = Math.max(1, s * 0.025);
    roundRect(g, s * 0.12, s * 0.12, s * 0.76, s * 0.76, r * 0.5); g.stroke();
  }
}

function sprite(size: number, pulse: boolean, mat: MaterialLook): HTMLCanvasElement {
  const key = `${Math.round(size * 4)}|${pulse ? 'P' : mat.id + mat.color}|${highContrast ? 1 : 0}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    const m = size * MARGIN;
    const full = size + m * 2;
    const px = Math.ceil(full * dpr);
    c.width = px; c.height = px;
    const g = c.getContext('2d')!;
    g.scale(px / full, px / full);
    g.translate(m, m);
    if (pulse) paintPulseBody(g, size); else paintMetal(g, size, mat);
    cache.set(key, c);
  }
  return c;
}

export interface BlockFx {
  scale?: number;
  alpha?: number;
  /** 0..1 extra brightness (clear sequence, contact highlight). */
  bright?: number;
  /** 0..1 Pulse core intensity boost (activation buildup). */
  charge?: number;
  /** Lift: offsets the block up and strengthens its shadow (settle animation). */
  lift?: number;
  /** Material override (a material transition draws not-yet-swept blocks in the old material). */
  material?: MaterialLook;
}

/** Draws a block at (x,y) with size s. */
export function drawBlock(g: CanvasRenderingContext2D, x: number, y: number, s: number, pulse = false, t = 0, reduced = false, fx: BlockFx = {}) {
  const scale = fx.scale ?? 1, alpha = fx.alpha ?? 1;
  if (scale <= 0 || alpha <= 0) return;
  const ss = s * scale;
  const ox = x + (s - ss) / 2, oy = y + (s - ss) / 2 - (fx.lift ?? 0) * s * 0.08;
  const m = ss * MARGIN;
  if (alpha < 1) g.globalAlpha = alpha;
  const mat = fx.material ?? current;
  g.drawImage(sprite(s, pulse, mat), ox - m, oy - m, ss + m * 2, ss + m * 2);
  if (pulse) drawPulseCore(g, ox, oy, ss, t, reduced, fx.charge ?? 0);
  if (fx.bright && fx.bright > 0) {
    g.fillStyle = pulse ? `rgba(198,255,255,${0.75 * fx.bright})` : rgba(mat.highlight, 0.75 * fx.bright);
    roundRect(g, ox, oy, ss, ss, ss * 0.14); g.fill();
  }
  if (alpha < 1) g.globalAlpha = 1;
}

/** The energy core: a breathing diamond with a slow internal sweep. charge (0..1) brightens it before activation. */
export function drawPulseCore(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, reduced = false, charge = 0) {
  const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.0028);
  const k = Math.min(1, breathe * 0.6 + charge);
  const cx = x + s / 2, cy = y + s / 2;
  const d = s * (0.2 + 0.03 * breathe + 0.06 * charge);
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, s * (0.42 + 0.15 * charge));
  glow.addColorStop(0, rgba(THEME.pulse, Math.min(1, (0.3 + 0.35 * k) * visuals.pulseGlow))); glow.addColorStop(1, rgba(THEME.pulse, 0));
  g.fillStyle = glow;
  g.fillRect(x - s * 0.1, y - s * 0.1, s * 1.2, s * 1.2);
  const diamond = (kk: number) => { g.beginPath(); g.moveTo(cx, cy - d * kk); g.lineTo(cx + d * kk, cy); g.lineTo(cx, cy + d * kk); g.lineTo(cx - d * kk, cy); g.closePath(); };
  g.fillStyle = '#0B4F5C'; diamond(1.3); g.fill();
  g.fillStyle = THEME.pulse; diamond(1); g.fill();
  // Internal energy movement: a bright band sliding through the diamond.
  if (!reduced) {
    g.save(); diamond(1); g.clip();
    const p = ((t * 0.0006) % 1) * 2 - 0.5;
    const band = g.createLinearGradient(cx - d, cy - d, cx + d, cy + d);
    const a = Math.max(0, Math.min(1, p - 0.15)), b = Math.max(0, Math.min(1, p)), c = Math.max(0, Math.min(1, p + 0.15));
    band.addColorStop(a, 'rgba(255,255,255,0)'); band.addColorStop(b, 'rgba(255,255,255,0.55)'); band.addColorStop(c, 'rgba(255,255,255,0)');
    g.fillStyle = band; g.fillRect(cx - d, cy - d, d * 2, d * 2);
    g.restore();
  }
  g.fillStyle = THEME.pulseCore; diamond(0.5 + 0.1 * k); g.fill();
}

/** A recessed empty cell in the board well. */
export function paintEmptyCell(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const r = s * 0.14;
  g.fillStyle = THEME.empty;
  roundRect(g, x, y, s, s, r); g.fill();
  // inner shadow along the top, faint catch-light along the bottom
  g.save();
  roundRect(g, x, y, s, s, r); g.clip();
  const sh = g.createLinearGradient(0, y, 0, y + s * 0.35);
  sh.addColorStop(0, 'rgba(0,0,0,0.42)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh; g.fillRect(x, y, s, s * 0.35);
  g.restore();
  g.strokeStyle = highContrast ? '#5C7A8F' : rgba(THEME.gridBorder, 0.7);
  g.lineWidth = highContrast ? 1.5 : 1;
  roundRect(g, x + 0.5, y + 0.5, s - 1, s - 1, r); g.stroke();
  g.strokeStyle = 'rgba(169,196,212,0.07)';
  g.beginPath(); g.moveTo(x + r, y + s - 0.5); g.lineTo(x + s - r, y + s - 0.5); g.stroke();
}

/** Machined metal frame around a recessed well: used for the board and the tray slots. */
export function paintFrame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, rim: number, accent: boolean) {
  // drop shadow under the platform
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = rim * 3; g.shadowOffsetY = rim;
  g.fillStyle = '#1B2733';
  roundRect(g, x, y, w, h, r); g.fill();
  g.restore();
  const metal = g.createLinearGradient(x, y, x, y + h);
  metal.addColorStop(0, '#3A4D5D'); metal.addColorStop(0.08, '#2A3A48'); metal.addColorStop(0.92, '#1C2834'); metal.addColorStop(1, '#141D27');
  g.fillStyle = metal;
  roundRect(g, x, y, w, h, r); g.fill();
  // top bevel highlight
  g.strokeStyle = 'rgba(200,225,240,0.28)'; g.lineWidth = 1;
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke();
  // recessed well
  const wx = x + rim, wy = y + rim, ww = w - rim * 2, wh = h - rim * 2, wr = Math.max(2, r - rim * 0.6);
  g.fillStyle = '#0E1720';
  roundRect(g, wx, wy, ww, wh, wr); g.fill();
  g.save();
  roundRect(g, wx, wy, ww, wh, wr); g.clip();
  const inner = g.createLinearGradient(0, wy, 0, wy + rim * 2.5);
  inner.addColorStop(0, 'rgba(0,0,0,0.6)'); inner.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = inner; g.fillRect(wx, wy, ww, rim * 2.5);
  // subtle environmental light from above
  const env = g.createRadialGradient(wx + ww * 0.3, wy, 0, wx + ww * 0.3, wy, Math.max(ww, wh));
  env.addColorStop(0, 'rgba(89,221,235,0.05)'); env.addColorStop(1, 'rgba(89,221,235,0)');
  g.fillStyle = env; g.fillRect(wx, wy, ww, wh);
  g.restore();
  g.strokeStyle = 'rgba(169,196,212,0.12)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(wx + wr, wy + wh + 0.5); g.lineTo(wx + ww - wr, wy + wh + 0.5); g.stroke();
  if (accent) {
    // illuminated accents: short cyan light strips at the four corners of the frame
    g.save();
    g.strokeStyle = rgba(THEME.pulse, 0.55); g.lineWidth = Math.max(1.5, rim * 0.22); g.lineCap = 'round';
    g.shadowColor = THEME.pulse; g.shadowBlur = rim;
    const L = Math.min(w, h) * 0.08, o = rim * 0.45;
    const seg = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    seg(x + r, y + o, x + r + L, y + o); seg(x + w - r - L, y + o, x + w - r, y + o);
    seg(x + r, y + h - o, x + r + L, y + h - o); seg(x + w - r - L, y + h - o, x + w - r, y + h - o);
    g.restore();
  }
}
