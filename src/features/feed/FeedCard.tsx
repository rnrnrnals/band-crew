import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import { useApp } from '../../state/AppContext';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { CommentSheet } from './CommentSheet';
import { CommentAuthor } from './CommentAuthor';
import { FeedShareButton } from '../chat/ShareContentSheet';
import { buildSharedPostContent } from '../../utils/contentShare';
import { formatMediaTime } from '../../utils/fileMedia';
import { posterUrlForVideo } from '../../utils/videoMediaUtils';
import './FeedCard.css';

function seekRatioFromBar(bar: HTMLElement, clientX: number): number {
  const rect = bar.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

export function FeedCard({
  post: initialPost,
  onUnfollowFromFeed,
}: {
  post: Post;
  onUnfollowFromFeed?: (teamId: string) => void;
}) {
  const { getTeam, toggleLike, toggleFollow, posts, followingIds, activeTeamId } = useApp();
  const post = posts.find((p) => p.id === initialPost.id) ?? initialPost;
  const team = getTeam(post.teamId);
  const isOwnTeam = post.teamId === activeTeamId;
  const isFollowing = followingIds.includes(post.teamId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const seekDragRef = useRef(false);
  const singleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);

  useEffect(() => {
    if (post.mediaType !== 'video' || !wrapRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          video.play().then(() => setPlaying(true)).catch(() => {});
        } else {
          video.pause();
          setPlaying(false);
        }
      },
      { threshold: [0.55] },
    );
    io.observe(wrapRef.current);
    return () => io.disconnect();
  }, [post.mediaType, post.id]);

  useEffect(() => {
    return () => {
      if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (post.mediaType !== 'video' || !videoRef.current) return;
    const video = videoRef.current;
    const syncProgress = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      setDurationSec(video.duration);
      if (!seekDragRef.current) {
        setProgress(video.currentTime / video.duration);
      }
    };
    video.addEventListener('timeupdate', syncProgress);
    video.addEventListener('loadedmetadata', syncProgress);
    video.addEventListener('durationchange', syncProgress);
    video.addEventListener('seeked', syncProgress);
    syncProgress();
    return () => {
      video.removeEventListener('timeupdate', syncProgress);
      video.removeEventListener('loadedmetadata', syncProgress);
      video.removeEventListener('durationchange', syncProgress);
      video.removeEventListener('seeked', syncProgress);
    };
  }, [post.mediaType, post.mediaUrl, post.id]);

  const seekVideo = useCallback((ratio: number, shouldPlay = true) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    video.currentTime = clamped * video.duration;
    setProgress(clamped);
    if (shouldPlay) {
      void video.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, []);

  const seekFromClientX = useCallback(
    (clientX: number, shouldPlay: boolean) => {
      const bar = seekBarRef.current;
      if (!bar) return;
      seekVideo(seekRatioFromBar(bar, clientX), shouldPlay);
    },
    [seekVideo],
  );

  const onSeekPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (singleClickTimerRef.current) {
      clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
    }
    seekDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromClientX(event.clientX, true);
  };

  const onSeekPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!seekDragRef.current) return;
    event.stopPropagation();
    seekFromClientX(event.clientX, playing);
  };

  const onSeekPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!seekDragRef.current) return;
    event.stopPropagation();
    seekFromClientX(event.clientX, true);
    seekDragRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const triggerLike = () => {
    if (singleClickTimerRef.current) {
      clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
    }
    if (!post.likedByMe) toggleLike(post.id);
    setShowHeartBurst(true);
    window.setTimeout(() => setShowHeartBurst(false), 900);
  };

  const handleMediaClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('.feed-video-seek')) return;
    if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = setTimeout(() => {
      setMuted((m) => {
        const next = !m;
        if (videoRef.current) {
          videoRef.current.muted = next;
          if (!next) videoRef.current.volume = 1;
        }
        return next;
      });
      singleClickTimerRef.current = null;
    }, 280);
  };

  const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('a, button, input, textarea')) return;
    triggerLike();
  };

  const heartBurst = showHeartBurst ? (
    <span className="feed-heart-burst" aria-hidden>
      ♥
    </span>
  ) : null;

  if (!team) return null;

  const videoPosterUrl = post.mediaType === 'video' ? posterUrlForVideo(post.mediaUrl) : undefined;

  return (
    <article className="feed-card" onDoubleClick={handleDoubleClick}>
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
              if (isFollowing) onUnfollowFromFeed?.(post.teamId);
              toggleFollow(post.teamId);
            }}
          >
            {isFollowing ? '팔로잉' : '팔로우'}
          </button>
        )}
      </header>

      {post.mediaType === 'video' && post.mediaUrl && (
        <div className="feed-media feed-media--video" ref={wrapRef} onClick={handleMediaClick}>
          <video
            ref={videoRef}
            src={post.mediaUrl}
            poster={videoPosterUrl}
            loop
            muted={muted}
            playsInline
            preload="auto"
          />
          <span className="media-badge">{muted ? '탭해서 소리 켜기' : playing ? '재생 중' : '일시정지'}</span>
          {playing ? (
            <div
              className="feed-video-seek"
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <div
                ref={seekBarRef}
                className="feed-video-seek-track"
                role="slider"
                aria-label="재생 위치"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                onPointerDown={onSeekPointerDown}
                onPointerMove={onSeekPointerMove}
                onPointerUp={onSeekPointerUp}
                onPointerCancel={onSeekPointerUp}
              >
                <div className="feed-video-seek-fill" style={{ width: `${progress * 100}%` }} />
                <span className="feed-video-seek-thumb" style={{ left: `${progress * 100}%` }} />
              </div>
              {durationSec > 0 ? (
                <div className="feed-video-seek-time">
                  <span>{formatMediaTime(progress * durationSec)}</span>
                  <span>{formatMediaTime(durationSec)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {heartBurst}
        </div>
      )}

      {post.mediaType === 'image' && post.mediaUrl && (
        <div className="feed-media">
          <img src={post.mediaUrl} alt="" />
          {heartBurst}
        </div>
      )}

      {post.mediaType === 'text' && (
        <div className="feed-text-only">
          <p>{post.caption}</p>
          {heartBurst}
        </div>
      )}

      <div className="feed-actions">
        <button type="button" className={post.likedByMe ? 'liked' : ''} onClick={() => toggleLike(post.id)}>
          {post.likedByMe ? '♥' : '♡'} {post.likes}
        </button>
        <button type="button" className="feed-comment-btn" onClick={() => setCommentsOpen(true)}>
          💬 {post.comments.length}
        </button>
        <FeedShareButton
          content={buildSharedPostContent(post, team.name)}
          label="채팅방에 공유"
        />
      </div>

      {post.mediaType !== 'text' && (
        <p className="feed-caption">
          <strong>{team.name}</strong> {post.caption}
        </p>
      )}

      {post.comments.slice(0, 2).map((c) => (
        <p key={c.id} className="feed-comment">
          <CommentAuthor comment={c} layout="inline" contextTeam={team} highlightPostTeam /> {c.text}
        </p>
      ))}

      {post.comments.length > 2 && (
        <button type="button" className="feed-more-comments" onClick={() => setCommentsOpen(true)}>
          댓글 {post.comments.length}개 모두 보기
        </button>
      )}

      {commentsOpen && <CommentSheet postId={post.id} onClose={() => setCommentsOpen(false)} />}
    </article>
  );
}
