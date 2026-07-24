const PRACTICE_SOCIAL_CACHE_KEYS = [
  'band-crew-practice-session-likes-v1',
  'band-crew-practice-track-likes-v1',
  'band-crew-practice-track-comments-v1',
  'band-crew-practice-comment-likes-v1',
] as const;

/** Clears practice like/comment caches so they do not bleed across accounts. */
export function clearPracticeSocialCaches(): void {
  for (const key of PRACTICE_SOCIAL_CACHE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore quota / privacy errors
    }
  }
}
