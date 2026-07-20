-- Reject duplicate team names when creating via RPC (case-insensitive, trimmed).
create or replace function public.create_team_with_leader(
  p_name text,
  p_genre text,
  p_nick text,
  p_position public.position_id,
  p_avatar_url text default '',
  p_bio text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Team name is required';
  end if;

  if coalesce(trim(p_nick), '') = '' then
    raise exception 'Nick is required';
  end if;

  if exists (
    select 1
    from public.teams
    where lower(trim(name)) = lower(trim(p_name))
  ) then
    raise exception 'Team name already exists';
  end if;

  insert into public.profiles (id, display_name, avatar_url, bio)
  values (
    v_user_id,
    coalesce(nullif(trim(p_nick), ''), 'User'),
    coalesce(p_avatar_url, ''),
    coalesce(p_bio, '')
  )
  on conflict (id) do nothing;

  insert into public.teams (name, genre, bio, cover_url)
  values (
    trim(p_name),
    coalesce(nullif(trim(p_genre), ''), '장르 미정'),
    '새로 만든 밴드팀입니다.',
    ''
  )
  returning id into v_team_id;

  insert into public.team_members (team_id, user_id, nick, position, avatar_url, bio, is_leader)
  values (
    v_team_id,
    v_user_id,
    trim(p_nick),
    p_position,
    coalesce(p_avatar_url, ''),
    coalesce(p_bio, ''),
    true
  );

  update public.profiles
  set active_team_id = v_team_id
  where id = v_user_id;

  return v_team_id;
end;
$$;

revoke all on function public.create_team_with_leader(text, text, text, public.position_id, text, text) from public;
grant execute on function public.create_team_with_leader(text, text, text, public.position_id, text, text) to authenticated;
