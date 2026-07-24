import type { PostComment } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import {
  mapPracticeSessionComment,
  type DbPracticeSessionComment,
  type DbTeam,
} from '../lib/supabaseMappers';

import {
  practiceCommentLikesTableMessage,
  practiceTrackLikeFailedMessage,
} from '../utils/practiceSocialErrors';

function isMissingPracticeTrackSocialTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { code?: string; message?: string };
  if (row.code === '42P01' || row.code === 'PGRST205') return true;
  const message = row.message?.toLowerCase() ?? '';
  return message.includes('practice_track_likes') || message.includes('practice_track_comments');
}

function missingTableMessage(): string {
  return '트랙 반응을 사용하려면 Supabase SQL Editor에서 supabase/migrations/20260724150000_practice_track_social.sql 을 실행해 주세요.';
}

type DbPracticeTrackCommentRow = DbPracticeSessionComment & {
  session_id: string;
  track_key: number;
};

function normalizeTrackKey(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesTrackKeys(trackKeys: number[], trackKey: number | null): trackKey is number {
  return trackKey !== null && trackKeys.includes(trackKey);
}

async function buildTrackCommentContext(
  rows: DbPracticeTrackCommentRow[],
  userId?: string,
): Promise<Map<string, { teamName?: string; nick?: string; likes: number; likedByMe: boolean }>> {
  const supabase = requireSupabase();
  const commentIds = rows.map((row) => row.id);
  const authorIds = [...new Set(rows.map((row) => row.author_user_id))];
  const authorTeamIds = [...new Set(rows.map((row) => row.author_team_id).filter(Boolean))] as string[];

  const [profilesRes, teamsRes, membersRes, likesRes] = await Promise.all([
    authorIds.length
      ? supabase.from(DB_TABLES.profiles).select('id, display_name').in('id', authorIds)
      : Promise.resolve({ data: [] }),
    authorTeamIds.length
      ? supabase.from(DB_TABLES.teams).select('id, name').in('id', authorTeamIds)
      : Promise.resolve({ data: [] }),
    authorIds.length
      ? supabase
          .from(DB_TABLES.teamMembers)
          .select('user_id, team_id, nick')
          .in('user_id', authorIds)
      : Promise.resolve({ data: [] }),
    commentIds.length
      ? supabase.from(DB_TABLES.practiceTrackCommentLikes).select('comment_id, user_id').in('comment_id', commentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map(
    (profilesRes.data ?? []).map((profile) => [
      profile.id as string,
      profile as { display_name: string },
    ]),
  );
  const teamNameMap = new Map((teamsRes.data ?? []).map((team) => [team.id as string, (team as DbTeam).name]));
  const memberNickMap = new Map<string, string>();
  for (const member of membersRes.data ?? []) {
    memberNickMap.set(`${member.user_id}:${member.team_id}`, member.nick as string);
  }

  const likeCount = new Map<string, number>();
  const likedByMe = new Set<string>();
  for (const like of likesRes.data ?? []) {
    const commentId = like.comment_id as string;
    likeCount.set(commentId, (likeCount.get(commentId) ?? 0) + 1);
    if (userId && like.user_id === userId) likedByMe.add(commentId);
  }

  const ctx = new Map<string, { teamName?: string; nick?: string; likes: number; likedByMe: boolean }>();
  for (const row of rows) {
    const teamName = row.author_team_id ? teamNameMap.get(row.author_team_id) : undefined;
    const memberKey = row.author_team_id ? `${row.author_user_id}:${row.author_team_id}` : undefined;
    ctx.set(row.id, {
      teamName,
      nick:
        (memberKey ? memberNickMap.get(memberKey) : undefined) ??
        profileMap.get(row.author_user_id)?.display_name ??
        'User',
      likes: likeCount.get(row.id) ?? 0,
      likedByMe: likedByMe.has(row.id),
    });
  }

  return ctx;
}

export interface PracticeTrackLikeSnapshot {
  likes: number;
  likedByMe: boolean;
}

export async function fetchPracticeTrackSocialInDb(
  sessionId: string,
  trackKeys: number[],
  userId: string,
): Promise<{
  likes: Record<number, PracticeTrackLikeSnapshot>;
  comments: Record<number, PostComment[]>;
}> {
  if (trackKeys.length === 0) {
    return { likes: {}, comments: {} };
  }

  const supabase = requireSupabase();

  const [likesRes, myLikesRes, commentsRes] = await Promise.all([
    supabase
      .from(DB_TABLES.practiceTrackLikes)
      .select('track_key, user_id')
      .eq('session_id', sessionId),
    supabase
      .from(DB_TABLES.practiceTrackLikes)
      .select('track_key')
      .eq('session_id', sessionId)
      .eq('user_id', userId),
    supabase
      .from(DB_TABLES.practiceTrackComments)
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at'),
  ]);

  const likeRows = likesRes.data;
  const myLikeRows = myLikesRes.data;
  const commentRows = commentsRes.data;
  const likesError = likesRes.error;
  const myLikesError = myLikesRes.error;
  const commentsError = commentsRes.error;

  if (likesError) {
    if (isMissingPracticeTrackSocialTable(likesError)) throw new Error(missingTableMessage());
    throw likesError;
  }
  if (myLikesError) {
    if (isMissingPracticeTrackSocialTable(myLikesError)) throw new Error(missingTableMessage());
    throw myLikesError;
  }
  if (commentsError) {
    if (isMissingPracticeTrackSocialTable(commentsError)) throw new Error(missingTableMessage());
    throw commentsError;
  }

  const myLikeSet = new Set<number>();
  for (const row of myLikeRows ?? []) {
    const trackKey = normalizeTrackKey(row.track_key);
    if (matchesTrackKeys(trackKeys, trackKey)) myLikeSet.add(trackKey);
  }

  const likes: Record<number, PracticeTrackLikeSnapshot> = {};
  for (const key of trackKeys) {
    likes[key] = { likes: 0, likedByMe: myLikeSet.has(key) };
  }
  for (const row of likeRows ?? []) {
    const trackKey = normalizeTrackKey(row.track_key);
    if (!matchesTrackKeys(trackKeys, trackKey)) continue;
    const snapshot = likes[trackKey] ?? { likes: 0, likedByMe: myLikeSet.has(trackKey) };
    snapshot.likes += 1;
    snapshot.likedByMe = myLikeSet.has(trackKey);
    likes[trackKey] = snapshot;
  }

  const filteredCommentRows = ((commentRows ?? []) as DbPracticeTrackCommentRow[]).filter((row) => {
    const trackKey = normalizeTrackKey(row.track_key);
    return matchesTrackKeys(trackKeys, trackKey);
  });
  const commentCtx = await buildTrackCommentContext(filteredCommentRows, userId);
  const comments: Record<number, PostComment[]> = {};
  for (const key of trackKeys) {
    comments[key] = [];
  }
  for (const row of filteredCommentRows) {
    const trackKey = normalizeTrackKey(row.track_key);
    if (!matchesTrackKeys(trackKeys, trackKey)) continue;
    const mapped = mapPracticeSessionComment(row, {
      authorTeamName: commentCtx.get(row.id)?.teamName,
      authorNick: commentCtx.get(row.id)?.nick,
      likes: commentCtx.get(row.id)?.likes ?? 0,
      likedByMe: commentCtx.get(row.id)?.likedByMe ?? false,
    });
    comments[trackKey] = [...(comments[trackKey] ?? []), mapped];
  }

  return { likes, comments };
}

export async function togglePracticeTrackLikeInDb(
  sessionId: string,
  trackKey: number,
  userId: string,
  liked: boolean,
): Promise<void> {
  const supabase = requireSupabase();
  if (liked) {
    const { error } = await supabase.from(DB_TABLES.practiceTrackLikes).insert({
      session_id: sessionId,
      track_key: trackKey,
      user_id: userId,
    });
    if (error && error.code !== '23505') {
      if (isMissingPracticeTrackSocialTable(error)) throw new Error(missingTableMessage());
      throw new Error(practiceTrackLikeFailedMessage(error.message));
    }
    return;
  }

  const { error } = await supabase
    .from(DB_TABLES.practiceTrackLikes)
    .delete()
    .eq('session_id', sessionId)
    .eq('track_key', trackKey)
    .eq('user_id', userId);
  if (error) {
    if (isMissingPracticeTrackSocialTable(error)) throw new Error(missingTableMessage());
    throw error;
  }
}

export async function createPracticeTrackCommentInDb(
  userId: string,
  input: {
    sessionId: string;
    trackKey: number;
    text: string;
    authorTeamId?: string;
  },
): Promise<PostComment> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.practiceTrackComments)
    .insert({
      session_id: input.sessionId,
      track_key: input.trackKey,
      author_user_id: userId,
      author_team_id: input.authorTeamId ?? null,
      text: input.text,
    })
    .select('*')
    .single();

  if (error || !data) {
    if (isMissingPracticeTrackSocialTable(error)) throw new Error(missingTableMessage());
    throw error ?? new Error('댓글 작성 실패');
  }

  const row = data as DbPracticeTrackCommentRow;
  const ctx = await buildTrackCommentContext([row], userId);
  return mapPracticeSessionComment(row, {
    authorTeamName: ctx.get(row.id)?.teamName,
    authorNick: ctx.get(row.id)?.nick,
    likes: 0,
    likedByMe: false,
  });
}

export async function togglePracticeTrackCommentLikeInDb(
  commentId: string,
  userId: string,
  liked: boolean,
): Promise<void> {
  const supabase = requireSupabase();
  if (liked) {
    const { error } = await supabase
      .from(DB_TABLES.practiceTrackCommentLikes)
      .insert({ comment_id: commentId, user_id: userId });
    if (error && error.code !== '23505') {
      if (isMissingPracticeTrackSocialTable(error)) return;
      throw new Error(practiceCommentLikesTableMessage());
    }
    return;
  }

  const { error } = await supabase
    .from(DB_TABLES.practiceTrackCommentLikes)
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', userId);
  if (error && !isMissingPracticeTrackSocialTable(error)) throw error;
}

export async function deletePracticeTrackCommentInDb(commentId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from(DB_TABLES.practiceTrackComments).delete().eq('id', commentId);
  if (error) {
    if (isMissingPracticeTrackSocialTable(error)) throw new Error(missingTableMessage());
    throw error;
  }
}
