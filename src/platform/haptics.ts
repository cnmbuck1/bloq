// Haptics through Capacitor (Core Haptics on iPhone). In a browser it uses navigator.vibrate where it exists.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Build 4 hierarchy: select very light < place / rotate light < single clear medium < multi clear medium-strong <
// Pulse distinctive (double tap) < major chain layered < Overdrive strong success; level success; perfect premium.
export type HapticKind = 'quad' | 'select' | 'place' | 'rotate' | 'clear' | 'multi' | 'pulse' | 'big' | 'invalid' | 'record' | 'levelup' | 'unlock'
  | 'majorChain' | 'overdrive' | 'perfect' | 'shield';
export type HapticIntensity = 'low' | 'medium' | 'high';

const native = Capacitor.isNativePlatform();
let enabled = true;
let intensity: HapticIntensity = 'medium';

export function setHapticIntensity(i: HapticIntensity) { intensity = i; }

// Intensity shifts each kind one impact step lighter or heavier (dev balancing setting).
const STEPS = [ImpactStyle.Light, ImpactStyle.Medium, ImpactStyle.Heavy];
const impact = (base: number) => STEPS[Math.max(0, Math.min(2, base + (intensity === 'low' ? -1 : intensity === 'high' ? 1 : 0)))];

export function setHapticsEnabled(on: boolean) { enabled = on; }

/** Several native taps in sequence (layered patterns). */
function pattern(steps: [number, () => Promise<void>][]) {
  for (const [at, fn] of steps) setTimeout(() => { fn().catch(() => {}); }, at);
}

export function haptic(kind: HapticKind) {
  if (!enabled) return;
  if (native) {
    switch (kind) {
      case 'pulse': pattern([[0, () => Haptics.impact({ style: impact(1) })], [70, () => Haptics.impact({ style: impact(0) })]]); return;
      case 'majorChain': pattern([[0, () => Haptics.impact({ style: impact(2) })], [90, () => Haptics.impact({ style: impact(1) })], [180, () => Haptics.impact({ style: impact(2) })]]); return;
      case 'overdrive': pattern([[0, () => Haptics.impact({ style: impact(2) })], [110, () => Haptics.notification({ type: NotificationType.Success })]]); return;
      // Build 8 graduated feedback: two lines a layered double impact, three a strong triple, four or more a burst
      case 'multi': pattern([[0, () => Haptics.impact({ style: impact(1) })], [70, () => Haptics.impact({ style: impact(0) })]]); return;
      case 'big': pattern([[0, () => Haptics.impact({ style: impact(2) })], [70, () => Haptics.impact({ style: impact(1) })], [140, () => Haptics.impact({ style: impact(0) })]]); return;
      case 'quad': pattern([[0, () => Haptics.impact({ style: impact(2) })], [80, () => Haptics.impact({ style: impact(2) })], [170, () => Haptics.impact({ style: impact(1) })], [260, () => Haptics.notification({ type: NotificationType.Success })]]); return;
      case 'perfect': pattern([[0, () => Haptics.impact({ style: impact(1) })], [80, () => Haptics.impact({ style: impact(2) })], [200, () => Haptics.notification({ type: NotificationType.Success })]]); return;
      default: break;
    }
    const p = (() => {
      switch (kind) {
        case 'select': return Haptics.selectionChanged();
        case 'place': return Haptics.impact({ style: impact(0) });
        case 'rotate': return Haptics.selectionChanged();
        case 'clear': return Haptics.impact({ style: impact(1) });
        case 'shield': return Haptics.impact({ style: impact(0) });
        // Build 8: an invalid drop is only a subtle tick (experimenting is never punished)
        case 'invalid': return Haptics.selectionChanged();
        case 'record': return Haptics.notification({ type: NotificationType.Success });
        case 'levelup': return Haptics.notification({ type: NotificationType.Success });
        case 'unlock': return Haptics.impact({ style: impact(0) });
        default: return undefined;
      }
    })();
    p?.catch(() => {});
    return;
  }
  const ms = { select: 4, place: 8, rotate: 5, clear: 14, pulse: 18, big: [20, 40, 30], invalid: 4, quad: [24, 40, 24, 50, 30, 60, 16], record: [10, 50, 20], levelup: [12, 40, 12, 40, 24], unlock: 10,
    multi: [16, 40, 10], majorChain: [24, 50, 16, 50, 28], overdrive: [30, 60, 14, 40, 20], perfect: [16, 40, 28, 60, 34], shield: 6 }[kind];
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}
