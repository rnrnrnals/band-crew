-- BandCrew schema RESET
-- Run this FIRST if initial_schema.sql fails with "already exists".
-- ⚠️ Deletes all BandCrew table data (safe if you haven't launched yet).

-- Auth trigger
drop trigger if exists on_auth_user_created on auth.users;

-- Tables (children first; CASCADE handles the rest)
drop table if exists public.chat_messages cascade;
drop table if exists public.practice_tracks cascade;
drop table if exists public.practice_sessions cascade;
drop table if exists public.schedule_events cascade;
drop table if exists public.highlight_items cascade;
drop table if exists public.highlights cascade;
drop table if exists public.stories cascade;
drop table if exists public.audio_comment_likes cascade;
drop table if exists public.audio_comments cascade;
drop table if exists public.team_audio_likes cascade;
drop table if exists public.team_audio_tracks cascade;
drop table if exists public.post_comment_likes cascade;
drop table if exists public.post_comments cascade;
drop table if exists public.post_likes cascade;
drop table if exists public.posts cascade;
drop table if exists public.team_follows cascade;
drop table if exists public.team_members cascade;
drop table if exists public.profiles cascade;
drop table if exists public.teams cascade;

-- Functions
drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.is_team_member(uuid) cascade;
drop function if exists public.is_team_leader(uuid) cascade;
drop function if exists public.my_team_ids() cascade;

-- Enums
drop type if exists public.chat_message_kind cascade;
drop type if exists public.schedule_kind cascade;
drop type if exists public.media_type cascade;
drop type if exists public.position_id cascade;
