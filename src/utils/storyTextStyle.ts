import type { CSSProperties } from 'react';

export type StoryFontId = 'sans' | 'display' | 'mono' | 'serif';

export type StoryTextStyle = {
  fontId: StoryFontId;
  textColor: string;
  /** `null` = no background pill */
  backgroundColor: string | null;
};

export const DEFAULT_STORY_TEXT_STYLE: StoryTextStyle = {
  fontId: 'sans',
  textColor: '#ffffff',
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
};

export const STORY_FONT_ORDER: StoryFontId[] = ['sans', 'display', 'mono', 'serif'];

export const STORY_FONT_LABELS: Record<StoryFontId, string> = {
  sans: '고딕',
  display: '디스플레이',
  mono: '모노',
  serif: '세리프',
};

export const STORY_TEXT_COLOR_PRESETS = [
  '#ffffff',
  '#000000',
  '#ffd43b',
  '#ff6b6b',
  '#51cf66',
  '#339af0',
  '#f783ac',
  '#e599f7',
] as const;

export const STORY_BG_COLOR_PRESETS: (string | null)[] = [
  'rgba(0, 0, 0, 0.35)',
  'rgba(255, 255, 255, 0.88)',
  '#ffffff',
  '#000000',
  '#ffd43b',
  '#339af0',
  null,
];

export function storyFontFamily(fontId: StoryFontId): string {
  switch (fontId) {
    case 'display':
      return '"Space Grotesk", "Noto Sans KR", sans-serif';
    case 'mono':
      return '"JetBrains Mono", ui-monospace, monospace';
    case 'serif':
      return 'Georgia, "Noto Serif KR", "Times New Roman", serif';
    default:
      return '"Noto Sans KR", sans-serif';
  }
}

export function storyFontWeight(fontId: StoryFontId): number {
  return fontId === 'mono' ? 500 : 700;
}

export function storyCanvasFont(fontId: StoryFontId, fontSize: number): string {
  return `${storyFontWeight(fontId)} ${fontSize}px ${storyFontFamily(fontId)}`;
}

export function cycleStoryFont(current: StoryFontId): StoryFontId {
  const index = STORY_FONT_ORDER.indexOf(current);
  return STORY_FONT_ORDER[(index + 1) % STORY_FONT_ORDER.length];
}

export function storyTextSurfaceStyle(style: StoryTextStyle): CSSProperties {
  const hasBg = style.backgroundColor != null && style.backgroundColor !== '';
  return {
    fontFamily: storyFontFamily(style.fontId),
    fontWeight: storyFontWeight(style.fontId),
    color: style.textColor,
    background: hasBg ? style.backgroundColor ?? undefined : 'transparent',
    textShadow: hasBg ? undefined : '0 1px 8px rgba(0, 0, 0, 0.55)',
    padding: hasBg ? '10px 18px' : '0',
    borderRadius: hasBg ? 10 : 0,
  };
}

export function storyTextInputStyle(style: StoryTextStyle): CSSProperties {
  const surface = storyTextSurfaceStyle(style);
  return {
    ...surface,
    padding: style.backgroundColor ? '12px 18px' : '12px 4px',
  };
}
