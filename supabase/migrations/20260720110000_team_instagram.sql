alter table public.teams
  add column if not exists instagram text not null default '';
