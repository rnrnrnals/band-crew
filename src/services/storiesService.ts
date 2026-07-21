import type { Story } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { mapStory } from '../lib/supabaseMappers';
import { STORY_TTL_MS } from '../utils/storyUtils';
import { deleteStorageUrls } from './storageService';

type DbStoryRow = {
  id: string;
  team_id: string;
  image_url: string;
  caption: string;
  created_at: string;
};

export async function fetchStoriesForTeamIds(teamIds: string[]): Promise<Story[]> {
  if (teamIds.length === 0) return [];
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(DB_TABLES.stories)
    .select('*')
    .in('team_id', teamIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => mapStory(row as DbStoryRow));
}

export async function createStoryInDb(input: Omit<Story, 'id' | 'createdAt'>): Promise<Story> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.stories)
    .insert({
      team_id: input.teamId,
      image_url: input.image,
      caption: input.caption ?? '',
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('스토리 업로드 실패');
  return mapStory(data as DbStoryRow);
}

/** Remove expired stories and their storage files. Safe to run on each bootstrap. */
export async function purgeExpiredStoriesInDb(maxAgeMs = STORY_TTL_MS): Promise<number> {
  const supabase = requireSupabase();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

  const { data: rows, error: readError } = await supabase
    .from(DB_TABLES.stories)
    .select('id, image_url')
    .lt('created_at', cutoff);
  if (readError) throw readError;

  const expired = (rows ?? []) as Pick<DbStoryRow, 'id' | 'image_url'>[];
  if (expired.length === 0) return 0;

  await deleteStorageUrls(...expired.map((row) => row.image_url));

  const { error: deleteError } = await supabase
    .from(DB_TABLES.stories)
    .delete()
    .in(
      'id',
      expired.map((row) => row.id),
    );
  if (deleteError) throw deleteError;

  return expired.length;
}

export async function deleteStoryInDb(storyId: string): Promise<void> {
  const supabase = requireSupabase();
  const { data: row, error: readError } = await supabase
    .from(DB_TABLES.stories)
    .select('image_url')
    .eq('id', storyId)
    .maybeSingle();
  if (readError) throw readError;

  await deleteStorageUrls(row?.image_url as string | null | undefined);

  const { error } = await supabase.from(DB_TABLES.stories).delete().eq('id', storyId);
  if (error) throw error;
}
