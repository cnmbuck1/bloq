// Build 8: pre-rendered gemstone crystals and the machined board compartment.
//
// The crystals are path-traced in Blender (Cycles) from tools/render/crystal_scene.py: a princess cut with a tall
// girdle, two crown bevels and a pavilion that returns light through the table. Each render is a transparent WebP
// seen from 16 degrees off vertical (the front facet shows, which gives the crystal its thickness). The compartment is
// one recessed cell rendered straight down at exactly one cell pitch, so it tiles seamlessly at any board size.
// Everything is inlined into the bundle (no network) and decoded once at start-up.

import pink from '../assets/gems/pink.webp?inline';
import amethyst from '../assets/gems/amethyst.webp?inline';
import emerald from '../assets/gems/emerald.webp?inline';
import amber from '../assets/gems/amber.webp?inline';
import ruby from '../assets/gems/ruby.webp?inline';
import diamond from '../assets/gems/diamond.webp?inline';
import sapphire from '../assets/gems/sapphire.webp?inline';
import aqua from '../assets/gems/aqua.webp?inline';
import topaz from '../assets/gems/topaz.webp?inline';
import pulse from '../assets/gems/pulse.webp?inline';
import compartment from '../assets/gems/compartment.webp?inline';

export type GemKey = 'pink' | 'amethyst' | 'emerald' | 'amber' | 'ruby' | 'diamond' | 'sapphire' | 'aqua' | 'topaz' | 'pulse';
const SRC: Record<GemKey | 'compartment', string> = { pink, amethyst, emerald, amber, ruby, diamond, sapphire, aqua, topaz, pulse, compartment };

/** Material id (config.materials) -> gemstone. Materials, names and unlock levels are unchanged; only the look is. */
export const GEM_FOR_MATERIAL: Record<string, GemKey> = {
  magenta: 'pink', violet: 'amethyst', emerald: 'emerald', amber: 'amber', crimson: 'ruby', platinum: 'diamond',
};
export const gemFor = (materialId: string): GemKey => GEM_FOR_MATERIAL[materialId] ?? 'sapphire';

/** Display names for the gemstone behind each material (materials screen, notices). */
export const GEM_NAMES: Record<GemKey, string> = {
  pink: 'Pink sapphire', amethyst: 'Amethyst', emerald: 'Emerald', amber: 'Amber', ruby: 'Ruby', diamond: 'Diamond',
  sapphire: 'Royal sapphire', aqua: 'Aquamarine', topaz: 'Golden topaz', pulse: 'Aquamarine core',
};

/** The crystal's width as a fraction of its render (0.88 units seen through a 1.3-unit orthographic camera). */
export const GEM_SPAN = 0.682;
/** The 16-degree view puts the stone's visual centre 7.8% of the image above the image centre (measured). */
export const GEM_RISE = 0.078;

const imgs = new Map<string, HTMLImageElement>();
let ready = false;
let loading: Promise<void> | null = null;

/** Decodes every image once. Resolves even if decoding fails (the renderer then falls back to Build 6 crystals). */
export function preloadGems(): Promise<void> {
  if (loading) return loading;
  if (typeof Image === 'undefined') return (loading = Promise.resolve());
  loading = Promise.all(Object.entries(SRC).map(([k, src]) => new Promise<void>((res) => {
    const im = new Image();
    im.onload = () => { imgs.set(k, im); res(); };
    im.onerror = () => res();
    im.src = src;
  }))).then(() => { ready = imgs.size === Object.keys(SRC).length; });
  return loading;
}

export const gemsReady = () => ready;
export function gemImage(k: GemKey): HTMLImageElement | undefined { return ready ? imgs.get(k) : undefined; }
export function compartmentImage(): HTMLImageElement | undefined { return ready ? imgs.get('compartment') : undefined; }
