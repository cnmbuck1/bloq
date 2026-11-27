// Player settings, stored locally.

import { KEYS, load, store } from '../platform/storage';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  /** Build 6: fewer particles and no ambient background motion (older devices, battery). */
  reducedEffects: boolean;
  /** Build 4: optional ambient music, and separate music / sound-effect levels (0..1). */
  music: boolean;
  musicVolume: number;
  sfxVolume: number;
}

function systemReducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
function systemHighContrast() {
  try { return matchMedia('(prefers-contrast: more)').matches; } catch { return false; }
}

export function loadSettings(): Settings {
  const defaults: Settings = { sound: true, haptics: true, reducedMotion: systemReducedMotion(), highContrast: systemHighContrast(), reducedEffects: false, music: true, musicVolume: 0.5, sfxVolume: 0.8 };
  try {
    const raw = load(KEYS.settings);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* defaults */ }
  return defaults;
}

export function saveSettings(s: Settings) { store(KEYS.settings, JSON.stringify(s)); }
