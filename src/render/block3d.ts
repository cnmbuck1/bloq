// Build 5 graphics prototypes: blocks rendered as real 3D objects with physically based materials, then cached as
// sprites so gameplay drawing stays as cheap as Build 4 (one drawImage per block).
//
// One small WebGL renderer (Three.js) builds each sprite on demand: a fixed orthographic camera looks straight down
// with a slight forward tilt, so every block shows its top face, bevels and a sliver of its front wall the same way.
// Lighting comes from a procedural studio environment (soft boxes, no HDR files) so reflections are controlled and
// consistent. Nothing is drawn with WebGL during play: once a sprite exists, the 2D canvas just copies it.
//
//   5B Anodized metal: a solid machined tile. Coloured metal under a thin clear anodized coat, brushed grain,
//      a precise chamfer, a slightly domed face and a soft contact shadow.
//   5C Crystal-metal hybrid: a cut crystal held in a thin metal bezel. The crystal transmits and refracts light
//      onto a faceted pavilion beneath it, so colour comes from inside the block, not from a gradient.

import * as THREE from 'three';

export type BlockStyle = 'b4' | 'b5b' | 'b5c';
export interface Look3D { color: string; highlight: string; shadow: string }

/** Sprite padding as a fraction of the cell (room for the contact shadow); must match blocks.ts MARGIN. */
export const MARGIN_3D = 0.2;
/** Camera tilt (degrees): enough to show the block's thickness, too little to read as perspective. */
const TILT = 11;

let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
let env: THREE.Texture | null = null;

/** True when WebGL is available (first call creates the renderer). Build 4 graphics are used otherwise. */
export function available3D(): boolean {
  if (renderer) return true;
  if (failed) return false;
  try {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setClearColor(0x000000, 0);
    env = studioEnvironment(renderer);
    canvas.addEventListener('webglcontextlost', () => { renderer = null; failed = true; });
    return true;
  } catch {
    failed = true;
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Studio environment: what the metal and crystal reflect. A large soft key box above and to the top left, a thin
// strip light on the left, a dim warm-cool fill from the front, and darkness elsewhere so edges stay defined.

function studioEnvironment(r: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090d);
  const panel = (w: number, h: number, intensity: number, color: number, pos: [number, number, number]) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(...pos); p.lookAt(0, 0, 0); scene.add(p);
  };
  // Blocks lie in the XY plane facing +Z; the camera sits on +Z. Straight overhead is kept dark: a flat face seen
  // from above reflects that direction, so crystal tables stay clear and metal faces get their light from the
  // dome of the face sweeping across the key box rather than from a flat wash.
  panel(9, 8, 2.6, 0xffffff, [-4.6, 5.6, 7.2]);   // key soft box, high top-left
  panel(6, 6, 0.22, 0xd8e4ff, [0, 0, 12]);        // very dim overhead fill (keeps deep facets from going black)
  panel(7, 7, 1.0, 0xf2f5ff, [-2.4, 2.9, 11]);  // broad soft gradient box: falls off across flat faces from the top left
  panel(4, 3, 0.9, 0xe6eeff, [3.5, 5.5, 8]);      // small secondary box, high top-right
  panel(16, 2.2, 1.3, 0xffffff, [0, 6.5, 8.5]);    // long horizontal strip: the brushed sheen across the top of metal faces
  panel(5, 14, 2.0, 0xffffff, [-9.5, 1.5, 0.2]);  // left strip, straddling the horizon: lights the left bevel
  panel(14, 5, 2.6, 0xffffff, [-1, 9.5, -0.6]);   // top strip, straddling the horizon: lights the top bevel
  panel(12, 3, 0.8, 0xbcd8ff, [0, -10, 1.2]);     // cool bounce from the front (front bevel and wall stay readable)
  panel(3, 12, 0.4, 0xffd9f0, [10, -1, 1.2]);      // warm rim on the right
  const pm = new THREE.PMREMGenerator(r);
  const tex = pm.fromScene(scene, 0.035).texture;
  pm.dispose();
  return tex;
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry. Tiles are built from a rounded square extruded along +Z with a bevel, so the chamfer is real geometry
// (it catches the environment) rather than painted.

function roundedSquare(half: number, r: number, hole?: THREE.Path): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-half + r, -half);
  s.lineTo(half - r, -half); s.quadraticCurveTo(half, -half, half, -half + r);
  s.lineTo(half, half - r); s.quadraticCurveTo(half, half, half - r, half);
  s.lineTo(-half + r, half); s.quadraticCurveTo(-half, half, -half, half - r);
  s.lineTo(-half, -half + r); s.quadraticCurveTo(-half, -half, -half + r, -half);
  if (hole) s.holes.push(hole);
  return s;
}
function roundedPath(half: number, r: number): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(-half + r, -half);
  p.quadraticCurveTo(-half, -half, -half, -half + r); p.lineTo(-half, half - r);
  p.quadraticCurveTo(-half, half, -half + r, half); p.lineTo(half - r, half);
  p.quadraticCurveTo(half, half, half, half - r); p.lineTo(half, -half + r);
  p.quadraticCurveTo(half, -half, half - r, -half); p.lineTo(-half + r, -half);
  return p;
}

