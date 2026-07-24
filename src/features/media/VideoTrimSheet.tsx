import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatMediaTime,
  MAX_VIDEO_DURATION_SEC,
  trimVideoBlob,
} from '../../utils/fileMedia';
import './VideoTrimSheet.css';

export type VideoClipSelection = {
  file: Blob;
  startSec: number;
  endSec: number;
};

interface VideoTrimSheetProps {
  file: Blob;
  fileName?: string;
  maxDurationSec?: number;
  /** true면 confirm에서 재인코딩 없이 구간만 전달 (스토리 편집 화면으로 이동) */
  deferTrim?: boolean;
  onConfirm: (result: Blob | VideoClipSelection) => void;
  onClose: () => void;
}

function seekVideoTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.max(0, timeSec);
    if (Math.abs(video.currentTime - target) < 0.05) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      window.clearTimeout(fallbackTimer);
      resolve();
    };

    const onSeeked = () => finish();
    const fallbackTimer = window.setTimeout(finish, 800);

    video.addEventListener('seeked', onSeeked);
    try {
      video.currentTime = target;
    } catch {
      finish();
    }
  });
}

function waitForPlayableAtTime(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = Math.max(0, timeSec);
    let settled = false;

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      window.clearTimeout(fallbackTimer);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('video load failed'));
    };

    const isReady = () =>
      Math.abs(video.currentTime - target) < 0.12 &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      !video.error;

    const onSeeked = () => {
      if (isReady()) finish();
    };

    const onCanPlay = () => {
      if (isReady()) finish();
    };

    const onError = () => fail();
    const fallbackTimer = window.setTimeout(finish, 2500);

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    if (isReady()) {
      finish();
      return;
    }

    void seekVideoTo(video, target).then(() => {
      if (isReady()) finish();
    });
  });
}

function inferVideoMimeType(file: Blob, fileName?: string): string {
  if (file.type.startsWith('video/')) return file.type;
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mkv') return 'video/x-matroska';
  return 'video/mp4';
}

