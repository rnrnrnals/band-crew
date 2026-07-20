-- Per-track volume (0 = silent; replaces mute toggle UX)

alter table public.practice_tracks
  add column if not exists volume numeric(4, 3) not null default 1
  check (volume >= 0 and volume <= 1);

update public.practice_tracks
  set volume = 0
  where muted = true;
