import { Link } from 'react-router-dom';
import type { BandTeam } from '../../types';
import './FollowListSheet.css';

interface FollowListSheetProps {
  title: string;
  teams: BandTeam[];
  onClose: () => void;
}

export function FollowListSheet({ title, teams, onClose }: FollowListSheetProps) {
  return (
    <div className="follow-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="follow-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="follow-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="follow-sheet-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <ul className="follow-sheet-list">
          {teams.map((t) => (
            <li key={t.id}>
              <Link to={`/team/${t.id}`} className="follow-sheet-row" onClick={onClose}>
                <img src={t.cover} alt="" />
                <div>
                  <strong>{t.name}</strong>
                  <span>
                    {t.genre} · 멤버 {t.members.length}명
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {teams.length === 0 && (
            <li className="follow-sheet-empty">아직 목록이 비어 있어요.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
