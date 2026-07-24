import type { StoryImageTransform, StoryTextOverlay } from './storyGestures';
import { DEFAULT_STORY_TEXT_STYLE, storyCanvasFont, type StoryTextStyle } from './storyTextStyle';
import type { HighlightItem, Story, StoryMediaType } from '../types';
import { encodeStoryVideoBlob } from './mediaCompress';
import { STORY_MAX_VIDEO_DURATION_SEC } from './fileMedia';
import { canvasToImageDataUrl } from './imageOutput';

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
/** Keep story rows in DB (for highlight picker) after they leave the 24h rail. */
export const STORY_ARCHIVE_MS = 7 * 24 * 60 * 60 * 1000;

export function isVideoMediaUrl(url: string): boolean {
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return true;
  if (url.startsWith('data:video/')) return true;
  if (url.startsWith('blob:') && url.includes('video')) return false;
  return false;
}

export function storyMediaType(story: Pick<Story, 'image' | 'mediaType'>): StoryMediaType {
  if (story.mediaType === 'video') return 'video';
  if (story.mediaType === 'image') return 'image';
  return isVideoMediaUrl(story.image) ? 'video' : 'image';
}

export function highlightItemMediaType(item: Pick<HighlightItem, 'image' | 'mediaType'>): StoryMediaType {
  if (item.mediaType === 'video') return 'video';
  if (item.mediaType === 'image') return 'image';
  return isVideoMediaUrl(item.image) ? 'video' : 'image';
}

export { STORY_MAX_VIDEO_DURATION_SEC };

export function isStoryActive(story: Story, now = Date.now()): boolean {
  return now - new Date(story.createdAt).getTime() < STORY_TTL_MS;
}

export function filterActiveStories(stories: Story[], now = Date.now()): Story[] {
  return stories.filter((story) => isStoryActive(story, now));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  if (lines.length === 0 && text) return [text];
  return lines;
}

function drawStoryMediaFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  transform: StoryImageTransform,
): void {
  const mediaAspect = sourceWidth / sourceHeight;
  const stageAspect = width / height;
  let drawW: number;
  let drawH: number;

  if (mediaAspect > stageAspect) {
    drawW = width;
    drawH = sourceHeight * (width / sourceWidth);
  } else {
    drawH = height;
    drawW = sourceWidth * (height / sourceHeight);
  }

  ctx.save();
  ctx.translate(width / 2 + transform.x, height / 2 + transform.y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale, transform.scale);
  ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawStoryImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  transform: StoryImageTransform,
): void {
  drawStoryMediaFrame(ctx, img, img.width, img.height, width, height, transform);
}

function drawStoryVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  transform: StoryImageTransform,
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw <= 0 || vh <= 0) return;
  drawStoryMediaFrame(ctx, video, vw, vh, width, height, transform);
}

export function hasStoryVideoTransform(transform: StoryImageTransform): boolean {
  return transform.scale !== 1 || transform.rotation !== 0 || transform.x !== 0 || transform.y !== 0;
}

function storyVideoOutputSize(stageWidth: number, stageHeight: number): { outW: number; outH: number } {
  const aspect = stageWidth / Math.max(1, stageHeight);
  const outH = 1280;
  const outW = Math.max(240, Math.round(outH * aspect));
  return { outW, outH };
}

export async function exportStoryVideoBlob(
  blob: Blob,
  stageWidth: number,
  stageHeight: number,
  transform: StoryImageTransform,
  clip?: { startSec: number; endSec: number },
): Promise<Blob> {
  const { outW, outH } = storyVideoOutputSize(stageWidth, stageHeight);
  const scaledTransform: StoryImageTransform = {
    ...transform,
    x: transform.x * (outW / Math.max(1, stageWidth)),
    y: transform.y * (outH / Math.max(1, stageHeight)),
  };

  return encodeStoryVideoBlob(
    blob,
    stageWidth,
    stageHeight,
    (ctx, video, width, height) => drawStoryVideoFrame(ctx, video, width, height, scaledTransform),
    clip ? { startSec: clip.startSec, endSec: clip.endSec } : undefined,
  );
}

function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlay: StoryTextOverlay,
): void {
  const trimmed = overlay.text.trim();
  if (!trimmed) return;

  const style: StoryTextStyle = overlay.style ?? DEFAULT_STORY_TEXT_STYLE;
  const fontSize = Math.max(22, Math.round(width * 0.065));
  ctx.font = storyCanvasFont(style.fontId, fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = width * 0.82;
  const lines = wrapLines(ctx, trimmed, maxWidth);
  const lineHeight = fontSize * 1.25;
  const centerX = width * overlay.x;
  const centerY = height * overlay.y;
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
  const hasBg = style.backgroundColor != null && style.backgroundColor !== '';
  const padX = hasBg ? 18 : 0;
  const padY = hasBg ? 12 : 0;

  lines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    const metrics = ctx.measureText(line);
    const boxW = metrics.width + padX * 2;
    const boxH = fontSize + padY * 2;

    if (hasBg) {
      ctx.fillStyle = style.backgroundColor!;
      ctx.beginPath();
      ctx.roundRect(centerX - boxW / 2, y - boxH / 2, boxW, boxH, 10);
      ctx.fill();
    }

    ctx.fillStyle = style.textColor;
    if (!hasBg) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 8;
    }
    ctx.fillText(line, centerX, y);
    ctx.shadowBlur = 0;
  });
}

export async function renderStoryComposite(
  imageUrl: string,
  stageWidth: number,
  stageHeight: number,
  imageTransform: StoryImageTransform,
  textOverlay?: StoryTextOverlay,
): Promise<string> {
  const img = await loadImage(imageUrl);
  const width = Math.max(1, Math.round(stageWidth));
  const height = Math.max(1, Math.round(stageHeight));
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return imageUrl;

  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  drawStoryImage(ctx, img, width, height, imageTransform);

  if (textOverlay?.text.trim()) {
    drawTextOverlay(ctx, width, height, textOverlay);
  }

  return canvasToImageDataUrl(canvas, 0.92);
}
