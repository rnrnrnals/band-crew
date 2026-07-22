import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { applyMediaElementUrl } from '../../utils/videoMediaUtils';
import { formatMediaTime } from '../../utils/fileMedia';
import {
  trackPlayableDuration,
  trackPlayableEndSec,
  trackTrimStartSec,
  type JamTrack,
} from './jamUtils';
import { resumePracticeAudio, setElementVolume } from './practicePlayback';
import './VideoTrackViewerSheet.css';

interface VideoTrackViewerSheetProps {
  track: JamTrack;
  onClose: () => void;
}

export function VideoTrackViewerSheet({ track, onClose }: VideoTrackViewerSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubTrackRef = useRef<HTMLDivElement>(null);
  const scrubDragRef = useRef<{ pointerId: number } | null>(null);
  const trimStart = trackTrimStartSec(track);
  const trimEnd = trackPlayableEndSec(track);
  const playable = trackPlayableDuration(track);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [scrubTime, setScrubTime] = useState(trimStart);
  const [scrubbing, setScrubbing] = useState(false);
  const seekingRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setReady(false);
    setPlaying(false);
    setScrubTime(trimStart);
    seekingRef.current = false;

    const onMeta = () => {
      video.currentTime = trimStart;
      setScrubTime(trimStart);
      setReady(true);
    };
    const onTimeUpdate = () => {
      if (seekingRef.current) return;
      const t = video.currentTime;
      setScrubTime(t);
      if (t >= trimEnd - 0.04) {
        video.pause();
        setPlaying(false);
        video.currentTime = trimEnd;
        setScrubTime(trimEnd);
      }
    };

    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('timeupdate', onTimeUpdate);
    applyMediaElementUrl(video, track.blobUrl);
    video.load();

    return () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [track.blobUrl, trimStart, trimEnd]);

  const seekTo = useCallback(
    (time: number) => {
      const clamped = Math.max(trimStart, Math.min(trimEnd, time));
      setScrubTime(clamped);
      const video = videoRef.current;
      if (video) video.currentTime = clamped;
    },
    [trimStart, trimEnd],
  );

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const trackEl = scrubTrackRef.current;
      if (!trackEl || playable <= 0) return trimStart;
      const rect = trackEl.getBoundingClientRect();
      if (rect.width <= 0) return trimStart;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return trimStart + ratio * playable;
    },
    [playable, trimStart],
  );

  const beginScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!ready) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubDragRef.current = { pointerId: event.pointerId };
    seekingRef.current = true;
    setScrubbing(true);
    videoRef.current?.pause();
    setPlaying(false);
    seekTo(timeFromClientX(event.clientX));
  };

  const moveScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = scrubDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    seekTo(timeFromClientX(event.clientX));
  };

  const endScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = scrubDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    scrubDragRef.current = null;
    seekingRef.current = false;
    setScrubbing(false);
  };

  const togglePlay = () => {
    resumePracticeAudio();
    const video = videoRef.current;
    if (!video || !ready) return;

    if (playing) {
      video.pause();
      setPlaying(false);
      return;
    }

    if (video.currentTime >= trimEnd - 0.04) {
      seekTo(trimStart);
    }
    setElementVolume(video, 1);
    void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const clipProgress = playable > 0 ? (scrubTime - trimStart) / playable : 0;

  const sheet = (
    <div className="video-viewer-backdrop" onClick={onClose} role="presentation">
      <div
        className="video-viewer-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${track.name} 동영상 보기`}
      >
        <header className="video-viewer-head">
          <div>
            <h2>{track.name}</h2>
            <p className="video-viewer-sub">
              {track.positionLabel}
              {playable > 0 ? ` · ${formatMediaTime(playable)}` : ''}
            </p>
          </div>
          <button type="button" className="video-viewer-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="video-viewer-stage">
          <video ref={videoRef} className="video-viewer-video" playsInline preload="auto" />
          {!ready ? <div className="video-viewer-loading">영상 불러오는 중…</div> : null}
          {!playing && ready && !scrubbing ? (
            <button type="button" className="video-viewer-play-overlay" onClick={togglePlay} aria-label="재생">
              ▶
            </button>
          ) : null}
        </div>

        <div className="video-viewer-controls">
          <div className="video-viewer-scrub-meta">
            <span>{formatMediaTime(Math.max(0, scrubTime - trimStart))}</span>
            <span>{formatMediaTime(playable)}</span>
          </div>
          <div
            ref={scrubTrackRef}
            className={`video-viewer-scrub-track${scrubbing ? ' dragging' : ''}${ready ? '' : ' disabled'}`}
            role="slider"
            aria-label="재생 위치"
            aria-valuemin={0}
            aria-valuemax={Math.round(playable * 1000)}
            aria-valuenow={Math.round(Math.max(0, scrubTime - trimStart) * 1000)}
            aria-disabled={!ready}
            onPointerDown={beginScrub}
            onPointerMove={moveScrub}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
          >
            <div className="video-viewer-scrub-rail" />
            <div className="video-viewer-scrub-fill" style={{ width: `${clipProgress * 100}%` }} />
            <div className="video-viewer-scrub-thumb" style={{ left: `${clipProgress * 100}%` }} />
          </div>
          <p className="video-viewer-scrub-hint">바를 드래그해서 앞뒤로 이동할 수 있어요</p>
          <button
            type="button"
            className="video-viewer-play-btn"
            onClick={togglePlay}
            disabled={!ready}
            aria-label={playing ? '일시정지' : '재생'}
          >
            {playing ? '■ 일시정지' : '▶ 재생'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