export function VideoTrimSheet({
  file,
  fileName,
  maxDurationSec = MAX_VIDEO_DURATION_SEC,
  deferTrim = false,
  onConfirm,
  onClose,
}: VideoTrimSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startSec: number } | null>(null);
  const clipBoundsRef = useRef({ start: 0, end: maxDurationSec });
  const previewRequestRef = useRef(0);
  const sourceUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const videoMimeType = useMemo(() => inferVideoMimeType(file, fileName), [file, fileName]);
  const [duration, setDuration] = useState(0);
  const [startSec, setStartSec] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const clipDuration = duration > 0 ? Math.min(maxDurationSec, duration) : maxDurationSec;
  const endSec = duration > 0 ? Math.min(startSec + clipDuration, duration) : clipDuration;
  const maxStart = Math.max(0, duration - clipDuration);
  const windowPct = duration > 0 ? (clipDuration / duration) * 100 : 100;
  const leftPct = duration > 0 ? (startSec / duration) * 100 : 0;
  const clipLabel = formatMediaTime(maxDurationSec);

  const updateClipBounds = useCallback(
    (start: number) => {
      const nextStart = Math.max(0, Math.min(start, maxStart));
      const nextEnd = duration > 0 ? Math.min(nextStart + clipDuration, duration) : nextStart + clipDuration;
      clipBoundsRef.current = { start: nextStart, end: nextEnd };
      setStartSec(nextStart);
      return nextStart;
    },
    [clipDuration, duration, maxStart],
  );

  const snapVideoToClipStart = useCallback(
    (start: number, options?: { pause?: boolean }) => {
      const video = videoRef.current;
      const nextStart = updateClipBounds(start);
      if (!video || !duration || processing) return nextStart;

      previewRequestRef.current += 1;
      if (options?.pause !== false) {
        video.pause();
        setPreviewPlaying(false);
      }
      void seekVideoTo(video, nextStart);
      return nextStart;
    },
    [duration, processing, updateClipBounds],
  );

  const startPreviewPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !duration || processing || previewLoading) return;

    const { start } = clipBoundsRef.current;
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setError('');
    setPreviewLoading(true);

    video.muted = true;
    video.playsInline = true;

    const playAtClipStart = async () => {
      if (previewRequestRef.current !== requestId) return;

      try {
        await waitForPlayableAtTime(video, start);
        if (previewRequestRef.current !== requestId) return;

        const playResult = video.play();
        if (!playResult) {
          setPreviewPlaying(!video.paused);
          return;
        }

        await playResult;
        if (previewRequestRef.current !== requestId) return;
        setPreviewPlaying(true);
      } catch {
        if (previewRequestRef.current !== requestId) return;
        setPreviewPlaying(false);
        setError('미리보기를 재생할 수 없어요. 잠시 후 다시 시도해주세요.');
      } finally {
        if (previewRequestRef.current === requestId) {
          setPreviewLoading(false);
        }
      }
    };

    // iOS 등: 사용자 탭 직후 play()로 재생 권한을 확보한 뒤 구간으로 이동
    const unlock = video.play();
    if (unlock) {
      unlock
        .then(() => {
          video.pause();
          void playAtClipStart();
        })
        .catch(() => {
          void playAtClipStart();
        });
    } else {
      void playAtClipStart();
    }
  }, [duration, processing, previewLoading]);

  const stopPreviewPlayback = useCallback(() => {
    previewRequestRef.current += 1;
    const video = videoRef.current;
    video?.pause();
    setPreviewPlaying(false);
    setPreviewLoading(false);
  }, []);

  const togglePreviewPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !duration || processing) return;
    if (previewLoading || (!video.paused && previewPlaying)) {
      stopPreviewPlayback();
      return;
    }
    startPreviewPlayback();
  }, [duration, previewLoading, previewPlaying, processing, startPreviewPlayback, stopPreviewPlayback]);

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
      snapVideoToClipStart(0);
    };

    video.addEventListener('loadedmetadata', onMeta);
    if (video.readyState >= 1) onMeta();

    return () => video.removeEventListener('loadedmetadata', onMeta);
  }, [sourceUrl, snapVideoToClipStart]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !duration || processing) return;

    const onPlay = () => setPreviewPlaying(true);
    const onPause = () => setPreviewPlaying(false);

    const onTimeUpdate = () => {
      if (video.paused) return;
      const { start, end } = clipBoundsRef.current;
      if (video.currentTime >= end - 0.05) {
        void seekVideoTo(video, start).then(() => {
          if (!video.paused) {
            void video.play().catch(() => stopPreviewPlayback());
          }
        });
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [duration, processing, sourceUrl]);

  const setStartClamped = useCallback(
    (sec: number) => {
      if (!duration) return;
      snapVideoToClipStart(sec);
    },
    [duration, snapVideoToClipStart],
  );

  const moveWindowByClientX = useCallback(
    (clientX: number, originStartSec: number, originClientX: number) => {
      const track = trackRef.current;
      if (!track || !duration) return;
      const trackWidth = track.clientWidth;
      if (trackWidth <= 0) return;
      const deltaX = clientX - originClientX;
      const deltaSec = (deltaX / trackWidth) * duration;
      updateClipBounds(originStartSec + deltaSec);
    },
    [duration, updateClipBounds],
  );

  const onWindowPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (processing || !duration) return;
    event.preventDefault();
    stopPreviewPlayback();
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
    snapVideoToClipStart(clipBoundsRef.current.start);
  };

  const confirm = async () => {
    const { start, end } = clipBoundsRef.current;

    if (deferTrim) {
      onConfirm({ file, startSec: start, endSec: end });
      return;
    }

    stopPreviewPlayback();
    setProcessing(true);
    setError('');
    try {
      const trimmed = await trimVideoBlob(file, start, end, undefined, maxDurationSec);
      onConfirm(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : '구간을 자르지 못했어요.');
    } finally {
      setProcessing(false);
    }
  };

  const limitLabel =
    maxDurationSec >= 60 && maxDurationSec % 60 === 0
      ? `${maxDurationSec / 60}분`
      : formatMediaTime(maxDurationSec);

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
          영상이 {limitLabel}을 넘어요. 밝은 구간을 좌우로 드래그해서 올릴 {limitLabel}을 골라주세요.
          {fileName ? ` (${fileName})` : ''}
        </p>

        <div className="video-trim-preview">
          <video
            ref={videoRef}
            playsInline
            preload="auto"
            muted
            onClick={togglePreviewPlayback}
          >
            <source src={sourceUrl} type={videoMimeType} />
          </video>
          <button
            type="button"
            className="video-trim-play-btn"
            onClick={togglePreviewPlayback}
            disabled={processing || previewLoading || !duration}
            aria-label={previewPlaying ? '일시정지' : previewLoading ? '미리보기 준비 중' : '선택 구간 재생'}
          >
            {previewLoading ? '…' : previewPlaying ? '⏸' : '▶'}
          </button>
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
              aria-label={`${clipLabel} 구간 위치`}
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
                <span className="video-trim-window-label">{clipLabel}</span>
              </div>
            </div>
          </div>
          <div className="video-trim-track-times">
            <span>0:00</span>
            <span>{duration ? formatMediaTime(duration) : '—'}</span>
          </div>
          <p className="video-trim-hint">
            구간을 옮긴 뒤 ▶ 버튼으로 선택한 {limitLabel}을 확인하세요.
          </p>
        </div>

        {error && <p className="video-trim-error">{error}</p>}

        <div className="video-trim-actions">
          <button type="button" className="video-trim-btn" onClick={onClose} disabled={processing}>
            취소
          </button>
          <button
            type="button"
            className="video-trim-btn video-trim-btn-primary"
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
