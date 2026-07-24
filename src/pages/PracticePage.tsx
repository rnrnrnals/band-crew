import { useMemo, useState, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { PracticeRoom } from '../features/practice/PracticeRoom';
import './PracticePage.css';

export function PracticePage() {
  const { activeTeam, sessions, addSession, isOwnPracticeSession, deleteSession, togglePracticeSessionPublic, updatePracticeSession } =
    useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSessionId = searchParams.get('session');
  const teamSessions = useMemo(
    () => sessions.filter((session) => session.teamId === activeTeam?.id),
    [sessions, activeTeam],
  );
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState('');
  const [publicBusyId, setPublicBusyId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBusyId, setEditBusyId] = useState<string | null>(null);

  const activeSession = activeSessionId
    ? teamSessions.find((session) => session.id === activeSessionId)
    : undefined;

  const openSession = (sessionId: string) => {
    setSearchParams({ session: sessionId }, { replace: false });
  };

  const closeSession = () => {
    setSearchParams({}, { replace: true });
  };

  if (activeSession && activeTeam) {
    return (
      <PracticeRoom
        session={activeSession}
        teamName={activeTeam.name}
        onBack={closeSession}
      />
    );
  }

  const create = () => {
    const title = newTitle.trim();
    if (!title) {
      setError('제목을 입력해 주세요.');
      return;
    }
    const session = addSession(title, 120);
    setNewTitle('');
    setError('');
    openSession(session.id);
  };

  const togglePublic = async (sessionId: string, event: MouseEvent) => {
    event.stopPropagation();
    if (publicBusyId) return;
    setPublicBusyId(sessionId);
    setError('');
    try {
      await togglePracticeSessionPublic(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '공개 설정을 바꾸지 못했어요.');
    } finally {
      setPublicBusyId(null);
    }
  };

  const startEdit = (sessionId: string, title: string, event: MouseEvent) => {
    event.stopPropagation();
    setEditingSessionId(sessionId);
    setEditTitle(title);
    setError('');
  };

  const cancelEdit = (event?: MouseEvent) => {
    event?.stopPropagation();
    setEditingSessionId(null);
    setEditTitle('');
  };

  const saveEdit = async (sessionId: string, event?: MouseEvent) => {
    event?.stopPropagation();
    const title = editTitle.trim();
    if (!title) {
      setError('제목을 입력해 주세요.');
      return;
    }
    if (editBusyId) return;
    setEditBusyId(sessionId);
    setError('');
    try {
      await updatePracticeSession(sessionId, { title });
      setEditingSessionId(null);
      setEditTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '제목을 수정하지 못했어요.');
    } finally {
      setEditBusyId(null);
    }
  };

  return (
    <div className="page practice-list">
      <h1 className="page-title">연습실</h1>
      <p className="page-sub">
        {activeTeam?.name} 팀의 레이어드 합주. 포지션별로 오디오·동영상 파일을 올리고 겹쳐 들어보세요.
      </p>

      <div className="card session-new">
        <div className="field">
          <label htmlFor="practice-session-title">세션 제목</label>
          <input
            id="practice-session-title"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="곡명, 셋리스트 메모, 연습 날짜…"
            maxLength={80}
          />
        </div>
        {error ? <p className="practice-page-error">{error}</p> : null}
        <button type="button" className="btn btn-primary" onClick={create} style={{ marginTop: 8 }}>
          + 새 세션 시작
        </button>
      </div>

      <h2 className="sec">우리 팀 세션</h2>
      <div className="session-list">
        {teamSessions.map((s) => {
          const likeCount = s.likes ?? 0;
          return (
          <div
            key={s.id}
            className={`session-card${s.isPublic ? ' is-public' : ''}${likeCount > 0 ? ' has-likes' : ''}`}
          >
            <button
              type="button"
              className="session-card-main"
              onClick={() => {
                if (editingSessionId === s.id) return;
                openSession(s.id);
              }}
            >
              <div>
                {editingSessionId === s.id ? (
                  <input
                    className="session-title-input"
                    value={editTitle}
                    maxLength={80}
                    autoFocus
                    disabled={editBusyId === s.id}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setEditTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void saveEdit(s.id);
                      if (event.key === 'Escape') cancelEdit();
                    }}
                  />
                ) : (
                  <strong>{s.title}</strong>
                )}
                <span>{new Date(s.updatedAt).toLocaleDateString('ko-KR')}</span>
              </div>
            </button>
            {likeCount > 0 ? (
              <div className="session-card-likes" aria-label={`좋아요 ${likeCount}개`}>
                ♥ {likeCount}
              </div>
            ) : null}
            <button
              type="button"
              className={`session-public-toggle${s.isPublic ? ' is-private-label' : ' is-public-label'}`}
              disabled={publicBusyId === s.id}
              onClick={(event) => void togglePublic(s.id, event)}
              aria-pressed={s.isPublic}
              aria-label={s.isPublic ? '비공개로 전환' : '다른 팀에 공개'}
            >
              {s.isPublic ? '비공개' : '공개'}
            </button>
            {isOwnPracticeSession(s) && (
              <div className="session-card-actions">
                <button
                  type="button"
                  className="session-edit"
                  disabled={editBusyId === s.id}
                  onClick={(event) => {
                    if (editingSessionId === s.id) {
                      void saveEdit(s.id, event);
                      return;
                    }
                    startEdit(s.id, s.title, event);
                  }}
                  title={editingSessionId === s.id ? '제목 저장' : '제목 수정'}
                >
                  {editingSessionId === s.id ? '저장' : '수정'}
                </button>
                <button
                  type="button"
                  className="session-delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteSession(s.id);
                  }}
                  title="세션 삭제"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
          );
        })}
        {teamSessions.length === 0 && (
          <p className="empty">세션이 없어요. 위에서 새로 만들어보세요.</p>
        )}
      </div>
    </div>
  );
}
