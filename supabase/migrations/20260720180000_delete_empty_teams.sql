-- Remove existing teams that have no members (cascades to posts, schedule, etc.).
delete from public.teams t
where not exists (
  select 1 from public.team_members tm where tm.team_id = t.id
);

-- Delete a team only when it has zero members (used after leave + one-off cleanup).
create or replace function public.delete_empty_team(p_team_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_team_id is null then
    return false;
  end if;

  if exists (select 1 from public.team_members where team_id = p_team_id) then
    return false;
  end if;

  delete from public.teams where id = p_team_id;
  return found;
end;
$$;

revoke all on function public.delete_empty_team(uuid) from public;
grant execute on function public.delete_empty_team(uuid) to authenticated;

-- Auto-delete team row when the last member is removed.
create or replace function public.delete_team_if_no_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.team_members where team_id = old.team_id) then
    delete from public.teams where id = old.team_id;
  end if;
  return old;
end;
$$;

drop trigger if exists team_members_delete_empty_team on public.team_members;
create trigger team_members_delete_empty_team
  after delete on public.team_members
  for each row
  execute function public.delete_team_if_no_members();

-- Bulk cleanup helper (safe to re-run).
create or replace function public.cleanup_empty_teams()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with deleted as (
    delete from public.teams t
    where not exists (
      select 1 from public.team_members tm where tm.team_id = t.id
    )
    returning t.id
  )
  select count(*)::integer into v_deleted from deleted;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.cleanup_empty_teams() from public;
grant execute on function public.cleanup_empty_teams() to authenticated;
