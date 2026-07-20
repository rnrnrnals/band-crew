-- BandCrew initial schema (Step B)
-- Apply in Supabase Dashboard → SQL Editor → New query → Run

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums (match src/types.ts)
-- ---------------------------------------------------------------------------
create type public.position_id as enum (
  'vocal', 'elec', 'acoustic', 'bass', 'drums', 'keys', 'sax', 'other'
);

create type public.media_type as enum ('video', 'image', 'text');

create type public.schedule_kind as enum ('practice', 'gig', 'other');

create type public.chat_message_kind as enum ('text', 'image', 'video', 'audio');

-- ---------------------------------------------------------------------------
-- Profiles (extends auth.users — wired in Step C)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text not null default '',
  bio text not null default '',
  active_team_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'App user profile, 1:1 with auth.users';

-- ---------------------------------------------------------------------------
-- Teams & membership
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  genre text not null default '',
  bio text not null default '',
  cover_url text not null default '',
  invite_code text unique,
  invite_code_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  nick text not null,
  position public.position_id not null default 'other',
  avatar_url text not null default '',
  bio text not null default '',
  is_leader boolean not null default false,
  created_at timestamptz not null default now(),
  unique (team_id, user_id),
  unique (team_id, nick)
);

alter table public.profiles
  add constraint profiles_active_team_id_fkey
  foreign key (active_team_id) references public.teams (id) on delete set null;

create table public.team_follows (
  follower_team_id uuid not null references public.teams (id) on delete cascade,
  following_team_id uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_team_id, following_team_id),
  constraint team_follows_no_self check (follower_team_id <> following_team_id)
);

-- ---------------------------------------------------------------------------
-- Feed: posts, likes, comments
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  author_user_id uuid references public.profiles (id) on delete set null,
  media_type public.media_type not null default 'text',
  media_url text,
  caption text not null default '',
  created_at timestamptz not null default now()
);

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_user_id uuid not null references public.profiles (id) on delete cascade,
  author_team_id uuid references public.teams (id) on delete set null,
  text text not null,
  parent_id uuid references public.post_comments (id) on delete cascade,
  reply_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_comment_likes (
  comment_id uuid not null references public.post_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Team audio & comments
-- ---------------------------------------------------------------------------
create table public.team_audio_tracks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  author_user_id uuid references public.profiles (id) on delete set null,
  title text not null,
  audio_url text not null,
  duration_sec numeric(10, 2),
  caption text,
  body text,
  cover_image_url text,
  created_at timestamptz not null default now()
);

