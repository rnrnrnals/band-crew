import type { HighlightItem, TeamHighlight } from '../types';

export function getHighlightStoryId(item: HighlightItem): string | undefined {
  return item.sourceStoryId || item.id.replace(/^hi-/, '');
}

export function isStoryInHighlight(highlight: TeamHighlight, storyId: string): boolean {
  return highlight.items.some((item) => getHighlightStoryId(item) === storyId);
}
