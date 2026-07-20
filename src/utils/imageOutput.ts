export type PreferredImageMime = 'image/webp' | 'image/jpeg';

let cachedPreferredImageMime: PreferredImageMime | null = null;

function prefersJpegPipeline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return /Android/i.test(navigator.userAgent);
}

export function getPreferredImageMime(): PreferredImageMime {
  if (cachedPreferredImageMime) return cachedPreferredImageMime;
  if (typeof document === 'undefined') return 'image/jpeg';
  if (prefersJpegPipeline()) {
    cachedPreferredImageMime = 'image/jpeg';
    return cachedPreferredImageMime;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const supportsWebp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  cachedPreferredImageMime = supportsWebp ? 'image/webp' : 'image/jpeg';
  return cachedPreferredImageMime;
}

export function getPreferredImageExtension(): 'webp' | 'jpg' {
  return getPreferredImageMime() === 'image/webp' ? 'webp' : 'jpg';
}

export function guessImageMimeFromName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'bmp':
      return 'image/bmp';
    case 'avif':
      return 'image/avif';
    default:
      return null;
  }
}

export function ensureImageBlobMime(blob: Blob, nameHint = ''): Blob {
  const type = blob.type?.toLowerCase() ?? '';
  if (type.startsWith('image/') && type !== 'image/*') return blob;
  const guessed = guessImageMimeFromName(nameHint) ?? 'image/jpeg';
  if (blob instanceof File) {
    return new File([blob], blob.name || 'photo.jpg', { type: guessed, lastModified: blob.lastModified });
  }
  return new Blob([blob], { type: guessed });
}

export function canvasToImageBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  const mime = getPreferredImageMime();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('압축에 실패했어요.'))),
      mime,
      quality,
    );
  });
}

export function canvasToImageDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  const mime = getPreferredImageMime();
  return canvas.toDataURL(mime, quality);
}
