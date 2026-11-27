// Materials. Standard blocks are anodized metal tiles (Build 3: magenta first, then the level's material): a bevelled
// rim lit from the top left, a slightly recessed brushed face and a soft contact shadow. Pulse Blocks are dark glass with an illuminated cyan rim
// and a diamond energy core (shape, not only colour, identifies them). Everything static is cached as
// sprites; only the Pulse core is drawn live.

import { THEME, mix, rgba } from './theme';
import { MARGIN_3D, available3D, renderBlock3D, type BlockStyle } from './block3d';

export type { BlockStyle } from './block3d';
let style: BlockStyle = 'b6';
/** Build 5 graphics selector: Build 4 canvas blocks, 5B anodized metal or 5C crystal-metal (3D rendered sprites). */
export function setBlockStyle(s: BlockStyle) { if (s !== style) { style = s; cache.clear(); } }
/** The style actually drawn (falls back to Build 4 when WebGL is unavailable). */
export const blockStyle = (): BlockStyle => (style === 'b6' ? 'b6' : style !== 'b4' && available3D() ? style : 'b4');

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

function sprite(size: number, pulse: boolean, mat: MaterialLook, od = false): HTMLCanvasElement {
  const st = blockStyle();
  const odv = od && (st === 'b5c' || st === 'b6');
  const key = `${st}|${Math.round(size * 4)}|${pulse ? 'P' : mat.id + mat.color}|${highContrast ? 1 : 0}|${odv ? 'od' : ''}`;
  let c = cache.get(key);
  if (!c && (st === 'b5b' || st === 'b5c')) {
    const px = Math.ceil(size * (1 + MARGIN * 2) * dpr);
    const r = renderBlock3D(st, pulse, mat, px, { shadow: visuals.shadow, highContrast, od: odv });
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
    if (st === 'b6') paintCrystal6(g, size, pulse, mat, odv);
    else if (pulse) paintPulseBody(g, size); else paintMetal(g, size, mat);
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
  /** Build 6: Overdrive-enhanced crystal (warmer, stronger inner light). */
  od?: boolean;
  /** Build 6: soft light under the block (0..1): selection, availability, placement glow. */
  under?: number;
  /** Build 6: unavailable piece (desaturated, dimmed; same material). */
  muted?: boolean;
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
  const spr = sprite(s, pulse, mat, fx.od);
  const st = blockStyle();
  if (fx.under && fx.under > 0) {
    const cx = ox + ss / 2, cy = oy + ss * 0.62, R = ss * 0.95;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    rg.addColorStop(0, rgba(pulse ? THEME.pulse : mat.color, 0.42 * fx.under)); rg.addColorStop(1, rgba(pulse ? THEME.pulse : mat.color, 0));
    g.fillStyle = rg; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  if (fx.muted) g.filter = 'saturate(0.35) brightness(0.8)';
  g.drawImage(spr, ox - m, oy - m, ss + m * 2, ss + m * 2);
  if (fx.muted) g.filter = 'none';
  if (pulse) {
    if (blockStyle() === 'b4') drawPulseCore(g, ox, oy - ss * 0.04 * visuals.depth, ss, t, reduced, fx.charge ?? 0);
    else drawPulseAura(g, ox, oy, ss, t, reduced, fx.charge ?? 0);
  }
  if (fx.bright && fx.bright > 0) {
    if (st === 'b4') {
      g.fillStyle = pulse ? `rgba(198,255,255,${0.75 * fx.bright})` : rgba(mat.highlight, 0.75 * fx.bright);
      roundRect(g, ox, oy, ss, ss * (1 - 0.085 * visuals.depth), ss * 0.12); g.fill();
    } else {
      // Build 6: the crystal itself lights up (additive copy of its own sprite keeps facets and material), with a
      // little white-hot core at high intensity.
      const prevA = g.globalAlpha, prevC = g.globalCompositeOperation;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = prevA * Math.min(1, fx.bright * 0.9);
      g.drawImage(spr, ox - m, oy - m, ss + m * 2, ss + m * 2);
      if (fx.bright > 0.5) {
        const k = (fx.bright - 0.5) * 2;
        const rg = g.createRadialGradient(ox + ss * 0.45, oy + ss * 0.42, 0, ox + ss * 0.45, oy + ss * 0.42, ss * 0.62);
        rg.addColorStop(0, `rgba(255,255,255,${0.5 * k})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = prevA; g.fillStyle = rg; g.fillRect(ox, oy, ss, ss);
      }
      g.globalAlpha = prevA; g.globalCompositeOperation = prevC;
    }
  }
  if (alpha < 1) g.globalAlpha = 1;
}

/**
 * Build 6 block destruction: the crystal fractures into eight shards (triangles from an off-centre break point),
 * which fly apart, turn and fade while their edges glow, then dissolve (the animator adds the particles).
 * p runs 0..1 over the destruction; `power` scales how far the shards travel (bigger clears break harder).
 */
export function drawBlockShards(g: CanvasRenderingContext2D, x: number, y: number, s: number, pulse: boolean, p: number, seed: number, fx: { material?: MaterialLook; od?: boolean; power?: number; dir?: [number, number] } = {}) {
  if (p >= 1) return;
  const mat = fx.material ?? current;
  const spr = sprite(s, pulse, mat, fx.od);
  const m = s * MARGIN;
  const rnd = (i: number) => { const v = Math.sin(seed * 91.7 + i * 17.3) * 43758.5453; return v - Math.floor(v); };
  const bx = x + s * (0.38 + 0.24 * rnd(1)), by = y + s * (0.38 + 0.24 * rnd(2));
  const pts: [number, number][] = [[x, y], [x + s / 2 + (rnd(3) - 0.5) * s * 0.3, y], [x + s, y], [x + s, y + s / 2 + (rnd(4) - 0.5) * s * 0.3],
    [x + s, y + s], [x + s / 2 + (rnd(5) - 0.5) * s * 0.3, y + s], [x, y + s], [x, y + s / 2 + (rnd(6) - 0.5) * s * 0.3]];
  const e = 1 - Math.pow(1 - p, 2.2);
  const power = fx.power ?? 1;
  const [dx0, dy0] = fx.dir ?? [0, 0];
  for (let i = 0; i < 8; i++) {
    const a = pts[i], b = pts[(i + 1) % 8];
    const cx = (a[0] + b[0] + bx) / 3, cy = (a[1] + b[1] + by) / 3;
    let vx = cx - bx, vy = cy - by; const len = Math.hypot(vx, vy) || 1; vx /= len; vy /= len;
    const dist = s * (0.35 + 0.5 * rnd(10 + i)) * power * e;
    const ox = (vx + dx0 * 0.6) * dist, oy = (vy + dy0 * 0.6) * dist + s * 0.25 * e * e;
    const rot = (rnd(20 + i) - 0.5) * 2.4 * e;
    const sc = 1 - 0.45 * e;
    g.save();
    g.globalAlpha *= Math.max(0, 1 - p * p);
    g.translate(cx + ox, cy + oy); g.rotate(rot); g.scale(sc, sc); g.translate(-cx, -cy);
    g.beginPath(); g.moveTo(bx, by); g.lineTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.closePath();
    g.save(); g.clip();
    g.drawImage(spr, x - m, y - m, s + m * 2, s + m * 2);
    // Freshly broken edges glow with the crystal's energy.
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rgba(pulse ? THEME.pulseCore : mat.highlight, 0.55 * (1 - p));
    g.fill();
    g.restore();
    g.strokeStyle = rgba(pulse ? THEME.pulseCore : mat.highlight, 0.9 * (1 - p)); g.lineWidth = Math.max(0.8, s * 0.03);
    g.stroke();
    g.restore();
  }
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
  if (blockStyle() !== 'b4') { paintEmptyCell6(g, x, y, s); return; }
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
  if (blockStyle() !== 'b4') { paintFrame6(g, x, y, w, h, r, rim, accent); return; }
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

/**
 * Build 6 empty cell: a recessed socket. The outline is about half as bright as Build 4's so placed crystals lead;
 * depth comes from inner shadows on the top and left (light from the upper left) and a faint catch-light on the
 * lower-right lip.
 */
function paintEmptyCell6(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const r = s * 0.13;
  const well = g.createLinearGradient(x, y, x + s * 0.6, y + s);
  well.addColorStop(0, '#080D14'); well.addColorStop(1, '#0F1620');
  g.fillStyle = well;
  roundRect(g, x, y, s, s, r); g.fill();
  g.save();
  roundRect(g, x, y, s, s, r); g.clip();
  const top = g.createLinearGradient(0, y, 0, y + s * 0.3);
  top.addColorStop(0, 'rgba(0,0,0,0.6)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = top; g.fillRect(x, y, s, s * 0.3);
  const left = g.createLinearGradient(x, 0, x + s * 0.22, 0);
  left.addColorStop(0, 'rgba(0,0,0,0.45)'); left.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = left; g.fillRect(x, y, s * 0.22, s);
  // a faint reflection of the board's ambient light on the floor of the socket
  const fl = g.createRadialGradient(x + s * 0.62, y + s * 0.7, 0, x + s * 0.62, y + s * 0.7, s * 0.6);
  fl.addColorStop(0, 'rgba(120,150,190,0.05)'); fl.addColorStop(1, 'rgba(120,150,190,0)');
  g.fillStyle = fl; g.fillRect(x, y, s, s);
  g.restore();
  g.strokeStyle = highContrast ? '#5C7A8F' : 'rgba(110,140,165,0.17)';
  g.lineWidth = highContrast ? 1.5 : 1;
  roundRect(g, x + 0.5, y + 0.5, s - 1, s - 1, r); g.stroke();
  // lower-right lip catches a little light
  g.strokeStyle = 'rgba(190,210,230,0.06)';
  g.beginPath(); g.moveTo(x + r, y + s - 0.5); g.lineTo(x + s - r, y + s - 0.5);
  g.moveTo(x + s - 0.5, y + r); g.lineTo(x + s - 0.5, y + s - r); g.stroke();
}

/**
 * Build 6 board perimeter: smoked metal with a glass inner edge. The bevel is lit from the upper left and falls
 * off to the lower right; a soft ambient halo separates the board from the reactor background. The tray slots use
 * the same material without the halo.
 */
function paintFrame6(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, rim: number, accent: boolean) {
  g.save();
  if (accent) {
    // ambient light around the perimeter (magenta-violet, very soft)
    g.shadowColor = 'rgba(190,70,210,0.32)'; g.shadowBlur = rim * 5;
    g.fillStyle = '#121A24';
    roundRect(g, x, y, w, h, r); g.fill();
  }
  g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = rim * 3; g.shadowOffsetY = rim * 0.9; g.shadowOffsetX = rim * 0.4;
  g.fillStyle = '#121A24';
  roundRect(g, x, y, w, h, r); g.fill();
  g.restore();
  const metal = g.createLinearGradient(x, y, x + w * 0.35, y + h);
  metal.addColorStop(0, '#3B4656'); metal.addColorStop(0.12, '#232C39'); metal.addColorStop(0.85, '#161D28'); metal.addColorStop(1, '#0E141C');
  g.fillStyle = metal;
  roundRect(g, x, y, w, h, r); g.fill();
  // outer bevel: bright on the top and left, dark on the bottom and right
  const bev = g.createLinearGradient(x, y, x + w, y + h);
  bev.addColorStop(0, 'rgba(225,215,245,0.5)'); bev.addColorStop(0.45, 'rgba(160,170,200,0.12)'); bev.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.strokeStyle = bev; g.lineWidth = 1.2;
  roundRect(g, x + 0.6, y + 0.6, w - 1.2, h - 1.2, r); g.stroke();
  // recessed well
  const wx = x + rim, wy = y + rim, ww = w - rim * 2, wh = h - rim * 2, wr = Math.max(2, r - rim * 0.6);
  const floor = g.createLinearGradient(wx, wy, wx + ww * 0.4, wy + wh);
  floor.addColorStop(0, '#070B11'); floor.addColorStop(1, '#0B111A');
  g.fillStyle = floor;
  roundRect(g, wx, wy, ww, wh, wr); g.fill();
  g.save();
  roundRect(g, wx, wy, ww, wh, wr); g.clip();
  const inner = g.createLinearGradient(0, wy, 0, wy + rim * 3);
  inner.addColorStop(0, 'rgba(0,0,0,0.7)'); inner.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = inner; g.fillRect(wx, wy, ww, rim * 3);
  const innerL = g.createLinearGradient(wx, 0, wx + rim * 2, 0);
  innerL.addColorStop(0, 'rgba(0,0,0,0.5)'); innerL.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = innerL; g.fillRect(wx, wy, rim * 2, wh);
  if (accent) {
    const env = g.createRadialGradient(wx + ww * 0.5, wy + wh * 0.5, 0, wx + ww * 0.5, wy + wh * 0.5, Math.max(ww, wh) * 0.75);
    env.addColorStop(0, 'rgba(150,80,200,0.06)'); env.addColorStop(1, 'rgba(150,80,200,0)');
    g.fillStyle = env; g.fillRect(wx, wy, ww, wh);
  }
  g.restore();
  // glass inner edge: a thin light line on the lower-right lip of the well, a dark one on the upper-left
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1;
  roundRect(g, wx - 0.5, wy - 0.5, ww + 1, wh + 1, wr + 0.5); g.stroke();
  const glass = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
  glass.addColorStop(0, 'rgba(200,180,240,0.04)'); glass.addColorStop(1, 'rgba(220,200,255,0.2)');
  g.strokeStyle = glass; g.lineWidth = 1;
  roundRect(g, wx + 0.5, wy + 0.5, ww - 1, wh - 1, wr); g.stroke();
  if (accent) {
    // illuminated corner brackets (cyan light set into the metal)
    g.save();
    g.strokeStyle = rgba(THEME.pulse, 0.75); g.lineWidth = Math.max(1.5, rim * 0.22); g.lineCap = 'round';
    g.shadowColor = THEME.pulse; g.shadowBlur = rim * 1.4;
    const L = Math.min(w, h) * 0.07, o = rim * 0.42, rr = Math.max(2, r - o);
    const corner = (cx: number, cy: number, sx: number, sy: number) => {
      g.beginPath();
      g.moveTo(cx + sx * (rr + L), cy); g.lineTo(cx + sx * rr, cy);
      g.arcTo(cx, cy, cx, cy + sy * rr, rr);
      g.lineTo(cx, cy + sy * (rr + L)); g.stroke();
    };
    corner(x + o, y + o, 1, 1); corner(x + w - o, y + o, -1, 1); corner(x + o, y + h - o, 1, -1); corner(x + w - o, y + h - o, -1, -1);
    g.restore();
  }
}

/**
 * Build 6 tray platform: a dark glass pedestal with an illuminated front lip and a pool of light where the piece
 * sits, so available pieces read as presented rather than boxed.
 */
export function paintPedestal(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: number) {
  const r = 14;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
  const body = g.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, 'rgba(22,30,42,0.55)'); body.addColorStop(0.7, 'rgba(16,22,32,0.85)'); body.addColorStop(1, '#0B1018');
  g.fillStyle = body; roundRect(g, x, y, w, h, r); g.fill();
  g.restore();
  // pool of light on the platform surface
  const cx = x + w / 2, cy = y + h * 0.5;
  const pool = g.createRadialGradient(cx, cy, 0, cx, cy, w * 0.55);
  pool.addColorStop(0, rgba(THEME.pulse, 0.07 + 0.06 * lit)); pool.addColorStop(1, rgba(THEME.pulse, 0));
  g.fillStyle = pool; roundRect(g, x, y, w, h, r); g.fill();
  // bevelled glass edge lit from the upper left
  const edge = g.createLinearGradient(x, y, x + w, y + h);
  edge.addColorStop(0, 'rgba(210,225,245,0.32)'); edge.addColorStop(0.5, 'rgba(150,170,200,0.08)'); edge.addColorStop(1, 'rgba(0,0,0,0.4)');
  g.strokeStyle = edge; g.lineWidth = 1;
  roundRect(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke();
  // illuminated front lip
  g.save();
  g.strokeStyle = rgba(THEME.pulse, 0.35 + 0.3 * lit); g.lineWidth = 2; g.lineCap = 'round';
  g.shadowColor = THEME.pulse; g.shadowBlur = 8;
  g.beginPath(); g.moveTo(x + r + 6, y + h - 1.5); g.lineTo(x + w - r - 6, y + h - 1.5); g.stroke();
  g.restore();
}

/**
 * Build 6 energy crystal (the shipped block). Drawn procedurally in 2D and cached, so it costs nothing per frame and
 * needs no WebGL on device. Read from the overhead camera it is a cube of coloured glass:
 *  - a chamfered bevel lit from the upper left (top and left faces bright, bottom and right faces deep),
 *  - a translucent table whose far edges show through, offset towards the light, for real thickness,
 *  - light trapped in the glass: the edges glow from inside and the core is lit from below,
 *  - a soft rounded reflection in the upper-left (never a single diagonal streak), and a contact shadow.
 * Pulse Blocks are the same crystal in cyan (their energy core is drawn live on top).
 */
function paintCrystal6(g: CanvasRenderingContext2D, s: number, pulse: boolean, mat: MaterialLook, od: boolean) {
  // hex mix (theme.mix returns rgb(), which rgba() cannot parse)
  const mx = (a: string, b2: string, t: number) => { const m = mix(a, b2, t).match(/\d+/g)!.map(Number); return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join(''); };
  const base = pulse ? '#2FC4DA' : mat.color;
  const hi = pulse ? '#C6FFFF' : mat.highlight;
  const deep = pulse ? '#0B4A5E' : mat.shadow;
  const warm = od && !pulse;
  const r = s * 0.13, b = s * 0.105 * visuals.depth; // corner radius, bevel width
  const sh = visuals.shadow;
  // contact shadow, falling to the lower right
  g.save();
  g.shadowColor = `rgba(0,0,0,${0.75 * sh})`; g.shadowBlur = s * 0.12; g.shadowOffsetX = s * 0.035; g.shadowOffsetY = s * 0.06;
  g.fillStyle = mx(deep, '#000000', 0.4);
  roundRect(g, s * 0.02, s * 0.02, s * 0.96, s * 0.96, r); g.fill();
  g.restore();
  // a faint coloured spill on the floor around the crystal (light escaping through the glass)
  const spill = g.createRadialGradient(s * 0.55, s * 0.6, s * 0.3, s * 0.55, s * 0.6, s * 0.72);
  spill.addColorStop(0, rgba(base, 0.22 * visuals.brightness)); spill.addColorStop(1, rgba(base, 0));
  g.fillStyle = spill; g.fillRect(-s * 0.2, -s * 0.2, s * 1.4, s * 1.4);

  g.save();
  roundRect(g, 0, 0, s, s, r); g.clip();
  // body: saturated glass, lighter towards the light
  const body = g.createLinearGradient(0, 0, s, s);
  body.addColorStop(0, mx(base, hi, 0.25)); body.addColorStop(0.5, base); body.addColorStop(1, mx(base, deep, 0.7));
  g.fillStyle = body; g.fillRect(0, 0, s, s);
  // bevel faces (chamfer): four trapezoids, each with its own light
  const face = (pts: number[], fill: string | CanvasGradient) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fillStyle = fill; g.fill(); };
  const top = g.createLinearGradient(0, 0, 0, b);
  top.addColorStop(0, mx(hi, base, 0.2)); top.addColorStop(1, mx(base, hi, 0.3));
  face([0, 0, s, 0, s - b, b, b, b], top);
  const left = g.createLinearGradient(0, 0, b, 0);
  left.addColorStop(0, mx(hi, base, 0.4)); left.addColorStop(1, mx(base, hi, 0.15));
  face([0, 0, b, b, b, s - b, 0, s], left);
  const right = g.createLinearGradient(s - b, 0, s, 0);
  right.addColorStop(0, mx(base, deep, 0.35)); right.addColorStop(1, mx(base, deep, 0.75));
  face([s, 0, s, s, s - b, s - b, s - b, b], right);
  const bottom = g.createLinearGradient(0, s - b, 0, s);
  bottom.addColorStop(0, mx(base, deep, 0.45)); bottom.addColorStop(1, mx(deep, '#000000', 0.35));
  face([0, s, b, s - b, s - b, s - b, s, s], bottom);
  // table (top face of the glass): translucent, darker in the middle where you look deepest into it
  const tx = b, tw = s - b * 2, tr = r * 0.55;
  g.save();
  roundRect(g, tx, tx, tw, tw, tr); g.clip();
  const tbl = g.createRadialGradient(s * 0.56, s * 0.58, 0, s * 0.56, s * 0.58, tw * 0.75);
  tbl.addColorStop(0, mx(base, deep, 0.62)); tbl.addColorStop(0.65, mx(base, deep, 0.35)); tbl.addColorStop(1, mx(base, deep, 0.05));
  g.fillStyle = tbl; g.fillRect(tx, tx, tw, tw);
  // light trapped in the glass: the inside of the edges glows (edge-lit acrylic), strongest on the lower right
  const glowCol = warm ? mx(hi, '#FFE2A8', 0.45) : hi;
  g.globalCompositeOperation = 'lighter';
  const ew = s * 0.16;
  const edges: [number, number, number, number, number, number, number, number, number][] = [
    [tx, tx, tw, ew, tx, tx, tx, tx + ew, 0.22], // top
    [tx, tx, ew, tw, tx, tx, tx + ew, tx, 0.2], // left
    [tx, tx + tw - ew, tw, ew, tx, tx + tw, tx, tx + tw - ew, 0.55], // bottom
    [tx + tw - ew, tx, ew, tw, tx + tw, tx, tx + tw - ew, tx, 0.55], // right
  ];
  for (const [x, y, w, h, x0, y0, x1, y1, a] of edges) {
    const lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, rgba(glowCol, a * visuals.edge * (warm ? 1.3 : 1))); lg.addColorStop(1, rgba(glowCol, 0));
    g.fillStyle = lg; g.fillRect(x, y, w, h);
  }
  // internal illumination: an energy core lit from below, offset away from the light
  const core = g.createRadialGradient(s * 0.58, s * 0.6, 0, s * 0.58, s * 0.6, s * 0.42);
  core.addColorStop(0, rgba(glowCol, (warm ? 0.42 : 0.28) * visuals.brightness)); core.addColorStop(1, rgba(glowCol, 0));
  g.fillStyle = core; g.fillRect(0, 0, s, s);
  g.globalCompositeOperation = 'source-over';
  g.restore();
  // the far (bottom) edges of the cube seen through the glass, shifted towards the light: real thickness
  const d = s * 0.075, fx0 = tx + s * 0.06 - d, fw = tw - s * 0.12;
  g.strokeStyle = rgba(hi, 0.3 * visuals.edge); g.lineWidth = Math.max(0.6, s * 0.014);
  roundRect(g, fx0, fx0, fw, fw, tr); g.stroke();
  g.strokeStyle = rgba(hi, 0.16 * visuals.edge);
  g.beginPath();
  g.moveTo(tx + tw, tx + tw); g.lineTo(fx0 + fw, fx0 + fw);
  g.moveTo(tx + tw, tx); g.lineTo(fx0 + fw, fx0);
  g.moveTo(tx, tx + tw); g.lineTo(fx0, fx0 + fw);
  g.stroke();
  // crisp facet lines where bevel meets table (lit on the top/left, shadowed on the bottom/right)
  g.lineWidth = Math.max(0.6, s * 0.012);
  g.strokeStyle = rgba(mx(hi, '#FFFFFF', 0.3), 0.7 * visuals.edge);
  g.beginPath(); g.moveTo(tx, tx + tw); g.lineTo(tx, tx); g.lineTo(tx + tw, tx); g.stroke();
  g.strokeStyle = rgba(deep, 0.65);
  g.beginPath(); g.moveTo(tx + tw, tx); g.lineTo(tx + tw, tx + tw); g.lineTo(tx, tx + tw); g.stroke();
  // chamfer seams at the corners
  g.strokeStyle = rgba(hi, 0.22); g.lineWidth = Math.max(0.5, s * 0.008);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(tx, tx); g.moveTo(s, 0); g.lineTo(tx + tw, tx); g.moveTo(0, s); g.lineTo(tx, tx + tw); g.stroke();
  // soft reflection of the key light: a rounded window in the upper left (no diagonal streak)
  const rx = s * 0.3, ry = s * 0.24;
  const refl = g.createRadialGradient(rx, ry, 0, rx, ry, s * 0.3);
  refl.addColorStop(0, `rgba(255,255,255,${0.22 * visuals.reflectivity})`); refl.addColorStop(0.55, `rgba(255,255,255,${0.06 * visuals.reflectivity})`); refl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = refl;
  g.beginPath(); g.ellipse(rx, ry, s * 0.24, s * 0.15, -0.35, 0, Math.PI * 2); g.fill();
  // a small, sharp secondary glint near the far corner of the table
  g.fillStyle = rgba(mx(hi, '#FFFFFF', 0.5), 0.35 * visuals.reflectivity);
  g.beginPath(); g.ellipse(tx + tw * 0.82, tx + tw * 0.2, s * 0.035, s * 0.018, -0.6, 0, Math.PI * 2); g.fill();
  g.restore();
  if (pulse) {
    // Pulse energy core: a faceted diamond suspended in the glass (shape, not only colour, identifies it)
    const cx = s * 0.5, cy = s * 0.5, d = s * 0.2;
    const halo = g.createRadialGradient(cx, cy, 0, cx, cy, s * 0.34);
    halo.addColorStop(0, 'rgba(198,255,255,0.55)'); halo.addColorStop(1, 'rgba(89,221,235,0)');
    g.fillStyle = halo; g.fillRect(0, 0, s, s);
    const facet = (x1: number, y1: number, x2: number, y2: number, col: string) => { g.beginPath(); g.moveTo(cx, cy); g.lineTo(x1, y1); g.lineTo(x2, y2); g.closePath(); g.fillStyle = col; g.fill(); };
    facet(cx, cy - d, cx - d, cy, '#F2FFFF'); facet(cx, cy - d, cx + d, cy, '#B8F6FF');
    facet(cx - d, cy, cx, cy + d, '#7FE6F2'); facet(cx + d, cy, cx, cy + d, '#3FBFD3');
  }
  // outer edge: lit rim on the upper left fading to a dark lip on the lower right
  const rim = g.createLinearGradient(0, 0, s, s);
  rim.addColorStop(0, rgba(mx(hi, '#FFFFFF', 0.35), 0.85)); rim.addColorStop(0.5, rgba(hi, 0.25)); rim.addColorStop(1, rgba(deep, 0.9));
  g.strokeStyle = rim; g.lineWidth = Math.max(0.7, s * 0.016);
  roundRect(g, s * 0.008, s * 0.008, s * 0.984, s * 0.984, r); g.stroke();
  if (highContrast) {
    g.strokeStyle = '#FFFFFF'; g.lineWidth = Math.max(1, s * 0.025);
    roundRect(g, tx + s * 0.02, tx + s * 0.02, tw - s * 0.04, tw - s * 0.04, tr); g.stroke();
  }
}
