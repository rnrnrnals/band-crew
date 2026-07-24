create table public.practice_session_likes (
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index practice_session_likes_session_idx
  on public.practice_session_likes (session_id);

alter table public.practice_session_likes enable row level security;

create policy "practice_session_likes_select_authenticated"
  on public.practice_session_likes for select to authenticated
  using (true);

create policy "practice_session_likes_mutate_own"
  on public.practice_session_likes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
