import type { PracticeSessionMeta } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { mapPractice } from '../lib/supabaseMappers';
import { deleteStorageFolder, deleteStorageUrls } from './storageService';
import { practiceSessionLikesTableMessage } from '../utils/practiceSocialErrors';

type DbPracticeSessionRow = {
  id: string;
  team_id: string;
  title: string;
  bpm: number;
  updated_at: string;
  author_user_id?: string | null;
  is_team_song?: boolean | null;
  is_public?: boolean | null;
};

function isMissingPracticePublicColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { code?: string; message?: string };
  if (row.code === '42703' || row.code === 'PGRST204') return true;
  const message = row.message?.toLowerCase() ?? '';
  return message.includes('is_public');
}

function filterPracticeRoomSessions(
  rows: DbPracticeSessionRow[] | null | undefined,
): PracticeSessionMeta[] {
  return (rows ?? [])
    .filter((row) => row.is_team_song !== true)
    .map((row) => mapPractice(row));
}

export async function fetchPracticeSessionsForTeamIds(
  teamIds: string[],
  userId?: string,
): Promise<PracticeSessionMeta[]> {
  if (teamIds.length === 0) return [];
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(DB_TABLES.practiceSessions)
    .select('*')
    .in('team_id', teamIds)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return attachPracticeSessionLikes(filterPracticeRoomSessions(data as DbPracticeSessionRow[]), userId);
}

/** Practice room layered session (not team feed song). */
export async function createPracticeSessionInDb(
  teamId: string,
  title: string,
  bpm: number,
  id?: string,
  authorUserId?: string,
): Promise<PracticeSessionMeta> {
  const supabase = requireSupabase();
  const baseRow: Record<string, unknown> = {
    ...(id ? { id } : {}),
    team_id: teamId,
    title,
    bpm,
    is_team_song: false,
  };
  if (authorUserId) baseRow.author_user_id = authorUserId;

  try {
    const { data, error } = await supabase
      .from(DB_TABLES.practiceSessions)
      .insert(baseRow)
      .select('*')
      .single();
    if (error || !data) throw error ?? new Error('연습 세션 생성 실패');
    return mapPractice(data as DbPracticeSessionRow);
  } catch (firstError) {
    delete baseRow.is_team_song;
    const { data, error } = await supabase
      .from(DB_TABLES.practiceSessions)
      .insert(baseRow)
      .select('*')
      .single();
    if (error || !data) throw firstError;
    return mapPractice(data as DbPracticeSessionRow);
  }
}

/** Idempotent — safe before saving tracks (handles new-session race). */
export async function ensurePracticeSessionInDb(session: PracticeSessionMeta): Promise<void> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.practiceSessions)
    .select('id')
    .eq('id', session.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return;

  const row: Record<string, unknown> = {
    id: session.id,
    team_id: session.teamId,
    title: session.title,
    bpm: session.bpm,
    is_team_song: false,
  };
  if (session.authorUserId) row.author_user_id = session.authorUserId;

  const { error: insertError } = await supabase.from(DB_TABLES.practiceSessions).insert(row);

  if (insertError) {
    if (insertError.code === '23505') return;
    if (insertError.code === '42703' || insertError.code === 'PGRST204') {
      delete row.is_team_song;
      const { error: retryError } = await supabase.from(DB_TABLES.practiceSessions).insert(row);
      if (retryError && retryError.code !== '23505') throw retryError;
      return;
    }
    throw insertError;
  }
}

export async function deletePracticeSessionInDb(
  sessionId: string,
  teamId?: string,
): Promise<void> {
  const supabase = requireSupabase();

  let resolvedTeamId = teamId;
  if (!resolvedTeamId) {
    const { data: sessionRow, error: sessionError } = await supabase
      .from(DB_TABLES.practiceSessions)
      .select('team_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    resolvedTeamId = sessionRow?.team_id as string | undefined;
  }

  const { data: tracks, error: tracksError } = await supabase
    .from(DB_TABLES.practiceTracks)
    .select('media_url')
    .eq('session_id', sessionId);
  if (tracksError) throw tracksError;

  await deleteStorageUrls(...(tracks ?? []).map((t) => t.media_url as string));

  if (resolvedTeamId) {
    await deleteStorageFolder(`practice/${resolvedTeamId}/${sessionId}`);
  }

  const { error } = await supabase
    .from(DB_TABLES.practiceSessions)
    .delete()
    .eq('id', sessionId);
  if (error) throw error;
}

export async function updatePracticeSessionInDb(
  sessionId: string,
  patch: { title?: string; bpm?: number; isPublic?: boolean },
  fallbackSession?: PracticeSessionMeta,
): Promise<PracticeSessionMeta> {
  if (fallbackSession) {
    await ensurePracticeSessionInDb(fallbackSession);
  }

  const supabase = requireSupabase();
  const updates: Record<string, string | number | boolean> = {};
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.bpm !== undefined) updates.bpm = patch.bpm;
  if (patch.isPublic !== undefined) updates.is_public = patch.isPublic;

  if (Object.keys(updates).length === 0) {
    throw new Error('변경할 내용이 없어요.');
  }

  const runUpdate = async (payload: Record<string, string | number | boolean>) => {
    const { data, error } = await supabase
      .from(DB_TABLES.practiceSessions)
      .update(payload)
      .eq('id', sessionId)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('연습 세션을 찾을 수 없어요.');
    return mapPractice(data as DbPracticeSessionRow);
  };

  try {
    return await runUpdate(updates);
  } catch (err) {
    if (patch.isPublic !== undefined && isMissingPracticePublicColumn(err)) {
      throw new Error(
        '공개 설정을 저장하려면 Supabase SQL Editor에서 supabase/migrations/20260724130000_practice_session_is_public.sql 을 실행해 주세요.',
      );
    }
    throw err;
  }
}

