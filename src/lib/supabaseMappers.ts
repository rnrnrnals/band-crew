import type {
  BandTeam,
  ChatMessage,
  ChatMessageKind,
  HighlightItem,
  PositionId,
  Post,
  PostComment,
  ScheduleEvent,
  Story,
  TeamAudioTrack,
  TeamHighlight,
  PracticeSessionMeta,
  TeamPracticeSong,
} from '../types';
import { sanitizeAvatarUrl } from '../mock/memberUtils';

export interface DbTeam {
  id: string;
  name: string;
  genre: string;
  bio: string;
  cover_url: string;
  instagram?: string | null;
  invite_code: string | null;
  invite_code_created_at: string | null;
  created_at: string;
}

export interface DbTeamMember {
  id: string;
  team_id: string;
  user_id: string;
  nick: string;
  position: PositionId;
  avatar_url: string;
  bio: string;
  instagram?: string | null;
  is_leader: boolean;
  is_co_leader?: boolean | null;
}

export interface DbPost {
  id: string;
  team_id: string;
  author_user_id: string | null;
  media_type: 'video' | 'image' | 'text';
  media_url: string | null;
  caption: string;
  created_at: string;
}

export interface DbPostComment {
  id: string;
  post_id: string;
  author_user_id: string;
  author_team_id: string | null;
  text: string;
  parent_id: string | null;
  reply_to: string | null;
  created_at: string;
}

export interface DbAudioTrack {
  id: string;
  team_id: string;
  author_user_id: string | null;
  title: string;
  audio_url: string;
  duration_sec: number | null;
  caption: string | null;
  body: string | null;
  cover_image_url: string | null;
  created_at: string;
}

export interface DbAudioComment {
  id: string;
  track_id: string;
  author_user_id: string;
  author_team_id: string | null;
  text: string;
  parent_id: string | null;
  reply_to: string | null;
  created_at: string;
}

export interface DbPracticeSessionComment {
  id: string;
  session_id: string;
  author_user_id: string;
  author_team_id: string | null;
  text: string;
  parent_id?: string | null;
  reply_to?: string | null;
  created_at: string;
  updated_at: string;
}

export function mapTeamMember(row: DbTeamMember): BandTeam['members'][number] {
  return {
    id: row.id,
    userId: row.user_id,
    nick: row.nick,
    position: row.position,
    avatar: sanitizeAvatarUrl(row.avatar_url) || undefined,
    bio: row.bio || undefined,
    instagram: row.instagram?.trim() || undefined,
    isLeader: row.is_leader,
    isCoLeader: row.is_co_leader === true,
  };
}

export function mapTeam(row: DbTeam, members: DbTeamMember[]): BandTeam {
  return {
    id: row.id,
    name: row.name,
    genre: row.genre,
    bio: row.bio,
    cover: row.cover_url,
    instagram: row.instagram?.trim() || undefined,
    inviteCode: row.invite_code ?? undefined,
    inviteCodeCreatedAt: row.invite_code_created_at ?? undefined,
    members: members.map(mapTeamMember),
  };
}

export function mapPostComment(
  row: DbPostComment,
  ctx: {
    authorTeamName?: string;
    authorNick?: string;
    authorAvatar?: string;
    likes: number;
    likedByMe: boolean;
  },
): PostComment {
  const crossTeam = !!row.author_team_id;
  return {
    id: row.id,
    author: crossTeam ? (ctx.authorTeamName ?? ctx.authorNick ?? 'User') : (ctx.authorNick ?? 'User'),
    authorUserId: row.author_user_id,
    authorTeam: ctx.authorTeamName,
    authorNick: crossTeam ? ctx.authorNick : undefined,
    authorAvatar: ctx.authorAvatar,
    text: row.text,
    parentId: row.parent_id ?? undefined,
    replyTo: row.reply_to ?? undefined,
    likes: ctx.likes,
    likedByMe: ctx.likedByMe,
  };
}

export function mapPost(
  row: DbPost,
  comments: PostComment[],
  likes: number,
  likedByMe: boolean,
): Post {
  return {
    id: row.id,
    teamId: row.team_id,
    mediaType: row.media_type,
    mediaUrl: row.media_url ?? undefined,
    caption: row.caption,
    likes,
    likedByMe,
    comments,
    createdAt: row.created_at,
  };
}

