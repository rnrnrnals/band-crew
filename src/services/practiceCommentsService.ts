import type { PostComment } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { mapPracticeSessionComment, type DbPracticeSessionComment, type DbTeam } from '../lib/supabaseMappers';
import { practiceCommentLikesTableMessage } from '../utils/practiceSocialErrors';

function isMissingPracticeSessionCommentsTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { code?: string; message?: string };
  if (row.code === '42P01' || row.code === 'PGRST205') return true;
  const message = row.message?.toLowerCase() ?? '';
  return message.includes('practice_session_comments');
}

function isMissingCommentLikeTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { code?: string; message?: string };
  if (row.code === '42P01' || row.code === 'PGRST205') return true;
  const message = row.message?.toLowerCase() ?? '';
  return message.includes('practice_session_comment_likes');
}

async function buildPracticeSessionCommentContext(
  rows: DbPracticeSessionComment[],
  userId?: string,
): Promise<
  Map<string, { teamName?: string; nick?: string; likes: number; likedByMe: boolean }>
> {
  const supabase = requireSupabase();
  const commentIds = rows.map((row) => row.id);
  const authorIds = [...new Set(rows.map((row) => row.author_user_id))];
  const authorTeamIds = [...new Set(rows.map((row) => row.author_team_id).filter(Boolean))] as string[];

  const [profilesRes, teamsRes, membersRes, likesRes, myLikesRes] = await Promise.all([
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
      ? supabase.from(DB_TABLES.practiceSessionCommentLikes).select('comment_id, user_id').in('comment_id', commentIds)
      : Promise.resolve({ data: [] }),
    userId && commentIds.length
      ? supabase
          .from(DB_TABLES.practiceSessionCommentLikes)
          .select('comment_id')
          .eq('user_id', userId)
          .in('comment_id', commentIds)
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
  const likedByMe = new Set<string>((myLikesRes.data ?? []).map((like) => like.comment_id as string));
  for (const like of likesRes.data ?? []) {
    const commentId = like.comment_id as string;
    likeCount.set(commentId, (likeCount.get(commentId) ?? 0) + 1);
    if (userId && like.user_id === userId) likedByMe.add(commentId);
  }

  const ctx = new Map<
    string,
    { teamName?: string; nick?: string; likes: number; likedByMe: boolean }
  >();
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

export async function fetchPracticeSessionCommentsInDb(
  sessionId: string,
  userId?: string,
): Promise<PostComment[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.practiceSessionComments)
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at');

  if (error) {
    if (isMissingPracticeSessionCommentsTable(error)) {
      throw new Error(
        '댓글을 불러오려면 Supabase SQL Editor에서 supabase/migrations/20260724140000_practice_session_comments.sql 을 실행해 주세요.',
      );
    }
    throw error;
  }

  const rows = (data ?? []) as DbPracticeSessionComment[];
  const ctx = await buildPracticeSessionCommentContext(rows, userId);
  return rows.map((row) =>
    mapPracticeSessionComment(row, {
      authorTeamName: ctx.get(row.id)?.teamName,
      authorNick: ctx.get(row.id)?.nick,
      likes: ctx.get(row.id)?.likes ?? 0,
      likedByMe: ctx.get(row.id)?.likedByMe ?? false,
    }),
  );
}

export async function createPracticeSessionCommentInDb(
  userId: string,
  input: {
    sessionId: string;
    text: string;
    authorTeamId?: string;
    parentId?: string;
    replyTo?: string;
  },
): Promise<PostComment> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.practiceSessionComments)
    .insert({
      session_id: input.sessionId,
      author_user_id: userId,
      author_team_id: input.authorTeamId ?? null,
      text: input.text,
      parent_id: input.parentId ?? null,
      reply_to: input.replyTo ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    if (isMissingPracticeSessionCommentsTable(error)) {
      throw new Error(
        '댓글을 남기려면 Supabase SQL Editor에서 supabase/migrations/20260724140000_practice_session_comments.sql 을 실행해 주세요.',
      );
    }
    throw error ?? new Error('댓글 작성 실패');
  }

  const row = data as DbPracticeSessionComment;
  const ctx = await buildPracticeSessionCommentContext([row], userId);
  return mapPracticeSessionComment(row, {
    authorTeamName: ctx.get(row.id)?.teamName,
    authorNick: ctx.get(row.id)?.nick,
    likes: 0,
    likedByMe: false,
  });
}

export async function deletePracticeSessionCommentInDb(commentId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from(DB_TABLES.practiceSessionComments).delete().eq('id', commentId);
  if (error) {
    if (isMissingPracticeSessionCommentsTable(error)) {
      throw new Error(
        '댓글을 삭제하려면 Supabase SQL Editor에서 supabase/migrations/20260724140000_practice_session_comments.sql 을 실행해 주세요.',
      );
    }
    throw error;
  }
}

export async function togglePracticeSessionCommentLikeInDb(
  commentId: string,
  userId: string,
  liked: boolean,
): Promise<void> {
  const supabase = requireSupabase();
  if (liked) {
    const { error } = await supabase
      .from(DB_TABLES.practiceSessionCommentLikes)
      .insert({ comment_id: commentId, user_id: userId });
    if (error && error.code !== '23505') {
      if (isMissingCommentLikeTable(error)) {
        throw new Error(practiceCommentLikesTableMessage());
      }
      throw error;
    }
    return;
  }

  const { error } = await supabase
    .from(DB_TABLES.practiceSessionCommentLikes)
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', userId);
  if (error && !isMissingCommentLikeTable(error)) throw error;
}