/** A tile: outer half-size `half`, body thickness `depth`, chamfer `bevel` wide and `bevelH` tall. */
function tile(half: number, corner: number, depth: number, bevel: number, bevelH: number, segments: number, hole?: THREE.Path) {
  const shape = roundedSquare(half - bevel, Math.max(0.005, corner - bevel * 0.6), hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevelH, bevelSize: bevel, bevelSegments: segments, curveSegments: 10, bevelOffset: 0 });
  g.translate(0, 0, bevelH); // bottom of the tile at z = 0
  g.computeVertexNormals();
  return g;
}

/** A pillowed face as a normal map: flat in the middle, rolling off toward the edges, with fine brushed grain. */
const domes = new Map<string, THREE.DataTexture>();
function domeNormals(strength: number, grainAmt: number): THREE.DataTexture {
  const k = `${strength}|${grainAmt}`;
  const hit = domes.get(k); if (hit) return hit;
  const N = 256, data = new Uint8Array(N * N * 4);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = new Float32Array(N).map(() => rnd() - 0.5);
  const h = (u: number, v: number) => { // u,v in -1..1; superellipse dome
    const d = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
    return -strength * (0.75 * d * d + 0.25 * Math.pow(d, 8));
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x / (N - 1)) * 2 - 1, v = (y / (N - 1)) * 2 - 1, e = 2 / N;
    let dx = (h(u + e, v) - h(u - e, v)) / (2 * e), dy = (h(u, v + e) - h(u, v - e)) / (2 * e);
    dy += rows[y] * grainAmt * 2 + (rows[(y + 1) % N] - rows[y]) * grainAmt; // brushed: along x
    const len = Math.hypot(dx, dy, 1);
    const i = (y * N + x) * 4;
    data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255); data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
    data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255); data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N);
  t.needsUpdate = true; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  domes.set(k, t);
  return t;
}
/** A real pillowed panel: a finely subdivided square whose centre rises by `rise` and rolls off at the edges. */
function pillow(half: number, rise: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(half * 2, half * 2, 48, 48);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / half, v = pos.getY(i) / half;
    // Separable profile (no diagonal creases): nearly flat across the middle, rolling off in the last fifth.
    const f = (x: number) => 1 - 0.35 * x * x - 0.65 * Math.pow(Math.abs(x), 12);
    pos.setZ(i, rise * f(u) * f(v));
  }
  g.computeVertexNormals();
  return g;
}

/** Fit a texture to a face whose world-XY UVs span -half..half. */
function fitUV(t: THREE.Texture, half: number): THREE.Texture {
  const c = t.clone(); c.repeat.set(1 / (2 * half), 1 / (2 * half)); c.offset.set(0.5, 0.5); c.needsUpdate = true; return c;
}

