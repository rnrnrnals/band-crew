-- Team audio track likes (mirrors post_likes)

create table if not exists public.team_audio_likes (
  track_id uuid not null references public.team_audio_tracks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (track_id, user_id)
);

create index if not exists team_audio_likes_track_idx on public.team_audio_likes (track_id);

alter table public.team_audio_likes enable row level security;

create policy "team_audio_likes_select_authenticated"
  on public.team_audio_likes for select to authenticated
  using (true);

create policy "team_audio_likes_mutate_own"
  on public.team_audio_likes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