export async function fetchPublicPracticeSessionsForTeam(
  teamId: string,
  userId?: string,
): Promise<PracticeSessionMeta[]> {
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(DB_TABLES.practiceSessions)
    .select('*')
    .eq('team_id', teamId)
    .eq('is_public', true)
    .order('updated_at', { ascending: false });

  if (!error) {
    return attachPracticeSessionLikes(filterPracticeRoomSessions(data as DbPracticeSessionRow[]), userId);
  }

  if (isMissingPracticePublicColumn(error)) {
    throw new Error(
      '공개 세션을 불러오려면 Supabase SQL Editor에서 supabase/migrations/20260724130000_practice_session_is_public.sql 을 실행해 주세요.',
    );
  }

  throw error;
}

function isMissingPracticeSessionLikesTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { code?: string; message?: string };
  if (row.code === '42P01' || row.code === 'PGRST205') return true;
  const message = row.message?.toLowerCase() ?? '';
  return message.includes('practice_session_likes');
}

export async function attachPracticeSessionLikes(
  sessions: PracticeSessionMeta[],
  userId?: string,
): Promise<PracticeSessionMeta[]> {
  if (sessions.length === 0) return sessions;

  const counts = await fetchPracticeSessionLikeCounts(
    sessions.map((session) => session.id),
    userId,
  );

  return sessions.map((session) => {
    const snapshot = counts[session.id];
    if (!snapshot) return session;
    return {
      ...session,
      likes: snapshot.likes,
      likedByMe: snapshot.likedByMe,
    };
  });
}

export async function fetchPracticeSessionLikeCounts(
  sessionIds: string[],
  userId?: string,
): Promise<Record<string, { likes: number; likedByMe: boolean }>> {
  if (sessionIds.length === 0) return {};

  const supabase = requireSupabase();

  const likesQuery = supabase
    .from(DB_TABLES.practiceSessionLikes)
    .select('session_id, user_id')
    .in('session_id', sessionIds);

  const myLikesQuery = userId
    ? supabase
        .from(DB_TABLES.practiceSessionLikes)
        .select('session_id')
        .eq('user_id', userId)
        .in('session_id', sessionIds)
    : null;

  const [likesRes, myLikesRes] = await Promise.all([
    likesQuery,
    myLikesQuery ?? Promise.resolve({ data: [], error: null }),
  ]);

  if (likesRes.error) {
    if (isMissingPracticeSessionLikesTable(likesRes.error)) {
      console.warn('[BandCrew] practice_session_likes table missing — likes will not persist on refresh');
      return {};
    }
    throw likesRes.error;
  }
  if (myLikesRes.error && !isMissingPracticeSessionLikesTable(myLikesRes.error)) {
    throw myLikesRes.error;
  }

  const myLikeSet = new Set((myLikesRes.data ?? []).map((row) => row.session_id as string));

  const result: Record<string, { likes: number; likedByMe: boolean }> = {};
  for (const row of likesRes.data ?? []) {
    const sessionId = row.session_id as string;
    const current = result[sessionId] ?? { likes: 0, likedByMe: false };
    result[sessionId] = {
      likes: current.likes + 1,
      likedByMe: current.likedByMe || myLikeSet.has(sessionId),
    };
  }

  for (const sessionId of myLikeSet) {
    if (!result[sessionId]) {
      result[sessionId] = { likes: 1, likedByMe: true };
    } else {
      result[sessionId].likedByMe = true;
    }
  }

  return result;
}

export async function togglePracticeSessionLikeInDb(
  sessionId: string,
  userId: string,
  liked: boolean,
): Promise<void> {
  const supabase = requireSupabase();
  if (liked) {
    const { error } = await supabase.from(DB_TABLES.practiceSessionLikes).insert({
      session_id: sessionId,
      user_id: userId,
    });
    if (error && error.code !== '23505') {
      if (isMissingPracticeSessionLikesTable(error)) {
        throw new Error(practiceSessionLikesTableMessage());
      }
      throw error;
    }
    return;
  }

  const { error } = await supabase
    .from(DB_TABLES.practiceSessionLikes)
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId);
  if (error && !isMissingPracticeSessionLikesTable(error)) throw error;
}
