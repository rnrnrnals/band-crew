import type { TeamPracticeSong } from '../types';

export function sortTeamPracticeSongs(songs: TeamPracticeSong[], teamId: string) {
  const teamSongs = songs.filter((song) => song.teamId === teamId);
  const sorted = [...teamSongs].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const current = teamSongs.find((song) => song.isCurrent === true) ?? null;
  const past = sorted.filter((song) => song.id !== current?.id);

  return {
    current,
    past,
    all: sorted,
  };
}

export function formatPracticeDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

/** Stored as "가수 - 제목" for team practice songs. */
export function formatPracticeSongTitle(artist: string, songTitle: string): string {
  const artistTrimmed = artist.trim();
  const titleTrimmed = songTitle.trim();
  if (artistTrimmed && titleTrimmed) return `${artistTrimmed} - ${titleTrimmed}`;
  return titleTrimmed || artistTrimmed;
}

export function parsePracticeSongTitle(stored: string): { artist: string; songTitle: string } {
  const trimmed = stored.trim();
  const separatorIndex = trimmed.indexOf(' - ');
  if (separatorIndex === -1) {
    return { artist: '', songTitle: trimmed };
  }
  return {
    artist: trimmed.slice(0, separatorIndex).trim(),
    songTitle: trimmed.slice(separatorIndex + 3).trim(),
  };
}

export function validatePracticeSongFields(artist: string, songTitle: string): string | null {
  if (!artist.trim()) return '가수를 입력해 주세요.';
  if (!songTitle.trim()) return '제목을 입력해 주세요.';
  return null;
}

/** @deprecated Use sortTeamPracticeSongs */
export const sortTeamPracticeSessions = sortTeamPracticeSongs;
