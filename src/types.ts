export type PositionId =
  | 'vocal'
  | 'elec'
  | 'acoustic'
  | 'bass'
  | 'drums'
  | 'keys'
  | 'sax'
  | 'other';

export interface TeamMember {
  id: string;
  userId?: string;
  nick: string;
  position: PositionId;
  avatar?: string;
  bio?: string;
  isLeader?: boolean;
}

export interface BandTeam {
  id: string;
  name: string;
  genre: string;
  bio: string;
  cover: string;
  inviteCode?: string;
  inviteCodeCreatedAt?: string;
  members: TeamMember[];
}

export interface Story {
  id: string;
  teamId: string;
  image: string;
  caption: string;
  createdAt: string;
}

export interface HighlightItem {
  id: string;
  image: string;
  caption: string;
  sourceStoryId?: string;
}

export interface TeamHighlight {
  id: string;
  teamId: string;
  title: string;
  coverImage: string;
  items: HighlightItem[];
  createdAt: string;
}

export interface TeamAudioTrack {
  id: string;
  teamId: string;
  title: string;
  audioUrl: string;
  durationSec?: number;
  caption?: string;
  body?: string;
  coverImage?: string;
  likes: number;
  likedByMe?: boolean;
  comments: PostComment[];
  createdAt: string;
}

export interface PostComment {
  id: string;
  author: string;
  authorUserId?: string;
  authorTeam?: string;
  authorNick?: string;
  authorAvatar?: string;
  text: string;
  parentId?: string;
  replyTo?: string;
  likes?: number;
  likedByMe?: boolean;
}

export interface Post {
  id: string;
  teamId: string;
  mediaType: 'video' | 'image' | 'text';
  mediaUrl?: string;
  caption: string;
  likes: number;
  likedByMe?: boolean;
  comments: PostComment[];
  createdAt: string;
}

export interface ScheduleEvent {
  id: string;
  teamId: string;
  title: string;
  place: string;
  placeMapUrl?: string;
  date: string;
  kind: 'practice' | 'gig' | 'other';
}

export interface PracticeSessionMeta {
  id: string;
  teamId: string;
  title: string;
  bpm: number;
  updatedAt: string;
  authorUserId?: string;
}

export interface AppUser {
  id: string;
  name: string;
  avatar: string;
  bio?: string;
}

export interface ChatMessage {
  id: string;
  teamId: string;
  chatThreadId?: string;
  authorNick: string;
  authorAvatar?: string;
  kind?: 'text' | 'image' | 'video' | 'audio';
  text?: string;
  mediaUrl?: string;
  createdAt: string;
}

export type ChatMessageKind = NonNullable<ChatMessage['kind']>;

export interface SendChatPayload {
  kind: ChatMessageKind;
  text?: string;
  mediaUrl?: string;
}
