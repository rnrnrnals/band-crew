import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BandTeam, TeamPracticeSong } from '../../types';
import { useApp } from '../../state/AppContext';
import {
  PracticeSongFields,
  formatPracticeSongTitle,
  validatePracticeSongFields,
} from './PracticeSongFields';
import { formatPracticeDate, sortTeamPracticeSongs } from '../../utils/teamPracticeSessions';
import './TeamPracticeSheet.css';

interface TeamPracticeSheetProps {
  team: BandTeam;
  canEdit: boolean;
  onClose: () => void;
}

export function TeamPracticeSheet({ team, canEdit, onClose }: TeamPracticeSheetProps) {
  const {
    teamPracticeSongs,
    addTeamPracticeSong,
    promoteTeamPracticeSong,
    deleteTeamPracticeSong,
  } = useApp();
  const { current, past } = useMemo(
    () => sortTeamPracticeSongs(teamPracticeSongs, team.id),
    [teamPracticeSongs, team.id],
  );
  const [newArtist, setNewArtist] = useState('');
  const [newSongTitle, setNewSongTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const addNewSong = async () => {
    const validationError = validatePracticeSongFields(newArtist, newSongTitle);
    if (validationError) {
      setError(validationError);
      return;
    }
    const title = formatPracticeSongTitle(newArtist, newSongTitle);
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const result = await addTeamPracticeSong(title, team.id);
      if (!result.ok) {
        setError(result.message ?? '연습곡을 저장하지 못했어요.');
        return;
      }
      if (result.message) setInfo(result.message);
      setNewArtist('');
      setNewSongTitle('');
    } finally {
      setBusy(false);
    }
  };

  const makeCurrent = async (song: TeamPracticeSong) => {
    setBusy(true);
    setError('');
    try {
      await promoteTeamPracticeSong(song.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '현재 곡으로 바꾸지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const removePast = async (songId: string) => {
    setBusy(true);
    setError('');
    try {
      const ok = await deleteTeamPracticeSong(songId);
      if (!ok) setError('삭제하지 못했어요.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const sheet = (
    <div className="team-practice-backdrop" onClick={onClose} role="presentation">
      <div
        className="team-practice-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${team.name} 연습곡`}
      >
        <header className="team-practice-head">
          <h2>연습곡</h2>
          <button type="button" className="team-practice-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <p className="team-practice-sub">
          {canEdit
            ? '가수와 제목을 입력하면 피드에 가수 - 제목 형식으로 표시돼요.'
            : `${team.name} 팀이 연습 중인 곡과 지난 연습곡이에요.`}
        </p>

        {error ? <p className="team-practice-error">{error}</p> : null}
        {info ? <p className="team-practice-info">{info}</p> : null}

        <section className="team-practice-current">
          <p className="team-practice-label">현재 연습중</p>
          {current ? (
            <div className="team-practice-current-row">
              <div className="team-practice-current-body">
                <p className="team-practice-current-title">{current.title}</p>
                <p className="team-practice-current-meta">{formatPracticeDate(current.updatedAt)} 갱신</p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="team-practice-item-delete"
                  disabled={busy}
                  onClick={() => void removePast(current.id)}
                >
                  삭제
                </button>
              ) : null}
            </div>
          ) : (
            <p className="team-practice-empty">아직 등록된 연습곡이 없어요.</p>
          )}
        </section>

        <h3 className="team-practice-section-title">지난 연습곡</h3>
        {past.length > 0 ? (
          <ul className="team-practice-list">
            {past.map((song) => (
              <li key={song.id} className="team-practice-item">
                <button
                  type="button"
                  className="team-practice-item-main"
                  disabled={busy || !canEdit}
                  onClick={() => {
                    if (canEdit) void makeCurrent(song);
                  }}
                >
                  <strong>{song.title}</strong>
                  <span>
                    {formatPracticeDate(song.updatedAt)}
                    {canEdit ? ' · 탭하면 현재 곡으로' : ''}
                  </span>
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    className="team-practice-item-delete"
                    disabled={busy}
                    onClick={() => void removePast(song.id)}
                  >
                    삭제
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="team-practice-empty">지난 연습곡이 없어요.</p>
        )}

        {canEdit ? (
          <section className="team-practice-new">
            <h3 className="team-practice-section-title">새 연습곡 추가</h3>
            <div className="team-practice-edit">
              <PracticeSongFields
                artist={newArtist}
                songTitle={newSongTitle}
                onArtistChange={setNewArtist}
                onSongTitleChange={setNewSongTitle}
                artistId="team-practice-new-artist"
                songTitleId="team-practice-new-title"
              />
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void addNewSong()}>
                현재 연습곡으로 추가
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
