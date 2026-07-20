import { loadImageFromBlob } from './squareImageCrop';
import { getPreferredImageExtension, getPreferredImageMime } from './imageOutput';

export function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(file.name);
}

function isHeicFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  return /\.(heic|heif)$/i.test(file.name);
}

function toOutputImageFile(blob: Blob, originalName: string): File {
  const baseName = originalName.replace(/\.[^.]+$/, '') || 'photo';
  const ext = getPreferredImageExtension();
  const type = getPreferredImageMime();
  return new File([blob], `${baseName}.${ext}`, { type });
}

export async function prepareProfileImageFile(file: File): Promise<File> {
  if (!isLikelyImageFile(file)) {
    throw new Error('사진 파일만 선택할 수 있어요.');
  }

  let blob: Blob = file;

  if (isHeicFile(file)) {
    try {
      const mod = await import('heic2any');
      const heic2any = mod.default;
      const converted = await heic2any({
        blob: file,
        toType: getPreferredImageMime(),
        quality: 0.9,
      });
      blob = Array.isArray(converted) ? converted[0] : converted;
    } catch {
      throw new Error(
        'iPhone HEIC 사진을 변환하지 못했어요. 사진 앱에서 JPG로 저장하거나 다른 사진을 선택해 주세요.',
      );
    }
  }

  try {
    await loadImageFromBlob(blob);
  } catch {
    throw new Error(
      '이 사진 형식은 브라우저에서 열 수 없어요. JPG·PNG·WEBP 사진을 선택해 주세요.',
    );
  }

  return blob instanceof File && !isHeicFile(file) && blob.type === getPreferredImageMime()
    ? blob
    : toOutputImageFile(blob, file.name);
}
