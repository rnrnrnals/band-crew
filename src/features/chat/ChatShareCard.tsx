import { Link } from 'react-router-dom';
import type { SharedContent } from '../../utils/contentShare';
import './ChatShareCard.css';

function formatDuration(sec?: number): string {
  if (sec == null || !Number.isFinite(sec)) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ChatShareCard({ content }: { content: SharedContent }) {
  if (content.type === 'post') {
    return (
      <Link to={`/team/${content.teamId}`} className="chat-share-card">
        {content.mediaUrl && content.mediaType !== 'text' ? (
          <div className="chat-share-thumb">
            {content.mediaType === 'video' ? (
              <video src={content.mediaUrl} muted playsInline preload="metadata" />
            ) : (
              <img src={content.mediaUrl} alt="" />
            )}
          </div>
        ) : null}
        <div className="chat-share-body">
          <span className="chat-share-kind">피드 공유</span>
          <strong>{content.teamName}</strong>
          <p>{content.caption || '게시물'}</p>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/team/${content.teamId}`} className="chat-share-card">
      {content.coverImage ? (
        <div className="chat-share-thumb">
          <img src={content.coverImage} alt="" />
        </div>
      ) : (
        <div className="chat-share-thumb chat-share-thumb-audio" aria-hidden>
          🎙
        </div>
      )}
      <div className="chat-share-body">
        <span className="chat-share-kind">사운드 공유</span>
        <strong>{content.title}</strong>
        <p>
          {content.teamName}
          {content.caption ? ` · ${content.caption}` : ''}
          {content.durationSec != null ? ` · ${formatDuration(content.durationSec)}` : ''}
        </p>
      </div>
    </Link>
  );
}
