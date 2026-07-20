import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Story } from '../../types';
import { useApp } from '../../state/AppContext';
import { formatRelativeTime } from '../../utils/timeUtils';
import { markStorySeen } from '../../utils/storySeenStorage';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import './StoryViewer.css';

function buildPlaylist(
  stories: Story[],
  followingIds: string[],
  activeTeamId: string | null,
) {
  const visible = stories.filter(
    (s) => followingIds.includes(s.teamId) || s.teamId === activeTeamId,
  );
  const teamOrder: string[] = [];
  visible.forEach((s) => {
    if (!teamOrder.includes(s.teamId)) teamOrder.push(s.teamId);
  });
  return teamOrder.map((teamId) => ({
    teamId,
    stories: visible
      .filter((s) => s.teamId === teamId)
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
  }));
}

export function StoryViewer({
  storyId,
  onClose,
  scopeTeamId,
}: {
  storyId: string;
  onClose: () => void;
  scopeTeamId?: string;
}) {
  const { stories, followingIds, activeTeamId, myTeamIds, getTeam } = useApp();

  const playlist = useMemo(() => {
    if (scopeTeamId) {
      const scoped = stories
        .filter((s) => s.teamId === scopeTeamId)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      return scoped.length ? [{ teamId: scopeTeamId, stories: scoped }] : [];
    }
    return buildPlaylist(stories, followingIds, activeTeamId);
  }, [stories, followingIds, activeTeamId, scopeTeamId]);

  const initial = useMemo(() => {
    for (let t = 0; t < playlist.length; t++) {
      const si = playlist[t].stories.findIndex((s) => s.id === storyId);
      if (si >= 0) return { teamIdx: t, storyIdx: si };
    }
    return { teamIdx: 0, storyIdx: 0 };
  }, [playlist, storyId]);

  const [teamIdx, setTeamIdx] = useState(initial.teamIdx);
  const [storyIdx, setStoryIdx] = useState(initial.storyIdx);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const bundle = playlist[teamIdx];
  const teamStories = bundle?.stories ?? [];
  const story = teamStories[storyIdx];
  const team = story ? getTeam(story.teamId) : undefined;

  useEffect(() => {
    if (!story) return;
    markStorySeen(story.id);
  }, [story?.id]);

  useEffect(() => {
    if (!story) return;
    const t = setTimeout(() => {
      if (storyIdx < teamStories.length - 1) {
        setStoryIdx((i) => i + 1);
      } else if (teamIdx < playlist.length - 1) {
        setTeamIdx((ti) => ti + 1);
        setStoryIdx(0);
      } else {
        onClose();
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [teamIdx, storyIdx, story, teamStories.length, playlist.length, onClose]);

  const goNext = () => {
    if (storyIdx < teamStories.length - 1) {
      setStoryIdx((i) => i + 1);
      return;
    }
    if (teamIdx < playlist.length - 1) {
      setTeamIdx((t) => t + 1);
      setStoryIdx(0);
      return;
    }
    onClose();
  };

  const goPrev = () => {
    if (storyIdx > 0) {
      setStoryIdx((i) => i - 1);
      return;
    }
    if (teamIdx > 0) {
      const prevTeam = playlist[teamIdx - 1];
      setTeamIdx((t) => t - 1);
      setStoryIdx(prevTeam.stories.length - 1);
      return;
    }
    onClose();
  };

  if (!story || !team || !bundle) return null;

  const teamFeedPath = myTeamIds.includes(team.id) ? '/my' : `/team/${team.id}`;
  const caption = story.caption.trim();
  const showCaption = caption.length > 0 && caption !== team.name;

  return (
    <div className="story-viewer" role="dialog" onClick={onClose}>
      <div className="story-panel" onClick={(e) => e.stopPropagation()}>
        <div className="story-progress">
          {teamStories.map((s, i) => (
            <div
              key={s.id}
              className={`bar ${i < storyIdx ? 'done' : ''} ${i === storyIdx ? 'active' : ''}`}
            >
              <div className="bar-fill" />
            </div>
          ))}
        </div>
        <div className="story-head">
          <ProfileAvatar src={team.cover} className="story-viewer-avatar" />
          <div className="story-head-meta">
            <div className="story-head-row">
              <Link to={teamFeedPath} className="story-head-team" onClick={onClose}>
                {team.name}
              </Link>
              <span className="story-head-time">{formatRelativeTime(story.createdAt, now)}</span>
            </div>
            {showCaption ? <span className="story-head-caption">{caption}</span> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <img className="story-media" src={story.image} alt="" />
        <button type="button" className="story-nav prev" onClick={goPrev} aria-label="이전" />
        <button type="button" className="story-nav next" onClick={goNext} aria-label="다음" />
      </div>
    </div>
  );
}
