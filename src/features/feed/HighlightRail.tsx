import { useMemo } from 'react';
import { useApp } from '../../state/AppContext';
import './HighlightRail.css';

interface HighlightRailProps {
  teamId: string;
  canEdit: boolean;
  onOpen: (highlightId: string) => void;
  onCreate: () => void;
  onAppend: (highlightId: string) => void;
}

export function HighlightRail({ teamId, canEdit, onOpen, onCreate, onAppend }: HighlightRailProps) {
  const { highlights } = useApp();
  const teamHighlights = useMemo(
    () =>
      highlights
        .filter((h) => h.teamId === teamId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [highlights, teamId],
  );

  if (!canEdit && teamHighlights.length === 0) return null;

  return (
    <section className="highlight-rail-wrap" aria-label="하이라이트">
      <div className="highlight-rail">
        {canEdit && (
          <button type="button" className="highlight-chip highlight-chip-new" onClick={onCreate}>
            <span className="highlight-ring highlight-ring-new">
              <span className="highlight-plus">+</span>
            </span>
            <span className="highlight-name">새로 만들기</span>
          </button>
        )}
        {teamHighlights.map((highlight) => (
          <button
            key={highlight.id}
            type="button"
            className="highlight-chip"
            onClick={() => onOpen(highlight.id)}
            onContextMenu={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              onAppend(highlight.id);
            }}
          >
            <span className="highlight-ring">
              <img src={highlight.coverImage} alt="" />
            </span>
            <span className="highlight-name">{highlight.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
