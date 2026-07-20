-- Practice room layer tracks (per session)

create table if not exists public.practice_tracks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  track_key bigint not null,
  name text not null,
  media_url text not null,
  color text not null default '#e0a04a',
  muted boolean not null default false,
  peaks jsonb not null default '[]',
  duration_sec numeric(10, 3) not null default 0,
  position_id text not null,
  position_label text not null,
  kind text not null check (kind in ('audio', 'video')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, track_key)
);

create index if not exists practice_tracks_session_idx
  on public.practice_tracks (session_id, sort_order);

drop trigger if exists practice_tracks_set_updated_at on public.practice_tracks;
create trigger practice_tracks_set_updated_at
  before update on public.practice_tracks
  for each row execute function public.set_updated_at();

alter table public.practice_tracks enable row level security;

drop policy if exists "practice_tracks_select_authenticated" on public.practice_tracks;
drop policy if exists "practice_tracks_mutate_member" on public.practice_tracks;

create policy "practice_tracks_select_authenticated"
  on public.practice_tracks for select to authenticated
  using (true);

create policy "practice_tracks_mutate_member"
  on public.practice_tracks for all to authenticated
  using (
    exists (
      select 1 from public.practice_sessions ps
      where ps.id = session_id and public.is_team_member(ps.team_id)
    )
  )
  with check (
    exists (
      select 1 from public.practice_sessions ps
      where ps.id = session_id and public.is_team_member(ps.team_id)
    )
  );

-- Storage: allow practice/{teamId}/{sessionId}/… uploads
drop policy if exists "media_insert_scope" on storage.objects;
drop policy if exists "media_update_scope" on storage.objects;
drop policy if exists "media_delete_scope" on storage.objects;

create policy "media_insert_scope"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (
      (
        public.storage_path_segment(name, 1) = 'profiles'
        and public.storage_path_segment(name, 2) = auth.uid()::text
      )
      or (
        public.storage_path_segment(name, 1) in ('posts', 'stories', 'audio', 'chat', 'teams', 'practice')
        and public.is_team_member(public.storage_path_segment(name, 2)::uuid)
      )
    )
  );

create policy "media_update_scope"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'media'
    and (
      (
        public.storage_path_segment(name, 1) = 'profiles'
        and public.storage_path_segment(name, 2) = auth.uid()::text
      )
      or (
        public.storage_path_segment(name, 1) in ('posts', 'stories', 'audio', 'chat', 'teams', 'practice')
        and public.is_team_member(public.storage_path_segment(name, 2)::uuid)
      )
    )
  );

create policy "media_delete_scope"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (
      (
        public.storage_path_segment(name, 1) = 'profiles'
        and public.storage_path_segment(name, 2) = auth.uid()::text
      )
      or (
        public.storage_path_segment(name, 1) in ('posts', 'stories', 'audio', 'chat', 'teams', 'practice')
        and public.is_team_member(public.storage_path_segment(name, 2)::uuid)
      )
    )
  );
