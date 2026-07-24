import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useConfirm } from '../../components/ConfirmDialog';
import { findCurrentMember } from '../../mock/memberUtils';
import { isOwnComment } from '../../utils/commentUtils';
import { CommentAuthor } from '../feed/CommentAuthor';
import '../feed/CommentAuthor.css';
import './PracticeTrackSocial.css';

interface PracticeTrackSocialProps {
  sessionId: string;
  sessionTeamId: string;
  trackKey: number;
}

export function PracticeTrackSocial({ sessionId, sessionTeamId, trackKey }: PracticeTrackSocialProps) {
  const {
    user,
    activeTeam,
    getTeam,
    getPracticeTrackLike,
    togglePracticeTrackLike,
    getPracticeTrackComments,
    addPracticeTrackComment,
    deletePracticeTrackComment,
    togglePracticeTrackCommentLike,
  } = useApp();
  const confirm = useConfirm();
  const sessionTeam = getTeam(sessionTeamId);
  const like = getPracticeTrackLike(sessionId, trackKey);
  const comments = getPracticeTrackComments(sessionId, trackKey);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const myNick = activeTeam
    ? (findCurrentMember(activeTeam, user)?.nick ?? user.name)
    : user.name;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError('');
    try {
      await addPracticeTrackComment(sessionId, trackKey, trimmed);
      setText('');
      setCommentsOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '댓글을 남기지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!(await confirm('삭제하시겠습니까?'))) return;
    deletePracticeTrackComment(sessionId, trackKey, commentId);
  };

  return (
    <div className="track-social">
      <div className="track-social-actions">
        <button
          type="button"
          className={`track-social-like${like.likedByMe ? ' is-liked' : ''}`}
          onClick={() => togglePracticeTrackLike(sessionId, trackKey)}
          aria-pressed={like.likedByMe}
          aria-label={like.likedByMe ? '좋아요 취소' : '좋아요'}
        >
          {like.likedByMe ? '♥' : '♡'} {like.likes}
        </button>
        <button
          type="button"
          className={`track-social-comment-toggle${commentsOpen ? ' is-open' : ''}`}
          onClick={() => setCommentsOpen((open) => !open)}
          aria-expanded={commentsOpen}
        >
          💬 {comments.length}
        </button>
      </div>

      {commentsOpen ? (
        <div className="track-social-comments">
          {error ? <p className="track-social-error">{error}</p> : null}
          {comments.length > 0 ? (
            <ul className="track-social-comment-list">
              {comments.map((comment) => {
                const mine = isOwnComment(comment, user.id, myNick, activeTeam?.name);
                return (
                  <li key={comment.id} className="track-social-comment-item">
                    <div className="track-social-comment-main">
                      <p className="track-social-comment-line">
                        <CommentAuthor
                          comment={comment}
                          layout="inline"
                          contextTeam={sessionTeam}
                          highlightPostTeam
                        />{' '}
                        <span>{comment.text}</span>
                      </p>
                      <button
                        type="button"
                        className={`track-social-comment-like${comment.likedByMe ? ' is-liked' : ''}`}
                        onClick={() =>
                          togglePracticeTrackCommentLike(sessionId, trackKey, comment.id)
                        }
                        aria-pressed={comment.likedByMe ?? false}
                        aria-label={comment.likedByMe ? '좋아요 취소' : '좋아요'}
                      >
                        {comment.likedByMe ? '♥' : '♡'} {comment.likes ?? 0}
                      </button>
                    </div>
                    {mine ? (
                      <button
                        type="button"
                        className="track-social-comment-delete"
                        onClick={() => void handleDelete(comment.id)}
                      >
                        삭제
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="track-social-comment-empty">첫 댓글을 남겨보세요.</p>
          )}

          <form className="track-social-comment-form" onSubmit={(event) => void submit(event)}>
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="댓글 달기…"
              maxLength={300}
              disabled={submitting}
            />
            <button type="submit" className="btn btn-primary" disabled={!text.trim() || submitting}>
              게시
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