/**
 * A cut crystal: an octagonal girdle (a square with clipped corners), a short vertical girdle wall, then a crown of
 * flat facets rising to a table. Each crown side is split into four triangles around a slightly raised point, so
 * neighbouring facets catch the studio lights differently (the sparkle comes from geometry, not painted streaks).
 */
function gemGeometry(half: number, clip: number, girdleH: number, crownH: number, table: number): THREE.BufferGeometry {
  const oct = (h: number, c: number, z: number) => [
    [-h + c, -h], [h - c, -h], [h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c],
  ].map(([x, y]) => new THREE.Vector3(x, y, z));
  const G0 = oct(half, clip, 0), G1 = oct(half, clip, girdleH), T = oct(half * table, clip * table, girdleH + crownH);
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const ctr = new THREE.Vector3(0, 0, girdleH + crownH);
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    // girdle wall
    tri(G0[i], G0[j], G1[j]); tri(G0[i], G1[j], G1[i]);
    // crown side, split around a raised midpoint
    const m = new THREE.Vector3().addVectors(G1[i], G1[j]).add(T[i]).add(T[j]).multiplyScalar(0.25);
    m.z += crownH * 0.12;
    tri(G1[i], G1[j], m); tri(G1[j], T[j], m); tri(T[j], T[i], m); tri(T[i], G1[i], m);
    // table
    tri(T[i], T[j], ctr);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** The mirror pavilion under a crystal: an inverted octagonal pyramid of polished facets. */
function pavilionGeometry(half: number, clip: number, depth: number): THREE.BufferGeometry {
  const P = [
    [-half + clip, -half], [half - clip, -half], [half, -half + clip], [half, half - clip], [half - clip, half], [-half + clip, half], [-half, half - clip], [-half, -half + clip],
  ];
  const pos: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = P[i], b = P[(i + 1) % 8];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    // two facets per side, meeting at the side's midpoint, both falling to the apex
    pos.push(a[0], a[1], depth, mx, my, depth, 0, 0, 0);
    pos.push(mx, my, depth, b[0], b[1], depth, 0, 0, 0);
    // shallow star facet near the girdle
    pos.push(a[0], a[1], depth, b[0], b[1], depth, mx * 0.7, my * 0.7, depth * 0.72);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const col = (c: string) => new THREE.Color().setStyle(c);
const lerpCol = (a: string, b: string, t: number) => col(a).lerp(col(b), t);

// ---------------------------------------------------------------------------------------------------------------
// Models

/** 5B: anodized metal tile. */
function metalBlock(look: Look3D): THREE.Group {
  const grp = new THREE.Group();
  const base = lerpCol(look.color, look.shadow, 0.12);
  const body = new THREE.MeshPhysicalMaterial({
    color: base, metalness: 1, roughness: 0.27, clearcoat: 0.25, clearcoatRoughness: 0.18, envMapIntensity: 1.2,
  });
  // Main body with a broad, crisp 45° chamfer: lit on the top and left, falling into shade on the right and front.
  grp.add(new THREE.Mesh(tile(0.47, 0.1, 0.1, 0.115, 0.1, 1), body));
  // Face: a gently pillowed, brushed panel. The pillow sweeps the key light across the face (bright top left,
  // deepening to the bottom right) and the anisotropic grain stretches the reflection along the brushing.
  const P = 0.355;
  const face = new THREE.MeshPhysicalMaterial({
    color: base, metalness: 1, roughness: 0.26,
    normalMap: fitUV(domeNormals(0, 0.14), P), normalScale: new THREE.Vector2(1, 1),
    clearcoat: 0.3, clearcoatRoughness: 0.12, envMapIntensity: 1.15, anisotropy: 0.9,
  });
  const plate = new THREE.Mesh(pillow(P, 0.03), face);
  plate.position.z = 0.1 + 0.1 * 2 - 0.012;
  grp.add(plate);
  return grp;
}

/** 5B Pulse: a dark titanium housing holding a cyan energy crystal. */
function metalPulse(): THREE.Group {
  const grp = new THREE.Group();
  const housing = new THREE.MeshPhysicalMaterial({ color: col('#3FA9B8'), metalness: 1, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.18, envMapIntensity: 1.2 });
  grp.add(new THREE.Mesh(tile(0.47, 0.1, 0.1, 0.115, 0.1, 1), housing));
  // Recessed well around the crystal.
  const well = new THREE.Mesh(tile(0.34, 0.07, 0.004, 0.03, 0.02, 2), new THREE.MeshPhysicalMaterial({ color: col('#0A2A31'), metalness: 0.6, roughness: 0.45, emissive: col('#59DDEB'), emissiveIntensity: 0.12 }));
  well.position.z = 0.3 - 0.03; grp.add(well);
  grp.add(energyCrystal(0.31, 0.29));
  return grp;
}

/** The Pulse diamond: a faceted, self-lit cyan crystal (brilliant-style: a low octagonal crown over a table). */
function energyCrystal(size: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(size, 0);
  const core = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    color: col('#7FEFFF'), emissive: col('#3FD4E6'), emissiveIntensity: 0.9, metalness: 0.1, roughness: 0.12,
    clearcoat: 1, clearcoatRoughness: 0.04, flatShading: true, envMapIntensity: 1.4,
  }));
  core.scale.set(1, 1, 0.42); core.position.z = z;
  g.add(core);
  const table = new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.42, 0), new THREE.MeshPhysicalMaterial({
    color: col('#E8FFFF'), emissive: col('#C6FFFF'), emissiveIntensity: 1.1, roughness: 0.1, flatShading: true,
  }));
  table.scale.set(1, 1, 0.3); table.position.z = z + size * 0.3;
  g.add(table);
  return g;
}

