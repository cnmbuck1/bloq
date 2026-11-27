// Materials. Standard blocks are anodized metal tiles (Build 3: magenta first, then the level's material): a bevelled
// rim lit from the top left, a slightly recessed brushed face and a soft contact shadow. Pulse Blocks are dark glass with an illuminated cyan rim
// and a diamond energy core (shape, not only colour, identifies them). Everything static is cached as
// sprites; only the Pulse core is drawn live.

import { THEME, mix, rgba } from './theme';
import { MARGIN_3D, available3D, renderBlock3D, type BlockStyle } from './block3d';

export type { BlockStyle } from './block3d';
let style: BlockStyle = 'b5c';
/** Build 5 graphics selector: Build 4 canvas blocks, 5B anodized metal or 5C crystal-metal (3D rendered sprites). */
export function setBlockStyle(s: BlockStyle) { if (s !== style) { style = s; cache.clear(); } }
/** The style actually drawn (falls back to Build 4 when WebGL is unavailable). */
export const blockStyle = (): BlockStyle => (style !== 'b4' && available3D() ? style : 'b4');

/** What the renderer needs from a material (see config.materials). */
export interface MaterialLook { id: string; color: string; highlight: string; shadow: string }

/** Developer-tunable look (Settings > Developer). 1 = the shipped default. */
export interface VisualParams {
  brightness: number; reflectivity: number; edge: number; pulseGlow: number; wave: number;
  /** Build 4: bevel / thickness depth, contact shadow strength, board illumination, Overdrive lighting. */
  depth: number; shadow: number; boardLight: number; odLight: number;
}
export const DEFAULT_VISUALS: VisualParams = { brightness: 1, reflectivity: 1, edge: 1, pulseGlow: 1, wave: 1, depth: 1, shadow: 1, boardLight: 1, odLight: 1 };
let visuals: VisualParams = { ...DEFAULT_VISUALS };
export function setVisualParams(v: Partial<VisualParams>) { visuals = { ...DEFAULT_VISUALS, ...v }; cache.clear(); }
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

const MARGIN = MARGIN_3D; // sprite padding (fraction of s) for the contact shadow (0.2)

/**
 * Build 4 premium metal: a solid tile with real thickness. A soft directional contact shadow sits under it, a
 * darker side wall shows its depth, four chamfered bevels catch the top-left light at different strengths, and
 * the face carries a controlled reflection band and a small specular point. Every material uses the same
 * construction, so a material change reads as an upgrade of the same object.
 */
