import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { BandTeam } from '../../types';
import { useApp } from '../../state/AppContext';
import {
  addTeamSearchHistory,
  useTeamSearchHistory,
  type TeamSearchHistoryEntry,
} from '../../utils/teamSearchHistoryStorage';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import './TeamSearchSheet.css';

interface TeamSearchSheetProps {
  onClose: () => void;
}

export function TeamSearchSheet({ onClose }: TeamSearchSheetProps) {
  const navigate = useNavigate();
  const { searchTeams, myTeamIds } = useApp();
  const recentTeams = useTeamSearchHistory();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BandTeam[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    const timer = window.setTimeout(() => {
      void searchTeams(trimmed)
        .then((teams) => {
          setResults(teams);
          if (teams.length === 0) {
            setError('검색 결과가 없어요.');
          }
        })
        .catch(() => {
          setResults([]);
          setError('팀 검색에 실패했어요.');
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, searchTeams]);

  const openTeam = (team: { id: string; name: string; cover: string; genre: string }) => {
    addTeamSearchHistory({ id: team.id, name: team.name, cover: team.cover, genre: team.genre });
    onClose();
    navigate(`/team/${team.id}`);
  };

  const openRecentTeam = (entry: TeamSearchHistoryEntry) => {
    addTeamSearchHistory({
      id: entry.teamId,
      name: entry.name,
      cover: entry.cover,
      genre: entry.genre,
    });
    onClose();
    navigate(`/team/${entry.teamId}`);
  };

  const renderTeamRow = (team: Pick<BandTeam, 'id' | 'name' | 'cover' | 'genre'>) => (
    <button type="button" className="team-search-item" onClick={() => openTeam(team)}>
      <ProfileAvatar src={team.cover} square className="team-search-avatar" />
      <div>
        <strong>{team.name}</strong>
        <span>
          {team.genre}
          {myTeamIds.includes(team.id) ? ' · 내 팀' : ''}
        </span>
      </div>
    </button>
  );

  const showRecent = query.trim().length === 0 && recentTeams.length > 0;

  const sheet = (
    <div className="team-search-backdrop" onClick={onClose} role="presentation">
      <div
        className="team-search-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="팀 검색"
      >
        <header className="team-search-head">
          <h2>팀 검색</h2>
          <button type="button" className="team-search-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <p className="team-search-sub">팀 이름으로 검색해 피드로 이동할 수 있어요.</p>

        <input
          className="team-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예: Moonlight, 데모 밴드"
          autoFocus
        />

        {showRecent ? (
          <section className="team-search-recent" aria-label="최근 검색">
            <h3 className="team-search-recent-title">최근 검색</h3>
            <ul className="team-search-list">
              {recentTeams.map((entry: TeamSearchHistoryEntry) => (
                <li key={entry.teamId}>
                  <button
                    type="button"
                    className="team-search-item is-recent"
                    onClick={() => openRecentTeam(entry)}
                  >
                    <img src={entry.cover} alt="" />
                    <div>
                      <strong>{entry.name}</strong>
                      <span>
                        {entry.genre}
                        {myTeamIds.includes(entry.teamId) ? ' · 내 팀' : ''}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {loading ? <p className="team-search-status">검색 중…</p> : null}
        {!loading && error ? <p className="team-search-error">{error}</p> : null}

        {query.trim().length > 0 ? (
          <ul className="team-search-list" role="listbox">
            {results.map((team) => (
              <li key={team.id}>{renderTeamRow(team)}</li>
            ))}
          </ul>
        ) : !showRecent ? (
          <p className="team-search-empty">팀 이름을 입력해 주세요.</p>
        ) : null}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
