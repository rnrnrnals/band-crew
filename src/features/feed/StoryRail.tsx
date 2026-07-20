import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../state/AppContext';
import { isTeamStoriesFullySeen, useStorySeen } from '../../utils/storySeenStorage';
import './StoryRail.css';

export function StoryRail({ onOpen }: { onOpen: (storyId: string) => void }) {
  const { stories, followingIds, activeTeamId, activeTeam, getTeam } = useApp();
  const storySeen = useStorySeen();

  const myTeamStories = useMemo(() => {
    if (!activeTeamId) return [];
    return stories
      .filter((s) => s.teamId === activeTeamId)
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }, [stories, activeTeamId]);

  const teamsWithStories = useMemo(() => {
    const visible = stories.filter(
      (s) => followingIds.includes(s.teamId) && s.teamId !== activeTeamId,
    );
    const order: string[] = [];
    visible.forEach((s) => {
      if (!order.includes(s.teamId)) order.push(s.teamId);
    });
    return order
      .map((teamId) => {
        const teamStories = visible
          .filter((s) => s.teamId === teamId)
          .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
        return {
          teamId,
          firstStory: teamStories[0],
          count: teamStories.length,
          storyIds: teamStories.map((story) => story.id),
        };
      })
      .filter((x) => x.firstStory)
      .sort((a, b) => {
        const aSeen = isTeamStoriesFullySeen(a.storyIds, storySeen);
        const bSeen = isTeamStoriesFullySeen(b.storyIds, storySeen);
        if (aSeen === bSeen) return 0;
        return aSeen ? 1 : -1;
      });
  }, [stories, followingIds, activeTeamId, storySeen]);

  const firstMyStory = myTeamStories[0];
  const hasMyStory = myTeamStories.length > 0;
  const myStoriesSeen = isTeamStoriesFullySeen(
    myTeamStories.map((story) => story.id),
    storySeen,
  );

  return (
    <div className="story-rail">
      {hasMyStory && firstMyStory && activeTeam ? (
        <div className="story-item story-mine">
          <div className="story-mine-wrap">
            <button
              type="button"
              className={`story-ring story-mine-ring${myStoriesSeen ? ' is-seen' : ''}`}
              onClick={() => onOpen(firstMyStory.id)}
              aria-label="내 팀 스토리 보기"
            >
              <img src={activeTeam.cover} alt="" />
              {myTeamStories.length > 1 && <span className="story-count">{myTeamStories.length}</span>}
            </button>
            <Link to="/story/upload" className="story-add-plus" aria-label="스토리 추가">+</Link>
          </div>
          <span>내 팀</span>
        </div>
      ) : (
        <Link to="/story/upload" className="story-item story-add">
          <div className="story-ring add">
            {activeTeam ? (
              <>
                <img src={activeTeam.cover} alt="" className="story-add-cover" />
                <span className="story-add-plus">+</span>
              </>
            ) : (
              <span className="story-add-fallback">+</span>
            )}
          </div>
          <span>내 팀</span>
        </Link>
      )}

      {teamsWithStories.map(({ teamId, firstStory, count, storyIds }) => {
        const team = getTeam(teamId);
        if (!team || !firstStory) return null;
        const allSeen = isTeamStoriesFullySeen(storyIds, storySeen);
        return (
          <button
            key={teamId}
            type="button"
            className="story-item"
            onClick={() => onOpen(firstStory.id)}
          >
            <div className={`story-ring${allSeen ? ' is-seen' : ''}`}>
              <img src={team.cover} alt="" />
              {count > 1 && <span className="story-count">{count}</span>}
            </div>
            <span>{team.name}</span>
          </button>
        );
      })}
    </div>
  );
}
