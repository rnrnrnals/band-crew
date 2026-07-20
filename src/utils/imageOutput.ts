export type PreferredImageMime = 'image/webp' | 'image/jpeg';

let cachedPreferredImageMime: PreferredImageMime | null = null;

export function getPreferredImageMime(): PreferredImageMime {
  if (cachedPreferredImageMime) return cachedPreferredImageMime;
  if (typeof document === 'undefined') return 'image/jpeg';

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
