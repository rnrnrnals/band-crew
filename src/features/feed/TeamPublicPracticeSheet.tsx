import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import type { BandTeam, PracticeSessionMeta } from '../../types';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/AuthContext';
import { PracticeRoom } from '../practice/PracticeRoom';
import './TeamPublicPracticeSheet.css';

interface TeamPublicPracticeSheetProps {
  team: BandTeam;
  onClose: () => void;
  restoreSessionId?: string | null;
}

export function TeamPublicPracticeSheet({ team, onClose, restoreSessionId }: TeamPublicPracticeSheetProps) {
  const { loadPublicPracticeSessions, getPublicPracticeSessions, togglePracticeSessionLike } = useApp();
  const { session: authSession, authLoading } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSession, setActiveSession] = useState<PracticeSessionMeta | null>(null);
  const sessions = getPublicPracticeSessions(team.id);

  const openSession = (session: PracticeSessionMeta) => {
    setActiveSession(session);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('practiceSession', session.id);
        return next;
      },
      { replace: true },
    );
  };

  const closeSession = () => {
    setActiveSession(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('practiceSession');
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (authLoading || !authSession?.user?.id) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadPublicPracticeSessions(team.id)
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '공개 세션을 불러오지 못했어요.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [team.id, loadPublicPracticeSessions, authLoading, authSession?.user?.id]);

  useEffect(() => {
    if (!restoreSessionId || loading || activeSession) return;
    const session = sessions.find((item) => item.id === restoreSessionId);
    if (session) setActiveSession(session);
  }, [restoreSessionId, loading, sessions, activeSession]);

  if (activeSession) {
    return createPortal(
      <div className="team-public-practice-room">
        <PracticeRoom
          session={activeSession}
          teamName={team.name}
          readOnly
          onBack={closeSession}
        />
      </div>,
      document.body,
    );
  }

  const sheet = (
    <div className="team-public-practice-backdrop" onClick={onClose} role="presentation">
      <div
        className="team-public-practice-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${team.name} 공개 연습실`}
      >
        <header className="team-public-practice-head">
          <h2>연습실</h2>
          <button
            type="button"
            className="team-public-practice-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </header>

        <p className="team-public-practice-sub">
          {team.name} 팀이 공개한 세션을 탭하면 우리 팀 연습실처럼 들어볼 수 있어요.
        </p>

        {error ? <p className="team-public-practice-error">{error}</p> : null}

        {loading ? (
          <p className="team-public-practice-empty">불러오는 중…</p>
        ) : sessions.length > 0 ? (
          <ul className="team-public-practice-list">
            {sessions.map((session) => (
              <li key={session.id} className="team-public-practice-item">
                <button
                  type="button"
                  className="team-public-practice-item-main"
                  onClick={() => openSession(session)}
                >
                  <div className="team-public-practice-item-body">
                    <strong>{session.title}</strong>
                    <span>{new Date(session.updatedAt).toLocaleDateString('ko-KR')}</span>
                  </div>
                </button>
                <button
                  type="button"
                  className={`team-public-practice-like${session.likedByMe ? ' is-liked' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePracticeSessionLike(session.id);
                  }}
                  aria-pressed={session.likedByMe ?? false}
                  aria-label={session.likedByMe ? '좋아요 취소' : '좋아요'}
                >
                  {session.likedByMe ? '♥' : '♡'} {session.likes ?? 0}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="team-public-practice-empty">아직 공개된 세션이 없어요.</p>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
