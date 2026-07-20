import { useState } from 'react';
import type { PostComment } from '../../types';
import { useApp } from '../../state/AppContext';
import { useConfirm } from '../../components/ConfirmDialog';
import { findCurrentMember } from '../../mock/memberUtils';
import { getCommentReplyLabel, isOwnComment } from '../../utils/commentUtils';
import { CommentSheetItem } from './CommentSheetItem';
import './CommentSheet.css';
import './CommentAuthor.css';

interface CommentSheetProps {
  postId: string;
  onClose: () => void;
}

export function CommentSheet({ postId, onClose }: CommentSheetProps) {
  const { posts, addComment, updateComment, deleteComment, toggleCommentLike, user, activeTeam, getTeam } =
    useApp();
  const confirm = useConfirm();
  const post = posts.find((p) => p.id === postId);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  if (!post) return null;

  const postTeam = getTeam(post.teamId);

  const myNick = activeTeam
    ? (findCurrentMember(activeTeam, user)?.nick ?? user.name)
    : user.name;

  const submit = () => {
    if (!text.trim()) return;
    addComment(postId, text, replyTo?.id);
    setText('');
    setReplyTo(null);
  };

  const startEdit = (commentId: string, currentText: string) => {
    setReplyTo(null);
    setEditingId(commentId);
    setEditText(currentText);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEdit = () => {
    if (!editingId || !editText.trim()) return;
    updateComment(postId, editingId, editText);
    cancelEdit();
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!(await confirm('삭제하시겠습니까?'))) return;
    deleteComment(postId, commentId);
    if (editingId === commentId) cancelEdit();
  };

  return (
    <div className="comment-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="comment-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="댓글"
      >
        <header className="comment-sheet-head">
          <h2>댓글</h2>
          <button type="button" className="comment-sheet-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <ul className="comment-sheet-list">
          {post.comments.length > 0 ? (
            post.comments.map((c) => (
              <CommentSheetItem
                key={c.id}
                comment={c}
                isReply={!!c.parentId}
                mine={isOwnComment(c, user.id, myNick, activeTeam?.name)}
                editing={editingId === c.id}
                editText={editText}
                onEditTextChange={setEditText}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onStartEdit={() => startEdit(c.id, c.text)}
                onDelete={() => void handleDeleteComment(c.id)}
                onToggleLike={() => toggleCommentLike(postId, c.id)}
                onReply={() => {
                  cancelEdit();
                  setReplyTo(c);
                }}
                contextTeam={postTeam}
                onAuthorNavigate={onClose}
              />
            ))
          ) : (
            <li className="comment-sheet-empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</li>
          )}
        </ul>

        {replyTo ? (
          <div className="comment-sheet-reply-banner">
            <span>{getCommentReplyLabel(replyTo)}에게 답글</span>
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
