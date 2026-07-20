-- Team feed "연습중" songs — separate from practice-room sessions.
create table if not exists public.team_practice_songs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null,
  is_current boolean not null default false,
  author_user_id uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists team_practice_songs_team_updated_idx
  on public.team_practice_songs (team_id, updated_at desc);

create unique index if not exists team_practice_songs_one_current_per_team
  on public.team_practice_songs (team_id)
  where is_current;

alter table public.team_practice_songs enable row level security;

create policy "team_practice_songs_select_authenticated"
  on public.team_practice_songs for select to authenticated using (true);

create policy "team_practice_songs_mutate_member"
  on public.team_practice_songs for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

-- Move legacy feed songs out of practice_sessions (if flagged).
insert into public.team_practice_songs (id, team_id, title, is_current, author_user_id, updated_at, created_at)
select ps.id, ps.team_id, ps.title, ps.is_current, ps.author_user_id, ps.updated_at, ps.created_at
from public.practice_sessions ps
where (
  ps.is_team_song = true
  or (
    ps.is_current = true
    and not exists (select 1 from public.practice_tracks pt where pt.session_id = ps.id)
  )
)
on conflict (id) do nothing;

delete from public.practice_sessions ps
where exists (select 1 from public.team_practice_songs tps where tps.id = ps.id);
