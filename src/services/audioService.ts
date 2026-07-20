import type { PostComment, TeamAudioTrack } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { deleteStorageUrls } from './storageService';
import {
  mapAudioComment,
  mapAudioTrack,
  type DbAudioComment,
  type DbAudioTrack,
  type DbTeam,
} from '../lib/supabaseMappers';

async function buildAudioCommentContext(
  rows: DbAudioComment[],
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
      ? supabase.from(DB_TABLES.audioCommentLikes).select('comment_id, user_id').in('comment_id', commentIds)
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
    ctx.set(row.id, {
      teamName,
      nick:
        (memberKey ? memberNickMap.get(memberKey) : undefined) ??
        profileMap.get(row.author_user_id)?.display_name ??
        'User',
      avatar:
        (memberKey ? memberAvatarMap.get(memberKey) : undefined) ??
        profileMap.get(row.author_user_id)?.avatar_url,
      likes: likeCount.get(row.id) ?? 0,
      likedByMe: likedByMe.has(row.id),
    });
  }

  return ctx;
}

async function hydrateAudioFromRows(trackRows: DbAudioTrack[], userId: string): Promise<TeamAudioTrack[]> {
  if (trackRows.length === 0) return [];
  const supabase = requireSupabase();
  const trackIds = trackRows.map((t) => t.id);

  const [{ data: commentRows }, { data: likeRows }, { data: myLikes }] = await Promise.all([
    supabase.from(DB_TABLES.audioComments).select('*').in('track_id', trackIds).order('created_at'),
    supabase.from(DB_TABLES.teamAudioLikes).select('track_id, user_id').in('track_id', trackIds),
    supabase.from(DB_TABLES.teamAudioLikes).select('track_id').eq('user_id', userId).in('track_id', trackIds),
  ]);

  const commentsByTrack = new Map<string, PostComment[]>();
  const ctx = await buildAudioCommentContext((commentRows ?? []) as DbAudioComment[], userId);
  for (const row of (commentRows ?? []) as DbAudioComment[]) {
    const c = mapAudioComment(row, {
      authorTeamName: ctx.get(row.id)?.teamName,
      authorNick: ctx.get(row.id)?.nick,
      authorAvatar: ctx.get(row.id)?.avatar,
      likes: ctx.get(row.id)?.likes ?? 0,
      likedByMe: ctx.get(row.id)?.likedByMe ?? false,
    });
    const list = commentsByTrack.get(row.track_id) ?? [];
    list.push(c);
    commentsByTrack.set(row.track_id, list);
  }

  const likeCount = new Map<string, number>();
  for (const like of likeRows ?? []) {
    const tid = like.track_id as string;
    likeCount.set(tid, (likeCount.get(tid) ?? 0) + 1);
  }
  const myLikeSet = new Set((myLikes ?? []).map((l) => l.track_id as string));

  return trackRows.map((row) =>
    mapAudioTrack(
      row,
      commentsByTrack.get(row.id) ?? [],
      likeCount.get(row.id) ?? 0,
      myLikeSet.has(row.id),
    ),
  );
}

export async function fetchAudioForTeamIds(
  teamIds: string[],
  userId: string,
): Promise<TeamAudioTrack[]> {
  if (teamIds.length === 0) return [];
  const supabase = requireSupabase();

  const { data: trackRows, error } = await supabase
    .from(DB_TABLES.teamAudioTracks)
    .select('*')
    .in('team_id', teamIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return hydrateAudioFromRows((trackRows ?? []) as DbAudioTrack[], userId);
}

/** Recent audio from teams outside the user's feed circle (home discovery). */
export async function fetchDiscoverAudio(
  userId: string,
  excludeTeamIds: string[],
  limit = 30,
): Promise<TeamAudioTrack[]> {
  const supabase = requireSupabase();
  const exclude = new Set(excludeTeamIds);

  const { data: trackRows, error } = await supabase
    .from(DB_TABLES.teamAudioTracks)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.max(limit * 3, 60));

  if (error) throw error;

  const filtered = ((trackRows ?? []) as DbAudioTrack[])
    .filter((row) => !exclude.has(row.team_id))
    .slice(0, limit);
  return hydrateAudioFromRows(filtered, userId);
}

export async function createAudioTrackInDb(
  userId: string,
  input: Omit<TeamAudioTrack, 'id' | 'createdAt' | 'comments' | 'likes' | 'likedByMe'>,
): Promise<TeamAudioTrack> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.teamAudioTracks)
    .insert({
      team_id: input.teamId,
      author_user_id: userId,
      title: input.title,
      audio_url: input.audioUrl,
      duration_sec: input.durationSec ?? null,
      caption: input.caption ?? null,
      body: input.body ?? null,
      cover_image_url: input.coverImage ?? null,
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('사운드 업로드 실패');
  return mapAudioTrack(data as DbAudioTrack, [], 0, false);
}

export async function deleteAudioTrackInDb(trackId: string): Promise<void> {
  const supabase = requireSupabase();
  const { data: row } = await supabase
    .from(DB_TABLES.teamAudioTracks)
    .select('audio_url, cover_image_url')
    .eq('id', trackId)
    .maybeSingle();

  await deleteStorageUrls(
    row?.audio_url as string | null | undefined,
    row?.cover_image_url as string | null | undefined,
  );

  const { error } = await supabase.from(DB_TABLES.teamAudioTracks).delete().eq('id', trackId);
  if (error) throw error;
}

export async function createAudioCommentInDb(
  userId: string,
  input: {
    trackId: string;
    text: string;
    authorTeamId?: string;
    parentId?: string;
    replyTo?: string;
  },
): Promise<PostComment> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.audioComments)
    .insert({
      track_id: input.trackId,
      author_user_id: userId,
      author_team_id: input.authorTeamId ?? null,
      text: input.text,
      parent_id: input.parentId ?? null,
      reply_to: input.replyTo ?? null,
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('댓글 작성 실패');
  const row = data as DbAudioComment;
  const ctx = await buildAudioCommentContext([row], userId);
  return mapAudioComment(row, {
    authorTeamName: ctx.get(row.id)?.teamName,
    authorNick: ctx.get(row.id)?.nick,
    authorAvatar: ctx.get(row.id)?.avatar,
    likes: 0,
    likedByMe: false,
  });
}

export async function updateAudioCommentInDb(commentId: string, text: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from(DB_TABLES.audioComments).update({ text }).eq('id', commentId);
  if (error) throw error;
}

export async function deleteAudioCommentInDb(commentId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from(DB_TABLES.audioComments).delete().eq('id', commentId);
  if (error) throw error;
}

export async function toggleAudioCommentLikeInDb(
  commentId: string,
  userId: string,
  liked: boolean,
): Promise<void> {
  const supabase = requireSupabase();
  if (liked) {
    const { error } = await supabase
      .from(DB_TABLES.audioCommentLikes)
      .insert({ comment_id: commentId, user_id: userId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from(DB_TABLES.audioCommentLikes)
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}

export async function toggleAudioLikeInDb(trackId: string, userId: string, liked: boolean): Promise<void> {
  const supabase = requireSupabase();
  if (liked) {
    const { error } = await supabase
      .from(DB_TABLES.teamAudioLikes)
      .insert({ track_id: trackId, user_id: userId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from(DB_TABLES.teamAudioLikes)
      .delete()
      .eq('track_id', trackId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}
