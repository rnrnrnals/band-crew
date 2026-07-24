alter table public.practice_sessions
  add column if not exists is_public boolean not null default false;

create index if not exists practice_sessions_public_team_idx
  on public.practice_sessions (team_id, is_public)
  where is_public = true and coalesce(is_team_song, false) = false;
