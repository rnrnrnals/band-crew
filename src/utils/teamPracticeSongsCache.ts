import type { TeamPracticeSong } from '../types';

const CACHE_KEY = 'band-crew-team-practice-songs-v1';

export function loadTeamPracticeSongsCache(): TeamPracticeSong[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TeamPracticeSong[];
  } catch {
    return [];
  }
}

export function saveTeamPracticeSongsCache(songs: TeamPracticeSong[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(songs));
  } catch {
    // ignore quota errors
  }
}

/** DB rows + in-memory/cache entries (pending sync or offline). */
export function mergeTeamPracticeSongs(
  dbSongs: TeamPracticeSong[],
  ...extraSources: TeamPracticeSong[][]
): TeamPracticeSong[] {
  const byId = new Map<string, TeamPracticeSong>();

  for (const song of dbSongs) {
    byId.set(song.id, song);
  }

  for (const source of extraSources) {
    for (const song of source) {
      const existing = byId.get(song.id);
      if (!existing) {
        byId.set(song.id, song);
        continue;
      }
      byId.set(song.id, {
        ...existing,
        isCurrent: existing.isCurrent === true || song.isCurrent === true,
      });
    }
  }

  return Array.from(byId.values());
}
