import type { PostComment } from '../types';

const CACHE_KEY = 'band-crew-practice-session-comments-v1';

export function loadPracticeSessionCommentsCache(): Record<string, PostComment[]> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PostComment[]>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

export function savePracticeSessionCommentsCache(cache: Record<string, PostComment[]>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

export function appendPracticeSessionCommentToCache(sessionId: string, comment: PostComment): void {
  const cache = loadPracticeSessionCommentsCache();
  cache[sessionId] = [...(cache[sessionId] ?? []), comment];
  savePracticeSessionCommentsCache(cache);
}

export function savePracticeSessionCommentsForSession(sessionId: string, comments: PostComment[]): void {
  const cache = loadPracticeSessionCommentsCache();
  if (comments.length === 0) {
    delete cache[sessionId];
  } else {
    cache[sessionId] = comments;
  }
  savePracticeSessionCommentsCache(cache);
}

export function removePracticeSessionCommentFromCache(sessionId: string, commentId: string): void {
  const cache = loadPracticeSessionCommentsCache();
  const next = (cache[sessionId] ?? []).filter((comment) => comment.id !== commentId);
  if (next.length === 0) {
    delete cache[sessionId];
  } else {
    cache[sessionId] = next;
  }
  savePracticeSessionCommentsCache(cache);
}
