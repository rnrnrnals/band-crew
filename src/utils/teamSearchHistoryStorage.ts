import { useEffect, useState } from 'react';
import type { BandTeam } from '../types';

const LS_KEY = 'band-crew-team-search-history-v1';
const MAX_ENTRIES = 3;
export const TEAM_SEARCH_HISTORY_EVENT = 'band-crew-team-search-history';

export interface TeamSearchHistoryEntry {
  teamId: string;
  name: string;
  cover: string;
  genre: string;
  searchedAt: number;
}

export function loadTeamSearchHistory(): TeamSearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as TeamSearchHistoryEntry[];
    return entries
      .filter((entry) => entry.teamId && entry.name)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function addTeamSearchHistory(team: Pick<BandTeam, 'id' | 'name' | 'cover' | 'genre'>): TeamSearchHistoryEntry[] {
  const now = Date.now();
  const next: TeamSearchHistoryEntry = {
    teamId: team.id,
    name: team.name,
    cover: team.cover,
    genre: team.genre,
    searchedAt: now,
  };
  const entries = loadTeamSearchHistory().filter((entry) => entry.teamId !== team.id);
  entries.unshift(next);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  window.dispatchEvent(new CustomEvent(TEAM_SEARCH_HISTORY_EVENT));
  return trimmed;
}

export function useTeamSearchHistory(): TeamSearchHistoryEntry[] {
  const [history, setHistory] = useState(() => loadTeamSearchHistory());

  useEffect(() => {
    const refresh = () => setHistory(loadTeamSearchHistory());
    window.addEventListener(TEAM_SEARCH_HISTORY_EVENT, refresh);
    return () => window.removeEventListener(TEAM_SEARCH_HISTORY_EVENT, refresh);
  }, []);

  return history;
}