create table public.audio_comments (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.team_audio_tracks (id) on delete cascade,
  author_user_id uuid not null references public.profiles (id) on delete cascade,
  author_team_id uuid references public.teams (id) on delete set null,
  text text not null,
  parent_id uuid references public.audio_comments (id) on delete cascade,
  reply_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audio_comment_likes (
  comment_id uuid not null references public.audio_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Stories & highlights
-- ---------------------------------------------------------------------------
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  image_url text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);

create table public.highlights (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null,
  cover_image_url text not null default '',
  created_at timestamptz not null default now()
);

create table public.highlight_items (
  id uuid primary key default gen_random_uuid(),
  highlight_id uuid not null references public.highlights (id) on delete cascade,
  image_url text not null,
  caption text not null default '',
  source_story_id uuid references public.stories (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Schedule & practice room
-- ---------------------------------------------------------------------------
create table public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null,
  place text not null default '',
  place_map_url text,
  event_date timestamptz not null,
  kind public.schedule_kind not null default 'other',
  created_at timestamptz not null default now()
);

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null,
  bpm int not null default 120 check (bpm > 0 and bpm <= 400),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Chat (in-team + cross-team threads)
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  chat_thread_id text,
  author_user_id uuid not null references public.profiles (id) on delete cascade,
  author_nick text not null,
  author_avatar_url text not null default '',
  kind public.chat_message_kind not null default 'text',
  text text,
  media_url text,
  created_at timestamptz not null default now()
);

comment on column public.chat_messages.chat_thread_id is
  'Null = in-team chat. Cross-team: sorted team ids joined with __ e.g. uuidA__uuidB';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index team_members_user_id_idx on public.team_members (user_id);
create index team_members_team_id_idx on public.team_members (team_id);
create index team_follows_following_idx on public.team_follows (following_team_id);
create index posts_team_created_idx on public.posts (team_id, created_at desc);
create index post_comments_post_idx on public.post_comments (post_id, created_at);
create index team_audio_team_created_idx on public.team_audio_tracks (team_id, created_at desc);
create index audio_comments_track_idx on public.audio_comments (track_id, created_at);
create index stories_team_created_idx on public.stories (team_id, created_at desc);
create index highlights_team_idx on public.highlights (team_id);
create index highlight_items_highlight_idx on public.highlight_items (highlight_id, sort_order);
create index schedule_events_team_date_idx on public.schedule_events (team_id, event_date);
create index practice_sessions_team_idx on public.practice_sessions (team_id);
create index chat_messages_team_created_idx on public.chat_messages (team_id, created_at desc);
create index chat_messages_thread_created_idx on public.chat_messages (chat_thread_id, created_at desc)
  where chat_thread_id is not null;
create index teams_invite_code_idx on public.teams (invite_code) where invite_code is not null;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create trigger post_comments_set_updated_at
  before update on public.post_comments
  for each row execute function public.set_updated_at();

create trigger audio_comments_set_updated_at
  before update on public.audio_comments
  for each row execute function public.set_updated_at();

create trigger practice_sessions_set_updated_at
  before update on public.practice_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth hook: auto-create profile (Step C)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'User'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_team_member(p_team_id uuid)
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
  );
$$;

create or replace function public.is_team_leader(p_team_id uuid)
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
      and tm.is_leader = true
  );
$$;

create or replace function public.my_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.team_id
  from public.team_members tm
  where tm.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_follows enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_comment_likes enable row level security;
alter table public.team_audio_tracks enable row level security;
alter table public.audio_comments enable row level security;
alter table public.audio_comment_likes enable row level security;
alter table public.stories enable row level security;
alter table public.highlights enable row level security;
alter table public.highlight_items enable row level security;
alter table public.schedule_events enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.chat_messages enable row level security;

-- profiles
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- teams
create policy "teams_select_authenticated"
  on public.teams for select to authenticated
  using (true);

create policy "teams_insert_authenticated"
  on public.teams for insert to authenticated
  with check (true);

create policy "teams_update_leader"
  on public.teams for update to authenticated
  using (public.is_team_leader(id))
  with check (public.is_team_leader(id));

-- team_members
create policy "team_members_select_authenticated"
  on public.team_members for select to authenticated
  using (true);

create policy "team_members_insert_self_or_leader"
  on public.team_members for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_team_leader(team_id)
  );

create policy "team_members_update_self_or_leader"
  on public.team_members for update to authenticated
  using (user_id = auth.uid() or public.is_team_leader(team_id))
  with check (user_id = auth.uid() or public.is_team_leader(team_id));

create policy "team_members_delete_self_or_leader"
  on public.team_members for delete to authenticated
  using (user_id = auth.uid() or public.is_team_leader(team_id));

-- team_follows (only members of follower team can manage)
create policy "team_follows_select_authenticated"
  on public.team_follows for select to authenticated
  using (true);

create policy "team_follows_insert_member"
  on public.team_follows for insert to authenticated
  with check (public.is_team_member(follower_team_id));

create policy "team_follows_delete_member"
  on public.team_follows for delete to authenticated
  using (public.is_team_member(follower_team_id));

-- posts
create policy "posts_select_authenticated"
  on public.posts for select to authenticated
  using (true);

create policy "posts_insert_member"
  on public.posts for insert to authenticated
  with check (public.is_team_member(team_id));

