import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BandTeam, PostComment } from '../../types';
import { CommentAuthor } from './CommentAuthor';

interface CommentSheetItemProps {
  comment: PostComment;
  mine: boolean;
  isReply?: boolean;
  onDelete: () => void;
  onToggleLike: () => void;
  onReply: () => void;
  textContent?: ReactNode;
  contextTeam?: BandTeam;
  onAuthorNavigate?: () => void;
  highlightPostTeam?: boolean;
  replyToLabel?: string;
}

const LONG_PRESS_MS = 450;

export function CommentSheetItem({
  comment,
  mine,
  isReply = false,
  onDelete,
  onToggleLike,
  onReply,
  textContent,
  contextTeam,
  onAuthorNavigate,
  highlightPostTeam = false,
  replyToLabel,
}: CommentSheetItemProps) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const longPressRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const clearLongPress = () => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  useEffect(() => {
    if (!actionMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setActionMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [actionMenuOpen]);

  const openActionMenu = () => {
    setActionMenuOpen(true);
    if (navigator.vibrate) navigator.vibrate(12);
  };

  const handlePointerDown = () => {
    if (!mine) return;
    movedRef.current = false;
    clearLongPress();
    longPressRef.current = window.setTimeout(() => {
      if (!movedRef.current) openActionMenu();
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = () => {
    movedRef.current = true;
    clearLongPress();
  };

  const handlePointerUp = () => {
    clearLongPress();
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    if (!mine) return;
    event.preventDefault();
    openActionMenu();
  };

  return (
    <li className={`comment-sheet-item${isReply ? ' is-reply' : ''}${actionMenuOpen ? ' has-action-menu' : ''}`}>
      <div className="comment-sheet-row">
        <div
          className="comment-sheet-body"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={handleContextMenu}
        >
          {comment.replyTo ? (
            <span className="comment-reply-tag">@{replyToLabel ?? comment.replyTo}에게 답글</span>
          ) : null}
          <p className="comment-sheet-content">
            <CommentAuthor
              comment={comment}
              layout="inline"
              contextTeam={contextTeam}
              highlightPostTeam={highlightPostTeam}
              onNavigate={onAuthorNavigate}
            />
            <span className="comment-sheet-text">{textContent ?? comment.text}</span>
          </p>
          <div className="comment-sheet-action-row">
            <button type="button" className="comment-reply-btn" onClick={onReply}>
              답글
            </button>
            {mine ? (
              <button
                type="button"
                className="comment-action-btn comment-action-btn--danger"
                onClick={onDelete}
              >
                삭제
              </button>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className={`comment-like-btn comment-like-btn--icon${comment.likedByMe ? ' is-liked' : ''}`}
          onClick={onToggleLike}
          aria-pressed={comment.likedByMe ?? false}
          aria-label={comment.likedByMe ? '좋아요 취소' : '좋아요'}
        >
          {comment.likedByMe ? '♥' : '♡'} {comment.likes ?? 0}
        </button>
      </div>

      {actionMenuOpen ? (
        <div className="comment-action-menu" ref={menuRef} role="menu">
          <button
            type="button"
            role="menuitem"
            className="comment-action-menu-item comment-action-menu-item--danger"
            onClick={() => {
              setActionMenuOpen(false);
              onDelete();
            }}
          >
            삭제
          </button>
        </div>
      ) : null}
    </li>
  );
}
