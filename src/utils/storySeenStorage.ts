import { useEffect, useState } from 'react';

const LS_KEY = 'band-crew-story-seen-v1';
const MAX_ENTRIES = 500;
export const STORY_SEEN_EVENT = 'band-crew-story-seen';

export function loadStorySeen(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as string[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function saveStorySeen(seen: Set<string>) {
  const ids = [...seen];
  const trimmed = ids.length > MAX_ENTRIES ? ids.slice(ids.length - MAX_ENTRIES) : ids;
  localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
}

export function markStorySeen(storyId: string): void {
  const seen = loadStorySeen();
  if (seen.has(storyId)) return;
  seen.add(storyId);
  saveStorySeen(seen);
  window.dispatchEvent(new CustomEvent(STORY_SEEN_EVENT));
}

export function isTeamStoriesFullySeen(storyIds: string[], seen: Set<string>): boolean {
  if (storyIds.length === 0) return false;
  return storyIds.every((id) => seen.has(id));
}

export function useStorySeen(): Set<string> {
  const [seen, setSeen] = useState(() => loadStorySeen());

  useEffect(() => {
    const refresh = () => setSeen(loadStorySeen());
    window.addEventListener(STORY_SEEN_EVENT, refresh);
    return () => window.removeEventListener(STORY_SEEN_EVENT, refresh);
  }, []);

  return seen;
}
