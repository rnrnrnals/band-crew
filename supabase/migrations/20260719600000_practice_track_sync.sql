-- Per-track sync offset (author can nudge their own recording timing)

alter table public.practice_tracks
  add column if not exists author_user_id uuid references public.profiles (id) on delete set null,
  add column if not exists sync_offset_sec numeric(8, 3) not null default 0;

create index if not exists practice_tracks_author_idx
  on public.practice_tracks (author_user_id)
  where author_user_id is not null;
