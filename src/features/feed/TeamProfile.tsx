import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AuthLoadingScreen } from '../../components/AuthLoadingScreen';
import { useApp } from '../../state/AppContext';
import { TeamFeedView } from './TeamFeedView';

export function TeamProfilePage() {
  const { teamId } = useParams();
  const { getTeam, myTeamIds, loadTeam } = useApp();
  const [loading, setLoading] = useState(false);
  const team = getTeam(teamId || '');

  useEffect(() => {
    if (!teamId || team) return;
    setLoading(true);
    void loadTeam(teamId).finally(() => setLoading(false));
  }, [teamId, team, loadTeam]);

  if (loading && !team) {
    return <AuthLoadingScreen />;
  }

  if (!team) {
    return (
      <div className="page">
        <p>팀을 찾을 수 없어요.</p>
        <Link to="/">홈으로</Link>
      </div>
    );
  }

  if (myTeamIds.includes(team.id)) {
    return <Navigate to="/my" replace />;
  }

  return <TeamFeedView team={team} variant="other" />;
}
