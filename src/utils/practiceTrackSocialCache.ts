import type { PostComment } from '../types';
import { mergeLikeCounts } from './likeCountMerge';

const LIKES_KEY = 'band-crew-practice-track-likes-v1';
const COMMENTS_KEY = 'band-crew-practice-track-comments-v1';

export interface PracticeTrackLikeState {
  likes: number;
  likedByMe: boolean;
}

export function loadPracticeTrackLikesCache(): Record<string, PracticeTrackLikeState> {
  try {
    const raw = localStorage.getItem(LIKES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PracticeTrackLikeState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function savePracticeTrackLikesCache(cache: Record<string, PracticeTrackLikeState>): void {
  try {
    localStorage.setItem(LIKES_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

export function setPracticeTrackLikeState(key: string, state: PracticeTrackLikeState): void {
  const cache = loadPracticeTrackLikesCache();
  if (state.likes <= 0 && !state.likedByMe) {
    delete cache[key];
  } else {
    cache[key] = state;
  }
  savePracticeTrackLikesCache(cache);
}

export function mergeTrackLikeSnapshot(
  remote: PracticeTrackLikeState | undefined,
  cached: PracticeTrackLikeState | undefined,
  current?: PracticeTrackLikeState,
): PracticeTrackLikeState {
  return mergeLikeCounts(remote, cached, current);
}

export function loadPracticeTrackCommentsCache(): Record<string, PostComment[]> {
  try {
    const raw = localStorage.getItem(COMMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PostComment[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function savePracticeTrackCommentsCache(cache: Record<string, PostComment[]>): void {
  try {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

export function appendPracticeTrackCommentToCache(key: string, comment: PostComment): void {
  const cache = loadPracticeTrackCommentsCache();
  cache[key] = [...(cache[key] ?? []), comment];
  savePracticeTrackCommentsCache(cache);
}

export function savePracticeTrackCommentsForKey(key: string, comments: PostComment[]): void {
  const cache = loadPracticeTrackCommentsCache();
  if (comments.length === 0) {
    delete cache[key];
  } else {
    cache[key] = comments;
  }
  savePracticeTrackCommentsCache(cache);
}

export function removePracticeTrackCommentFromCache(key: string, commentId: string): void {
  const cache = loadPracticeTrackCommentsCache();
  const next = (cache[key] ?? []).filter((comment) => comment.id !== commentId);
  if (next.length === 0) {
    delete cache[key];
  } else {
    cache[key] = next;
  }
  savePracticeTrackCommentsCache(cache);
}
