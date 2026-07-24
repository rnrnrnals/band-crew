alter table public.practice_session_comments
  add column if not exists parent_id uuid references public.practice_session_comments (id) on delete cascade,
  add column if not exists reply_to text;

create index if not exists practice_session_comments_parent_idx
  on public.practice_session_comments (parent_id);

create table if not exists public.practice_session_comment_likes (
  comment_id uuid not null references public.practice_session_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.practice_track_comment_likes (
  comment_id uuid not null references public.practice_track_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.practice_session_comment_likes enable row level security;
alter table public.practice_track_comment_likes enable row level security;

create policy "practice_session_comment_likes_select_authenticated"
  on public.practice_session_comment_likes for select to authenticated
  using (true);

create policy "practice_session_comment_likes_mutate_own"
  on public.practice_session_comment_likes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "practice_track_comment_likes_select_authenticated"
  on public.practice_track_comment_likes for select to authenticated
  using (true);

create policy "practice_track_comment_likes_mutate_own"
  on public.practice_track_comment_likes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
