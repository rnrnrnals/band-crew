import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../state/AppContext';
import './LeaderGate.css';

interface LeaderGateProps {
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
}

export function LeaderGate({
  children,
  backTo = '/my',
  backLabel = '팀 피드로',
}: LeaderGateProps) {
  const { canManageActiveTeam, activeTeam } = useApp();

  if (!canManageActiveTeam) {
    return (
      <div className="page leader-gate">
        <h1 className="page-title">리더 · 코리더 전용</h1>
        <p className="page-sub">
          {activeTeam ? `${activeTeam.name} 팀의 ` : ''}
          프로필 수정과 게시물 올리기는 리더 또는 코리더만 할 수 있어요.
        </p>
        <Link to={backTo} className="btn btn-primary">
          {backLabel}
        </Link>
      </div>
    );
  }

  return children;
}
