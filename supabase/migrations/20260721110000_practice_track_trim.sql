alter table public.practice_tracks
  add column if not exists trim_start_sec numeric(8, 3) not null default 0,
  add column if not exists trim_end_sec numeric(8, 3) not null default 0;
