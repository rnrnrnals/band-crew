import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { TeamAudioTrack } from '../../types';
import { useApp } from '../../state/AppContext';
import { CommentAuthor } from './CommentAuthor';
import { AudioCommentSheet } from './AudioCommentSheet';
import { FeedShareButton } from '../chat/ShareContentSheet';
import { buildSharedAudioContent } from '../../utils/contentShare';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import './FeedCard.css';
import './AudioFeedCard.css';

function formatDuration(sec?: number): string {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioFeedCard({
  track: initialTrack,
  onOpen,
  onUnfollowFromFeed,
}: {
  track: TeamAudioTrack;
  onOpen: () => void;
  onUnfollowFromFeed?: (teamId: string) => void;
}) {
  const { getTeam, toggleAudioLike, toggleFollow, teamAudios, followingIds, activeTeamId } = useApp();
  const track = teamAudios.find((t) => t.id === initialTrack.id) ?? initialTrack;
  const team = getTeam(track.teamId);
  const isOwnTeam = track.teamId === activeTeamId;
  const isFollowing = followingIds.includes(track.teamId);
  const singleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);

  useEffect(() => {
    return () => {
      if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    };
  }, []);

  const triggerLike = () => {
    if (singleClickTimerRef.current) {
      clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
    }
    if (!track.likedByMe) toggleAudioLike(track.id);
    setShowHeartBurst(true);
    window.setTimeout(() => setShowHeartBurst(false), 900);
  };

  const handlePreviewClick = () => {
    if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = setTimeout(() => {
      onOpen();
      singleClickTimerRef.current = null;
    }, 280);
  };

  const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('a, button, input, textarea')) return;
    triggerLike();
  };

  if (!team) return null;

  const comments = track.comments ?? [];
  const durationLabel = formatDuration(track.durationSec);
  const heartBurst = showHeartBurst ? (
    <span className="feed-heart-burst" aria-hidden>
      ♥
    </span>
  ) : null;

  return (
    <article className="feed-card audio-feed-card" onDoubleClick={handleDoubleClick}>
      <header className="feed-head">
        <Link to={`/team/${team.id}`} className="feed-team">
          <ProfileAvatar src={team.cover} className="feed-team-avatar" />
          <div>
            <strong>{team.name}</strong>
            <span>{team.genre}</span>
          </div>
        </Link>
        {!isOwnTeam && (
          <button
            type="button"
            className={`feed-follow-btn ${isFollowing ? 'is-following' : ''}`}
            onClick={() => {
              if (isFollowing) onUnfollowFromFeed?.(track.teamId);
              toggleFollow(track.teamId);
            }}
          >
            {isFollowing ? '팔로잉' : '팔로우'}
          </button>
        )}
      </header>

      <button
        type="button"
        className={`audio-feed-preview${track.coverImage ? ' has-cover' : ''}`}
        onClick={handlePreviewClick}
        aria-label={`${track.title} 사운드 보기`}
      >
        {track.coverImage ? <img src={track.coverImage} alt="" className="audio-feed-cover" /> : null}
        <span className="audio-feed-shade" aria-hidden />
        <span className="audio-feed-badge">🎙 사운드</span>
        <span className="audio-feed-play" aria-hidden>
          ▶
        </span>
        <span className="audio-feed-meta">
          <strong>{track.title}</strong>
          {track.caption ? <span>{track.caption}</span> : null}
          <em>{durationLabel}</em>
        </span>
        {heartBurst}
      </button>

      <div className="feed-actions">
        <button
          type="button"
          className={track.likedByMe ? 'liked' : ''}
          onClick={() => toggleAudioLike(track.id)}
        >
          {track.likedByMe ? '♥' : '♡'} {track.likes}
        </button>
        <button type="button" className="feed-comment-btn" onClick={() => setCommentsOpen(true)}>
          💬 {comments.length}
        </button>
        <FeedShareButton
          content={buildSharedAudioContent(track, team.name)}
          label="채팅방에 공유"
        />
      </div>

      <p className="feed-caption">
        <strong>{team.name}</strong> {track.caption || track.title}
      </p>

      {comments.slice(0, 2).map((c) => (
        <p key={c.id} className="feed-comment">
          <CommentAuthor comment={c} layout="inline" contextTeam={team} /> {c.text}
        </p>
      ))}

      {comments.length > 2 && (
        <button type="button" className="feed-more-comments" onClick={() => setCommentsOpen(true)}>
          댓글 {comments.length}개 모두 보기
        </button>
      )}

      {commentsOpen && <AudioCommentSheet trackId={track.id} onClose={() => setCommentsOpen(false)} />}
    </article>
  );
}
