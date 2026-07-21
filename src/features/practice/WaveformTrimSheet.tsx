import { useCallback, useEffect, useRef, useState } from 'react';
import type { JamTrack } from './jamUtils';
import { drawWaveform } from './jamUtils';
import { formatMediaTime } from '../../utils/fileMedia';
import './WaveformTrimSheet.css';

const MIN_CLIP_SEC = 0.05;

interface WaveformTrimSheetProps {
  track: JamTrack;
  onConfirm: (trimStartSec: number, trimEndSec: number) => void;
  onClose: () => void;
}

export function WaveformTrimSheet({ track, onConfirm, onClose }: WaveformTrimSheetProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    kind: 'start' | 'end';
    originX: number;
    originStart: number;
    originEnd: number;
  } | null>(null);

  const duration = Math.max(track.duration || 0, MIN_CLIP_SEC);
  const initialStart = Math.min(track.trimStartSec ?? 0, duration - MIN_CLIP_SEC);
  const initialEnd = Math.max(
    initialStart + MIN_CLIP_SEC,
    duration - (track.trimEndSec ?? 0),
  );

  const [startSec, setStartSec] = useState(initialStart);
  const [endSec, setEndSec] = useState(initialEnd);
  const [dragging, setDragging] = useState(false);

  const startPct = (startSec / duration) * 100;
  const endPct = (endSec / duration) * 100;

  const paintWaveform = useCallback(() => {
    drawWaveform(canvasRef.current, track.peaks, track.color, null);
  }, [track.color, track.peaks]);

  useEffect(() => {
    const frame = requestAnimationFrame(paintWaveform);
    return () => cancelAnimationFrame(frame);
  }, [paintWaveform, startSec, endSec]);

  useEffect(() => {
    const onResize = () => paintWaveform();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paintWaveform]);

  const secFromClientX = useCallback(
    (clientX: number) => {
      const trackEl = trackRef.current;
      if (!trackEl) return 0;
      const rect = trackEl.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const beginDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    kind: 'start' | 'end',
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      kind,
      originX: event.clientX,
      originStart: startSec,
      originEnd: endSec,
    };
    setDragging(true);
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const sec = secFromClientX(event.clientX);
    if (drag.kind === 'start') {
      setStartSec(Math.max(0, Math.min(sec, drag.originEnd - MIN_CLIP_SEC)));
      return;
    }
    setEndSec(Math.max(drag.originStart + MIN_CLIP_SEC, Math.min(duration, sec)));
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const confirm = () => {
    onConfirm(startSec, Math.max(0, duration - endSec));
  };

  return (
    <div className="wave-trim-backdrop" onClick={onClose} role="presentation">
      <div
        className="wave-trim-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="파형 구간 자르기"
      >
        <header className="wave-trim-head">
          <h2>파형 구간 자르기</h2>
          <button type="button" className="wave-trim-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <p className="wave-trim-sub">
          {track.name} · 양쪽 핸들을 드래그해서 앞뒤를 자르세요. (최소 {MIN_CLIP_SEC * 1000}
          ms)
        </p>

        <p className="wave-trim-range-label">
          {formatMediaTime(startSec)} ~ {formatMediaTime(endSec)} ·{' '}
          {formatMediaTime(endSec - startSec)}
        </p>

        <div className="wave-trim-timeline">
          <div ref={trackRef} className={`wave-trim-track ${dragging ? 'dragging' : ''}`}>
            <canvas ref={canvasRef} className="wave-trim-canvas" aria-hidden />
            <div className="wave-trim-dim wave-trim-dim-left" style={{ width: `${startPct}%` }} />
            <div
              className="wave-trim-dim wave-trim-dim-right"
              style={{ left: `${endPct}%`, width: `${100 - endPct}%` }}
            />
            <div
              className="wave-trim-selection"
              style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
            />
            <button
              type="button"
              className="wave-trim-handle wave-trim-handle-start"
              style={{ left: `${startPct}%` }}
              aria-label="앞부분 자르기"
              onPointerDown={(event) => beginDrag(event, 'start')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
            <button
              type="button"
              className="wave-trim-handle wave-trim-handle-end"
              style={{ left: `${endPct}%` }}
              aria-label="뒷부분 자르기"
              onPointerDown={(event) => beginDrag(event, 'end')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          </div>
          <div className="wave-trim-track-times">
            <span>0:00</span>
            <span>{formatMediaTime(duration)}</span>
          </div>
          <p className="wave-trim-hint">파형 위 핸들을 터치한 채 좌우로 밀어 구간을 조절하세요.</p>
        </div>

        <div className="wave-trim-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm}>
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
