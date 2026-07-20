import type { Post, TeamAudioTrack } from '../types';
import type { FeedSeenRecord } from './feedSeenStorage';
import { feedSeenKey } from './feedSeenStorage';

export type HomeFeedItem =
  | { kind: 'post'; id: string; createdAt: string; post: Post }
  | { kind: 'audio'; id: string; createdAt: string; track: TeamAudioTrack };

export interface FeedRankContext {
  followingIds: string[];
  myTeamIds: string[];
  activeTeamId: string | null;
  pinnedTeamIds: string[];
  seen: Record<string, FeedSeenRecord>;
  random?: () => number;
  now?: number;
}

function itemMeta(item: HomeFeedItem): {
  teamId: string;
  likes: number;
  commentCount: number;
  seenKey: string;
} {
  if (item.kind === 'post') {
    return {
      teamId: item.post.teamId,
      likes: item.post.likes,
      commentCount: item.post.comments.length,
      seenKey: feedSeenKey('post', item.id),
    };
  }
  return {
    teamId: item.track.teamId,
    likes: item.track.likes,
    commentCount: item.track.comments.length,
    seenKey: feedSeenKey('audio', item.id),
  };
}

export function scoreHomeFeedItem(item: HomeFeedItem, ctx: FeedRankContext): number {
  const now = ctx.now ?? Date.now();
  const rand = ctx.random?.() ?? Math.random();
  const { teamId, likes, commentCount, seenKey } = itemMeta(item);

  const isFollowing = ctx.followingIds.includes(teamId);
  const isMine = ctx.myTeamIds.includes(teamId);
  const isActive = teamId === ctx.activeTeamId;
  const isPinned = ctx.pinnedTeamIds.includes(teamId);
  const seen = ctx.seen[seenKey];

  let score = 0;

  if (isActive || isPinned) score += 48;
  else if (isFollowing || isMine) score += 36;
  else score += 14;

  if (!seen) {
    score += isFollowing || isMine || isActive ? 58 : 24;
  } else {
    const hoursSinceSeen = (now - seen.lastSeenAt) / 3_600_000;
    if (seen.viewCount >= 4) score -= 52;
    else if (seen.viewCount >= 2) score -= 30;
    else if (hoursSinceSeen < 6) score -= 20;
    else if (hoursSinceSeen < 24) score -= 10;
    else score -= 4;
  }

  score += Math.min(38, Math.log1p(likes) * 10);
  score += Math.min(16, Math.log1p(commentCount) * 4);

  const ageHours = (now - +new Date(item.createdAt)) / 3_600_000;
  score += Math.max(0, 24 - ageHours * 0.4);

  score += rand * 20;

  return score;
}

export function rankHomeFeedItems(items: HomeFeedItem[], ctx: FeedRankContext): HomeFeedItem[] {
  return [...items]
    .map((item) => ({ item, score: scoreHomeFeedItem(item, ctx) }))
    .sort((a, b) => b.score - a.score || +new Date(b.item.createdAt) - +new Date(a.item.createdAt))
    .map(({ item }) => item);
}

export function buildHomeFeedItems(posts: Post[], teamAudios: TeamAudioTrack[]): HomeFeedItem[] {
  const postItems: HomeFeedItem[] = posts.map((post) => ({
    kind: 'post',
    id: post.id,
    createdAt: post.createdAt,
    post,
  }));
  const audioItems: HomeFeedItem[] = teamAudios.map((track) => ({
    kind: 'audio',
    id: track.id,
    createdAt: track.createdAt,
    track,
  }));
  return [...postItems, ...audioItems];
}

export function mergeFeedItemsById(items: HomeFeedItem[]): HomeFeedItem[] {
  const map = new Map<string, HomeFeedItem>();
  for (const item of items) {
    map.set(`${item.kind}:${item.id}`, item);
  }
  return [...map.values()];
}