export function mapAudioComment(
  row: DbAudioComment,
  ctx: {
    authorTeamName?: string;
    authorNick?: string;
    authorAvatar?: string;
    likes: number;
    likedByMe: boolean;
  },
): PostComment {
  return mapPostComment(row as unknown as DbPostComment, ctx);
}

export function mapPracticeSessionComment(
  row: DbPracticeSessionComment,
  ctx: {
    authorTeamName?: string;
    authorNick?: string;
    likes?: number;
    likedByMe?: boolean;
  },
): PostComment {
  const crossTeam = !!row.author_team_id;
  return {
    id: row.id,
    author: crossTeam ? (ctx.authorTeamName ?? ctx.authorNick ?? 'User') : (ctx.authorNick ?? 'User'),
    authorUserId: row.author_user_id,
    authorTeam: ctx.authorTeamName,
    authorNick: crossTeam ? ctx.authorNick : undefined,
    text: row.text,
    parentId: row.parent_id ?? undefined,
    replyTo: row.reply_to ?? undefined,
    likes: ctx.likes ?? 0,
    likedByMe: ctx.likedByMe ?? false,
  };
}

export function mapAudioTrack(
  row: DbAudioTrack,
  comments: PostComment[],
  likes = 0,
  likedByMe = false,
): TeamAudioTrack {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    audioUrl: row.audio_url,
    durationSec: row.duration_sec ?? undefined,
    caption: row.caption ?? undefined,
    body: row.body ?? undefined,
    coverImage: row.cover_image_url ?? undefined,
    likes,
    likedByMe,
    comments,
    createdAt: row.created_at,
  };
}

export function mapStory(row: {
  id: string;
  team_id: string;
  image_url: string;
  media_type?: string | null;
  caption: string;
  created_at: string;
}): Story {
  return {
    id: row.id,
    teamId: row.team_id,
    image: row.image_url,
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    caption: row.caption,
    createdAt: row.created_at,
  };
}

export function mapSchedule(row: {
  id: string;
  team_id: string;
  title: string;
  place: string;
  place_map_url: string | null;
  event_date: string;
  kind: ScheduleEvent['kind'];
}): ScheduleEvent {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    place: row.place,
    placeMapUrl: row.place_map_url ?? undefined,
    date: row.event_date,
    kind: row.kind,
  };
}

export function mapPractice(row: {
  id: string;
  team_id: string;
  title: string;
  bpm: number;
  updated_at: string;
  author_user_id?: string | null;
  is_public?: boolean | null;
}): PracticeSessionMeta {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    bpm: row.bpm,
    updatedAt: row.updated_at,
    authorUserId: row.author_user_id ?? undefined,
    isPublic: row.is_public === true,
  };
}

export function mapTeamPracticeSong(row: {
  id: string;
  team_id: string;
  title: string;
  is_current: boolean;
  author_user_id?: string | null;
  updated_at: string;
}): TeamPracticeSong {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    updatedAt: row.updated_at,
    authorUserId: row.author_user_id ?? undefined,
    isCurrent: row.is_current,
  };
}

export function mapChat(row: {
  id: string;
  team_id: string;
  chat_thread_id: string | null;
  author_user_id: string;
  author_nick: string;
  author_avatar_url: string;
  kind: ChatMessageKind;
  text: string | null;
  media_url: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
}): ChatMessage {
  return {
    id: row.id,
    teamId: row.team_id,
    chatThreadId: row.chat_thread_id ?? undefined,
    authorUserId: row.author_user_id,
    authorNick: row.author_nick,
    authorAvatar: row.author_avatar_url || undefined,
    kind: row.kind,
    text: row.text ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export function mapHighlightItem(row: {
  id: string;
  image_url: string;
  media_type?: string | null;
  caption: string;
  source_story_id: string | null;
}): HighlightItem {
  return {
    id: row.id,
    image: row.image_url,
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    caption: row.caption,
    sourceStoryId: row.source_story_id ?? undefined,
  };
}

export function mapHighlight(
  row: { id: string; team_id: string; title: string; cover_image_url: string; created_at: string },
  items: HighlightItem[],
): TeamHighlight {
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    coverImage: row.cover_image_url,
    items,
    createdAt: row.created_at,
  };
}
