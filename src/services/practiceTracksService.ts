import type { PositionId } from '../types';
import type { MediaKind } from '../features/practice/jamUtils';
import { DB_TABLES } from '../lib/databaseTables';
import { requireSupabase } from '../lib/supabase';
import type { PracticeSessionMeta } from '../types';
import type { StoredPracticeTrack } from '../utils/practiceStorage';
import { ensurePracticeSessionInDb } from './practiceService';
import {
  dataUrlToBlob,
  deleteStorageUrls,
  isStoragePublicUrl,
  uploadMediaBlob,
} from './storageService';

type DbPracticeTrackRow = {
  id: string;
  session_id: string;
  track_key: number;
  name: string;
  media_url: string;
  color: string;
  muted: boolean;
  peaks: number[];
  duration_sec: number;
  position_id: string;
  position_label: string;
  kind: MediaKind;
  sort_order: number;
  author_user_id: string | null;
  sync_offset_sec: number;
  volume: number;
};

function mapRow(row: DbPracticeTrackRow): StoredPracticeTrack {
  const volume = row.volume != null ? Number(row.volume) : row.muted ? 0 : 1;
  return {
    id: Number(row.track_key),
    name: row.name,
    mediaUrl: row.media_url,
    color: row.color,
    volume,
    peaks: Array.isArray(row.peaks) ? row.peaks : [],
    duration: Number(row.duration_sec),
    positionId: row.position_id as PositionId,
    positionLabel: row.position_label,
    kind: row.kind,
    authorUserId: row.author_user_id ?? undefined,
    syncOffsetSec: Number(row.sync_offset_sec) || 0,
  };
}

async function publishTrackMedia(
  teamId: string,
  sessionId: string,
  mediaUrl: string,
): Promise<string> {
  if (isStoragePublicUrl(mediaUrl)) return mediaUrl;
  if (mediaUrl.startsWith('blob:')) {
    const blob = await fetch(mediaUrl).then((r) => r.blob());
    return uploadMediaBlob('practice', `${teamId}/${sessionId}`, blob);
  }
  if (mediaUrl.startsWith('data:')) {
    const blob = await dataUrlToBlob(mediaUrl);
    return uploadMediaBlob('practice', `${teamId}/${sessionId}`, blob);
  }
  return mediaUrl;
}

function needsTrackMediaUpload(track: StoredPracticeTrack, prev?: StoredPracticeTrack): boolean {
  if (!prev) return true;
  if (isStoragePublicUrl(track.mediaUrl)) return prev.mediaUrl !== track.mediaUrl;
  if (isStoragePublicUrl(prev.mediaUrl)) return false;
  return prev.mediaUrl !== track.mediaUrl;
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  const msg = error.message?.toLowerCase() ?? '';
  return msg.includes('column') && msg.includes('practice_tracks');
}

function withStoredMediaUrl(
  track: StoredPracticeTrack,
  prev?: StoredPracticeTrack,
): StoredPracticeTrack {
  const mediaUrl =
    isStoragePublicUrl(track.mediaUrl) || !prev?.mediaUrl
      ? track.mediaUrl
      : prev.mediaUrl;
  return {
    ...track,
    mediaUrl,
    authorUserId: track.authorUserId ?? prev?.authorUserId,
    syncOffsetSec: track.syncOffsetSec ?? prev?.syncOffsetSec ?? 0,
    volume: track.volume ?? prev?.volume ?? 1,
  };
}

function buildTrackRows(
  sessionId: string,
  track: StoredPracticeTrack,
  mediaUrl: string,
  sortOrder: number,
  includeExtras: boolean,
): Record<string, unknown>[] {
  const volume = track.volume ?? 1;
  const base: Record<string, unknown> = {
    session_id: sessionId,
    track_key: track.id,
    name: track.name,
    media_url: mediaUrl,
    color: track.color,
    muted: volume === 0,
    peaks: track.peaks,
    duration_sec: track.duration,
    position_id: track.positionId,
    position_label: track.positionLabel,
    kind: track.kind,
    sort_order: sortOrder,
  };

  if (!includeExtras) return [base];

  const full: Record<string, unknown> = {
    ...base,
    volume,
    sync_offset_sec: track.syncOffsetSec ?? 0,
  };
  if (track.authorUserId) full.author_user_id = track.authorUserId;
  return [full, base];
}

async function upsertTrackRow(
  sessionId: string,
  track: StoredPracticeTrack,
  mediaUrl: string,
  sortOrder: number,
): Promise<StoredPracticeTrack> {
  const supabase = requireSupabase();
  const candidates = buildTrackRows(sessionId, track, mediaUrl, sortOrder, true);
  let lastError: { code?: string; message?: string } | null = null;

  for (let i = 0; i < candidates.length; i += 1) {
    let row = candidates[i];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error } = await supabase
        .from(DB_TABLES.practiceTracks)
        .upsert(row, { onConflict: 'session_id,track_key' })
        .select('*')
        .single();

      if (!error && data) {
        const mapped = mapRow(data as DbPracticeTrackRow);
        return {
          ...mapped,
          authorUserId: mapped.authorUserId ?? track.authorUserId,
          syncOffsetSec: mapped.syncOffsetSec ?? track.syncOffsetSec ?? 0,
          volume: mapped.volume ?? track.volume ?? 1,
        };
      }

      lastError = error;
      if (error?.code === '23503' && row.author_user_id) {
        const { author_user_id: _drop, ...withoutAuthor } = row;
        row = withoutAuthor;
        continue;
      }
      if (isMissingColumnError(error) && i + 1 < candidates.length) break;
      throw error ?? new Error('연습 트랙 저장 실패');
    }
  }

  throw lastError ?? new Error('연습 트랙 저장 실패');
}

