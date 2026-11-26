// BLOQ palette (from the Build 1 spec). Colour is cosmetic; it never affects the rules.

export const THEME = {
  bg: '#141C2E',
  boardPanel: '#1A2438',
  empty: '#263247',
  emptyEdge: '#2E3B53',
  text: '#F1F5FF',
  textDim: '#9AA8C3',
  valid: 'rgba(255,255,255,0.22)',
  invalid: '#FF5C7A',
  lineGlow: 'rgba(255,255,255,0.9)',
  pulseCyan: '#22E4FF',
  pulseWhite: '#F4FDFF',
  blocks: ['#42B5F5', '#A78BFA', '#34D399', '#FBBF24', '#FB7185'],
} as const;

export function shade(hex: string, amt: number): string {
  // amt in -1..1: negative darkens toward black, positive lightens toward white.
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round(r + (t - r) * p); g = Math.round(g + (t - g) * p); b = Math.round(b + (t - b) * p);
  return `rgb(${r},${g},${b})`;
}

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
