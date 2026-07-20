import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useApp } from '../../state/AppContext';
import {
  encodeShareMessage,
  listShareChatDestinations,
  type SharedContent,
} from '../../utils/contentShare';
import './ShareContentSheet.css';

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v10" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

export function ShareContentSheet({
  content,
  onClose,
}: {
  content: SharedContent;
  onClose: () => void;
}) {
  const { activeTeam, activeTeamId, chatMessages, sendChatMessage, getTeam } = useApp();
  const [donePeerId, setDonePeerId] = useState<string | undefined | null>(null);

  const destinations = useMemo(
    () =>
      listShareChatDestinations({
        activeTeamId,
        activeTeamName: activeTeam?.name,
        activeTeamCover: activeTeam?.cover,
        chatMessages,
        getTeam,
      }),
    [activeTeam?.cover, activeTeam?.name, activeTeamId, chatMessages, getTeam],
  );

  const crossTeamDestinations = destinations.filter((d) => d.peerTeamId);

  const shareTo = (peerTeamId?: string) => {
    if (!activeTeamId) return;
    sendChatMessage({ kind: 'text', text: encodeShareMessage(content) }, peerTeamId ? { peerTeamId } : undefined);
    setDonePeerId(peerTeamId ?? '__own__');
  };

  const chatLink =
    donePeerId === '__own__'
      ? '/chat'
      : donePeerId
        ? `/chat/team/${donePeerId}`
        : null;

  const sheet = (
    <div className="share-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="share-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="채팅방에 공유"
      >
        <header className="share-sheet-head">
          <h2>채팅방에 공유</h2>
          <button type="button" className="share-sheet-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        {donePeerId !== null ? (
          <div className="share-sheet-done">
            <p>채팅방에 공유했어요.</p>
            {chatLink ? (
              <Link to={chatLink} className="btn btn-primary" onClick={onClose}>
                채팅방으로 이동
              </Link>
            ) : null}
            <button type="button" className="btn" onClick={onClose}>
              닫기
            </button>
          </div>
        ) : !activeTeamId ? (
          <p className="share-sheet-empty">팀에 가입하면 채팅으로 공유할 수 있어요.</p>
        ) : (
          <>
            <p className="share-sheet-sub">공유할 채팅방을 선택하세요.</p>

            <ul className="share-sheet-list">
              {destinations
                .filter((d) => !d.peerTeamId)
                .map((dest) => (
                  <li key={dest.id}>
                    <button type="button" className="share-sheet-row" onClick={() => shareTo()}>
                      {dest.cover ? <img src={dest.cover} alt="" /> : <span className="share-sheet-fallback">⌂</span>}
                      <div>
                        <strong>{dest.label}</strong>
                        <span>{dest.subtitle}</span>
                      </div>
                    </button>
                  </li>
                ))}
            </ul>

            {crossTeamDestinations.length > 0 ? (
              <>
                <h3 className="share-sheet-section">대화 중인 팀</h3>
                <ul className="share-sheet-list">
                  {crossTeamDestinations.map((dest) => (
                    <li key={dest.id}>
                      <button
                        type="button"
                        className="share-sheet-row"
                        onClick={() => shareTo(dest.peerTeamId)}
                      >
                        {dest.cover ? <img src={dest.cover} alt="" /> : <span className="share-sheet-fallback">♪</span>}
                        <div>
                          <strong>{dest.label}</strong>
                          <span>{dest.subtitle}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="share-sheet-hint">다른 팀과 대화를 시작하면 여기에도 표시돼요.</p>
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

export function FeedShareButton({
  content,
  label,
}: {
  content: SharedContent;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="feed-share-btn"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <ShareIcon />
      </button>
      {open ? <ShareContentSheet content={content} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
