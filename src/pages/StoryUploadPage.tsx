import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { LeaderGate } from '../features/team/LeaderGate';
import { compressDataUrlImage, getVideoDuration, prepareMediaBlob, readFileAsDataUrl, STORY_MAX_VIDEO_DURATION_SEC, videoNeedsTrim } from '../utils/fileMedia';
import { canvasToImageBlob } from '../utils/imageOutput';
import { ensurePublishedMedia } from '../utils/mediaUpload';
import { VideoTrimSheet, type VideoClipSelection } from '../features/media/VideoTrimSheet';
import {
  DEFAULT_IMAGE_TRANSFORM,
  DEFAULT_TEXT_POSITION,
  angle,
  clampScale,
  clampTextPosition,
  distance,
  midpoint,
  type StoryImageTransform,
} from '../utils/storyGestures';
import { renderStoryComposite, exportStoryVideoBlob, hasStoryVideoTransform } from '../utils/storyUtils';
import {
  cycleStoryFont,
  DEFAULT_STORY_TEXT_STYLE,
  STORY_BG_COLOR_PRESETS,
  STORY_FONT_LABELS,
  STORY_TEXT_COLOR_PRESETS,
  storyTextInputStyle,
  storyTextSurfaceStyle,
  type StoryTextStyle,
} from '../utils/storyTextStyle';
import './StoryUploadPage.css';

type StoryStep = 'camera' | 'edit';
type StoryMediaKind = 'image' | 'video';

const DRAG_THRESHOLD = 6;