create policy "posts_delete_member"
  on public.posts for delete to authenticated
  using (public.is_team_member(team_id));

-- post_likes
create policy "post_likes_select_authenticated"
  on public.post_likes for select to authenticated
  using (true);

create policy "post_likes_mutate_own"
  on public.post_likes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- post_comments
create policy "post_comments_select_authenticated"
  on public.post_comments for select to authenticated
  using (true);

create policy "post_comments_insert_authenticated"
  on public.post_comments for insert to authenticated
  with check (author_user_id = auth.uid());

create policy "post_comments_update_own"
  on public.post_comments for update to authenticated
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

create policy "post_comments_delete_own"
  on public.post_comments for delete to authenticated
  using (author_user_id = auth.uid());

-- post_comment_likes
create policy "post_comment_likes_select_authenticated"
  on public.post_comment_likes for select to authenticated
  using (true);

create policy "post_comment_likes_mutate_own"
  on public.post_comment_likes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- team_audio_tracks
create policy "team_audio_select_authenticated"
  on public.team_audio_tracks for select to authenticated
  using (true);

create policy "team_audio_insert_member"
  on public.team_audio_tracks for insert to authenticated
  with check (public.is_team_member(team_id));

create policy "team_audio_delete_member"
  on public.team_audio_tracks for delete to authenticated
  using (public.is_team_member(team_id));

-- audio_comments
create policy "audio_comments_select_authenticated"
  on public.audio_comments for select to authenticated
  using (true);

create policy "audio_comments_insert_authenticated"
  on public.audio_comments for insert to authenticated
  with check (author_user_id = auth.uid());

create policy "audio_comments_update_own"
  on public.audio_comments for update to authenticated
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

create policy "audio_comments_delete_own"
  on public.audio_comments for delete to authenticated
  using (author_user_id = auth.uid());

-- audio_comment_likes
create policy "audio_comment_likes_select_authenticated"
  on public.audio_comment_likes for select to authenticated
  using (true);

create policy "audio_comment_likes_mutate_own"
  on public.audio_comment_likes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- stories, highlights, schedule, practice, chat — team members manage
create policy "stories_select_authenticated"
  on public.stories for select to authenticated using (true);
create policy "stories_insert_member"
  on public.stories for insert to authenticated
  with check (public.is_team_member(team_id));
create policy "stories_delete_member"
  on public.stories for delete to authenticated
  using (public.is_team_member(team_id));

create policy "highlights_select_authenticated"
  on public.highlights for select to authenticated using (true);
create policy "highlights_insert_member"
  on public.highlights for insert to authenticated
  with check (public.is_team_member(team_id));
create policy "highlights_update_member"
  on public.highlights for update to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
create policy "highlights_delete_member"
  on public.highlights for delete to authenticated
  using (public.is_team_member(team_id));

create policy "highlight_items_select_authenticated"
  on public.highlight_items for select to authenticated using (true);
create policy "highlight_items_mutate_member"
  on public.highlight_items for all to authenticated
  using (
    exists (
      select 1 from public.highlights h
      where h.id = highlight_id and public.is_team_member(h.team_id)
    )
  )
  with check (
    exists (
      select 1 from public.highlights h
      where h.id = highlight_id and public.is_team_member(h.team_id)
    )
  );

create policy "schedule_events_select_authenticated"
  on public.schedule_events for select to authenticated using (true);
create policy "schedule_events_mutate_member"
  on public.schedule_events for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy "practice_sessions_select_authenticated"
  on public.practice_sessions for select to authenticated using (true);
create policy "practice_sessions_mutate_member"
  on public.practice_sessions for all to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy "chat_messages_select_authenticated"
  on public.chat_messages for select to authenticated using (true);
create policy "chat_messages_insert_member"
  on public.chat_messages for insert to authenticated
  with check (
    public.is_team_member(team_id)
    and author_user_id = auth.uid()
  );
