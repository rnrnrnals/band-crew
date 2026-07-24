import { useState } from 'react';
import type { PostComment } from '../../types';
import { useApp } from '../../state/AppContext';
import { useConfirm } from '../../components/ConfirmDialog';
import { findCurrentMember } from '../../mock/memberUtils';
import { getCommentReplyLabel, isOwnComment } from '../../utils/commentUtils';
import { CommentSheetItem } from './CommentSheetItem';
import { CommentTimestampText } from './CommentTimestampText';
import './CommentSheet.css';
import './CommentAuthor.css';
import './CommentTimestampText.css';

interface AudioCommentSheetProps {
  trackId: string;
  onClose: () => void;
  onTimestampClick?: (seconds: number) => void;
}

export function AudioCommentSheet({ trackId, onClose, onTimestampClick }: AudioCommentSheetProps) {
  const {
    teamAudios,
    addAudioComment,
    deleteAudioComment,
    toggleAudioCommentLike,
    user,
    activeTeam,
    getTeam,
  } = useApp();
  const confirm = useConfirm();
  const track = teamAudios.find((t) => t.id === trackId);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);

  if (!track) return null;

  const trackTeam = getTeam(track.teamId);
  const comments = track.comments ?? [];
  const myNick = activeTeam
    ? (findCurrentMember(activeTeam, user)?.nick ?? user.name)
    : user.name;

  const submit = () => {
    if (!text.trim()) return;
    addAudioComment(trackId, text, replyTo?.id);
    setText('');
    setReplyTo(null);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!(await confirm('삭제하시겠습니까?'))) return;
    deleteAudioComment(trackId, commentId);
  };

  return (
    <div className="comment-sheet-backdrop audio-comment-backdrop" onClick={onClose} role="presentation">
      <div
        className="comment-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="사운드 댓글"
      >
        <header className="comment-sheet-head">
          <h2>댓글</h2>
          <button type="button" className="comment-sheet-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <ul className="comment-sheet-list">
          {comments.length > 0 ? (
            comments.map((c) => {
              const parent = c.parentId ? comments.find((item) => item.id === c.parentId) : undefined;
              return (
                <CommentSheetItem
                  key={c.id}
                  comment={c}
                  isReply={!!c.parentId}
                  replyToLabel={parent ? getCommentReplyLabel(parent, trackTeam, true) : undefined}
                  mine={isOwnComment(c, user.id, myNick, activeTeam?.name)}
                  onDelete={() => void handleDeleteComment(c.id)}
                  onToggleLike={() => toggleAudioCommentLike(trackId, c.id)}
                  onReply={() => setReplyTo(c)}
                  textContent={<CommentTimestampText text={c.text} onTimestampClick={onTimestampClick} />}
                  contextTeam={trackTeam}
                  highlightPostTeam
                  onAuthorNavigate={onClose}
                />
              );
            })
          ) : (
            <li className="comment-sheet-empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</li>
          )}
        </ul>

        {replyTo ? (
          <div className="comment-sheet-reply-banner">
            <span>{getCommentReplyLabel(replyTo, trackTeam, true)}에게 답글</span>
            <button type="button" className="comment-sheet-reply-cancel" onClick={() => setReplyTo(null)}>
              취소
            </button>
          </div>
        ) : null}

        <form
          className="comment-sheet-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={replyTo ? '답글 달기...' : '댓글 달기...'}
            maxLength={300}
          />
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            게시
          </button>
        </form>
      </div>
    </div>
  );
}
