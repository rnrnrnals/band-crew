import { useEffect, useRef } from 'react';
import type { PositionId } from '../../types';
import type { MediaKind } from './jamUtils';
import { drawWaveform } from './jamUtils';
import { formatMediaTime } from '../../utils/fileMedia';
import './RecordPreviewSheet.css';

export interface RecordPreviewData {
  blobUrl: string;
  kind: MediaKind;
  positionId: PositionId;
  positionLabel: string;
  name: string;
  color: string;
  peaks: number[];
  duration: number;
}

interface RecordPreviewSheetProps {
  preview: RecordPreviewData;
  onConfirm: () => void;
  onDiscard: () => void;
}

export function RecordPreviewSheet({ preview, onConfirm, onDiscard }: RecordPreviewSheetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (preview.kind === 'video') return;
    const paint = () => drawWaveform(canvasRef.current, preview.peaks, preview.color, null);
    const frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [preview.color, preview.kind, preview.peaks]);

  return (
    <div className="record-preview-backdrop" role="presentation">
      <div
        className="record-preview-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="녹음 확인"
      >
        <header className="record-preview-head">
          <h2>녹음 확인</h2>
        </header>

        <p className="record-preview-sub">
          {preview.positionLabel} · {preview.name}
          {preview.duration > 0 ? ` · ${formatMediaTime(preview.duration)}` : ''}
        </p>

        <div className="record-preview-player">
          {preview.kind === 'video' ? (
            <video src={preview.blobUrl} controls playsInline preload="metadata" />
          ) : (
            <>
              <canvas ref={canvasRef} className="record-preview-wave" aria-hidden />
              <audio src={preview.blobUrl} controls preload="metadata" />
            </>
          )}
        </div>

        <p className="record-preview-hint">들어보고 세션에 올릴지 선택하세요.</p>

        <div className="record-preview-actions">
          <button type="button" className="btn" onClick={onDiscard}>
            버리기
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            세션에 올리기
          </button>
        </div>
      </div>
    </div>
  );
}