/** 5C: a cut crystal in a thin metal bezel, over a faceted pavilion that the crystal refracts. */
function crystalBlock(look: Look3D, pulse: boolean): THREE.Group {
  const grp = new THREE.Group();
  const tint = pulse ? '#59DDEB' : look.color;
  const hi = pulse ? '#C6FFFF' : look.highlight;
  const deep = pulse ? '#0B4F5C' : look.shadow;
  // Bezel: a polished metal frame, slightly tinted by the crystal it holds.
  const bezelMat = new THREE.MeshPhysicalMaterial({ color: lerpCol('#6E7884', tint, 0.25), metalness: 1, roughness: 0.3, clearcoat: 0.2, clearcoatRoughness: 0.15, envMapIntensity: 0.5 });
  grp.add(new THREE.Mesh(tile(0.47, 0.1, 0.1, 0.035, 0.035, 3, roundedPath(0.4, 0.05)), bezelMat));
  // Seat under the crystal (dark, so the crystal reads deep rather than milky).
  const seat = new THREE.Mesh(tile(0.43, 0.08, 0.02, 0.01, 0.01, 1), new THREE.MeshStandardMaterial({ color: lerpCol(deep, '#000000', 0.55), metalness: 0.2, roughness: 0.6 }));
  seat.position.z = -0.14; grp.add(seat);
  // Pavilion: polished mirror facets beneath the crystal. Seen through it, each facet reflects a different part of
  // the studio, which gives the block its inner brilliance.
  const pav = new THREE.Mesh(pavilionGeometry(0.42, 0.09, 0.17), new THREE.MeshPhysicalMaterial({
    color: lerpCol(tint, hi, 0.2), metalness: 0.75, roughness: 0.22, emissive: col(tint), emissiveIntensity: pulse ? 0.55 : 0.42, flatShading: true, envMapIntensity: 1.6,
  }));
  pav.position.z = -0.1;
  grp.add(pav);
  // The crystal.
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: lerpCol(tint, hi, 0.4), metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.1, ior: 1.5,
    attenuationColor: lerpCol(tint, hi, 0.2), attenuationDistance: 0.5, specularIntensity: 1, specularColor: col('#ffffff'),
    iridescence: 0.4, iridescenceIOR: 1.4, dispersion: 3, envMapIntensity: 1.5, flatShading: true,
  });
  const gem = new THREE.Mesh(gemGeometry(0.415, 0.09, 0.06, 0.12, 0.5), crystalMat);
  gem.position.z = 0.1;
  grp.add(gem);
  if (pulse) {
    // The energy core sits inside the crystal, so the crystal's facets refract and frame it.
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), new THREE.MeshPhysicalMaterial({
      color: col('#7FF0FF'), emissive: col('#59DDEB'), emissiveIntensity: 1.6, roughness: 0.1, metalness: 0, flatShading: true,
    }));
    core.scale.set(1, 1, 0.5); core.position.z = 0.15;
    grp.add(core);
  }
  return grp;
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering a sprite

