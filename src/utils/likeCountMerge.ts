export interface LikeCountState {
  likes?: number;
  likedByMe?: boolean;
}

export function mergeLikeCounts(
  ...states: Array<LikeCountState | undefined>
): { likes: number; likedByMe: boolean } {
  let likes = 0;
  let likedByMe = false;
  for (const state of states) {
    likes = Math.max(likes, state?.likes ?? 0);
    likedByMe = likedByMe || (state?.likedByMe ?? false);
  }
  return { likes, likedByMe };
}

/** Merge server data with in-memory optimistic state without OR-ing stale likedByMe. */
export function mergeReloadLikeCounts(
  remote: LikeCountState | undefined,
  local: LikeCountState | undefined,
): { likes: number; likedByMe: boolean } {
  const remoteLikes = remote?.likes ?? 0;
  const localLikes = local?.likes ?? 0;
  const remoteLiked = remote?.likedByMe ?? false;
  const localLiked = local?.likedByMe ?? false;
  return {
    likes: Math.max(remoteLikes, localLikes),
    likedByMe: remoteLiked || (localLiked && localLikes > remoteLikes),
  };
}
