import { useEffect, useMemo, useState } from 'react';
import type { TeamHighlight } from '../../types';
import { useApp } from '../../state/AppContext';
import { useConfirm } from '../../components/ConfirmDialog';
import { getHighlightStoryId, isStoryInHighlight } from '../../utils/highlightUtils';
import './HighlightEditorSheet.css';

interface HighlightEditorSheetProps {
  teamId: string;
  highlight?: TeamHighlight;
  mode?: 'create' | 'edit' | 'append';
  onClose: () => void;
}

export function HighlightEditorSheet({
  teamId,
  highlight,
  mode = highlight ? 'edit' : 'create',
  onClose,
}: HighlightEditorSheetProps) {
  const { stories, createHighlight, updateHighlight, appendStoriesToHighlight, deleteHighlight } =
    useApp();
  const confirm = useConfirm();
  const [title, setTitle] = useState(highlight?.title ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (!highlight || mode === 'append') return [];
    return highlight.items
      .map((item) => getHighlightStoryId(item))
      .filter((id): id is string => !!id && stories.some((s) => s.id === id));
  });
  const [error, setError] = useState('');

  const teamStories = useMemo(
    () =>
      stories
        .filter((s) => s.teamId === teamId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [stories, teamId],
  );

  const pickableStories = useMemo(() => {
    if (mode === 'append' && highlight) {
      return teamStories.filter((story) => !isStoryInHighlight(highlight, story.id));
    }
    return teamStories;
  }, [mode, highlight, teamStories]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const toggleStory = (storyId: string) => {
    setSelectedIds((prev) =>
      prev.includes(storyId) ? prev.filter((id) => id !== storyId) : [...prev, storyId],
    );
  };

  const save = () => {
    if (mode === 'append' && highlight) {
      if (selectedIds.length === 0) {
        setError('추가할 스토리를 선택해주세요.');
        return;
      }
      appendStoriesToHighlight(highlight.id, selectedIds);
      onClose();
      return;
    }

    const trimmed = title.trim();
    if (!trimmed) {
      setError('하이라이트 이름을 입력해주세요.');
      return;
    }
    if (selectedIds.length === 0) {
      setError('스토리를 하나 이상 선택해주세요.');
      return;
    }
    if (highlight) {
      updateHighlight(highlight.id, { title: trimmed, storyIds: selectedIds });
    } else {
      createHighlight(teamId, trimmed, selectedIds);
    }
    onClose();
  };

  const remove = async () => {
    if (!highlight) return;
    if (!(await confirm('삭제하시겠습니까?'))) return;
    deleteHighlight(highlight.id);
    onClose();
  };

  const sheetTitle =
    mode === 'append' ? `${highlight?.title ?? '하이라이트'}에 추가` : highlight ? '하이라이트 수정' : '하이라이트 만들기';

  const saveLabel = mode === 'append' ? '추가' : '저장';

  return (
    <div className="highlight-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="highlight-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={sheetTitle}
      >
        <header className="highlight-sheet-head">
          <h2>{sheetTitle}</h2>
          <button type="button" className="highlight-sheet-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="highlight-sheet-body">
          {mode !== 'append' && (
            <div className="field">
              <label>이름</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 합주, 공연, 버스킹"
                maxLength={12}
              />
            </div>
          )}

          {mode === 'append' && highlight && highlight.items.length > 0 && (
            <>
              <p className="highlight-sheet-label">담긴 스토리 {highlight.items.length}개</p>
              <div className="highlight-story-pick highlight-story-pick-saved">
                {highlight.items.map((item) => (
                  <div key={item.id} className="highlight-story-item saved">
                    <img src={item.image} alt="" />
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="highlight-sheet-label">
            {mode === 'append' ? '추가할 스토리' : '스토리 선택'}
          </p>
          {pickableStories.length > 0 ? (
            <div className="highlight-story-pick">
              {pickableStories.map((story) => {
                const selected = selectedIds.includes(story.id);
                return (
                  <button
                    key={story.id}
                    type="button"
                    className={`highlight-story-item ${selected ? 'selected' : ''}`}
                    onClick={() => toggleStory(story.id)}
                  >
                    <img src={story.image} alt="" />
                    {selected && <span className="highlight-story-check">✓</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="highlight-sheet-empty">
              {mode === 'append'
                ? '추가할 수 있는 새 스토리가 없어요. 스토리를 올린 뒤 다시 시도해 주세요.'
                : '올린 스토리가 없어요. 스토리를 올린 뒤 하이라이트에 담을 수 있어요.'}
            </p>
          )}

          {error && <p className="highlight-sheet-error">{error}</p>}
        </div>

        <footer className="highlight-sheet-foot">
          {highlight && mode === 'edit' && (
            <button type="button" className="btn highlight-sheet-delete" onClick={remove}>
              삭제
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={save}>
            {saveLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
