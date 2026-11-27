// BLOQ palette: graphite surfaces, cyan energy. Build 3 standard blocks use level materials (config.materials).
// Colour carries meaning: titanium = standard block, cyan = Pulse. Purple and gold are reserved
// for future special blocks and are not used on blocks yet.

export const THEME = {
  bg: '#0C131D',
  bg2: '#141E2B',
  empty: '#17222E',
  gridBorder: '#304556',
  titanium: '#657F92',
  titaniumHi: '#A9C4D4',
  titaniumLo: '#304657',
  pulse: '#59DDEB',
  pulseCore: '#C6FFFF',
  text: '#EAF5FF',
  textDim: '#8FA8B9',
  gold: '#E6C47E',
  invalid: '#E56868',
  /** Reserved for future Surge / Multiplier blocks. */
  reservedPurple: '#9B7BEA',
  reservedGold: '#E6C47E',
} as const;

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) + (((y >> s) & 255) - ((x >> s) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
