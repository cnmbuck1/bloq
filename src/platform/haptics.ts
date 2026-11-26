// Haptics through Capacitor (Core Haptics on iPhone). In a browser it uses navigator.vibrate where it exists.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticKind = 'select' | 'place' | 'clear' | 'pulse' | 'big' | 'invalid' | 'record';

const native = Capacitor.isNativePlatform();
let enabled = true;

export function setHapticsEnabled(on: boolean) { enabled = on; }

export function haptic(kind: HapticKind) {
  if (!enabled) return;
  if (native) {
    const p = (() => {
      switch (kind) {
        case 'select': return Haptics.selectionChanged();
        case 'place': return Haptics.impact({ style: ImpactStyle.Light });
        case 'clear': return Haptics.impact({ style: ImpactStyle.Medium });
        case 'pulse': return Haptics.impact({ style: ImpactStyle.Medium });
        case 'big': return Haptics.impact({ style: ImpactStyle.Heavy });
        case 'invalid': return Haptics.notification({ type: NotificationType.Warning });
        case 'record': return Haptics.notification({ type: NotificationType.Success });
      }
    })();
    p?.catch(() => {});
    return;
  }
  const ms = { select: 4, place: 8, clear: 14, pulse: 18, big: [20, 40, 30], invalid: [6, 30, 6], record: [10, 50, 20] }[kind];
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}
