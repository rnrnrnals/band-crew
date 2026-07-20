import { guessImageMimeFromName } from './imageOutput';

export async function sniffImageMime(blob: Blob, nameHint = ''): Promise<string | null> {
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());

  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    header.length >= 4 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return 'image/png';
  }
  if (header.length >= 3 && header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
    return 'image/gif';
  }
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (
    header.length >= 12 &&
    header[4] === 0x66 &&
    header[5] === 0x74 &&
    header[6] === 0x79 &&
    header[7] === 0x70
  ) {
    const brand = String.fromCharCode(header[8], header[9], header[10], header[11]).toLowerCase();
    if (/heic|heix|hevc|mif1|msf1|avif/.test(brand)) {
      return brand.includes('avif') ? 'image/avif' : 'image/heic';
    }
  }

  return guessImageMimeFromName(nameHint);
}

export async function ensureImageBlobMimeAsync(blob: Blob, nameHint = ''): Promise<Blob> {
  const type = blob.type?.toLowerCase() ?? '';
  if (type.startsWith('image/') && type !== 'image/*') return blob;

  const sniffed = await sniffImageMime(blob, nameHint);
  const resolved = sniffed ?? guessImageMimeFromName(nameHint) ?? 'image/jpeg';

  if (blob instanceof File) {
    return new File([blob], blob.name || 'photo.jpg', {
      type: resolved,
      lastModified: blob.lastModified,
    });
  }
  return new Blob([blob], { type: resolved });
}

export function isAndroidBrowser(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}
