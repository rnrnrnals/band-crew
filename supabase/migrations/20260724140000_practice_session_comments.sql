create table public.practice_session_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  author_user_id uuid not null references public.profiles (id) on delete cascade,
  author_team_id uuid references public.teams (id) on delete set null,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index practice_session_comments_session_idx
  on public.practice_session_comments (session_id, created_at);

create trigger practice_session_comments_set_updated_at
  before update on public.practice_session_comments
  for each row execute function public.set_updated_at();

alter table public.practice_session_comments enable row level security;

create policy "practice_session_comments_select_authenticated"
  on public.practice_session_comments for select to authenticated
  using (true);

create policy "practice_session_comments_insert_authenticated"
  on public.practice_session_comments for insert to authenticated
  with check (author_user_id = auth.uid());

create policy "practice_session_comments_update_own"
  on public.practice_session_comments for update to authenticated
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

create policy "practice_session_comments_delete_own"
  on public.practice_session_comments for delete to authenticated
  using (author_user_id = auth.uid());
