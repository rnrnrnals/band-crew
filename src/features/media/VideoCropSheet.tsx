import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MediaProgressPanel } from '../../components/MediaProgressPanel';
import { cropVideoToFrameBlob, type VideoCompressProfile } from '../../utils/fileMedia';
import { clampProgress } from '../../utils/mediaProgress';
import { remuxVideoToMp4 } from '../../utils/videoTranscode';
import {
  POST_VIDEO_FRAME_RATIO,
  clampPanFrame,
  coverScaleFrame,
  initialPanFrame,
} from '../../utils/videoFrameCrop';
import './VideoCropSheet.css';

interface VideoCropSheetProps {
  file: File;
  fileName?: string;
  description?: string;
  onConfirm: (cropped: Blob) => void;
  onClose: () => void;
  /** Called when the video still can't be loaded/cropped in this browser
   * after the remux fallback and the caller wants to offer uploading the
   * (possibly already-remuxed) file as-is instead of hard-blocking. */
  onSkip?: (blob: Blob) => void;
  /** Feed keeps 900×900 + higher video bitrate; practice shrinks video and
   * keeps audio at 128kbps. */
  compressProfile?: VideoCompressProfile;
}

export function VideoCropSheet({
  file,
  fileName,
  description = '피드에 올라갈 정사각형 프레임에 꽉 차도록 맞춰 주세요. 드래그하고 확대할 수 있어요.',
  onConfirm,
  onClose,
  onSkip,
  compressProfile = 'feed',
}: VideoCropSheetProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const openedAtRef = useRef(Date.now());
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const remuxAttemptedRef = useRef(false);
  const [remuxedBlob, setRemuxedBlob] = useState<Blob | null>(null);
  const [transcoding, setTranscoding] = useState(false);
  const effectiveBlob: Blob = remuxedBlob ?? file;
  const sourceUrl = useMemo(() => URL.createObjectURL(effectiveBlob), [effectiveBlob]);

  const [viewportWidth, setViewportWidth] = useState(280);
  const [viewportHeight, setViewportHeight] = useState(Math.round(280 / POST_VIDEO_FRAME_RATIO));
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [minScale, setMinScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobProgress, setJobProgress] = useState<{
    label: string;
    progress: number;
    startedAt: number;
  } | null>(null);
  const jobStartedRef = useRef(0);

  const reportJob = useCallback((label: string, progress: number) => {
    if (jobStartedRef.current === 0) jobStartedRef.current = performance.now();
    setJobProgress({
      label,
      progress: clampProgress(progress),
      startedAt: jobStartedRef.current,
    });
  }, []);

  const clearJob = useCallback(() => {
    jobStartedRef.current = 0;
    setJobProgress(null);
  }, []);

  useEffect(() => () => URL.revokeObjectURL(sourceUrl), [sourceUrl]);

  useEffect(() => {
    openedAtRef.current = Date.now();
    remuxAttemptedRef.current = false;
    setRemuxedBlob(null);
    clearJob();
  }, [file, clearJob]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const sync = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const h = Math.round(w / POST_VIDEO_FRAME_RATIO);
      setViewportWidth(w);
      setViewportHeight(h);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setLoading(true);
    setVideoSize(null);
    setError('');
    clearJob();
    const onMeta = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w <= 0 || h <= 0) {
        setError('영상 정보를 불러오지 못했어요.');
        setLoading(false);
        return;
      }
      setVideoSize({ w, h });
      setLoading(false);
      clearJob();
      // Start the preview loop only once metadata is confirmed, instead of
      // the `autoplay` attribute racing decode against metadata parsing —
      // some mobile browsers error out on large/high-res clips when both
      // happen at once even though the file is perfectly playable.
      video.play().catch(() => {
        /* preview autoplay is best-effort; cropping doesn't depend on it */
      });
    };
    const showLoadError = () => {
      const code = video.error?.code;
      const isQuickTime =
        effectiveBlob.type === 'video/quicktime' || /\.mov$/i.test(file.name);
      if (code === 4 && isQuickTime) {
        setError(
          '이 영상은 아이폰 전용 형식(.mov)이라 이 기기(브라우저)에서 처리할 수 없어요. ' +
            '아이폰의 사진 앱에서 이 영상을 카카오톡·메일 등으로 한 번 공유했다가 다시 저장한 뒤 그 파일로 올려보세요 — 보통 자동으로 mp4로 바뀌어요.',
        );
      } else {
        const reason =
          code === 1
            ? '읽기가 중단됐어요'
            : code === 2
              ? '네트워크 오류'
              : code === 3
                ? '디코딩 실패'
                : code === 4
                  ? '이 브라우저가 지원하지 않는 형식'
                  : '알 수 없는 오류';
        const sizeMb = (effectiveBlob.size / (1024 * 1024)).toFixed(1);
        setError(
          `영상을 불러오지 못했어요. (${reason} · code ${code ?? '?'} · ${effectiveBlob.type || '타입 없음'} · ${sizeMb}MB)`,
        );
      }
      setLoading(false);
    };
    const onErr = () => {
      if (remuxAttemptedRef.current) {
        showLoadError();
        return;
      }
      remuxAttemptedRef.current = true;
      setTranscoding(true);
      reportJob('호환 형식으로 변환 중…', 0);
      void remuxVideoToMp4(file, (update) => {
        reportJob(update.label ?? '호환 형식으로 변환 중…', update.progress);
      })
        .then((blob) => {
          setTranscoding(false);
          setRemuxedBlob(blob);
          clearJob();
        })
        .catch(() => {
          setTranscoding(false);
          clearJob();
          showLoadError();
        });
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onErr);
    return () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
    };
  }, [sourceUrl, file, effectiveBlob, clearJob, reportJob]);

  useEffect(() => {
    if (!videoSize || viewportWidth <= 0 || viewportHeight <= 0) return;
    const nextMinScale = coverScaleFrame(viewportWidth, viewportHeight, videoSize.w, videoSize.h);
    const pan = initialPanFrame(viewportWidth, viewportHeight, videoSize.w, videoSize.h, nextMinScale);
    setMinScale(nextMinScale);
    setScale(nextMinScale);
    setOffsetX(pan.offsetX);
    setOffsetY(pan.offsetY);
  }, [viewportWidth, viewportHeight, videoSize]);

  const applyPan = useCallback(
    (nextX: number, nextY: number, nextScale = scale) => {
      if (!videoSize) return;
      const clamped = clampPanFrame(
        viewportWidth,
        viewportHeight,
        videoSize.w,
        videoSize.h,
        nextScale,
        nextX,
        nextY,
      );
      setOffsetX(clamped.offsetX);
      setOffsetY(clamped.offsetY);
    },
    [scale, videoSize, viewportHeight, viewportWidth],
  );

  const applyScale = useCallback(
    (nextScale: number) => {
      if (!videoSize) return;
      const clampedScale = Math.max(minScale, Math.min(minScale * 3, nextScale));
      const centerX = viewportWidth / 2;
      const centerY = viewportHeight / 2;
      const videoX = (centerX - offsetX) / scale;
      const videoY = (centerY - offsetY) / scale;
      const nextOffsetX = centerX - videoX * clampedScale;
      const nextOffsetY = centerY - videoY * clampedScale;
      setScale(clampedScale);
      applyPan(nextOffsetX, nextOffsetY, clampedScale);
    },
    [applyPan, minScale, offsetX, offsetY, scale, videoSize, viewportHeight, viewportWidth],
  );

  const onViewportPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (processing || loading || !videoSize) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offsetX,
      originY: offsetY,
    };
    setDragging(true);
  };

  const onViewportPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    applyPan(
      drag.originX + (event.clientX - drag.startX),
      drag.originY + (event.clientY - drag.startY),
    );
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const tryClose = () => {
    if (Date.now() - openedAtRef.current < 400) return;
    onClose();
  };

  const confirm = async () => {
    if (!videoSize || processing) return;
    setProcessing(true);
    setError('');
    jobStartedRef.current = performance.now();
    reportJob('영상 압축 준비 중…', 0);
    try {
      const cropped = await cropVideoToFrameBlob(
        effectiveBlob,
        {
          viewportWidth,
          viewportHeight,
          scale,
          offsetX,
          offsetY,
        },
        compressProfile,
        (update) => {
          reportJob(update.label ?? '영상 압축 중…', update.progress);
        },
      );
      clearJob();
      onConfirm(cropped);
    } catch (err) {
      clearJob();
      setError(err instanceof Error ? err.message : '영상을 자르지 못했어요.');
    } finally {
      setProcessing(false);
    }
  };

  const zoomPct = minScale > 0 ? Math.round(((scale - minScale) / (minScale * 2)) * 100) : 0;

  const sheet = (
    <div className="video-crop-backdrop" onClick={tryClose} role="presentation">
      <div
        className="video-crop-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="영상 프레임 맞추기"
      >
        <header className="video-crop-head">
          <h2>영상 프레임 맞추기</h2>
          <button type="button" className="video-crop-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <p className="video-crop-sub">
          {description}
          {fileName ? ` (${fileName})` : ''}
        </p>

        <div
          ref={viewportRef}
          className={`video-crop-viewport${dragging ? ' dragging' : ''}`}
          onPointerDown={onViewportPointerDown}
          onPointerMove={onViewportPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <video
            ref={videoRef}
            src={sourceUrl}
            className="video-crop-video"
            playsInline
            muted
            loop
            preload="metadata"
            style={
              videoSize
                ? {
                    width: videoSize.w * scale,
                    height: videoSize.h * scale,
                    transform: `translate(${offsetX}px, ${offsetY}px)`,
                  }
                : undefined
            }
          />
          {loading && !jobProgress ? (
            <div className="video-crop-loading">
              {transcoding ? '이 형식을 변환하는 중… (처음엔 시간이 걸려요)' : '영상 준비 중…'}
            </div>
          ) : null}
          <div className="video-crop-frame" aria-hidden />
        </div>

        <div className="video-crop-zoom">
          <label htmlFor="video-crop-zoom">확대</label>
          <input
            id="video-crop-zoom"
            type="range"
            min={0}
            max={100}
            value={zoomPct}
            disabled={!videoSize || processing || loading}
            onChange={(event) =>
              applyScale(minScale + (Number(event.target.value) / 100) * minScale * 2)
            }
          />
        </div>

        {error ? <p className="video-crop-error">{error}</p> : null}

        {jobProgress ? (
          <div className="video-crop-progress">
            <MediaProgressPanel
              label={jobProgress.label}
              progress={jobProgress.progress}
              startedAt={jobProgress.startedAt}
            />
          </div>
        ) : null}

        <div className="video-crop-actions">
          <button type="button" className="btn" onClick={onClose} disabled={processing}>
            취소
          </button>
          {error && onSkip ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSkip(effectiveBlob)}
              disabled={processing}
            >
              크롭 없이 올리기
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void confirm()}
              disabled={processing || loading || !videoSize}
            >
              {processing ? '압축 중…' : '적용'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
