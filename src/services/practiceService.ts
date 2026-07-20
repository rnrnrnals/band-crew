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
  return (data ?? []).map((row) => mapPractice(row as DbPracticeSessionRow));
}

export async function createPracticeSessionInDb(
  teamId: string,
  title: string,
  bpm: number,
  id?: string,
  authorUserId?: string,
): Promise<PracticeSessionMeta> {
  const supabase = requireSupabase();
  const row: Record<string, unknown> = {
    ...(id ? { id } : {}),
    team_id: teamId,
    title,
    bpm,
  };
  if (authorUserId) row.author_user_id = authorUserId;

  const { data, error } = await supabase
    .from(DB_TABLES.practiceSessions)
    .insert(row)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('연습 세션 생성 실패');
  const mapped = mapPractice(data as DbPracticeSessionRow);
  return {
    ...mapped,
    authorUserId: mapped.authorUserId ?? authorUserId,
  };
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
  };
  if (session.authorUserId) row.author_user_id = session.authorUserId;

  const { error: insertError } = await supabase.from(DB_TABLES.practiceSessions).insert(row);

  if (insertError) {
    if (insertError.code === '23505') return;
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
