alter table public.chat_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

drop policy if exists "chat_messages_update_own" on public.chat_messages;
create policy "chat_messages_update_own"
  on public.chat_messages for update to authenticated
  using (author_user_id = auth.uid() and deleted_at is null)
  with check (author_user_id = auth.uid());
