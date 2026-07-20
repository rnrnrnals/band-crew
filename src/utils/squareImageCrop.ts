export const SQUARE_COVER_OUTPUT_SIZE = 900;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function coverScale(viewport: number, imageWidth: number, imageHeight: number): number {
  if (imageWidth <= 0 || imageHeight <= 0) return 1;
  return Math.max(viewport / imageWidth, viewport / imageHeight);
}

export function clampPan(
  viewport: number,
  imageWidth: number,
  imageHeight: number,
  scale: number,
  offsetX: number,
  offsetY: number,
): { offsetX: number; offsetY: number } {
  const displayW = imageWidth * scale;
  const displayH = imageHeight * scale;
  return {
    offsetX: clamp(offsetX, viewport - displayW, 0),
    offsetY: clamp(offsetY, viewport - displayH, 0),
  };
}

export function initialPan(viewport: number, imageWidth: number, imageHeight: number, scale: number) {
  return clampPan(viewport, imageWidth, imageHeight, scale, (viewport - imageWidth * scale) / 2, (viewport - imageHeight * scale) / 2);
}

export async function loadImageFromFile(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('이미지를 불러오지 못했어요.'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function cropSquareFromPan(
  image: HTMLImageElement,
  viewport: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  outputSize = SQUARE_COVER_OUTPUT_SIZE,
): HTMLCanvasElement {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const side = viewport / scale;
  const sx = clamp(-offsetX / scale, 0, Math.max(0, iw - side));
  const sy = clamp(-offsetY / scale, 0, Math.max(0, ih - side));
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 처리하지 못했어요.');
  ctx.drawImage(image, sx, sy, side, side, 0, 0, outputSize, outputSize);
  return canvas;
}

export async function cropSquareImageFile(
  file: Blob,
  viewport: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  outputSize = SQUARE_COVER_OUTPUT_SIZE,
): Promise<Blob> {
  const image = await loadImageFromFile(file);
  const canvas = cropSquareFromPan(image, viewport, scale, offsetX, offsetY, outputSize);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('이미지를 저장하지 못했어요.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.9,
    );
  });
}
