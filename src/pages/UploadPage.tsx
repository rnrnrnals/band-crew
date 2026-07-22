import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { LeaderGate } from '../features/team/LeaderGate';
import {
  CHAT_MAX_IMAGE_BYTES,
  CHAT_MAX_VIDEO_BYTES,
  formatMaxSize,
  getVideoDuration,
  prepareMediaBlob,
  captureVideoPosterBlob,
  videoNeedsTrim,
} from '../utils/fileMedia';
import { ensurePublishedMedia } from '../utils/mediaUpload';
import { uploadPosterForVideo } from '../services/storageService';
import { ensureVideoFileType, videoFileExtension } from '../utils/videoMediaUtils';
import { VideoTrimSheet } from '../features/media/VideoTrimSheet';
import { VideoCropSheet } from '../features/media/VideoCropSheet';
import './UploadPage.css';

type MediaType = 'video' | 'image' | 'text';

export function UploadPage() {
  const { activeTeam, addPost } = useApp();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaType, setMediaType] = useState<MediaType>('text');
  const [caption, setCaption] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [trimVideo, setTrimVideo] = useState<{ file: File; name: string } | null>(null);
  const [cropVideo, setCropVideo] = useState<{ file: File; name: string } | null>(null);

  const clearAttachment = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAttachedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const changeMediaType = (type: MediaType) => {
    setMediaType(type);
    clearAttachment();
    setError('');
  };

  const validateFile = (file: File, type: MediaType): string | null => {
    if (type === 'image') {
      if (!file.type.startsWith('image/')) return '사진 파일만 선택할 수 있어요.';
      return null;
    }
    if (type === 'video') {
      if (!file.type.startsWith('video/')) return '영상 파일만 선택할 수 있어요.';
      return null;
    }
    return null;
  };

  const applyVideoFile = (file: File, preview: Blob | File = file) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAttachedFile(file);
    setPreviewUrl(URL.createObjectURL(preview));
  };

  const openVideoCrop = (file: File, name = file.name) => {
    setCropVideo({ file, name });
  };

  const onFileSelected = async (file: File | null) => {
    setError('');
    if (!file) {
      clearAttachment();
      return;
    }
    const normalized = mediaType === 'video' ? ensureVideoFileType(file) : file;
    const validationError = validateFile(normalized, mediaType);
    if (validationError) {
      setError(validationError);
      clearAttachment();
      return;
    }

    if (mediaType === 'video') {
      const objectUrl = URL.createObjectURL(normalized);
      const duration = await getVideoDuration(objectUrl);
      URL.revokeObjectURL(objectUrl);
      if (videoNeedsTrim(duration)) {
        setTrimVideo({ file: normalized, name: normalized.name });
        return;
      }
      openVideoCrop(normalized);
      return;
    }

    applyVideoFile(normalized);
  };

  const handleTrimConfirm = (trimmed: Blob) => {
    if (!trimVideo) return;
    const base = trimVideo.name.replace(/\.[^.]+$/, '') || 'video';
    const ext = videoFileExtension(trimmed.type || 'video/mp4');
    const nextFile = new File([trimmed], `${base}-clip.${ext}`, { type: trimmed.type || `video/${ext}` });
    setTrimVideo(null);
    openVideoCrop(nextFile, `${base}-clip.${ext}`);
  };

  const handleCropConfirm = (cropped: Blob) => {
    if (!cropVideo) return;
    const base = cropVideo.name.replace(/\.[^.]+$/, '') || 'video';
    const ext = videoFileExtension(cropped.type || 'video/mp4');
    const nextFile = new File([cropped], `${base}-frame.${ext}`, {
      type: cropped.type || `video/${ext}`,
    });
    applyVideoFile(nextFile, cropped);
    setCropVideo(null);
  };

  const handleCropClose = () => {
    setCropVideo(null);
  };

  const handleCropSkip = (blob: Blob) => {
    if (!cropVideo) return;
    const base = cropVideo.name.replace(/\.[^.]+$/, '') || 'video';
    const ext = videoFileExtension(blob.type || 'video/mp4');
    const nextFile = new File([blob], `${base}.${ext}`, {
      type: blob.type || `video/${ext}`,
    });
    applyVideoFile(nextFile, blob);
    setCropVideo(null);
  };

  const submit = async () => {
    if (!activeTeam || submitting) return;
    if (!caption.trim() && mediaType === 'text') {
      setError('글 내용을 입력해주세요.');
      return;
    }
    if (mediaType !== 'text' && !attachedFile) {
      setError(mediaType === 'image' ? '사진을 선택해주세요.' : '영상을 선택해주세요.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let mediaUrl: string | undefined;
      if (mediaType !== 'text' && attachedFile) {
        const kind = mediaType === 'image' ? 'image' : 'video';
        const prepared = await prepareMediaBlob(attachedFile, kind);
        mediaUrl = await ensurePublishedMedia(prepared, 'posts', activeTeam.id, attachedFile.name);
        if (kind === 'video' && mediaUrl && /^https?:\/\//i.test(mediaUrl)) {
          const poster = await captureVideoPosterBlob(prepared);
          await uploadPosterForVideo(mediaUrl, poster);
        }
      }

      addPost({
        teamId: activeTeam.id,
        mediaType,
        caption: caption.trim() || `${activeTeam.name}의 새 소식`,
        mediaUrl,
      });
      navigate('/');
    } catch {
      setError('파일을 불러오지 못했어요. 더 작은 파일로 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const accept = mediaType === 'image' ? 'image/*' : 'video/*';

  return (
    <LeaderGate>
    <div className="page upload-page">
      <header className="upload-head">
        <Link to="/my" className="upload-back" aria-label="뒤로">
          ←
        </Link>
        <h1 className="upload-title">업로드</h1>
        <span className="upload-head-spacer" aria-hidden />
      </header>
      <p className="page-sub upload-sub">
        <strong>{activeTeam?.name}</strong> 팀 명의로 피드에 올려요. 영상은 최대 5분, 파일 크기는 자동으로{' '}
        {formatMaxSize(CHAT_MAX_IMAGE_BYTES)} / {formatMaxSize(CHAT_MAX_VIDEO_BYTES)} 이하로 줄여요.
      </p>

      <div className="type-tabs">
        {(['text', 'image', 'video'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={mediaType === t ? 'on' : ''}
            onClick={() => changeMediaType(t)}
          >
            {t === 'text' ? '글' : t === 'image' ? '사진' : '영상'}
          </button>
        ))}
      </div>

      {mediaType !== 'text' && (
        <div className="upload-media">
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            className="upload-file-input"
            onChange={(e) => {
              void onFileSelected(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />

          {previewUrl ? (
            <div
              className={`upload-preview${mediaType === 'video' ? ' upload-preview--video-frame' : ''}`}
            >
              {mediaType === 'image' ? (
                <img src={previewUrl} alt="" />
              ) : (
                <video src={previewUrl} controls playsInline />
              )}
              <button type="button" className="upload-remove" onClick={clearAttachment}>
                첨부 제거
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="upload-picker"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="upload-picker-icon">{mediaType === 'image' ? '🖼' : '🎬'}</span>
              <strong>{mediaType === 'image' ? '사진 선택' : '영상 선택'}</strong>
              <span>
                {mediaType === 'image'
                  ? `갤러리에서 사진을 고르세요 (자동 ${formatMaxSize(CHAT_MAX_IMAGE_BYTES)} 이하)`
                  : `갤러리에서 영상을 고르세요 (최대 5분 · 정사각형 프레임 맞춤 · 자동 ${formatMaxSize(CHAT_MAX_VIDEO_BYTES)} 이하)`}
              </span>
            </button>
          )}
        </div>
      )}

      <div className="field">
        <label>{mediaType === 'text' ? '내용' : '캡션'}</label>
        <textarea
          rows={4}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="연습 후기, 공연 공지, 합주 영상 소개…"
        />
      </div>

      {error && <p className="upload-error">{error}</p>}

      <button
        type="button"
        className="btn btn-primary upload-submit"
        disabled={submitting}
        onClick={submit}
      >
        {submitting ? '압축 · 올리는 중…' : '팀에 올리기'}
      </button>
      {trimVideo && (
        <VideoTrimSheet
          file={trimVideo.file}
          fileName={trimVideo.name}
          onClose={() => setTrimVideo(null)}
          onConfirm={handleTrimConfirm}
        />
      )}
      {cropVideo && (
        <VideoCropSheet
          file={cropVideo.file}
          fileName={cropVideo.name}
          onClose={handleCropClose}
          onConfirm={handleCropConfirm}
          onSkip={handleCropSkip}
        />
      )}
    </div>
    </LeaderGate>
  );
}
