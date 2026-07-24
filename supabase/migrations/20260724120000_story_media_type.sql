alter table public.stories
  add column if not exists media_type text not null default 'image'
  check (media_type in ('image', 'video'));

alter table public.highlight_items
  add column if not exists media_type text not null default 'image'
  check (media_type in ('image', 'video'));
