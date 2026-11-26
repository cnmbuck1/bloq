// Player settings, stored locally.

import { KEYS, load, store } from '../platform/storage';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
}

function systemReducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
function systemHighContrast() {
  try { return matchMedia('(prefers-contrast: more)').matches; } catch { return false; }
}

export function loadSettings(): Settings {
  const defaults: Settings = { sound: true, haptics: true, reducedMotion: systemReducedMotion(), highContrast: systemHighContrast() };
  try {
    const raw = load(KEYS.settings);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* defaults */ }
  return defaults;
}

export function saveSettings(s: Settings) { store(KEYS.settings, JSON.stringify(s)); }
