import type { Post, TeamAudioTrack } from '../types';

export const SHARE_MESSAGE_PREFIX = '__BANDCREW_SHARE__:';

export type SharedPostContent = {
  type: 'post';
  postId: string;
  teamId: string;
  teamName: string;
  caption: string;
  mediaType: Post['mediaType'];
  mediaUrl?: string;
};

export type SharedAudioContent = {
  type: 'audio';
  trackId: string;
  teamId: string;
  teamName: string;
  title: string;
  caption?: string;
  coverImage?: string;
  durationSec?: number;
};

export type SharedContent = SharedPostContent | SharedAudioContent;

export function buildSharedPostContent(post: Post, teamName: string): SharedPostContent {
  return {
    type: 'post',
    postId: post.id,
    teamId: post.teamId,
    teamName,
    caption: post.caption,
    mediaType: post.mediaType,
    mediaUrl: post.mediaUrl,
  };
}

export function buildSharedAudioContent(track: TeamAudioTrack, teamName: string): SharedAudioContent {
  return {
    type: 'audio',
    trackId: track.id,
    teamId: track.teamId,
    teamName,
    title: track.title,
    caption: track.caption,
    coverImage: track.coverImage,
    durationSec: track.durationSec,
  };
}

export function encodeShareMessage(content: SharedContent): string {
  return `${SHARE_MESSAGE_PREFIX}${JSON.stringify(content)}`;
}

export function parseShareMessage(text?: string): SharedContent | null {
  if (!text?.startsWith(SHARE_MESSAGE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(SHARE_MESSAGE_PREFIX.length)) as SharedContent;
    if (parsed.type !== 'post' && parsed.type !== 'audio') return null;
    if (!parsed.teamId || !parsed.teamName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function shareMessagePreview(text?: string): string | null {
  const shared = parseShareMessage(text);
  if (!shared) return null;
  if (shared.type === 'post') {
    return shared.caption.trim() || `${shared.teamName} 피드`;
  }
  return shared.title.trim() || `${shared.teamName} 사운드`;
}

export interface ShareChatDestination {
  id: string;
  peerTeamId?: string;
  label: string;
  subtitle: string;
  cover?: string;
  lastActivityAt: number;
}

export function listShareChatDestinations(input: {
  activeTeamId: string | null;
  activeTeamName?: string;
  activeTeamCover?: string;
  chatMessages: { chatThreadId?: string; createdAt: string }[];
  getTeam: (id: string) => { id: string; name: string; cover: string; genre: string } | undefined;
}): ShareChatDestination[] {
  const { activeTeamId, activeTeamName, activeTeamCover, chatMessages, getTeam } = input;
  if (!activeTeamId || !activeTeamName) return [];

  const destinations: ShareChatDestination[] = [
    {
      id: 'own-team',
      label: `${activeTeamName} 팀 채팅`,
      subtitle: '우리 팀 채팅방',
      cover: activeTeamCover,
      lastActivityAt: Number.MAX_SAFE_INTEGER,
    },
  ];

  const peerActivity = new Map<string, number>();
  for (const msg of chatMessages) {
    if (!msg.chatThreadId) continue;
    const parts = msg.chatThreadId.split('__');
    const teamA = parts[0] ?? '';
    const teamB = parts[1] ?? '';
    if (teamA !== activeTeamId && teamB !== activeTeamId) continue;
    const peerId: string = teamA === activeTeamId ? teamB : teamA;
    if (!peerId || peerId === activeTeamId) continue;
    const ts = +new Date(msg.createdAt);
    peerActivity.set(peerId, Math.max(peerActivity.get(peerId) ?? 0, ts));
  }

  const peerEntries = [...peerActivity.entries()].sort((a, b) => b[1] - a[1]);
  for (const [peerId, lastActivityAt] of peerEntries) {
    const team = getTeam(peerId);
    if (!team) continue;
    destinations.push({
      id: `peer-${peerId}`,
      peerTeamId: peerId,
      label: team.name,
      subtitle: '팀 간 대화',
      cover: team.cover,
      lastActivityAt,
    });
  }

  return destinations.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}
