-- Track who created each practice session (for delete permission)

alter table public.practice_sessions
  add column if not exists author_user_id uuid references public.profiles (id) on delete set null;

create index if not exists practice_sessions_author_idx
  on public.practice_sessions (author_user_id)
  where author_user_id is not null;
