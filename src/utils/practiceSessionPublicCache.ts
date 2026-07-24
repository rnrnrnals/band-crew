import type { PracticeSessionMeta } from '../types';

const CACHE_KEY = 'band-crew-practice-session-public-v1';

export function loadPracticeSessionPublicCache(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function savePracticeSessionPublicCache(cache: Record<string, boolean>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

export function setPracticeSessionPublicFlag(sessionId: string, isPublic: boolean): void {
  const cache = loadPracticeSessionPublicCache();
  if (isPublic) {
    cache[sessionId] = true;
  } else {
    delete cache[sessionId];
  }
  savePracticeSessionPublicCache(cache);
}

export function mergePracticeSessionPublicFlags(
  sessions: PracticeSessionMeta[],
): PracticeSessionMeta[] {
  const cache = loadPracticeSessionPublicCache();
  return sessions.map((session) => {
    if (!(session.id in cache)) return session;
    return { ...session, isPublic: cache[session.id] === true };
  });
}

export function removePracticeSessionPublicFlag(sessionId: string): void {
  const cache = loadPracticeSessionPublicCache();
  if (!(sessionId in cache)) return;
  delete cache[sessionId];
  savePracticeSessionPublicCache(cache);
}