const scene = new THREE.Scene();
const key = new THREE.DirectionalLight(0xffffff, 1.6);
const fill = new THREE.HemisphereLight(0xdfe9ff, 0x0a0f18, 0.35);
key.position.set(-2.5, 3, 6);
scene.add(key, fill);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);

/**
 * Renders one block sprite: a canvas of `px` × `px` device pixels covering the cell plus MARGIN_3D on every side,
 * with the soft contact shadow painted underneath. Returns null if WebGL is unavailable.
 */
export function renderBlock3D(style: 'b5b' | 'b5c', pulse: boolean, look: Look3D, px: number, opts: { shadow?: number; highContrast?: boolean } = {}): HTMLCanvasElement | null {
  if (!available3D() || !renderer) return null;
  const model = style === 'b5b' ? (pulse ? metalPulse() : metalBlock(look)) : crystalBlock(look, pulse);
  // Height of the model's top, to frame the camera on its projected centre.
  const box = new THREE.Box3().setFromObject(model);
  const zt = box.max.z;
  const t = (TILT * Math.PI) / 180;
  scene.environment = env;
  scene.add(model);
  const half = 0.5 + MARGIN_3D;
  camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half;
  camera.updateProjectionMatrix();
  const target = new THREE.Vector3(0, 0, zt / 2);
  camera.position.set(0, -Math.sin(t) * 10, Math.cos(t) * 10).add(target);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  const ss = Math.min(1024, Math.ceil(px * 2)); // supersample, then let the 2D canvas filter down
  renderer.setSize(ss, ss, false);
  renderer.toneMappingExposure = style === 'b5b' ? 0.88 : 1;
  renderer.render(scene, camera);
  scene.remove(model);
  model.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });

  const out = document.createElement('canvas');
  out.width = px; out.height = px;
  const g = out.getContext('2d')!;
  const cell = px / (1 + MARGIN_3D * 2), m = cell * MARGIN_3D;
  // Contact shadow: tight and dark at the base, with a wider soft penumbra, offset away from the key light.
  const sh = opts.shadow ?? 1;
  if (sh > 0) {
    g.save();
    g.filter = `blur(${cell * 0.06}px)`;
    g.fillStyle = `rgba(0,0,0,${Math.min(0.85, 0.62 * sh)})`;
    rr(g, m + cell * 0.05, m + cell * 0.1, cell * 0.92, cell * 0.92, cell * 0.12); g.fill();
    g.filter = `blur(${cell * 0.14}px)`;
    g.fillStyle = `rgba(0,0,0,${Math.min(0.6, 0.35 * sh)})`;
    rr(g, m + cell * 0.04, m + cell * 0.16, cell * 0.96, cell * 0.92, cell * 0.16); g.fill();
    g.restore();
  }
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(renderer.domElement, 0, 0, ss, ss, 0, 0, px, px);
  if (opts.highContrast) {
    g.strokeStyle = '#FFFFFF'; g.lineWidth = Math.max(1.5, cell * 0.045);
    rr(g, m + g.lineWidth / 2, m + g.lineWidth / 2, cell - g.lineWidth, cell - g.lineWidth, cell * 0.12); g.stroke();
  }
  return out;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
}
