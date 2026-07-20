import type { PracticeSessionMeta } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { mapPractice } from '../lib/supabaseMappers';
import { deleteStorageFolder, deleteStorageUrls } from './storageService';

type DbPracticeSessionRow = {
  id: string;
  team_id: string;
  title: string;
  bpm: number;
  updated_at: string;
  author_user_id?: string | null;
  is_team_song?: boolean | null;
};

export async function fetchPracticeSessionsForTeamIds(
  teamIds: string[],
): Promise<PracticeSessionMeta[]> {
  if (teamIds.length === 0) return [];
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(DB_TABLES.practiceSessions)
    .select('*')
    .in('team_id', teamIds)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? [])
    .map((row) => mapPractice(row as DbPracticeSessionRow))
    .filter((session) => {
      const row = data?.find((item) => item.id === session.id) as DbPracticeSessionRow | undefined;
      return row?.is_team_song !== true;
    });
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
  patch: { title?: string; bpm?: number },
): Promise<PracticeSessionMeta> {
  const supabase = requireSupabase();
  const updates: Record<string, string | number> = {};
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.bpm !== undefined) updates.bpm = patch.bpm;

  const { data, error } = await supabase
    .from(DB_TABLES.practiceSessions)
    .update(updates)
    .eq('id', sessionId)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('연습 세션 수정 실패');
  return mapPractice(data as DbPracticeSessionRow);
}
