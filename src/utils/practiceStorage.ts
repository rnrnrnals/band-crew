import type { PositionId } from '../types';
import type { MediaKind } from '../features/practice/jamUtils';

export interface StoredPracticeTrack {
  id: number;
  name: string;
  mediaUrl: string;
  color: string;
  volume: number;
  /** Legacy local data */
  muted?: boolean;
  peaks: number[];
  duration: number;
  positionId: PositionId;
  positionLabel: string;
  kind: MediaKind;
  authorUserId?: string;
  syncOffsetSec?: number;
}

const LS_KEY = 'band-crew-practice-tracks-v1';

type TrackStore = Record<string, StoredPracticeTrack[]>;

function loadAll(): TrackStore {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as TrackStore;
  } catch {
    return {};
  }
}

function saveAll(store: TrackStore) {
  localStorage.setItem(LS_KEY, JSON.stringify(store));
}

export function loadSessionTracks(sessionId: string): StoredPracticeTrack[] {
  return loadAll()[sessionId] ?? [];
}

export function saveSessionTracks(sessionId: string, tracks: StoredPracticeTrack[]): boolean {
  try {
    const all = loadAll();
    if (tracks.length === 0) {
      delete all[sessionId];
    } else {
      all[sessionId] = tracks;
    }
    saveAll(all);
    return true;
  } catch {
    return false;
  }
}

export function deleteSessionTracks(sessionId: string) {
  const all = loadAll();
  delete all[sessionId];
  saveAll(all);
}
