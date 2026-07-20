import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';
import { useApp } from '../../state/AppContext';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { CommentSheet } from './CommentSheet';
import { CommentAuthor } from './CommentAuthor';
import { FeedShareButton } from '../chat/ShareContentSheet';
import { buildSharedPostContent } from '../../utils/contentShare';
import './FeedCard.css';

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
  const singleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
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

  const triggerLike = () => {
    if (singleClickTimerRef.current) {
      clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
    }
    if (!post.likedByMe) toggleLike(post.id);
    setShowHeartBurst(true);
    window.setTimeout(() => setShowHeartBurst(false), 900);
  };

  const handleMediaClick = () => {
    if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = setTimeout(() => {
      setMuted((m) => !m);
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
        <div className="feed-media" ref={wrapRef} onClick={handleMediaClick}>
          <video ref={videoRef} src={post.mediaUrl} loop muted={muted} playsInline preload="metadata" />
          <span className="media-badge">{muted ? '탭해서 소리 켜기' : playing ? '재생 중' : '일시정지'}</span>
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
          <CommentAuthor comment={c} layout="inline" contextTeam={team} /> {c.text}
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
