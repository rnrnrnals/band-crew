import type { TeamPracticeSong } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { mapTeamPracticeSong } from '../lib/supabaseMappers';

type DbTeamPracticeSongRow = {
  id: string;
  team_id: string;
  title: string;
  is_current: boolean;
  author_user_id?: string | null;
  updated_at: string;
};

function isMissingTeamPracticeSongsTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { code?: string; message?: string };
  if (row.code === '42P01' || row.code === 'PGRST205' || row.code === 'PGRST204') return true;
  const message = row.message?.toLowerCase() ?? '';
  return message.includes('team_practice_songs') && message.includes('does not exist');
}

export { isMissingTeamPracticeSongsTable };

async function clearCurrentTeamPracticeSong(teamId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from(DB_TABLES.teamPracticeSongs)
    .update({ is_current: false })
    .eq('team_id', teamId)
    .eq('is_current', true);
  if (error) {
    if (isMissingTeamPracticeSongsTable(error)) return;
    throw error;
  }
}

export async function fetchTeamPracticeSongsForTeamIds(
  teamIds: string[],
): Promise<TeamPracticeSong[]> {
  if (teamIds.length === 0) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.teamPracticeSongs)
    .select('*')
    .in('team_id', teamIds)
    .order('updated_at', { ascending: false });
  if (error) {
    if (isMissingTeamPracticeSongsTable(error)) {
      console.warn('[BandCrew] team_practice_songs table not ready — skipping feed songs');
      return [];
    }
    throw error;
  }
  return (data ?? []).map((row) => mapTeamPracticeSong(row as DbTeamPracticeSongRow));
}

export async function createTeamPracticeSongInDb(
  teamId: string,
  title: string,
  id?: string,
  authorUserId?: string,
): Promise<TeamPracticeSong> {
  const supabase = requireSupabase();
  await clearCurrentTeamPracticeSong(teamId);
  const row: Record<string, unknown> = {
    ...(id ? { id } : {}),
    team_id: teamId,
    title: title.trim(),
    is_current: true,
  };
  if (authorUserId) row.author_user_id = authorUserId;

  const { data, error } = await supabase
    .from(DB_TABLES.teamPracticeSongs)
    .insert(row)
    .select('*')
    .single();
  if (error || !data) {
    if (isMissingTeamPracticeSongsTable(error)) {
      throw Object.assign(new Error('team_practice_songs table missing'), { code: 'PGRST205' });
    }
    throw error ?? new Error('연습곡 추가 실패');
  }
  return mapTeamPracticeSong(data as DbTeamPracticeSongRow);
}

export async function promoteTeamPracticeSongInDb(
  songId: string,
  teamId: string,
): Promise<TeamPracticeSong> {
  const supabase = requireSupabase();
  await clearCurrentTeamPracticeSong(teamId);
  const touchedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from(DB_TABLES.teamPracticeSongs)
    .update({ is_current: true, updated_at: touchedAt })
    .eq('id', songId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('현재 연습곡 변경 실패');
  return mapTeamPracticeSong(data as DbTeamPracticeSongRow);
}

export async function deleteTeamPracticeSongInDb(songId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from(DB_TABLES.teamPracticeSongs).delete().eq('id', songId);
  if (error) throw error;
}
