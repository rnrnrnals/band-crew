import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { BandTeam, TeamHighlight } from '../../types';
import { useApp } from '../../state/AppContext';
import { highlightItemMediaType, STORY_MAX_VIDEO_DURATION_SEC } from '../../utils/storyUtils';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { StorySlideMedia } from './StorySlideMedia';
import './StoryViewer.css';

const IMAGE_SLIDE_MS = 4000;

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
  const [slideDurationSec, setSlideDurationSec] = useState(IMAGE_SLIDE_MS / 1000);
  const items = highlight.items;
  const item = items[itemIdx];
  const teamFeedPath = myTeamIds.includes(team.id) ? '/my' : `/team/${team.id}`;
  const mediaType = item ? highlightItemMediaType(item) : 'image';

  const goNext = useCallback(() => {
    if (itemIdx < items.length - 1) {
      setItemIdx((i) => i + 1);
      return;
    }
    onClose();
  }, [itemIdx, items.length, onClose]);

  useEffect(() => {
    if (!item || mediaType !== 'image') return;
    setSlideDurationSec(IMAGE_SLIDE_MS / 1000);
    const t = window.setTimeout(goNext, IMAGE_SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [itemIdx, item, mediaType, goNext]);

  useEffect(() => {
    if (!item || mediaType !== 'video') return;
    setSlideDurationSec(STORY_MAX_VIDEO_DURATION_SEC);
  }, [item?.id, mediaType]);

  const handleVideoDuration = useCallback((seconds: number) => {
    setSlideDurationSec(Math.min(seconds, STORY_MAX_VIDEO_DURATION_SEC));
  }, []);

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
              style={
                i === itemIdx
                  ? ({ '--story-duration': `${slideDurationSec}s` } as CSSProperties)
                  : undefined
              }
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
        <StorySlideMedia
          key={item.id}
          src={item.image}
          mediaType={mediaType}
          onVideoEnded={goNext}
          onVideoDuration={handleVideoDuration}
        />
        <button type="button" className="story-nav prev" onClick={goPrev} aria-label="이전" />
        <button type="button" className="story-nav next" onClick={goNext} aria-label="다음" />
      </div>
    </div>
  );
}
