import type { Story } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { mapStory } from '../lib/supabaseMappers';

export async function fetchStoriesForTeamIds(teamIds: string[]): Promise<Story[]> {
  if (teamIds.length === 0) return [];
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(DB_TABLES.stories)
    .select('*')
    .in('team_id', teamIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) =>
    mapStory(row as { id: string; team_id: string; image_url: string; caption: string; created_at: string }),
  );
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
  return mapStory(data as { id: string; team_id: string; image_url: string; caption: string; created_at: string });
}