function paintMetal(g: CanvasRenderingContext2D, s: number, m: MaterialLook) {
  const v = visuals;
  const r = s * 0.12;
  const depth = s * 0.085 * v.depth;
  const top = s - depth; // height of the top surface; the side wall fills the rest
  const b = Math.max(1.4, s * 0.1); // chamfer width
  const lift = (c: string, t: number) => (t >= 0 ? mix(c, '#FFFFFF', Math.min(1, t)) : mix(c, '#000000', Math.min(1, -t)));
  const base = lift(m.color, (v.brightness - 1) * 0.6);
  // Contact shadow: soft, offset down and slightly right with the light.
  if (v.shadow > 0) {
    g.save();
    g.shadowColor = `rgba(0,0,0,${Math.min(0.9, 0.55 * v.shadow)})`; g.shadowBlur = s * 0.14 * v.shadow; g.shadowOffsetY = s * 0.07 * v.shadow; g.shadowOffsetX = s * 0.025;
    g.fillStyle = mix(m.shadow, '#000000', 0.4);
    roundRect(g, s * 0.03, depth, s * 0.94, s - depth, r); g.fill();
    g.restore();
  }
  // Side wall (thickness): the material in shade, a little lighter at the left where the light reaches round.
  const wall = g.createLinearGradient(0, 0, s, 0);
  wall.addColorStop(0, mix(m.shadow, base, 0.35)); wall.addColorStop(0.5, m.shadow); wall.addColorStop(1, mix(m.shadow, '#000000', 0.35));
  g.fillStyle = wall;
  roundRect(g, 0, depth * 0.6, s, s - depth * 0.6, r); g.fill();
  // Catch-light along the bottom of the wall (reflected light from the well).
  g.strokeStyle = rgba(m.highlight, 0.18 * v.edge); g.lineWidth = Math.max(0.6, s * 0.015);
  g.beginPath(); g.moveTo(r, s - 0.6); g.lineTo(s - r, s - 0.6); g.stroke();
  // Top surface: four chamfers lit from the top left.
  g.save();
  roundRect(g, 0, 0, s, top, r); g.clip();
  const quad = (pts: number[], fill: string | CanvasGradient) => {
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath(); g.fillStyle = fill; g.fill();
  };
  const ix = b, iy = b, iw = s - b * 2, ih = top - b * 2;
  quad([0, 0, s, 0, ix + iw, iy, ix, iy], mix(m.highlight, '#FFFFFF', Math.min(0.6, 0.22 * v.edge)));
  quad([0, 0, ix, iy, ix, iy + ih, 0, top], mix(m.highlight, base, 0.45));
  quad([s, 0, s, top, ix + iw, iy + ih, ix + iw, iy], mix(base, m.shadow, 0.42));
  quad([0, top, ix, iy + ih, ix + iw, iy + ih, s, top], mix(m.shadow, base, 0.3));
  // Face: anodized gradient, slightly convex.
  const fr = r * 0.55;
  const face = g.createLinearGradient(0, iy, 0, iy + ih);
  face.addColorStop(0, mix(base, m.highlight, 0.22)); face.addColorStop(0.45, base); face.addColorStop(1, mix(base, m.shadow, 0.28));
  g.fillStyle = face;
  roundRect(g, ix, iy, iw, ih, fr); g.fill();
  g.save();
  roundRect(g, ix, iy, iw, ih, fr); g.clip();
  // Fine brushed grain, very low contrast.
  const lines = Math.max(5, Math.round(ih / 1.8));
  for (let i = 0; i < lines; i++) {
    const y = iy + (i + 0.5) * (ih / lines);
    const a = 0.015 + hash(i) * 0.035;
    g.strokeStyle = hash(i + 50) > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(ix + hash(i + 9) * iw * 0.2, y); g.lineTo(ix + iw - hash(i + 3) * iw * 0.2, y); g.stroke();
  }
  // Controlled reflection: one soft diagonal band, then a small specular point near the top left.
  const R = 0.2 * v.reflectivity;
  const band = g.createLinearGradient(ix, iy, ix + iw, iy + ih);
  band.addColorStop(0, `rgba(255,255,255,${R * 0.5})`); band.addColorStop(0.3, `rgba(255,255,255,${R * 0.05})`);
  band.addColorStop(0.44, `rgba(255,255,255,${R})`); band.addColorStop(0.56, 'rgba(255,255,255,0)'); band.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = band; g.fillRect(ix, iy, iw, ih);
  const sp = g.createRadialGradient(ix + iw * 0.24, iy + ih * 0.2, 0, ix + iw * 0.24, iy + ih * 0.2, iw * 0.36);
  sp.addColorStop(0, `rgba(255,255,255,${Math.min(0.6, 0.34 * v.reflectivity)})`); sp.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sp; g.fillRect(ix, iy, iw, ih);
  g.restore();
  // Face edge: a thin dark seam where face meets bevel, and a lit lip along its lower edge.
  g.lineWidth = Math.max(0.6, s * 0.014);
  g.strokeStyle = rgba(m.shadow, 0.55);
  roundRect(g, ix, iy, iw, ih, fr); g.stroke();
  g.restore();
  // Subtle edge accent: a crisp highlight on the outer top edge.
  g.strokeStyle = `rgba(255,255,255,${Math.min(1, 0.55 * v.edge)})`;
  g.lineWidth = Math.max(0.7, s * 0.018);
  g.beginPath(); g.moveTo(r, 0.7); g.lineTo(s - r, 0.7); g.stroke();
  if (highContrast) {
    g.strokeStyle = '#FFFFFF'; g.lineWidth = Math.max(1.5, s * 0.045);
    roundRect(g, g.lineWidth / 2, g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth, r); g.stroke();
  }
}

