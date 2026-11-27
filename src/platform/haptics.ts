// Haptics through Capacitor (Core Haptics on iPhone). In a browser it uses navigator.vibrate where it exists.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticKind = 'select' | 'place' | 'rotate' | 'clear' | 'pulse' | 'big' | 'invalid' | 'record' | 'levelup' | 'unlock';
export type HapticIntensity = 'low' | 'medium' | 'high';

const native = Capacitor.isNativePlatform();
let enabled = true;
let intensity: HapticIntensity = 'medium';

export function setHapticIntensity(i: HapticIntensity) { intensity = i; }

// Intensity shifts each kind one impact step lighter or heavier (dev balancing setting).
const STEPS = [ImpactStyle.Light, ImpactStyle.Medium, ImpactStyle.Heavy];
const impact = (base: number) => STEPS[Math.max(0, Math.min(2, base + (intensity === 'low' ? -1 : intensity === 'high' ? 1 : 0)))];

export function setHapticsEnabled(on: boolean) { enabled = on; }

export function haptic(kind: HapticKind) {
  if (!enabled) return;
  if (native) {
    const p = (() => {
      switch (kind) {
        case 'select': return Haptics.selectionChanged();
        case 'place': return Haptics.impact({ style: impact(0) });
        case 'rotate': return Haptics.selectionChanged();
        case 'clear': return Haptics.impact({ style: impact(1) });
        case 'pulse': return Haptics.impact({ style: impact(1) });
        case 'big': return Haptics.impact({ style: impact(2) });
        case 'invalid': return Haptics.notification({ type: NotificationType.Warning });
        case 'record': return Haptics.notification({ type: NotificationType.Success });
        case 'levelup': return Haptics.notification({ type: NotificationType.Success });
        case 'unlock': return Haptics.impact({ style: impact(0) });
      }
    })();
    p?.catch(() => {});
    return;
  }
  const ms = { select: 4, place: 8, rotate: 5, clear: 14, pulse: 18, big: [20, 40, 30], invalid: [6, 30, 6], record: [10, 50, 20], levelup: [12, 40, 12, 40, 24], unlock: 10 }[kind];
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}
