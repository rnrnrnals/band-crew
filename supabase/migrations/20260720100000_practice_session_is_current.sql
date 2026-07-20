-- One explicit "current" practice song per team (team feed header).
alter table public.practice_sessions
  add column if not exists is_current boolean not null default false;

with ranked as (
  select
    id,
    row_number() over (partition by team_id order by updated_at desc, created_at desc) as rn
  from public.practice_sessions
)
update public.practice_sessions ps
set is_current = true
from ranked r
where ps.id = r.id
  and r.rn = 1;

create unique index if not exists practice_sessions_one_current_per_team
  on public.practice_sessions (team_id)
  where is_current = true;
