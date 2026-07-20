export type StoryImageTransform = {
  scale: number;
  rotation: number;
  x: number;
  y: number;
};

export type StoryTextOverlay = {
  text: string;
  x: number;
  y: number;
};

export const DEFAULT_IMAGE_TRANSFORM: StoryImageTransform = {
  scale: 1,
  rotation: 0,
  x: 0,
  y: 0,
};

export const DEFAULT_TEXT_POSITION = { x: 0.5, y: 0.46 };

export function clampScale(scale: number): number {
  return Math.min(4, Math.max(0.5, scale));
}

export function clampTextPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(0.92, Math.max(0.08, x)),
    y: Math.min(0.88, Math.max(0.12, y)),
  };
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angle(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
