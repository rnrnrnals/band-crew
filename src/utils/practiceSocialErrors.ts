export const PRACTICE_SESSION_LIKES_MIGRATION =
  'supabase/migrations/20260724170000_practice_session_likes.sql';

export const PRACTICE_TRACK_LIKES_FK_MIGRATION =
  'supabase/migrations/20260724180000_practice_track_likes_drop_track_fk.sql';

export const PRACTICE_COMMENT_LIKES_MIGRATION =
  'supabase/migrations/20260724160000_practice_comment_replies_likes.sql';

export function practiceSessionLikesTableMessage(): string {
  return `좋아요를 저장하려면 Supabase SQL Editor에서 ${PRACTICE_SESSION_LIKES_MIGRATION} 을 실행해 주세요.`;
}

export function practiceTrackLikeFailedMessage(cause?: string): string {
  const hint = `트랙 좋아요 저장에 실패했어요. ${PRACTICE_TRACK_LIKES_FK_MIGRATION} 마이그레이션 적용 여부를 확인해 주세요.`;
  return cause ? `${hint} (${cause})` : hint;
}

export function practiceCommentLikesTableMessage(): string {
  return `댓글 좋아요를 저장하려면 Supabase SQL Editor에서 ${PRACTICE_COMMENT_LIKES_MIGRATION} 을 실행해 주세요.`;
}
