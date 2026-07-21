import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChatMessage } from '../../types';
import { parseShareMessage } from '../../utils/contentShare';
import { canEditChatMessage, isChatMessageDeleted } from '../../utils/chatUtils';
import './ChatMessageBubble.css';

const LONG_PRESS_MS = 450;
const DELETED_MESSAGE_TEXT = '삭제된 메세지입니다.';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  mine: boolean;
  canManage: boolean;
  isMedia?: boolean;
  timestamp: ReactNode;
  children: ReactNode;
  onEdit: (messageId: string, text: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
}

export function ChatMessageBubble({
  message,
  mine,
  canManage,
  isMedia = false,
  timestamp,
  children,
  onEdit,
  onDelete,
}: ChatMessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.text ?? '');
  const [saving, setSaving] = useState(false);
  const longPressRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const deleted = isChatMessageDeleted(message);
  const editable = canManage && canEditChatMessage(message);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  useEffect(() => {
    if (!editing) setEditText(message.text ?? '');
  }, [message.text, editing]);

  const clearLongPress = () => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const openMenu = () => {
    if (!canManage || deleted) return;
    setMenuOpen(true);
    if (navigator.vibrate) navigator.vibrate(12);
  };

  const handlePointerDown = () => {
    if (!canManage || deleted || editing) return;
    movedRef.current = false;
    clearLongPress();
    longPressRef.current = window.setTimeout(() => {
      if (!movedRef.current) openMenu();
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
    if (!canManage || deleted || editing) return;
    event.preventDefault();
    openMenu();
  };

  const startEdit = () => {
    if (!editable) return;
    setEditText(message.text ?? '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditText(message.text ?? '');
  };

  const saveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onEdit(message.id, trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onDelete(message.id);
    } finally {
      setSaving(false);
    }
  };

  const showEditedLabel = !!message.editedAt && !deleted && !parseShareMessage(message.text);

  return (
    <div className={`chat-bubble-shell${menuOpen ? ' has-action-menu' : ''}${mine ? ' mine' : ''}`}>
      {editing ? (
        <div className="chat-message-edit">
          <textarea
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
          />
          <div className="chat-message-edit-actions">
            <button type="button" className="btn" onClick={cancelEdit} disabled={saving}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void saveEdit()}
              disabled={!editText.trim() || saving}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`chat-bubble${deleted ? ' is-deleted' : ''}${isMedia ? ' media' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={handleContextMenu}
        >
          {deleted ? <p className="chat-bubble-deleted">{DELETED_MESSAGE_TEXT}</p> : children}
          <div className="chat-bubble-meta">
            {showEditedLabel ? <span className="chat-edited-label">수정됨</span> : null}
            {timestamp}
          </div>
        </div>
      )}

      {menuOpen ? (
        <div className="chat-action-menu" ref={menuRef} role="menu">
          {editable ? (
            <button
              type="button"
              role="menuitem"
              className="chat-action-menu-item"
              onClick={() => {
                setMenuOpen(false);
                startEdit();
              }}
            >
              수정
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="chat-action-menu-item chat-action-menu-item--danger"
            onClick={() => {
              setMenuOpen(false);
              void handleDelete();
            }}
          >
            삭제
          </button>
        </div>
      ) : null}
    </div>
  );
}
