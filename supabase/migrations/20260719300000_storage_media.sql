-- E: Supabase Storage — public media bucket + RLS

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

create or replace function public.storage_path_segment(path text, index int)
returns text
language sql
immutable
as $$
  select (string_to_array(path, '/'))[index];
$$;

drop policy if exists "media_public_read" on storage.objects;
drop policy if exists "media_insert_scope" on storage.objects;
drop policy if exists "media_update_scope" on storage.objects;
drop policy if exists "media_delete_scope" on storage.objects;

create policy "media_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'media');

create policy "media_insert_scope"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (
      (
        public.storage_path_segment(name, 1) = 'profiles'
        and public.storage_path_segment(name, 2) = auth.uid()::text
      )
      or (
        public.storage_path_segment(name, 1) in ('posts', 'stories', 'audio', 'chat', 'teams')
        and public.is_team_member(public.storage_path_segment(name, 2)::uuid)
      )
    )
  );

create policy "media_update_scope"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and (
      (
        public.storage_path_segment(name, 1) = 'profiles'
        and public.storage_path_segment(name, 2) = auth.uid()::text
      )
      or (
        public.storage_path_segment(name, 1) in ('posts', 'stories', 'audio', 'chat', 'teams')
        and public.is_team_member(public.storage_path_segment(name, 2)::uuid)
      )
    )
  );

create policy "media_delete_scope"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (
      (
        public.storage_path_segment(name, 1) = 'profiles'
        and public.storage_path_segment(name, 2) = auth.uid()::text
      )
      or (
        public.storage_path_segment(name, 1) in ('posts', 'stories', 'audio', 'chat', 'teams')
        and public.is_team_member(public.storage_path_segment(name, 2)::uuid)
      )
    )
  );
