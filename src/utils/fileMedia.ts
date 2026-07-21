export function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const CHAT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const CHAT_MAX_VIDEO_BYTES = 12 * 1024 * 1024;
export const CHAT_MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export {
  compressImageBlob,
  compressVideoBlob,
  compressAudioBlob,
  prepareMediaBlob,
  readPreparedMediaAsDataUrl,
  compressDataUrlImage,
  getAudioDuration,
  getVideoDuration,
  trimVideoBlob,
  cropVideoToFrameBlob,
  captureVideoPosterBlob,
  videoNeedsTrim,
  formatMediaTime,
  MAX_VIDEO_DURATION_SEC,
  formatMaxSize,
  type MediaKind,
} from './mediaCompress';