export function StoryUploadPage() {
  const { activeTeam, addStory } = useApp();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const editVideoRef = useRef<HTMLVideoElement>(null);
  const imageTransformRef = useRef<StoryImageTransform>(DEFAULT_IMAGE_TRANSFORM);
  const imagePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const imageGestureRef = useRef<{
    startTransform: StoryImageTransform;
    startDistance: number;
    startAngle: number;
    startMid: { x: number; y: number };
  } | null>(null);
  const textDragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const [step, setStep] = useState<StoryStep>('camera');
  const [mediaKind, setMediaKind] = useState<StoryMediaKind>('image');
  const [overlayText, setOverlayText] = useState('');
  const [textStyle, setTextStyle] = useState<StoryTextStyle>(DEFAULT_STORY_TEXT_STYLE);
  const [textPos, setTextPos] = useState(DEFAULT_TEXT_POSITION);
  const [textEditing, setTextEditing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoClip, setVideoClip] = useState<Pick<VideoClipSelection, 'startSec' | 'endSec'> | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [trimVideo, setTrimVideo] = useState<{ file: Blob; fileName?: string } | null>(null);
  const [imageTransform, setImageTransform] = useState<StoryImageTransform>(DEFAULT_IMAGE_TRANSFORM);
  const [galleryThumb, setGalleryThumb] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    imageTransformRef.current = imageTransform;
  }, [imageTransform]);

  const applyImageTransform = (next: StoryImageTransform) => {
    imageTransformRef.current = next;
    setImageTransform(next);
  };

  const resetEditState = () => {
    setOverlayText('');
    setTextStyle(DEFAULT_STORY_TEXT_STYLE);
    setTextPos(DEFAULT_TEXT_POSITION);
    setTextEditing(false);
    setImageTransform(DEFAULT_IMAGE_TRANSFORM);
    imageTransformRef.current = DEFAULT_IMAGE_TRANSFORM;
    imagePointersRef.current.clear();
    imageGestureRef.current = null;
    textDragRef.current = null;
  };

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraReady(false);
  };

  const startCamera = async (facing: 'user' | 'environment') => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('카메라를 사용할 수 없어요. 갤러리에서 선택해주세요.');
      return;
    }

    stopCamera();
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
      });
      cameraStreamRef.current = stream;
      setFacingMode(facing);
      setCameraReady(true);
    } catch {
      setCameraError('카메라 권한이 필요해요.');
      setCameraReady(false);
    }
  };

  useEffect(() => {
    if (step !== 'camera') return;
    if (trimVideo) {
      stopCamera();
      return;
    }
    void startCamera(facingMode);
    return () => stopCamera();
  }, [step, trimVideo, facingMode]);

  useEffect(() => {
    const video = cameraPreviewRef.current;
    const stream = cameraStreamRef.current;
    if (step !== 'camera' || !video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {});
  }, [step, cameraReady]);

  useEffect(() => {
    if (textEditing) textInputRef.current?.focus();
  }, [textEditing]);

  useEffect(() => {
    if (step !== 'edit' || mediaKind !== 'video' || !videoPreviewUrl) return;
    const video = editVideoRef.current;
    if (!video) return;

    const start = videoClip?.startSec ?? 0;
    const end = videoClip?.endSec;

    const syncPreview = () => {
      if (Number.isFinite(start)) video.currentTime = start;
      void video.play().catch(() => {});
    };

    const onTimeUpdate = () => {
      if (end != null && Number.isFinite(end) && video.currentTime >= end - 0.05) {
        video.currentTime = start;
      }
    };

    video.addEventListener('loadedmetadata', syncPreview);
    video.addEventListener('timeupdate', onTimeUpdate);
    if (video.readyState >= 1) syncPreview();

    return () => {
      video.removeEventListener('loadedmetadata', syncPreview);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [step, mediaKind, videoPreviewUrl, videoClip?.startSec, videoClip?.endSec]);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

  const clearVideoPreview = () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null);
    setVideoBlob(null);
    setVideoClip(null);
  };

  const setImageFromBlob = (blob: Blob, thumb?: string) => {
    void prepareMediaBlob(blob, 'image')
      .then(async (prepared) => {
        const url = await readFileAsDataUrl(prepared);
        stopCamera();
        clearVideoPreview();
        setMediaKind('image');
        setImageUrl(url);
        if (thumb) setGalleryThumb(thumb);
        resetEditState();
        setStep('edit');
        setError('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '사진을 처리하지 못했어요.');
      });
  };

  const setVideoFromBlob = (blob: Blob, clip?: Pick<VideoClipSelection, 'startSec' | 'endSec'> | null) => {
    void prepareMediaBlob(blob, 'video')
      .then((prepared) => {
        stopCamera();
        setImageUrl(null);
        clearVideoPreview();
        const url = URL.createObjectURL(prepared);
        setVideoBlob(prepared);
        setVideoClip(clip ?? null);
        setVideoPreviewUrl(url);
        setMediaKind('video');
        resetEditState();
        setStep('edit');
        setError('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '영상을 처리하지 못했어요.');
      });
  };

  const handleTrimConfirm = (result: Blob | VideoClipSelection) => {
    setTrimVideo(null);
    if (result instanceof Blob) {
      setVideoFromBlob(result);
      return;
    }
    setVideoFromBlob(result.file, { startSec: result.startSec, endSec: result.endSec });
  };

  const handleVideoFile = async (file: File) => {
    const thumb = URL.createObjectURL(file);
    setGalleryThumb(thumb);
    try {
      const duration = await getVideoDuration(thumb);
      if (videoNeedsTrim(duration, STORY_MAX_VIDEO_DURATION_SEC)) {
        setTrimVideo({ file, fileName: file.name });
        return;
      }
      setVideoFromBlob(file);
    } catch {
      setError('영상 정보를 확인하지 못했어요.');
    }
  };

  const takePhoto = () => {
    const video = cameraPreviewRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    void canvasToImageBlob(canvas, 0.92).then((blob) => {
      if (blob) setImageFromBlob(blob);
    });
  };

  const onFileSelected = (file: File | undefined) => {
    if (!file) return;
    if (file.type.startsWith('video/')) {
      void handleVideoFile(file);
      return;
    }
    if (file.type.startsWith('image/')) {
      const thumb = URL.createObjectURL(file);
      setImageFromBlob(file, thumb);
      return;
    }
    setError('사진 또는 영상 파일만 올릴 수 있어요.');
  };

  const backToCamera = () => {
    setImageUrl(null);
    clearVideoPreview();
    setMediaKind('image');
    resetEditState();
    setStep('camera');
  };

  const updateImageGesture = () => {
    const pointers = imagePointersRef.current;
    const session = imageGestureRef.current;
    if (!session) return;

    const points = [...pointers.values()];
    if (points.length === 1) {
      applyImageTransform({
        ...session.startTransform,
        x: session.startTransform.x + (points[0].x - session.startMid.x),
        y: session.startTransform.y + (points[0].y - session.startMid.y),
      });
      return;
    }

    if (points.length >= 2) {
      const currentDistance = distance(points[0], points[1]);
      const currentAngle = angle(points[0], points[1]);
      const currentMid = midpoint(points[0], points[1]);
      const scaleRatio = session.startDistance > 0 ? currentDistance / session.startDistance : 1;

      applyImageTransform({
        scale: clampScale(session.startTransform.scale * scaleRatio),
        rotation: session.startTransform.rotation + (currentAngle - session.startAngle),
        x: session.startTransform.x + (currentMid.x - session.startMid.x),
        y: session.startTransform.y + (currentMid.y - session.startMid.y),
      });
    }
  };

  const onImagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (textEditing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    imagePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const points = [...imagePointersRef.current.values()];
    if (points.length === 1) {
      imageGestureRef.current = {
        startTransform: imageTransformRef.current,
        startDistance: 0,
        startAngle: 0,
        startMid: points[0],
      };
    } else if (points.length === 2) {
      imageGestureRef.current = {
        startTransform: imageTransformRef.current,
        startDistance: distance(points[0], points[1]),
        startAngle: angle(points[0], points[1]),
        startMid: midpoint(points[0], points[1]),
      };
    }
  };

  const onImagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (textEditing || !imagePointersRef.current.has(event.pointerId)) return;
    imagePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    updateImageGesture();
  };

  const endImagePointer = (event: ReactPointerEvent<HTMLDivElement>, pointerId: number) => {
    imagePointersRef.current.delete(pointerId);
    if (imagePointersRef.current.size === 0) {
      imageGestureRef.current = null;
      return;
    }

    const points = [...imagePointersRef.current.values()];
    imageGestureRef.current = {
      startTransform: imageTransformRef.current,
      startDistance: points.length >= 2 ? distance(points[0], points[1]) : 0,
      startAngle: points.length >= 2 ? angle(points[0], points[1]) : 0,
      startMid: points.length >= 2 ? midpoint(points[0], points[1]) : points[0],
    };

    try {
      event.currentTarget.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  };

  const onImagePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    endImagePointer(event, event.pointerId);
  };

  const onTextPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    textDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origX: textPos.x,
      origY: textPos.y,
      moved: false,
    };
  };

  const onTextPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = textDragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) drag.moved = true;

    const rect = stage.getBoundingClientRect();
    setTextPos(
      clampTextPosition(drag.origX + dx / rect.width, drag.origY + dy / rect.height),
    );
  };

  const onTextPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = textDragRef.current;
    if (!drag) return;
    if (!drag.moved) setTextEditing(true);
    textDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const submit = async () => {
    if (!activeTeam) return;
    setSubmitting(true);
    setError('');
    try {
      if (mediaKind === 'video') {
        if (!videoBlob || !stageRef.current) return;
        const rect = stageRef.current.getBoundingClientRect();
        const needsProcessing = !!videoClip || hasStoryVideoTransform(imageTransform);
        let uploadBlob = videoBlob;
        if (needsProcessing) {
          uploadBlob = await exportStoryVideoBlob(
            videoBlob,
            rect.width,
            rect.height,
            imageTransform,
            videoClip ?? undefined,
          );
        }
        uploadBlob = await prepareMediaBlob(uploadBlob, 'video');
        const mediaUrl = await ensurePublishedMedia(uploadBlob, 'stories', activeTeam.id);
        addStory({
          teamId: activeTeam.id,
          image: mediaUrl,
          mediaType: 'video',
          caption: overlayText.trim(),
        });
        navigate('/');
        return;
      }

      if (!imageUrl || !stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      const finalImage = await renderStoryComposite(
        imageUrl,
        rect.width,
        rect.height,
        imageTransform,
        overlayText.trim()
          ? { text: overlayText, x: textPos.x, y: textPos.y, style: textStyle }
          : undefined,
      );
      const compressedImage = await compressDataUrlImage(finalImage);
      const image = await ensurePublishedMedia(compressedImage, 'stories', activeTeam.id);
      addStory({
        teamId: activeTeam.id,
        image,
        mediaType: 'image',
        caption: overlayText.trim(),
      });
      navigate('/');
    } catch {
      setError('스토리를 올리지 못했어요.');
      setSubmitting(false);
    }
  };

  const flipCamera = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    void startCamera(next);
  };

  const imageLayerStyle = {
    transform: `translate(${imageTransform.x}px, ${imageTransform.y}px) rotate(${imageTransform.rotation}deg) scale(${imageTransform.scale})`,
  };

  const textLayerStyle = {
    left: `${textPos.x * 100}%`,
    top: `${textPos.y * 100}%`,
  };

  const textSurfaceStyle = storyTextSurfaceStyle(textStyle);
  const textEditorStyle = storyTextInputStyle(textStyle);

  if (!activeTeam) return null;

  return (
    <LeaderGate backTo="/my">
    <div className="story-studio">
      {step === 'camera' && (
        <>
          <div className="story-studio-media">
            {cameraReady ? (
              <video ref={cameraPreviewRef} autoPlay playsInline muted className="story-studio-video" />
            ) : (
              <div className="story-studio-fallback">
                <p>{cameraError || '카메라를 불러오는 중…'}</p>
              </div>
            )}
          </div>

          <header className="story-studio-top">
            <button type="button" className="story-studio-icon-btn" onClick={() => navigate('/')} aria-label="닫기">
              ✕
            </button>
            <span className="story-studio-title">스토리</span>
            <span className="story-studio-spacer" />
          </header>

          <div className="story-studio-team">
            <img src={activeTeam.cover} alt="" />
            <span>{activeTeam.name}</span>
          </div>

          {(error || cameraError) && <p className="story-studio-toast">{error || cameraError}</p>}

          <footer className="story-studio-controls">
            <button
              type="button"
              className="story-studio-gallery"
              onClick={() => fileInputRef.current?.click()}
              aria-label="갤러리에서 선택"
            >
              {galleryThumb ? (
                <img src={galleryThumb} alt="" />
              ) : (
                <span className="story-studio-gallery-icon" />
              )}
            </button>

            <button
              type="button"
              className="story-studio-shutter"
              onClick={takePhoto}
              disabled={!cameraReady}
              aria-label="촬영"
            >
              <span />
            </button>

            <button
              type="button"
              className="story-studio-icon-btn story-studio-flip"
              onClick={flipCamera}
              disabled={!cameraReady}
              aria-label="카메라 전환"
            >
              ↻
            </button>
          </footer>
        </>
      )}

      {step === 'edit' && (imageUrl || videoPreviewUrl) && (
        <>
          <div
            ref={stageRef}
            className={`story-studio-edit-stage${textEditing ? ' story-studio-edit-stage--text' : ''}`}
            onPointerDown={textEditing ? undefined : onImagePointerDown}
            onPointerMove={textEditing ? undefined : onImagePointerMove}
            onPointerUp={textEditing ? undefined : onImagePointerUp}
            onPointerCancel={textEditing ? undefined : onImagePointerUp}
          >
            <div className="story-studio-image-layer" style={imageLayerStyle}>
              {mediaKind === 'video' && videoPreviewUrl ? (
                <video ref={editVideoRef} src={videoPreviewUrl} autoPlay loop muted playsInline />
              ) : (
                imageUrl && <img src={imageUrl} alt="" draggable={false} />
              )}
            </div>

            {!textEditing && overlayText && (
              <div
                className="story-studio-text-preview"
                style={{ ...textLayerStyle, ...textSurfaceStyle }}
                onPointerDown={onTextPointerDown}
                onPointerMove={onTextPointerMove}
                onPointerUp={onTextPointerUp}
                onPointerCancel={onTextPointerUp}
              >
                {overlayText}
              </div>
            )}

            {textEditing && (
              <div className="story-studio-text-editor" style={textLayerStyle}>
                <textarea
                  ref={textInputRef}
                  className="story-studio-text-input"
                  style={textEditorStyle}
                  value={overlayText}
                  onChange={(e) => setOverlayText(e.target.value)}
                  placeholder="텍스트 입력…"
                  maxLength={120}
                  rows={3}
                />
              </div>
            )}
          </div>

          <header className="story-studio-top">
            <button type="button" className="story-studio-icon-btn" onClick={backToCamera} aria-label="다시 찍기">
              ←
            </button>
            <span className="story-studio-title">스토리</span>
            {textEditing ? (
              <button type="button" className="story-studio-share" onClick={() => setTextEditing(false)}>
                완료
              </button>
            ) : (
              <button type="button" className="story-studio-share" disabled={submitting} onClick={() => void submit()}>
                {submitting
                  ? mediaKind === 'video' &&
                    (videoClip || hasStoryVideoTransform(imageTransform))
                    ? '영상 처리 중…'
                    : '…'
                  : '공유'}
              </button>
            )}
          </header>

          {error && <p className="story-studio-toast">{error}</p>}

          {textEditing && (
            <footer className="story-studio-text-style-bar">
              <button
                type="button"
                className="story-text-font-btn"
                style={{ fontFamily: textSurfaceStyle.fontFamily }}
                onClick={() =>
                  setTextStyle((prev) => ({ ...prev, fontId: cycleStoryFont(prev.fontId) }))
                }
                aria-label={`글꼴: ${STORY_FONT_LABELS[textStyle.fontId]}`}
              >
                Aa
              </button>
              <div className="story-text-style-group">
                <span className="story-text-style-label">글자</span>
                <div className="story-text-swatches">
                  {STORY_TEXT_COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`story-text-swatch${textStyle.textColor === color ? ' is-active' : ''}`}
                      style={{ background: color }}
                      aria-label={`글자색 ${color}`}
                      onClick={() => setTextStyle((prev) => ({ ...prev, textColor: color }))}
                    />
                  ))}
                </div>
              </div>
              <div className="story-text-style-group">
                <span className="story-text-style-label">배경</span>
                <div className="story-text-swatches">
                  {STORY_BG_COLOR_PRESETS.map((color) => (
                    <button
                      key={color ?? 'none'}
                      type="button"
                      className={`story-text-swatch${textStyle.backgroundColor === color ? ' is-active' : ''}${color == null ? ' is-none' : ''}`}
                      style={color ? { background: color } : undefined}
                      aria-label={color == null ? '배경 없음' : `배경색 ${color}`}
                      onClick={() => setTextStyle((prev) => ({ ...prev, backgroundColor: color }))}
                    />
                  ))}
                </div>
              </div>
            </footer>
          )}

          {!textEditing && (
            <footer className="story-studio-edit-tools">
              <button type="button" className="story-studio-aa" onClick={() => setTextEditing(true)}>
                Aa
              </button>
              <span className="story-studio-edit-hint">사진·영상·텍스트를 손가락으로 조절하세요</span>
            </footer>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="story-studio-file"
        onChange={(e) => {
          onFileSelected(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {trimVideo && (
        <VideoTrimSheet
          file={trimVideo.file}
          fileName={trimVideo.fileName}
          maxDurationSec={STORY_MAX_VIDEO_DURATION_SEC}
          deferTrim
          onConfirm={handleTrimConfirm}
          onClose={() => setTrimVideo(null)}
        />
      )}
    </div>
    </LeaderGate>
  );
}
