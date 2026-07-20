import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BandTeam, TeamHighlight } from '../../types';
import { useApp } from '../../state/AppContext';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import './StoryViewer.css';

interface HighlightViewerProps {
  highlight: TeamHighlight;
  team: BandTeam;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAppend: () => void;
}

export function HighlightViewer({ highlight, team, canEdit, onClose, onEdit, onAppend }: HighlightViewerProps) {
  const { myTeamIds } = useApp();
  const [itemIdx, setItemIdx] = useState(0);
  const items = highlight.items;
  const item = items[itemIdx];
  const teamFeedPath = myTeamIds.includes(team.id) ? '/my' : `/team/${team.id}`;

  useEffect(() => {
    if (!item) return;
    const t = window.setTimeout(() => {
      if (itemIdx < items.length - 1) {
        setItemIdx((i) => i + 1);
      } else {
        onClose();
      }
    }, 4000);
    return () => window.clearTimeout(t);
  }, [itemIdx, item, items.length, onClose]);

  const goNext = () => {
    if (itemIdx < items.length - 1) {
      setItemIdx((i) => i + 1);
      return;
    }
    onClose();
  };

  const goPrev = () => {
    if (itemIdx > 0) {
      setItemIdx((i) => i - 1);
      return;
    }
    onClose();
  };

  if (!item) return null;

  return (
    <div className="story-viewer" role="dialog" onClick={onClose}>
      <div className="story-panel" onClick={(e) => e.stopPropagation()}>
        <div className="story-progress">
          {items.map((entry, i) => (
            <div
              key={entry.id}
              className={`bar ${i < itemIdx ? 'done' : ''} ${i === itemIdx ? 'active' : ''}`}
            >
              <div className="bar-fill" />
            </div>
          ))}
        </div>
        <div className="story-head">
          <ProfileAvatar src={team.cover} className="story-viewer-avatar" />
          <div>
            <Link to={teamFeedPath} className="story-head-team" onClick={onClose}>
              {highlight.title}
            </Link>
            <span>{item.caption || team.name}</span>
          </div>
          {canEdit ? (
            <>
              <button type="button" onClick={onAppend} aria-label="스토리 추가">
                ＋
              </button>
              <button type="button" onClick={onEdit} aria-label="하이라이트 수정">
                ⋯
              </button>
              <button type="button" onClick={onClose} aria-label="닫기">
                ✕
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} aria-label="닫기">
              ✕
            </button>
          )}
        </div>
        <img className="story-media" src={item.image} alt="" />
        <button type="button" className="story-nav prev" onClick={goPrev} aria-label="이전" />
        <button type="button" className="story-nav next" onClick={goNext} aria-label="다음" />
      </div>
    </div>
  );
}
