import type { StoryImageTransform, StoryTextOverlay } from './storyGestures';
import type { Story } from '../types';

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

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

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  transform: StoryImageTransform,
): void {
  const imgAspect = img.width / img.height;
  const stageAspect = width / height;
  let drawW: number;
  let drawH: number;

  if (imgAspect > stageAspect) {
    drawH = height;
    drawW = img.width * (height / img.height);
  } else {
    drawW = width;
    drawH = img.height * (width / img.width);
  }

  ctx.save();
  ctx.translate(width / 2 + transform.x, height / 2 + transform.y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale, transform.scale);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlay: StoryTextOverlay,
): void {
  const trimmed = overlay.text.trim();
  if (!trimmed) return;

  const fontSize = Math.max(22, Math.round(width * 0.065));
  ctx.font = `700 ${fontSize}px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = width * 0.82;
  const lines = wrapLines(ctx, trimmed, maxWidth);
  const lineHeight = fontSize * 1.25;
  const centerX = width * overlay.x;
  const centerY = height * overlay.y;
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    const metrics = ctx.measureText(line);
    const padX = 18;
    const padY = 12;
    const boxW = metrics.width + padX * 2;
    const boxH = fontSize + padY * 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.roundRect(centerX - boxW / 2, y - boxH / 2, boxW, boxH, 10);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6;
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
  drawCoverImage(ctx, img, width, height, imageTransform);

  if (textOverlay?.text.trim()) {
    drawTextOverlay(ctx, width, height, textOverlay);
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}
