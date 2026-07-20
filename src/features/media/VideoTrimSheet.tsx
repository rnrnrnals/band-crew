import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_VIDEO_DURATION_SEC,
  formatMediaTime,
  trimVideoBlob,
} from '../../utils/fileMedia';
import './VideoTrimSheet.css';

interface VideoTrimSheetProps {
  file: Blob;
  fileName?: string;
  onConfirm: (trimmed: Blob) => void;
  onClose: () => void;
}

export function VideoTrimSheet({ file, fileName, onConfirm, onClose }: VideoTrimSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startSec: number } | null>(null);
  const sourceUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [duration, setDuration] = useState(0);
  const [startSec, setStartSec] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const clipDuration = duration > 0 ? Math.min(MAX_VIDEO_DURATION_SEC, duration) : MAX_VIDEO_DURATION_SEC;
  const endSec = duration > 0 ? Math.min(startSec + clipDuration, duration) : clipDuration;
  const maxStart = Math.max(0, duration - clipDuration);
  const windowPct = duration > 0 ? (clipDuration / duration) * 100 : 100;
  const leftPct = duration > 0 ? (startSec / duration) * 100 : 0;

  useEffect(() => {
    return () => URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onMeta = () => {
      const total = video.duration;
      if (!Number.isFinite(total) || total <= 0) return;
      setDuration(total);
      setStartSec(0);
    };
    video.addEventListener('loadedmetadata', onMeta);
    return () => video.removeEventListener('loadedmetadata', onMeta);
  }, [sourceUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !duration || dragging) return;
    video.currentTime = startSec;
  }, [startSec, duration, dragging]);

  const setStartClamped = useCallback(
    (sec: number) => {
      if (!duration) return;
      const next = Math.max(0, Math.min(sec, maxStart));
      setStartSec(next);
    },
    [duration, maxStart],
  );

  const moveWindowByClientX = useCallback(
    (clientX: number, originStartSec: number, originClientX: number) => {
      const track = trackRef.current;
      if (!track || !duration) return;
      const trackWidth = track.clientWidth;
      if (trackWidth <= 0) return;
      const deltaX = clientX - originClientX;
      const deltaSec = (deltaX / trackWidth) * duration;
      setStartClamped(originStartSec + deltaSec);
    },
    [duration, setStartClamped],
  );

  const onWindowPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (processing || !duration) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startSec,
    };
    setDragging(true);
  };

  const onWindowPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    moveWindowByClientX(event.clientX, drag.startSec, drag.startX);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const confirm = async () => {
    setProcessing(true);
    setError('');
    try {
      const trimmed = await trimVideoBlob(file, startSec, endSec);
      onConfirm(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '구간을 자르지 못했어요.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="video-trim-backdrop" onClick={onClose} role="presentation">
      <div
        className="video-trim-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="영상 구간 선택"
      >
        <header className="video-trim-head">
          <h2>업로드 구간 선택</h2>
          <button type="button" className="video-trim-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <p className="video-trim-sub">
          영상이 5분을 넘어요. 밝은 구간을 좌우로 드래그해서 올릴 5분을 골라주세요.
          {fileName ? ` (${fileName})` : ''}
        </p>

        <div className="video-trim-preview">
          <video ref={videoRef} src={sourceUrl} controls playsInline preload="metadata" />
        </div>

        <p className="video-trim-range-label">
          {formatMediaTime(startSec)} ~ {formatMediaTime(endSec)} · {formatMediaTime(endSec - startSec)}
        </p>

        <div className="video-trim-timeline">
          <div ref={trackRef} className="video-trim-track">
            <div className="video-trim-track-base" aria-hidden />
            <div
              className={`video-trim-window ${dragging ? 'dragging' : ''}`}
              style={{ left: `${leftPct}%`, width: `${windowPct}%` }}
              role="slider"
              aria-label="5분 구간 위치"
              aria-valuemin={0}
              aria-valuemax={Math.round(maxStart)}
              aria-valuenow={Math.round(startSec)}
              aria-valuetext={`${formatMediaTime(startSec)}부터 ${formatMediaTime(endSec - startSec)}`}
              tabIndex={0}
              onPointerDown={onWindowPointerDown}
              onPointerMove={onWindowPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => {
                if (processing || !duration) return;
                const step = event.shiftKey ? 5 : 1;
                if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  setStartClamped(startSec - step);
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  setStartClamped(startSec + step);
                }
              }}
            >
              <div className="video-trim-window-inner">
                <span className="video-trim-window-label">5:00</span>
              </div>
            </div>
          </div>
          <div className="video-trim-track-times">
            <span>0:00</span>
            <span>{duration ? formatMediaTime(duration) : '—'}</span>
          </div>
          <p className="video-trim-hint">밝은 구간을 터치한 채 좌우로 밀어 위치를 조절하세요.</p>
        </div>

        {error && <p className="video-trim-error">{error}</p>}

        <div className="video-trim-actions">
          <button type="button" className="btn" onClick={onClose} disabled={processing}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={processing || endSec <= startSec}
            onClick={() => void confirm()}
          >
            {processing ? '구간 처리 중…' : '이 구간 올리기'}
          </button>
        </div>
      </div>
    </div>
  );
}
