-- Co-leader: one per team, same app permissions as leader (except role management).
alter table public.team_members
  add column if not exists is_co_leader boolean not null default false;

create unique index if not exists team_members_one_co_leader_per_team
  on public.team_members (team_id)
  where is_co_leader;

create or replace function public.is_team_manager(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and (tm.is_leader = true or tm.is_co_leader = true)
  );
$$;
