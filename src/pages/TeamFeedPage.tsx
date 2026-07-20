import { useApp } from '../state/AppContext';
import { TeamFeedView } from '../features/feed/TeamFeedView';

export function TeamFeedPage() {
  const { activeTeam } = useApp();
  if (!activeTeam) return null;
  return <TeamFeedView team={activeTeam} variant="own" />;
}
