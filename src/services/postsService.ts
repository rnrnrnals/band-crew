import type { Post, PostComment } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { deleteStorageUrls } from './storageService';
import { posterUrlForVideo } from '../utils/videoMediaUtils';
import {
  mapPost,
  mapPostComment,
  type DbPost,
  type DbPostComment,
  type DbTeam,
} from '../lib/supabaseMappers';

async function buildCommentContext(
  rows: DbPostComment[],
  userId: string,
): Promise<Map<string, { teamName?: string; nick?: string; avatar?: string; likes: number; likedByMe: boolean }>> {
  const supabase = requireSupabase();
  const commentIds = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.author_user_id))];
  const authorTeamIds = [...new Set(rows.map((r) => r.author_team_id).filter(Boolean))] as string[];

  const [profilesRes, teamsRes, membersRes, likesRes] = await Promise.all([
    authorIds.length
      ? supabase.from(DB_TABLES.profiles).select('id, display_name, avatar_url').in('id', authorIds)
      : Promise.resolve({ data: [] }),
    authorTeamIds.length
      ? supabase.from(DB_TABLES.teams).select('id, name').in('id', authorTeamIds)
      : Promise.resolve({ data: [] }),
    authorIds.length
      ? supabase
          .from(DB_TABLES.teamMembers)
          .select('user_id, team_id, nick, avatar_url')
          .in('user_id', authorIds)
      : Promise.resolve({ data: [] }),
    commentIds.length
      ? supabase.from(DB_TABLES.postCommentLikes).select('comment_id, user_id').in('comment_id', commentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map(
    (profilesRes.data ?? []).map((p) => [p.id as string, p as { display_name: string; avatar_url: string }]),
  );
  const teamNameMap = new Map((teamsRes.data ?? []).map((t) => [t.id as string, (t as DbTeam).name]));
  const memberNickMap = new Map<string, string>();
  const memberAvatarMap = new Map<string, string>();
  for (const m of membersRes.data ?? []) {
    const key = `${m.user_id}:${m.team_id}`;
    memberNickMap.set(key, m.nick as string);
    if (m.avatar_url) memberAvatarMap.set(key, m.avatar_url as string);
  }

  const likeCount = new Map<string, number>();
  const likedByMe = new Set<string>();
  for (const like of likesRes.data ?? []) {
    const cid = like.comment_id as string;
    likeCount.set(cid, (likeCount.get(cid) ?? 0) + 1);
    if (like.user_id === userId) likedByMe.add(cid);
  }

  const ctx = new Map<
    string,
    { teamName?: string; nick?: string; avatar?: string; likes: number; likedByMe: boolean }
  >();

  for (const row of rows) {
    const teamName = row.author_team_id ? teamNameMap.get(row.author_team_id) : undefined;
    const memberKey = row.author_team_id
      ? `${row.author_user_id}:${row.author_team_id}`
      : undefined;
    const nick =
      (memberKey ? memberNickMap.get(memberKey) : undefined) ??
      profileMap.get(row.author_user_id)?.display_name ??
      'User';
    const avatar =
      (memberKey ? memberAvatarMap.get(memberKey) : undefined) ??
      profileMap.get(row.author_user_id)?.avatar_url;
    ctx.set(row.id, {
      teamName,
      nick,
      avatar,
      likes: likeCount.get(row.id) ?? 0,
      likedByMe: likedByMe.has(row.id),
    });
  }

  return ctx;
}

async function hydratePostsFromRows(postRows: DbPost[], userId: string): Promise<Post[]> {
  if (postRows.length === 0) return [];
  const supabase = requireSupabase();
  const postIds = postRows.map((p) => p.id);

  const [{ data: commentRows }, { data: likeRows }, { data: myLikes }] = await Promise.all([
    supabase.from(DB_TABLES.postComments).select('*').in('post_id', postIds).order('created_at'),
    supabase.from(DB_TABLES.postLikes).select('post_id, user_id').in('post_id', postIds),
    supabase.from(DB_TABLES.postLikes).select('post_id').eq('user_id', userId).in('post_id', postIds),
  ]);

  const commentsByPost = new Map<string, PostComment[]>();
  const commentCtx = await buildCommentContext((commentRows ?? []) as DbPostComment[], userId);
  for (const row of (commentRows ?? []) as DbPostComment[]) {
    const c = mapPostComment(row, {
      authorTeamName: commentCtx.get(row.id)?.teamName,
      authorNick: commentCtx.get(row.id)?.nick,
      authorAvatar: commentCtx.get(row.id)?.avatar,
      likes: commentCtx.get(row.id)?.likes ?? 0,
      likedByMe: commentCtx.get(row.id)?.likedByMe ?? false,
    });
    const list = commentsByPost.get(row.post_id) ?? [];
    list.push(c);
    commentsByPost.set(row.post_id, list);
  }

  const likeCount = new Map<string, number>();
  for (const like of likeRows ?? []) {
    const pid = like.post_id as string;
    likeCount.set(pid, (likeCount.get(pid) ?? 0) + 1);
  }
  const myLikeSet = new Set((myLikes ?? []).map((l) => l.post_id as string));

  return postRows.map((row) =>
    mapPost(
      row,
      commentsByPost.get(row.id) ?? [],
      likeCount.get(row.id) ?? 0,
      myLikeSet.has(row.id),
    ),
  );
}

export async function fetchPostsForTeamIds(teamIds: string[], userId: string): Promise<Post[]> {
  if (teamIds.length === 0) return [];
  const supabase = requireSupabase();

  const { data: postRows, error } = await supabase
    .from(DB_TABLES.posts)
    .select('*')
    .in('team_id', teamIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return hydratePostsFromRows((postRows ?? []) as DbPost[], userId);
}

/** Recent posts from teams outside the user's feed circle (home discovery). */
export async function fetchDiscoverPosts(
  userId: string,
  excludeTeamIds: string[],
  limit = 40,
): Promise<Post[]> {
  const supabase = requireSupabase();
  const exclude = new Set(excludeTeamIds);

  const { data: postRows, error } = await supabase
    .from(DB_TABLES.posts)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.max(limit * 3, 80));

  if (error) throw error;

  const filtered = ((postRows ?? []) as DbPost[]).filter((row) => !exclude.has(row.team_id)).slice(0, limit);
  return hydratePostsFromRows(filtered, userId);
}

export async function createPostInDb(
  userId: string,
  input: { teamId: string; mediaType: Post['mediaType']; mediaUrl?: string; caption: string },
): Promise<Post> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.posts)
    .insert({
      team_id: input.teamId,
      author_user_id: userId,
      media_type: input.mediaType,
      media_url: input.mediaUrl ?? null,
      caption: input.caption,
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('게시 실패');
  return mapPost(data as DbPost, [], 0, false);
}

export async function deletePostInDb(postId: string): Promise<void> {
  const supabase = requireSupabase();
  const { data: row } = await supabase
    .from(DB_TABLES.posts)
    .select('media_url')
    .eq('id', postId)
    .maybeSingle();

  await deleteStorageUrls(
    row?.media_url as string | null | undefined,
    posterUrlForVideo(row?.media_url as string | undefined),
  );

  const { error } = await supabase.from(DB_TABLES.posts).delete().eq('id', postId);
  if (error) throw error;
}

export async function togglePostLikeInDb(postId: string, userId: string, liked: boolean): Promise<void> {
  const supabase = requireSupabase();
  if (liked) {
    const { error } = await supabase.from(DB_TABLES.postLikes).insert({ post_id: postId, user_id: userId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from(DB_TABLES.postLikes)
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}

export async function createPostCommentInDb(
  userId: string,
  input: {
    postId: string;
    text: string;
    authorTeamId?: string;
    parentId?: string;
    replyTo?: string;
  },
): Promise<PostComment> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.postComments)
    .insert({
      post_id: input.postId,
      author_user_id: userId,
      author_team_id: input.authorTeamId ?? null,
      text: input.text,
      parent_id: input.parentId ?? null,
      reply_to: input.replyTo ?? null,
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('댓글 작성 실패');
  const row = data as DbPostComment;
  const ctx = await buildCommentContext([row], userId);
  return mapPostComment(row, {
    authorTeamName: ctx.get(row.id)?.teamName,
    authorNick: ctx.get(row.id)?.nick,
    authorAvatar: ctx.get(row.id)?.avatar,
    likes: 0,
    likedByMe: false,
  });
}

export async function updatePostCommentInDb(commentId: string, text: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from(DB_TABLES.postComments).update({ text }).eq('id', commentId);
  if (error) throw error;
}

export async function deletePostCommentInDb(commentId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from(DB_TABLES.postComments).delete().eq('id', commentId);
  if (error) throw error;
}

export async function togglePostCommentLikeInDb(
  commentId: string,
  userId: string,
  liked: boolean,
): Promise<void> {
  const supabase = requireSupabase();
  if (liked) {
    const { error } = await supabase
      .from(DB_TABLES.postCommentLikes)
      .insert({ comment_id: commentId, user_id: userId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from(DB_TABLES.postCommentLikes)
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}
