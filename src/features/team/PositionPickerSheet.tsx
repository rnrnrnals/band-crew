import { useState } from 'react';
import type { PositionId } from '../../types';
import { POSITION_LABELS, POS_ART } from '../../mock/positions';
import '../feed/FollowListSheet.css';
import '../team/TeamGate.css';
import './PositionPickerSheet.css';

const POSITIONS = Object.keys(POSITION_LABELS) as PositionId[];

interface PositionPickerSheetProps {
  current: PositionId;
  onSelect: (position: PositionId) => void;
  onClose: () => void;
}

export function PositionPickerSheet({ current, onSelect, onClose }: PositionPickerSheetProps) {
  const [selected, setSelected] = useState(current);

  return (
    <div className="follow-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="follow-sheet position-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="포지션 변경"
      >
        <header className="follow-sheet-head">
          <h2>포지션 변경</h2>
          <button type="button" className="follow-sheet-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="position-sheet-body">
          <p className="position-sheet-sub">이 팀에서 맡는 파트를 선택하세요.</p>
          <div className="pos-pick">
            {POSITIONS.map((position) => (
              <button
                key={position}
                type="button"
                className={`pos-item ${selected === position ? 'selected' : ''}`}
                onClick={() => setSelected(position)}
              >
                <span className="pos-art" dangerouslySetInnerHTML={{ __html: POS_ART[position] }} />
                <span>{POSITION_LABELS[position]}</span>
              </button>
            ))}
          </div>
        </div>

        <footer className="position-sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onSelect(selected);
              onClose();
            }}
          >
            저장
          </button>
        </footer>
      </div>
    </div>
  );
}
