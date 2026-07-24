import type { Story } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { mapStory } from '../lib/supabaseMappers';
import { STORY_ARCHIVE_MS } from '../utils/storyUtils';
import {
  deleteOrphanHighlightImageUrls,
  fetchHighlightedStoryIds,
} from './highlightsService';

type DbStoryRow = {
  id: string;
  team_id: string;
  image_url: string;
  media_type?: string | null;
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
      media_type: input.mediaType ?? 'image',
      caption: input.caption ?? '',
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('스토리 업로드 실패');
  return mapStory(data as DbStoryRow);
}

/**
 * Remove old stories no longer on the 24h rail. Stories referenced by highlights are
 * kept indefinitely; others are removed after STORY_ARCHIVE_MS (default 7 days).
 */
export async function purgeExpiredStoriesInDb(maxAgeMs = STORY_ARCHIVE_MS): Promise<number> {
  const supabase = requireSupabase();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

  const { data: rows, error: readError } = await supabase
    .from(DB_TABLES.stories)
    .select('id, image_url')
    .lt('created_at', cutoff);
  if (readError) throw readError;

  const expired = (rows ?? []) as Pick<DbStoryRow, 'id' | 'image_url'>[];
  if (expired.length === 0) return 0;

  const highlightedStoryIds = await fetchHighlightedStoryIds(supabase);
  const deletable = expired.filter((row) => !highlightedStoryIds.has(row.id));
  if (deletable.length === 0) return 0;

  await deleteOrphanHighlightImageUrls(
    supabase,
    deletable.map((row) => row.image_url),
  );

  const { error: deleteError } = await supabase
    .from(DB_TABLES.stories)
    .delete()
    .in(
      'id',
      deletable.map((row) => row.id),
    );
  if (deleteError) throw deleteError;

  return deletable.length;
}

export async function deleteStoryInDb(storyId: string): Promise<void> {
  const supabase = requireSupabase();
  const { data: row, error: readError } = await supabase
    .from(DB_TABLES.stories)
    .select('image_url')
    .eq('id', storyId)
    .maybeSingle();
  if (readError) throw readError;

  if (row?.image_url) {
    await deleteOrphanHighlightImageUrls(supabase, [row.image_url as string]);
  }

  const { error } = await supabase.from(DB_TABLES.stories).delete().eq('id', storyId);
  if (error) throw error;
}
