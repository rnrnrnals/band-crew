import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { getCrossTeamThreadId, getCrossTeamThreadPreview } from '../utils/chatUtils';
import { ProfileAvatar } from '../components/ProfileAvatar';
import './MyPage.css';
import './ChatTeamsPage.css';

export function ChatTeamsPage() {
  const { activeTeamId, followingIds, chatMessages, getTeam } = useApp();

  const teams = followingIds
    .filter((id) => id !== activeTeamId)
    .map((id) => getTeam(id))
    .filter((team): team is NonNullable<typeof team> => !!team);

  return (
    <div className="page chat-teams-page">
      <header className="chat-teams-head">
        <Link to="/chat" className="settings-back">
          ← 우리 팀 채팅
        </Link>
        <h1 className="page-title">다른 팀과 대화</h1>
        <p className="page-sub">팔로우한 팀에게 메시지를 보낼 수 있어요.</p>
      </header>

      <ul className="chat-teams-list">
        {teams.map((team) => {
          const threadId =
            activeTeamId ? getCrossTeamThreadId(activeTeamId, team.id) : '';
          const preview = threadId ? getCrossTeamThreadPreview(chatMessages, threadId) : null;

          return (
            <li key={team.id}>
              <Link to={`/chat/team/${team.id}`} className="chat-teams-row card">
                <ProfileAvatar src={team.cover} square className="chat-teams-avatar" />
                <div>
                  <strong>{team.name}</strong>
                  <span>{team.genre}</span>
                  <p>{preview ?? '대화를 시작해보세요'}</p>
                </div>
              </Link>
            </li>
          );
        })}
        {teams.length === 0 && (
          <li className="chat-teams-empty card">팔로우한 다른 팀이 없어요. 홈에서 팀을 팔로우해보세요.</li>
        )}
      </ul>
    </div>
  );
}
