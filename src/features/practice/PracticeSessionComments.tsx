import { useEffect, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/AuthContext';
import { useConfirm } from '../../components/ConfirmDialog';
import { findCurrentMember } from '../../mock/memberUtils';
import { getCommentReplyLabel, isOwnComment } from '../../utils/commentUtils';
import { CommentSheetItem } from '../feed/CommentSheetItem';
import '../feed/CommentSheet.css';
import '../feed/CommentAuthor.css';
import './PracticeSessionComments.css';

interface PracticeSessionCommentsProps {
  sessionId: string;
  sessionTeamId: string;
}

export function PracticeSessionComments({ sessionId, sessionTeamId }: PracticeSessionCommentsProps) {
  const {
    user,
    activeTeam,
    getTeam,
    loadPracticeSessionComments,
    getPracticeSessionComments,
    addPracticeSessionComment,
    deletePracticeSessionComment,
    togglePracticeSessionCommentLike,
  } = useApp();
  const { session: authSession, authLoading } = useAuth();
  const confirm = useConfirm();
  const sessionTeam = getTeam(sessionTeamId);
  const comments = getPracticeSessionComments(sessionId);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<(typeof comments)[number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading || !authSession?.user?.id) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadPracticeSessionComments(sessionId)
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '댓글을 불러오지 못했어요.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, loadPracticeSessionComments, authLoading, authSession?.user?.id]);

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
      await addPracticeSessionComment(sessionId, trimmed, replyTo?.id);
      setText('');
      setReplyTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '댓글을 남기지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!(await confirm('삭제하시겠습니까?'))) return;
    deletePracticeSessionComment(sessionId, commentId);
  };

  return (
    <section className="pr-session-comments" aria-label="세션 댓글">
      <h3 className="pr-session-comments-title">댓글 {comments.length > 0 ? comments.length : ''}</h3>

      {error ? <p className="pr-session-comments-error">{error}</p> : null}

      {loading ? (
        <p className="pr-session-comments-empty">댓글 불러오는 중…</p>
      ) : comments.length > 0 ? (
        <ul className="pr-session-comments-list comment-sheet-list">
          {comments.map((comment) => {
            const parent = comment.parentId
              ? comments.find((item) => item.id === comment.parentId)
              : undefined;
            return (
              <CommentSheetItem
                key={comment.id}
                comment={comment}
                isReply={!!comment.parentId}
                replyToLabel={
                  parent ? getCommentReplyLabel(parent, sessionTeam, true) : undefined
                }
                mine={isOwnComment(comment, user.id, myNick, activeTeam?.name)}
                onDelete={() => void handleDelete(comment.id)}
                onToggleLike={() => togglePracticeSessionCommentLike(sessionId, comment.id)}
                onReply={() => setReplyTo(comment)}
                contextTeam={sessionTeam}
                highlightPostTeam
              />
            );
          })}
        </ul>
      ) : (
        <p className="pr-session-comments-empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</p>
      )}

      {replyTo ? (
        <div className="comment-sheet-reply-banner pr-session-comments-reply-banner">
          <span>{getCommentReplyLabel(replyTo, sessionTeam, true)}에게 답글</span>
          <button type="button" className="comment-sheet-reply-cancel" onClick={() => setReplyTo(null)}>
            취소
          </button>
        </div>
      ) : null}

      <form className="pr-session-comments-form" onSubmit={(event) => void submit(event)}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={replyTo ? '답글 달기…' : `${myNick}(으)로 댓글 달기…`}
          maxLength={300}
          disabled={submitting}
        />
        <button type="submit" className="btn btn-primary" disabled={!text.trim() || submitting}>
          게시
        </button>
      </form>
    </section>
  );
}
