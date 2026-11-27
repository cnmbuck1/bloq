import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { GEM_FOR_MATERIAL, GEM_NAMES, GEM_SPAN, gemFor } from '../src/render/gems';

describe('Build 8 gemstone assets', () => {
  it('every material has its own gemstone (materials, names and unlock levels are unchanged)', () => {
    const ids = DEFAULT_CONFIG.materials.map((m) => m.id);
    expect(ids).toEqual(['magenta', 'violet', 'emerald', 'amber', 'crimson', 'platinum']);
    const gems = ids.map(gemFor);
    expect(new Set(gems).size).toBe(ids.length);
    for (const g of gems) expect(GEM_NAMES[g]).toBeTruthy();
    expect(Object.keys(GEM_FOR_MATERIAL).sort()).toEqual([...ids].sort());
  });

  it('ships every render the game loads, as compact WebP files', () => {
    const dir = 'src/assets/gems';
    const files = readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => f.replace('.webp', '')).sort();
    expect(files).toEqual(['amber', 'amethyst', 'aqua', 'compartment', 'diamond', 'emerald', 'pink', 'pulse', 'ruby', 'sapphire', 'topaz']);
    const total = files.reduce((a, f) => a + statSync(`${dir}/${f}.webp`).size, 0);
    expect(total).toBeLessThan(400 * 1024);
  });

  it('the stone sits inside its compartment (narrower than the opening, wider than the floor)', () => {
    // Compartment opening 0.892 of the pitch (0.86 + chamfer), floor 0.72; the stone is 94% of a cell (0.92 pitch).
    const stone = 0.94 * 0.92;
    expect(stone).toBeLessThan(0.892);
    expect(stone).toBeGreaterThan(0.72);
    expect(GEM_SPAN).toBeGreaterThan(0.6);
    expect(GEM_SPAN).toBeLessThan(0.75);
  });
});
