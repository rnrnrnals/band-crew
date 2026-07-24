import type { PracticeSessionMeta } from '../types';
import { mergeLikeCounts, type LikeCountState } from './likeCountMerge';

const CACHE_KEY = 'band-crew-practice-session-likes-v1';

export interface PracticeSessionLikeState {
  likes: number;
  likedByMe: boolean;
}

export function loadPracticeSessionLikesCache(): Record<string, PracticeSessionLikeState> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PracticeSessionLikeState>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

export function savePracticeSessionLikesCache(cache: Record<string, PracticeSessionLikeState>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

export function setPracticeSessionLikeState(
  sessionId: string,
  state: PracticeSessionLikeState,
): void {
  const cache = loadPracticeSessionLikesCache();
  if (state.likes <= 0 && !state.likedByMe) {
    delete cache[sessionId];
  } else {
    cache[sessionId] = state;
  }
  savePracticeSessionLikesCache(cache);
}

export function mergePracticeSessionLike(
  session: PracticeSessionMeta,
  extra?: LikeCountState,
): PracticeSessionMeta {
  const cached = loadPracticeSessionLikesCache()[session.id];
  const merged = mergeLikeCounts(session, cached, extra);
  return { ...session, likes: merged.likes, likedByMe: merged.likedByMe };
}

export function mergePracticeSessionLikes(
  sessions: PracticeSessionMeta[],
): PracticeSessionMeta[] {
  return sessions.map((session) => mergePracticeSessionLike(session));
}
