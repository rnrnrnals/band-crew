import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { PracticeRoom } from '../features/practice/PracticeRoom';
import './PracticePage.css';

export function PracticePage() {
  const { activeTeam, sessions, addSession, isOwnPracticeSession, deleteSession } = useApp();
  const teamSessions = useMemo(
    () => sessions.filter((session) => session.teamId === activeTeam?.id),
    [sessions, activeTeam],
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState('');

  const activeSession = teamSessions.find((s) => s.id === activeSessionId);

  if (activeSession && activeTeam) {
    return (
      <PracticeRoom
        session={activeSession}
        teamName={activeTeam.name}
        onBack={() => setActiveSessionId(null)}
      />
    );
  }

  const create = () => {
    const title = newTitle.trim();
    if (!title) {
      setError('제목을 입력해 주세요.');
      return;
    }
    const session = addSession(title, 92);
    setNewTitle('');
    setError('');
    setActiveSessionId(session.id);
  };

  return (
    <div className="page practice-list">
      <h1 className="page-title">연습실</h1>
      <p className="page-sub">
        {activeTeam?.name} 팀의 레이어드 합주. 포지션별로 녹음·녹화하고 겹쳐 들어보세요.
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
        {teamSessions.map((s) => (
          <div key={s.id} className="session-card">
            <button type="button" className="session-card-main" onClick={() => setActiveSessionId(s.id)}>
              <div>
                <strong>{s.title}</strong>
                <span>
                  ♩ {s.bpm} · {new Date(s.updatedAt).toLocaleDateString('ko-KR')}
                </span>
              </div>
              <span className="go">입장 →</span>
            </button>
            {isOwnPracticeSession(s) && (
              <button
                type="button"
                className="session-delete"
                onClick={() => deleteSession(s.id)}
                title="세션 삭제"
              >
                삭제
              </button>
            )}
          </div>
        ))}
        {teamSessions.length === 0 && (
          <p className="empty">세션이 없어요. 위에서 새로 만들어보세요.</p>
        )}
      </div>
    </div>
  );
}
