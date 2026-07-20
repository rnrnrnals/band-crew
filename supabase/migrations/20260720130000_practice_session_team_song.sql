alter table public.practice_sessions
  add column if not exists is_team_song boolean not null default false;

-- Feed "연습중" entries created before this flag used is_current on shared rows.
update public.practice_sessions
set is_team_song = true
where is_current = true
  and not exists (
    select 1
    from public.practice_tracks pt
    where pt.session_id = practice_sessions.id
  );
