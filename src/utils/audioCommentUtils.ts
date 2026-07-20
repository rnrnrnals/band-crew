import type { BandTeam, PostComment } from '../types';
import { resolveCommentTeam } from './commentUtils';

export interface ParsedTimestamp {
  text: string;
  startIndex: number;
  endIndex: number;
  seconds: number;
}

export type CommentTextPart =
  | { type: 'text'; text: string }
  | { type: 'timestamp'; text: string; seconds: number };

const TIMESTAMP_RE = /(?<![\d:])(\d{1,2}):(\d{2})(?::(\d{2}))?(?![\d:])/g;

export function parseTimestampToken(minStr: string, secStr: string, hourStr?: string): number | null {
  const sec = Number(secStr);
  if (!Number.isFinite(sec) || sec < 0 || sec >= 60) return null;

  if (hourStr !== undefined) {
    const hour = Number(hourStr);
    const min = Number(minStr);
    if (!Number.isFinite(hour) || !Number.isFinite(min) || min < 0 || min >= 60) return null;
    return hour * 3600 + min * 60 + sec;
  }

  const min = Number(minStr);
  if (!Number.isFinite(min) || min < 0) return null;
  return min * 60 + sec;
}

export function parseTimestamps(text: string): ParsedTimestamp[] {
  const results: ParsedTimestamp[] = [];
  TIMESTAMP_RE.lastIndex = 0;
  let match: RegExpExecArray | null = TIMESTAMP_RE.exec(text);
  while (match) {
    const seconds = parseTimestampToken(match[1], match[2], match[3]);
    if (seconds != null && Number.isFinite(seconds)) {
      results.push({
        text: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        seconds,
      });
    }
    match = TIMESTAMP_RE.exec(text);
  }
  return results;
}

export function splitCommentWithTimestamps(text: string): CommentTextPart[] {
  const timestamps = parseTimestamps(text);
  if (timestamps.length === 0) return [{ type: 'text', text }];

  const parts: CommentTextPart[] = [];
  let cursor = 0;
  for (const ts of timestamps) {
    if (ts.startIndex > cursor) {
      parts.push({ type: 'text', text: text.slice(cursor, ts.startIndex) });
    }
    parts.push({ type: 'timestamp', text: ts.text, seconds: ts.seconds });
    cursor = ts.endIndex;
  }
  if (cursor < text.length) {
    parts.push({ type: 'text', text: text.slice(cursor) });
  }
  return parts;
}

export interface WaveCommentMarker {
  id: string;
  commentId: string;
  seconds: number;
  ratio: number;
  label: string;
  author: string;
  teamId: string;
  teamName: string;
  personName: string;
  avatarUrl: string;
  stack: number;
}

export function resolveCommentTeamName(comment: PostComment, trackTeam?: BandTeam): string {
  return comment.authorTeam ?? trackTeam?.name ?? comment.author;
}

export function resolveCommentPersonName(comment: PostComment): string {
  if (comment.authorNick) return comment.authorNick;
  if (comment.authorTeam) return comment.author;
  return comment.author;
}

function findCommenterTeam(comment: PostComment, teams: BandTeam[]): BandTeam | undefined {
  if (comment.authorTeam) {
    return teams.find((t) => t.name === comment.authorTeam);
  }
  return teams.find((t) =>
    t.members.some((m) => m.nick === comment.author || m.id === comment.authorUserId),
  );
}

export function resolveCommentAvatar(
  comment: PostComment,
  trackTeam: BandTeam | undefined,
  teams: BandTeam[],
): string {
  const commenterTeam = findCommenterTeam(comment, teams);
  const isOwnTeamTrackComment =
    !!trackTeam && !!commenterTeam && commenterTeam.id === trackTeam.id;

  if (isOwnTeamTrackComment) {
    const member = trackTeam.members.find(
      (m) =>
        m.nick === comment.author ||
        m.nick === comment.authorNick ||
        m.id === comment.authorUserId,
    );
    return member?.avatar ?? comment.authorAvatar ?? trackTeam.cover;
  }

  return commenterTeam?.cover ?? trackTeam?.cover ?? teams[0]?.cover ?? '';
}

export function getWaveCommentMarkers(
  comments: PostComment[] | undefined,
  durationSec: number | undefined,
  context?: { trackTeam?: BandTeam; teams?: BandTeam[] },
): WaveCommentMarker[] {
  if (!comments?.length || !durationSec || durationSec <= 0) return [];

  const trackTeam = context?.trackTeam;
  const teams = context?.teams ?? (trackTeam ? [trackTeam] : []);

  const raw: (Omit<WaveCommentMarker, 'stack'> & { commentOrder: number; tsOrder: number })[] = [];
  comments.forEach((comment, commentOrder) => {
    const timestamps = parseTimestamps(comment.text);
    const author = comment.authorNick ?? comment.author;
    const teamName = resolveCommentTeamName(comment, trackTeam);
    const personName = resolveCommentPersonName(comment);
    const avatarUrl = resolveCommentAvatar(comment, trackTeam, teams);
    const commentTeam = resolveCommentTeam(comment, teams, trackTeam);
    for (const ts of timestamps) {
      raw.push({
        id: `${comment.id}-${ts.startIndex}`,
        commentId: comment.id,
        seconds: ts.seconds,
        ratio: Math.max(0, Math.min(1, ts.seconds / durationSec)),
        label: comment.text.trim(),
        author,
        teamId: commentTeam?.id ?? '',
        teamName,
        personName,
        avatarUrl,
        commentOrder,
        tsOrder: ts.startIndex,
      });
    }
  });

  raw.sort((a, b) => {
    if (a.seconds !== b.seconds) return a.seconds - b.seconds;
    if (a.commentOrder !== b.commentOrder) return a.commentOrder - b.commentOrder;
    return a.tsOrder - b.tsOrder;
  });

  const stacks = new Map<string, number>();
  return raw.map((marker) => {
    const key = marker.seconds.toFixed(2);
    const stack = stacks.get(key) ?? 0;
    stacks.set(key, stack + 1);
    const { commentOrder: _commentOrder, tsOrder: _tsOrder, ...rest } = marker;
    return { ...rest, stack };
  });
}

export function barNearCommentRatio(barRatio: number, commentRatios: number[], barCount: number): boolean {
  const threshold = 1.2 / barCount;
  return commentRatios.some((ratio) => Math.abs(ratio - barRatio) <= threshold);
}

/** Pixel X inside the wave element for a normalized 0–1 ratio (aligned to bar region). */
export function measureWaveRatioPosition(wave: HTMLElement, ratio: number): number {
  const bars = wave.querySelectorAll<HTMLElement>(':scope > span');
  const waveRect = wave.getBoundingClientRect();
  if (waveRect.width <= 0) return 0;

  if (bars.length === 0) {
    return Math.max(0, Math.min(waveRect.width, ratio * waveRect.width));
  }

  const first = bars[0].getBoundingClientRect();
  const last = bars[bars.length - 1].getBoundingClientRect();
  const start = first.left - waveRect.left;
  const width = last.right - first.left;
  if (width <= 0) {
    return Math.max(0, Math.min(waveRect.width, ratio * waveRect.width));
  }

  return start + Math.max(0, Math.min(1, ratio)) * width;
}
