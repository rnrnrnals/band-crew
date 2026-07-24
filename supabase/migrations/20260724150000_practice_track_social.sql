create table public.practice_track_likes (
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  track_key bigint not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, track_key, user_id),
  foreign key (session_id, track_key)
    references public.practice_tracks (session_id, track_key) on delete cascade
);

create index practice_track_likes_session_idx
  on public.practice_track_likes (session_id, track_key);

create table public.practice_track_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  track_key bigint not null,
  author_user_id uuid not null references public.profiles (id) on delete cascade,
  author_team_id uuid references public.teams (id) on delete set null,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, track_key)
    references public.practice_tracks (session_id, track_key) on delete cascade
);

create index practice_track_comments_track_idx
  on public.practice_track_comments (session_id, track_key, created_at);

create trigger practice_track_comments_set_updated_at
  before update on public.practice_track_comments
  for each row execute function public.set_updated_at();

alter table public.practice_track_likes enable row level security;
alter table public.practice_track_comments enable row level security;

create policy "practice_track_likes_select_authenticated"
  on public.practice_track_likes for select to authenticated
  using (true);

create policy "practice_track_likes_mutate_own"
  on public.practice_track_likes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "practice_track_comments_select_authenticated"
  on public.practice_track_comments for select to authenticated
  using (true);

create policy "practice_track_comments_insert_authenticated"
  on public.practice_track_comments for insert to authenticated
  with check (author_user_id = auth.uid());

create policy "practice_track_comments_update_own"
  on public.practice_track_comments for update to authenticated
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

create policy "practice_track_comments_delete_own"
  on public.practice_track_comments for delete to authenticated
  using (author_user_id = auth.uid());