function paintPulseBody(g: CanvasRenderingContext2D, full: number) {
  const r = full * 0.13;
  const depth = full * 0.085 * visuals.depth;
  g.save();
  g.shadowColor = `rgba(0,0,0,${Math.min(0.9, 0.55 * visuals.shadow)})`; g.shadowBlur = full * 0.14 * visuals.shadow; g.shadowOffsetY = full * 0.07 * visuals.shadow;
  g.fillStyle = '#05181E';
  roundRect(g, 0, depth * 0.6, full, full - depth * 0.6, r); g.fill();
  g.restore();
  // Housing side wall (thickness), then the glass body on top.
  const wall = g.createLinearGradient(0, 0, full, 0);
  wall.addColorStop(0, '#0F3C47'); wall.addColorStop(1, '#041318');
  g.fillStyle = wall; roundRect(g, 0, depth * 0.6, full, full - depth * 0.6, r); g.fill();
  g.strokeStyle = rgba(THEME.pulse, 0.3); g.lineWidth = Math.max(0.6, full * 0.015);
  g.beginPath(); g.moveTo(r, full - 0.6); g.lineTo(full - r, full - 0.6); g.stroke();
  g.save();
  g.scale(1, (full - depth) / full);
  const s = full;
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
  g.restore();
}

function sprite(size: number, pulse: boolean, mat: MaterialLook): HTMLCanvasElement {
  const st = blockStyle();
  const key = `${st}|${Math.round(size * 4)}|${pulse ? 'P' : mat.id + mat.color}|${highContrast ? 1 : 0}`;
  let c = cache.get(key);
  if (!c && st !== 'b4') {
    const px = Math.ceil(size * (1 + MARGIN * 2) * dpr);
    const r = renderBlock3D(st, pulse, mat, px, { shadow: visuals.shadow, highContrast });
    if (r) { c = r; cache.set(key, c); }
  }
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
  if (pulse) {
    if (blockStyle() === 'b4') drawPulseCore(g, ox, oy - ss * 0.04 * visuals.depth, ss, t, reduced, fx.charge ?? 0);
    else drawPulseAura(g, ox, oy, ss, t, reduced, fx.charge ?? 0);
  }
  if (fx.bright && fx.bright > 0) {
    g.fillStyle = pulse ? `rgba(198,255,255,${0.75 * fx.bright})` : rgba(mat.highlight, 0.75 * fx.bright);
    roundRect(g, ox, oy, ss, ss * (1 - 0.085 * visuals.depth), ss * 0.12); g.fill();
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

/**
 * Build 5: the 3D Pulse sprites already carry their crystal core, so the live layer is only light: a soft breathing
 * glow around the core (additive, restrained) that intensifies before activation.
 */
function drawPulseAura(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, reduced: boolean, charge: number) {
  const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.0028);
  const k = Math.min(1, 0.35 + breathe * 0.35 + charge);
  const cx = x + s / 2, cy = y + s * 0.47;
  const prev = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, s * (0.36 + 0.16 * charge));
  glow.addColorStop(0, rgba(THEME.pulse, Math.min(0.85, (0.12 + 0.28 * k) * visuals.pulseGlow)));
  glow.addColorStop(0.5, rgba(THEME.pulse, Math.min(0.4, 0.08 * k * visuals.pulseGlow)));
  glow.addColorStop(1, rgba(THEME.pulse, 0));
  g.fillStyle = glow;
  g.fillRect(x - s * 0.1, y - s * 0.1, s * 1.2, s * 1.2);
  if (charge > 0) {
    g.fillStyle = rgba(THEME.pulseCore, 0.5 * charge);
    const d = s * (0.12 + 0.08 * charge);
    g.beginPath(); g.moveTo(cx, cy - d); g.lineTo(cx + d, cy); g.lineTo(cx, cy + d); g.lineTo(cx - d, cy); g.closePath(); g.fill();
  }
  g.globalCompositeOperation = prev;
}

/** A recessed empty cell in the board well. */
export function paintEmptyCell(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const r = s * 0.14;
  // Build 4: empty cells are dimmer and more recessed, so placed blocks lead.
  const well = g.createLinearGradient(0, y, 0, y + s);
  well.addColorStop(0, mix(THEME.empty, '#000000', 0.25)); well.addColorStop(1, mix(THEME.empty, THEME.bg, 0.2));
  g.fillStyle = well;
  roundRect(g, x, y, s, s, r); g.fill();
  // inner shadow along the top, faint catch-light along the bottom
  g.save();
  roundRect(g, x, y, s, s, r); g.clip();
  const sh = g.createLinearGradient(0, y, 0, y + s * 0.35);
  sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh; g.fillRect(x, y, s, s * 0.35);
  g.restore();
  g.strokeStyle = highContrast ? '#5C7A8F' : rgba(THEME.gridBorder, 0.42);
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
