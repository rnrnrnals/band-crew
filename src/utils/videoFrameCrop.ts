import { clamp } from './squareImageCrop';

/** Feed post frame: square (width / height). */
export const POST_VIDEO_FRAME_RATIO = 1;
export const POST_VIDEO_OUTPUT_WIDTH = 900;
export const POST_VIDEO_OUTPUT_HEIGHT = 900;
/** Practice tracks only need audible audio — video can be small/blurry. */
export const PRACTICE_VIDEO_OUTPUT_WIDTH = 480;
export const PRACTICE_VIDEO_OUTPUT_HEIGHT = 480;

export interface VideoFrameCropParams {
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function coverScaleFrame(
  viewportW: number,
  viewportH: number,
  mediaW: number,
  mediaH: number,
): number {
  if (mediaW <= 0 || mediaH <= 0) return 1;
  return Math.max(viewportW / mediaW, viewportH / mediaH);
}

export function clampPanFrame(
  viewportW: number,
  viewportH: number,
  mediaW: number,
  mediaH: number,
  scale: number,
  offsetX: number,
  offsetY: number,
): { offsetX: number; offsetY: number } {
  const displayW = mediaW * scale;
  const displayH = mediaH * scale;
  return {
    offsetX: clamp(offsetX, viewportW - displayW, 0),
    offsetY: clamp(offsetY, viewportH - displayH, 0),
  };
}

export function initialPanFrame(
  viewportW: number,
  viewportH: number,
  mediaW: number,
  mediaH: number,
  scale: number,
) {
  return clampPanFrame(
    viewportW,
    viewportH,
    mediaW,
    mediaH,
    scale,
    (viewportW - mediaW * scale) / 2,
    (viewportH - mediaH * scale) / 2,
  );
}

export function cropRectFromPan(
  videoW: number,
  videoH: number,
  viewportW: number,
  viewportH: number,
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  const sw = viewportW / scale;
  const sh = viewportH / scale;
  const sx = clamp(-offsetX / scale, 0, Math.max(0, videoW - sw));
  const sy = clamp(-offsetY / scale, 0, Math.max(0, videoH - sh));
  return { sx, sy, sw, sh };
}
