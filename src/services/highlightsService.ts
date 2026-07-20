import type { HighlightItem, Story, TeamHighlight } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { mapHighlight, mapHighlightItem } from '../lib/supabaseMappers';

type DbHighlight = {
  id: string;
  team_id: string;
  title: string;
  cover_image_url: string;
  created_at: string;
};

type DbHighlightItem = {
  id: string;
  highlight_id: string;
  image_url: string;
  caption: string;
  source_story_id: string | null;
  sort_order: number;
};

export async function fetchHighlightsForTeamIds(teamIds: string[]): Promise<TeamHighlight[]> {
  if (teamIds.length === 0) return [];
  const supabase = requireSupabase();

  const { data: highlightRows, error } = await supabase
    .from(DB_TABLES.highlights)
    .select('*')
    .in('team_id', teamIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const highlights = (highlightRows ?? []) as DbHighlight[];
  if (highlights.length === 0) return [];

  const highlightIds = highlights.map((h) => h.id);
  const { data: itemRows, error: itemError } = await supabase
    .from(DB_TABLES.highlightItems)
    .select('*')
    .in('highlight_id', highlightIds)
    .order('sort_order');

  if (itemError) throw itemError;

  const itemsByHighlight = new Map<string, HighlightItem[]>();
  for (const row of (itemRows ?? []) as DbHighlightItem[]) {
    const list = itemsByHighlight.get(row.highlight_id) ?? [];
    list.push(mapHighlightItem(row));
    itemsByHighlight.set(row.highlight_id, list);
  }

  return highlights.map((row) => mapHighlight(row, itemsByHighlight.get(row.id) ?? []));
}

function storiesToItems(storyIds: string[], stories: Story[]): HighlightItem[] {
  return storyIds
    .map((storyId) => stories.find((s) => s.id === storyId))
    .filter(Boolean)
    .map((story) => ({
      id: `pending-${story!.id}`,
      image: story!.image,
      caption: story!.caption,
      sourceStoryId: story!.id,
    }));
}

export async function createHighlightInDb(
  teamId: string,
  title: string,
  storyIds: string[],
  stories: Story[],
): Promise<TeamHighlight> {
  const supabase = requireSupabase();
  const items = storiesToItems(storyIds, stories);
  if (items.length === 0) throw new Error('하이라이트에 넣을 스토리가 없어요');

  const { data: highlightRow, error } = await supabase
    .from(DB_TABLES.highlights)
    .insert({
      team_id: teamId,
      title,
      cover_image_url: items[0].image,
    })
    .select('*')
    .single();

  if (error || !highlightRow) throw error ?? new Error('하이라이트 생성 실패');
  const highlight = highlightRow as DbHighlight;

  const { data: insertedItems, error: itemError } = await supabase
    .from(DB_TABLES.highlightItems)
    .insert(
      items.map((item, index) => ({
        highlight_id: highlight.id,
        image_url: item.image,
        caption: item.caption,
        source_story_id: item.sourceStoryId ?? null,
        sort_order: index,
      })),
    )
    .select('*');

  if (itemError) throw itemError;

  return mapHighlight(
    highlight,
    ((insertedItems ?? []) as DbHighlightItem[]).map(mapHighlightItem),
  );
}

export async function updateHighlightInDb(
  highlightId: string,
  patch: { title?: string; storyIds?: string[] },
  stories: Story[],
): Promise<TeamHighlight> {
  const supabase = requireSupabase();

  if (patch.title != null) {
    const { error } = await supabase
      .from(DB_TABLES.highlights)
      .update({ title: patch.title })
      .eq('id', highlightId);
    if (error) throw error;
  }

  if (patch.storyIds) {
    const items = storiesToItems(patch.storyIds, stories);
    if (items.length === 0) throw new Error('하이라이트에 넣을 스토리가 없어요');

    const { error: deleteError } = await supabase
      .from(DB_TABLES.highlightItems)
      .delete()
      .eq('highlight_id', highlightId);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase.from(DB_TABLES.highlightItems).insert(
      items.map((item, index) => ({
        highlight_id: highlightId,
        image_url: item.image,
        caption: item.caption,
        source_story_id: item.sourceStoryId ?? null,
        sort_order: index,
      })),
    );
    if (insertError) throw insertError;

    const { error: coverError } = await supabase
      .from(DB_TABLES.highlights)
      .update({ cover_image_url: items[0].image })
      .eq('id', highlightId);
    if (coverError) throw coverError;
  }

  const { data: highlightRow, error: fetchError } = await supabase
    .from(DB_TABLES.highlights)
    .select('*')
    .eq('id', highlightId)
    .single();
  if (fetchError || !highlightRow) throw fetchError ?? new Error('하이라이트를 찾을 수 없어요');

  const { data: itemRows, error: itemError } = await supabase
    .from(DB_TABLES.highlightItems)
    .select('*')
    .eq('highlight_id', highlightId)
    .order('sort_order');
  if (itemError) throw itemError;

  return mapHighlight(
    highlightRow as DbHighlight,
    ((itemRows ?? []) as DbHighlightItem[]).map(mapHighlightItem),
  );
}

export async function appendHighlightStoriesInDb(
  highlightId: string,
  storyIds: string[],
  stories: Story[],
  existingSourceIds: string[],
): Promise<TeamHighlight> {
  const supabase = requireSupabase();
  const existing = new Set(existingSourceIds);
  const newStoryIds = storyIds.filter((id) => !existing.has(id));
  const items = storiesToItems(newStoryIds, stories);
  if (items.length === 0) {
    const { data: highlightRow } = await supabase
      .from(DB_TABLES.highlights)
      .select('*')
      .eq('id', highlightId)
      .single();
    const { data: itemRows } = await supabase
      .from(DB_TABLES.highlightItems)
      .select('*')
      .eq('highlight_id', highlightId)
      .order('sort_order');
    if (!highlightRow) throw new Error('하이라이트를 찾을 수 없어요');
    return mapHighlight(
      highlightRow as DbHighlight,
      ((itemRows ?? []) as DbHighlightItem[]).map(mapHighlightItem),
    );
  }

  const { data: lastItem } = await supabase
    .from(DB_TABLES.highlightItems)
    .select('sort_order')
    .eq('highlight_id', highlightId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const startOrder = ((lastItem?.sort_order as number | undefined) ?? -1) + 1;

  const { error: insertError } = await supabase.from(DB_TABLES.highlightItems).insert(
    items.map((item, index) => ({
      highlight_id: highlightId,
      image_url: item.image,
      caption: item.caption,
      source_story_id: item.sourceStoryId ?? null,
      sort_order: startOrder + index,
    })),
  );
  if (insertError) throw insertError;

  const { data: highlightRow, error: fetchError } = await supabase
    .from(DB_TABLES.highlights)
    .select('*')
    .eq('id', highlightId)
    .single();
  if (fetchError || !highlightRow) throw fetchError ?? new Error('하이라이트를 찾을 수 없어요');

  const { data: itemRows, error: itemError } = await supabase
    .from(DB_TABLES.highlightItems)
    .select('*')
    .eq('highlight_id', highlightId)
    .order('sort_order');
  if (itemError) throw itemError;

  return mapHighlight(
    highlightRow as DbHighlight,
    ((itemRows ?? []) as DbHighlightItem[]).map(mapHighlightItem),
  );
}

export async function deleteHighlightInDb(highlightId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from(DB_TABLES.highlights).delete().eq('id', highlightId);
  if (error) throw error;
}
