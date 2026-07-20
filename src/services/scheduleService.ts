import type { ScheduleEvent } from '../types';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import { mapSchedule } from '../lib/supabaseMappers';

export async function fetchScheduleForTeamIds(teamIds: string[]): Promise<ScheduleEvent[]> {
  if (teamIds.length === 0) return [];
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from(DB_TABLES.scheduleEvents)
    .select('*')
    .in('team_id', teamIds)
    .order('event_date', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) =>
    mapSchedule(
      row as {
        id: string;
        team_id: string;
        title: string;
        place: string;
        place_map_url: string | null;
        event_date: string;
        kind: ScheduleEvent['kind'];
      },
    ),
  );
}

export async function deleteScheduleEventInDb(eventId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from(DB_TABLES.scheduleEvents).delete().eq('id', eventId);
  if (error) throw error;
}

export async function createScheduleEventInDb(input: Omit<ScheduleEvent, 'id'>): Promise<ScheduleEvent> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.scheduleEvents)
    .insert({
      team_id: input.teamId,
      title: input.title,
      place: input.place,
      place_map_url: input.placeMapUrl ?? null,
      event_date: input.date,
      kind: input.kind,
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('일정 추가 실패');
  return mapSchedule(
    data as {
      id: string;
      team_id: string;
      title: string;
      place: string;
      place_map_url: string | null;
      event_date: string;
      kind: ScheduleEvent['kind'];
    },
  );
}
