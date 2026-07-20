-- BandCrew: check which schema objects already exist
select 'table' as kind, tablename as name
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles', 'teams', 'team_members', 'team_follows',
    'posts', 'post_likes', 'post_comments', 'post_comment_likes',
    'team_audio_tracks', 'team_audio_likes', 'audio_comments', 'audio_comment_likes',
    'stories', 'highlights', 'highlight_items',
    'schedule_events', 'practice_sessions', 'practice_tracks', 'chat_messages'
  )
union all
select 'type', typname
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and typname in ('position_id', 'media_type', 'schedule_kind', 'chat_message_kind')
order by kind, name;
