// Share a locally generated results image. iPhone app: native share sheet via Capacitor Share.
// Browser: Web Share with a file where supported, otherwise download the PNG.

import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Directory, Filesystem } from '@capacitor/filesystem';

/** Set when the App Store listing exists; it is appended to the share text. */
export const APP_STORE_URL = '';

export async function shareImage(canvas: HTMLCanvasElement, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const fullText = APP_STORE_URL ? `${text} ${APP_STORE_URL}` : text;
  if (Capacitor.isNativePlatform()) {
    const data = canvas.toDataURL('image/png').split(',')[1];
    const file = await Filesystem.writeFile({ path: 'bloq-result.png', data, directory: Directory.Cache });
    try {
      await Share.share({ title: 'BLOQ', text: fullText, files: [file.uri] });
      return 'shared';
    } catch { return 'cancelled'; }
  }
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (blob) {
    const file = new File([blob], 'bloq-result.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], text: fullText, title: 'BLOQ' }); return 'shared'; } catch { return 'cancelled'; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'bloq-result.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'downloaded';
  }
  return 'cancelled';
}
