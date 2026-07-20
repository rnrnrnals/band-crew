alter table public.profiles
  add column if not exists instagram text not null default '';

alter table public.team_members
  add column if not exists instagram text not null default '';
