import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cropVideoToFrameBlob } from '../../utils/fileMedia';
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
  onConfirm: (cropped: Blob) => void;
  onClose: () => void;
}

export function VideoCropSheet({ file, fileName, onConfirm, onClose }: VideoCropSheetProps) {
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
  const sourceUrl = useMemo(() => URL.createObjectURL(file), [file]);

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

  useEffect(() => () => URL.revokeObjectURL(sourceUrl), [sourceUrl]);

  useEffect(() => {
    openedAtRef.current = Date.now();
  }, [file]);

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
    };
    const onErr = () => {
      setError('영상을 불러오지 못했어요.');
      setLoading(false);
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onErr);
    return () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
    };
  }, [sourceUrl]);

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
    try {
      const cropped = await cropVideoToFrameBlob(file, {
        viewportWidth,
        viewportHeight,
        scale,
        offsetX,
        offsetY,
      });
      onConfirm(cropped);
    } catch (err) {
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
          피드에 올라갈 정사각형 프레임에 꽉 차도록 맞춰 주세요. 드래그하고 확대할 수 있어요.
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
            autoPlay
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
          {loading ? <div className="video-crop-loading">영상 준비 중…</div> : null}
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

        <div className="video-crop-actions">
          <button type="button" className="btn" onClick={onClose} disabled={processing}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void confirm()}
            disabled={processing || loading || !videoSize}
          >
            {processing ? '처리 중…' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
