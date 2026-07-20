import {
  loadImageFromBlob,
  transcodeImageBlobToPreferredFormat,
} from './squareImageCrop';
import {
  getPreferredImageExtension,
  getPreferredImageMime,
} from './imageOutput';
import { ensureImageBlobMimeAsync, isAndroidBrowser } from './imageMime';

function normalizePickedImageFile(file: File): Promise<File> {
  return ensureImageBlobMimeAsync(file, file.name).then((blob) => blob as File);
}

export function isLikelyImageFile(file: File): boolean {
  const type = file.type?.toLowerCase() ?? '';
  if (type.startsWith('image/')) return true;
  if (!type || type === 'application/octet-stream') {
    if (/\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(file.name)) return true;
    // Android gallery picks often arrive without a MIME type or extension.
    return file.size > 0;
  }
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

async function convertHeicIfNeeded(file: File): Promise<Blob> {
  if (!isHeicFile(file)) return file;

  if (isAndroidBrowser()) {
    try {
      return await transcodeImageBlobToPreferredFormat(file);
    } catch {
      // Fall through to heic2any below.
    }
  }

  try {
    const mod = await import('heic2any');
    const heic2any = mod.default;
    const converted = await heic2any({
      blob: file,
      toType: getPreferredImageMime(),
      quality: 0.9,
    });
    return Array.isArray(converted) ? converted[0] : converted;
  } catch {
    throw new Error(
      'iPhone HEIC 사진을 변환하지 못했어요. 사진 앱에서 JPG로 저장하거나 다른 사진을 선택해 주세요.',
    );
  }
}

export async function prepareProfileImageFile(file: File): Promise<File> {
  const normalized = await normalizePickedImageFile(file);
  if (!isLikelyImageFile(normalized)) {
    throw new Error('사진 파일만 선택할 수 있어요.');
  }

  let blob: Blob = await convertHeicIfNeeded(normalized);

  try {
    await loadImageFromBlob(blob);
  } catch {
    throw new Error(
      '이 사진 형식은 브라우저에서 열 수 없어요. JPG·PNG·WEBP 사진을 선택해 주세요.',
    );
  }

  const preferredMime = getPreferredImageMime();
  const alreadyPreferred =
    blob instanceof File &&
    !isHeicFile(normalized) &&
    blob.type === preferredMime;

  if (alreadyPreferred && !isAndroidBrowser()) {
    return blob as File;
  }

  try {
    const transcoded = await transcodeImageBlobToPreferredFormat(blob);
    return toOutputImageFile(transcoded, normalized.name);
  } catch {
    if (blob instanceof File && !isHeicFile(normalized)) {
      return blob;
    }
    throw new Error(
      '이 사진 형식은 브라우저에서 열 수 없어요. JPG·PNG·WEBP 사진을 선택해 주세요.',
    );
  }
}
