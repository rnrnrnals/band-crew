import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { compressImageBlob, readFileAsDataUrl } from '../../utils/fileMedia';
import {
  clampPan,
  coverScale,
  cropSquareImageFile,
  initialPan,
  loadImageFromFile,
} from '../../utils/squareImageCrop';
import './SquareImageCropSheet.css';

interface SquareImageCropSheetProps {
  file: File;
  onConfirm: (dataUrl: string) => void;
  onClose: () => void;
  heading?: string;
}

export function SquareImageCropSheet({
  file,
  onConfirm,
  onClose,
  heading = '사진 자르기',
}: SquareImageCropSheetProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef(Date.now());
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );
  const [viewportSize, setViewportSize] = useState(280);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [minScale, setMinScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    openedAtRef.current = Date.now();
  }, [file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const sync = () => {
      const w = el.clientWidth;
      if (w > 0) setViewportSize(w);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!imageSize || viewportSize <= 0) return;
    const nextMinScale = coverScale(viewportSize, imageSize.w, imageSize.h);
    const pan = initialPan(viewportSize, imageSize.w, imageSize.h, nextMinScale);
    setMinScale(nextMinScale);
    setScale(nextMinScale);
    setOffsetX(pan.offsetX);
    setOffsetY(pan.offsetY);
  }, [viewportSize, imageSize]);

  useEffect(() => {
    let cancelled = false;
    setImageSize(null);
    setError('');
    void (async () => {
      try {
        const image = await loadImageFromFile(file);
        if (cancelled) return;
        setImageSize({
          w: image.naturalWidth || image.width,
          h: image.naturalHeight || image.height,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '이미지를 불러오지 못했어요.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const applyPan = useCallback(
    (nextX: number, nextY: number, nextScale = scale) => {
      if (!imageSize) return;
      const clamped = clampPan(viewportSize, imageSize.w, imageSize.h, nextScale, nextX, nextY);
      setOffsetX(clamped.offsetX);
      setOffsetY(clamped.offsetY);
    },
    [imageSize, scale, viewportSize],
  );

  const applyScale = useCallback(
    (nextScale: number) => {
      if (!imageSize) return;
      const clampedScale = Math.max(minScale, Math.min(minScale * 3, nextScale));
      const centerX = viewportSize / 2;
      const centerY = viewportSize / 2;
      const imageX = (centerX - offsetX) / scale;
      const imageY = (centerY - offsetY) / scale;
      const nextOffsetX = centerX - imageX * clampedScale;
      const nextOffsetY = centerY - imageY * clampedScale;
      setScale(clampedScale);
      applyPan(nextOffsetX, nextOffsetY, clampedScale);
    },
    [applyPan, imageSize, minScale, offsetX, offsetY, scale, viewportSize],
  );

  const onViewportPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (processing || !imageSize) return;
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
    applyPan(drag.originX + (event.clientX - drag.startX), drag.originY + (event.clientY - drag.startY));
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
    if (!imageSize || processing) return;
    setProcessing(true);
    setError('');
    try {
      const cropped = await cropSquareImageFile(file, viewportSize, scale, offsetX, offsetY);
      const compressed = await compressImageBlob(cropped);
      const dataUrl = await readFileAsDataUrl(compressed);
      onConfirm(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지를 자르지 못했어요.');
    } finally {
      setProcessing(false);
    }
  };

  const zoomPct = minScale > 0 ? Math.round(((scale - minScale) / (minScale * 2)) * 100) : 0;

  const sheet = (
    <div className="square-crop-backdrop" onClick={tryClose} role="presentation">
      <div
        className="square-crop-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
      >
        <header className="square-crop-head">
          <h2>{heading}</h2>
          <button type="button" className="square-crop-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <p className="square-crop-sub">정사각형 안에 들어갈 영역을 맞춰 주세요. 사진을 드래그하고 확대할 수 있어요.</p>

        <div
          ref={viewportRef}
          className={`square-crop-viewport${dragging ? ' dragging' : ''}`}
          onPointerDown={onViewportPointerDown}
          onPointerMove={onViewportPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {imageSize ? (
            <img
              src={previewUrl}
              alt=""
              className="square-crop-image is-ready"
              draggable={false}
              style={{
                width: imageSize.w * scale,
                height: imageSize.h * scale,
                transform: `translate(${offsetX}px, ${offsetY}px)`,
              }}
            />
          ) : (
            <img src={previewUrl} alt="" className="square-crop-image is-loading" draggable={false} />
          )}
          <div className="square-crop-frame" aria-hidden />
        </div>

        <div className="square-crop-zoom">
          <label htmlFor="square-crop-zoom">확대</label>
          <input
            id="square-crop-zoom"
            type="range"
            min={0}
            max={100}
            value={zoomPct}
            disabled={!imageSize || processing}
            onChange={(event) => applyScale(minScale + (Number(event.target.value) / 100) * minScale * 2)}
          />
        </div>

        {error ? <p className="square-crop-error">{error}</p> : null}

        <div className="square-crop-actions">
          <button type="button" className="btn" onClick={onClose} disabled={processing}>
            취소
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={processing || !imageSize}>
            {processing ? '처리 중…' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