export async function fetchPracticeTracksForSession(
  sessionId: string,
): Promise<StoredPracticeTrack[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(DB_TABLES.practiceTracks)
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as DbPracticeTrackRow[]).map(mapRow);
}

export async function upsertPracticeTrackInDb(
  sessionId: string,
  teamId: string,
  track: StoredPracticeTrack,
  sortOrder: number,
): Promise<StoredPracticeTrack> {
  const mediaUrl = await publishTrackMedia(teamId, sessionId, track.mediaUrl);
  return upsertTrackRow(sessionId, track, mediaUrl, sortOrder);
}

export async function updatePracticeTrackMetaInDb(
  sessionId: string,
  trackKey: number,
  patch: {
    volume?: number;
    name?: string;
    sortOrder?: number;
    color?: string;
    syncOffsetSec?: number;
  },
): Promise<void> {
  const supabase = requireSupabase();
  const full: Record<string, unknown> = {};
  const base: Record<string, unknown> = {};

  if (patch.volume !== undefined) {
    full.volume = patch.volume;
    full.muted = patch.volume === 0;
    base.muted = patch.volume === 0;
  }
  if (patch.name !== undefined) {
    full.name = patch.name;
    base.name = patch.name;
  }
  if (patch.sortOrder !== undefined) {
    full.sort_order = patch.sortOrder;
    base.sort_order = patch.sortOrder;
  }
  if (patch.color !== undefined) {
    full.color = patch.color;
    base.color = patch.color;
  }
  if (patch.syncOffsetSec !== undefined) full.sync_offset_sec = patch.syncOffsetSec;

  const candidates = Object.keys(full).length ? [full, base] : [];
  if (candidates.length === 0) return;

  let lastError: { code?: string; message?: string } | null = null;
  for (const row of candidates) {
    const { error } = await supabase
      .from(DB_TABLES.practiceTracks)
      .update(row)
      .eq('session_id', sessionId)
      .eq('track_key', trackKey);
    if (!error) return;
    lastError = error;
    if (isMissingColumnError(error)) continue;
    throw error;
  }
  throw lastError ?? new Error('연습 트랙 메타 저장 실패');
}

export async function deletePracticeTrackInDb(
  sessionId: string,
  trackKey: number,
  mediaUrl?: string,
): Promise<void> {
  const supabase = requireSupabase();

  let urlToDelete = mediaUrl;
  if (!urlToDelete || !isStoragePublicUrl(urlToDelete)) {
    const { data, error: fetchError } = await supabase
      .from(DB_TABLES.practiceTracks)
      .select('media_url')
      .eq('session_id', sessionId)
      .eq('track_key', trackKey)
      .maybeSingle();
    if (fetchError) throw fetchError;
    urlToDelete = (data?.media_url as string | undefined) ?? mediaUrl;
  }

  if (urlToDelete && isStoragePublicUrl(urlToDelete)) {
    await deleteStorageUrls(urlToDelete);
  }

  const { error } = await supabase
    .from(DB_TABLES.practiceTracks)
    .delete()
    .eq('session_id', sessionId)
    .eq('track_key', trackKey);
  if (error) throw error;
}

export async function syncPracticeTracksToDb(
  sessionMeta: PracticeSessionMeta,
  tracks: StoredPracticeTrack[],
  previous: Map<number, StoredPracticeTrack>,
): Promise<Map<number, StoredPracticeTrack>> {
  await ensurePracticeSessionInDb(sessionMeta);

  const sessionId = sessionMeta.id;
  const teamId = sessionMeta.teamId;
  const nextMap = new Map<number, StoredPracticeTrack>();
  const nextKeys = new Set(tracks.map((t) => t.id));

  for (const [trackKey, oldTrack] of previous) {
    if (!nextKeys.has(trackKey)) {
      await deletePracticeTrackInDb(sessionId, trackKey, oldTrack.mediaUrl);
    }
  }

  for (let i = 0; i < tracks.length; i += 1) {
    const track = tracks[i];
    const prev = previous.get(track.id);
    const uploadMedia = needsTrackMediaUpload(track, prev);
    const metaChanged =
      !prev ||
      (prev.volume ?? 1) !== (track.volume ?? 1) ||
      prev.name !== track.name ||
      prev.color !== track.color ||
      (prev.syncOffsetSec ?? 0) !== (track.syncOffsetSec ?? 0);

    if (uploadMedia) {
      const saved = await upsertPracticeTrackInDb(sessionId, teamId, track, i);
      nextMap.set(saved.id, saved);
    } else if (metaChanged) {
      await updatePracticeTrackMetaInDb(sessionId, track.id, {
        volume: track.volume ?? 1,
        name: track.name,
        color: track.color,
        sortOrder: i,
        syncOffsetSec: track.syncOffsetSec ?? 0,
      });
      nextMap.set(track.id, withStoredMediaUrl(track, prev));
    } else {
      nextMap.set(track.id, withStoredMediaUrl(track, prev));
    }
  }

  return nextMap;
}
