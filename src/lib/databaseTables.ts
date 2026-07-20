/**
 * Supabase table names (Step B schema).
 * Typed rows will be generated in a later step (supabase gen types).
 */
export const DB_TABLES = {
  profiles: 'profiles',
  teams: 'teams',
  teamMembers: 'team_members',
  teamFollows: 'team_follows',
  posts: 'posts',
  postLikes: 'post_likes',
  postComments: 'post_comments',
  postCommentLikes: 'post_comment_likes',
  teamAudioTracks: 'team_audio_tracks',
  teamAudioLikes: 'team_audio_likes',
  audioComments: 'audio_comments',
  audioCommentLikes: 'audio_comment_likes',
  stories: 'stories',
  highlights: 'highlights',
  highlightItems: 'highlight_items',
  scheduleEvents: 'schedule_events',
  practiceSessions: 'practice_sessions',
  practiceTracks: 'practice_tracks',
  teamPracticeSongs: 'team_practice_songs',
  chatMessages: 'chat_messages',
} as const;

export type DbTableName = (typeof DB_TABLES)[keyof typeof DB_TABLES];
