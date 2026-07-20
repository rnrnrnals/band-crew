import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useConfirm } from '../../components/ConfirmDialog';
import { TeamAudioPanel } from './TeamAudioPanel';
import { CommentAuthor } from './CommentAuthor';
import { CommentTimestampText } from './CommentTimestampText';
import { AudioCommentSheet } from './AudioCommentSheet';
import './PostDetailSheet.css';
import './SoundDetailSheet.css';
import './FeedCard.css';
import './CommentAuthor.css';
import './CommentTimestampText.css';
import './CommentSheet.css';

interface SoundDetailSheetProps {
  trackId: string;
  canDelete?: boolean;
  onClose: () => void;
}

export function SoundDetailSheet({ trackId, canDelete = false, onClose }: SoundDetailSheetProps) {
  const { teamAudios, deleteTeamAudio, getTeam, toggleAudioCommentLike, toggleAudioLike } = useApp();
  const confirm = useConfirm();
  const track = teamAudios.find((t) => t.id === trackId);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [seekRequest, setSeekRequest] = useState<{ token: number; seconds: number } | null>(null);

  if (!track) return null;

  const team = getTeam(track.teamId);
  const comments = track.comments ?? [];

  const handleTimestampClick = (seconds: number) => {
    setSeekRequest({ token: Date.now(), seconds });
  };

  const handleDelete = async () => {
    if (!(await confirm('삭제하시겠습니까?'))) return;
    deleteTeamAudio(trackId);
    onClose();
  };

  return (
    <div className="post-detail-backdrop" onClick={onClose} role="presentation">
      <div
        className="post-detail-panel sound-detail-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="사운드"
      >
        <header className="post-detail-head sound-detail-head">
          <div className="sound-detail-head-side">
            {canDelete ? (
              <button type="button" className="post-detail-delete" onClick={handleDelete}>
                삭제
              </button>
            ) : null}
          </div>
          {team ? <h2 className="sound-detail-team">{team.name}</h2> : <span className="sound-detail-team" aria-hidden />}
          <div className="sound-detail-head-side sound-detail-head-side--end">
            <button type="button" className="post-detail-close" onClick={onClose} aria-label="닫기">
              ✕
            </button>
          </div>
        </header>

        <div className="post-detail-body sound-detail-body">
          <TeamAudioPanel
            tracks={[track]}
            canUpload={false}
            embedded
            seekRequest={seekRequest}
            onTeamFeedNavigate={onClose}
          />

          {track.body ? <p className="sound-detail-body-text">{track.body}</p> : null}

          <div className="feed-actions sound-detail-actions">
            <button
              type="button"
              className={track.likedByMe ? 'liked' : ''}
              onClick={() => toggleAudioLike(trackId)}
            >
              {track.likedByMe ? '♥' : '♡'} {track.likes}
            </button>
            <button type="button" className="feed-comment-btn" onClick={() => setCommentsOpen(true)}>
              💬 {comments.length}
            </button>
          </div>

          {comments.slice(0, 2).map((c) => (
            <div key={c.id} className={`sound-detail-comment${c.parentId ? ' is-reply' : ''}`}>
              <div className="sound-detail-comment-row">
                <p className="feed-comment">
                  {c.replyTo ? <span className="comment-reply-tag">@{c.replyTo} </span> : null}
                  <CommentAuthor comment={c} layout="inline" contextTeam={team} onNavigate={onClose} />{' '}
                  <CommentTimestampText text={c.text} onTimestampClick={handleTimestampClick} />
                </p>
                <button
                  type="button"
                  className={`comment-like-btn comment-like-btn--icon${c.likedByMe ? ' is-liked' : ''}`}
                  onClick={() => toggleAudioCommentLike(trackId, c.id)}
                  aria-pressed={c.likedByMe ?? false}
                  aria-label={c.likedByMe ? '좋아요 취소' : '좋아요'}
                >
                  {c.likedByMe ? '♥' : '♡'}
                </button>
              </div>
            </div>
          ))}

          {comments.length > 2 && (
            <button type="button" className="feed-more-comments" onClick={() => setCommentsOpen(true)}>
              댓글 {comments.length}개 모두 보기
            </button>
          )}

          {comments.length === 0 && (
            <button type="button" className="feed-more-comments" onClick={() => setCommentsOpen(true)}>
              첫 댓글 남기기
            </button>
          )}
        </div>

        {commentsOpen && (
          <AudioCommentSheet
            trackId={trackId}
            onClose={() => setCommentsOpen(false)}
            onTimestampClick={handleTimestampClick}
          />
        )}
      </div>
    </div>
  );
}
