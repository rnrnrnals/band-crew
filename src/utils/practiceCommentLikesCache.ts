import type { PostComment } from '../types';
import { mergeLikeCounts } from './likeCountMerge';

const CACHE_KEY = 'band-crew-practice-comment-likes-v1';

export interface PracticeCommentLikeState {
  likes: number;
  likedByMe: boolean;
}

export function loadPracticeCommentLikesCache(): Record<string, PracticeCommentLikeState> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PracticeCommentLikeState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function savePracticeCommentLikesCache(cache: Record<string, PracticeCommentLikeState>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

export function setPracticeCommentLikeState(commentId: string, state: PracticeCommentLikeState): void {
  const cache = loadPracticeCommentLikesCache();
  if (state.likes <= 0 && !state.likedByMe) {
    delete cache[commentId];
  } else {
    cache[commentId] = state;
  }
  savePracticeCommentLikesCache(cache);
}

export function applyPracticeCommentLikeCache(
  comments: PostComment[],
  previous: PostComment[] = [],
): PostComment[] {
  const cache = loadPracticeCommentLikesCache();
  return comments.map((comment) => {
    const cached = cache[comment.id];
    const prev = previous.find((item) => item.id === comment.id);
    const merged = mergeLikeCounts(comment, prev, cached);
    return {
      ...comment,
      likes: merged.likes,
      likedByMe: merged.likedByMe,
    };
  });
}
