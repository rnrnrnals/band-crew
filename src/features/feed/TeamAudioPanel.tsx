import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Post, TeamAudioTrack } from '../../types';
import { useApp } from '../../state/AppContext';
import { useNavigateToTeamFeed } from '../../hooks/useNavigateToTeamFeed';
import { SquareImageCropSheet } from '../media/SquareImageCropSheet';
import { prepareMediaBlob, formatMaxSize, CHAT_MAX_AUDIO_BYTES, getAudioDuration } from '../../utils/fileMedia';
import { ensurePublishedMedia } from '../../utils/mediaUpload';
import { barNearCommentRatio, getWaveCommentMarkers, measureWaveRatioPosition } from '../../utils/audioCommentUtils';
import './TeamAudioPanel.css';

function formatDuration(sec?: number): string {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatProgressTime(progress: number, durationSec?: number): string | null {
  if (durationSec == null || !Number.isFinite(durationSec)) return null;
  return formatDuration(progress * durationSec);
}

function waveformBars(seed: string, count = 52): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Array.from({ length: count }, (_, i) => {
    const n = Math.abs(Math.sin(hash * 0.001 + i * 1.7) * 100 + ((hash + i * 13) % 47));
    return 18 + (n % 72);
  });
}

function resolveDuration(audio: HTMLAudioElement, fallbackSec?: number): number | null {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    return audio.duration;
  }
  if (fallbackSec != null && Number.isFinite(fallbackSec) && fallbackSec > 0) {
    return fallbackSec;
  }
  return null;
}

/** Map pointer X to 0–1 across the visible bar region (excludes outer padding). */
function ratioFromWavePointer(wave: HTMLElement, clientX: number): number {
  const bars = wave.querySelectorAll<HTMLElement>(':scope > span');
  if (bars.length === 0) {
    const rect = wave.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  const first = bars[0].getBoundingClientRect();
  const last = bars[bars.length - 1].getBoundingClientRect();
  const start = first.left;
  const end = last.right;
  const width = end - start;
  if (width <= 0) return 0;
  return Math.max(0, Math.min(1, (clientX - start) / width));
}

interface AudioTrackCardProps {
  track: TeamAudioTrack;
  isActive: boolean;
  isPlaying: boolean;
  progress: number;
  playbackDurationSec?: number;
  canDelete?: boolean;
  onPlayPause: () => void;
  onRestart: () => void;
  onSeek: (ratio: number, shouldPlay?: boolean) => void;
  onSeekTimestamp?: (seconds: number) => void;
  onOpen?: () => void;
  largeWave?: boolean;
  gridCell?: boolean;
  onTeamFeedNavigate?: () => void;
}

function AudioTrackCard({
  track,
  isActive,
  isPlaying,
  progress,
  playbackDurationSec,
  onPlayPause,
  onRestart,
  onSeek,
  onSeekTimestamp,
  onOpen,
  largeWave = false,
  gridCell = false,
  onTeamFeedNavigate,
}: AudioTrackCardProps) {
  const { teams, getTeam } = useApp();
  const navigateToTeamFeed = useNavigateToTeamFeed();
  const waveRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [waveBarCount, setWaveBarCount] = useState(largeWave ? 96 : 52);
  const bars = useMemo(() => waveformBars(track.id, waveBarCount), [track.id, waveBarCount]);
  const [durationSec, setDurationSec] = useState<number | undefined>(track.durationSec);
  const [markerLeftPx, setMarkerLeftPx] = useState<Record<string, number>>({});
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const trackTeam = useMemo(() => getTeam(track.teamId), [getTeam, track.teamId]);

  useEffect(() => {
    setDurationSec(track.durationSec);
  }, [track.durationSec]);

  useEffect(() => {
    if (durationSec != null && Number.isFinite(durationSec)) return;
    const audio = new Audio(track.audioUrl);
    audio.preload = 'metadata';
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSec(audio.duration);
      }
    };
    audio.addEventListener('loadedmetadata', onMeta);
    audio.onerror = () => {};
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.src = '';
    };
  }, [track.audioUrl, durationSec]);

  const durationLabel =
    durationSec != null && Number.isFinite(durationSec) ? formatDuration(durationSec) : null;
  const timelineDurationSec =
    isActive && playbackDurationSec != null && Number.isFinite(playbackDurationSec)
      ? playbackDurationSec
      : durationSec;
  const progressLabel = isActive ? formatProgressTime(progress, timelineDurationSec) : null;

  const markerDurationSec = playbackDurationSec ?? durationSec ?? track.durationSec;
  const waveMarkers = useMemo(
    () => getWaveCommentMarkers(track.comments, markerDurationSec, { trackTeam, teams }),
    [track.comments, markerDurationSec, trackTeam, teams],
  );
  const commentRatios = useMemo(() => waveMarkers.map((marker) => marker.ratio), [waveMarkers]);
  const maxMarkerStack = useMemo(
    () => waveMarkers.reduce((max, marker) => Math.max(max, marker.stack), 0),
    [waveMarkers],
  );
  const markerAvatarSize = largeWave ? 44 : 36;
  const markerStackStep = largeWave ? 50 : 42;
  const markerLaneHeight =
    waveMarkers.length > 0 ? markerAvatarSize + maxMarkerStack * markerStackStep + 4 : 0;

  useEffect(() => {
    if (activeMarkerId == null) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if ((target as Element).closest?.('.tf-wave-comment-marker')) return;
      setActiveMarkerId(null);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [activeMarkerId]);

  const updateMarkerPositions = useCallback(() => {
    const wave = waveRef.current;
    if (!wave || waveMarkers.length === 0) {
      setMarkerLeftPx({});
      return;
    }
    const next: Record<string, number> = {};
    for (const marker of waveMarkers) {
      next[marker.id] = measureWaveRatioPosition(wave, marker.ratio);
    }
    setMarkerLeftPx(next);
  }, [waveMarkers]);

  useLayoutEffect(() => {
    const wave = waveRef.current;
    if (!wave) return;
    const syncBars = () => {
      const width = wave.clientWidth;
      if (width <= 0) return;
      const gap = largeWave ? 3 : 2;
      const targetWidth = largeWave ? 5 : 4;
      const nextCount = Math.max(
        largeWave ? 48 : 32,
        Math.min(140, Math.floor((width + gap) / (targetWidth + gap))),
      );
      setWaveBarCount((prev) => (prev === nextCount ? prev : nextCount));
    };
    syncBars();
    const observer = new ResizeObserver(syncBars);
    observer.observe(wave);
    return () => observer.disconnect();
  }, [largeWave]);

  useLayoutEffect(() => {
    updateMarkerPositions();
    const wave = waveRef.current;
    if (!wave) return;
    const observer = new ResizeObserver(() => updateMarkerPositions());
    observer.observe(wave);
    return () => observer.disconnect();
  }, [updateMarkerPositions, waveBarCount]);

  const seekFromClientX = (clientX: number, shouldPlay: boolean) => {
    const wave = waveRef.current;
    if (!wave) return;
    setActiveMarkerId(null);
    onSeek(ratioFromWavePointer(wave, clientX), shouldPlay);
  };

  const onWavePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    seekFromClientX(event.clientX, true);
  };

  const onWavePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    seekFromClientX(event.clientX, isPlaying);
  };

  const onWavePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) {
      seekFromClientX(event.clientX, true);
    }
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const Tag = gridCell ? 'div' : 'li';

  return (
    <Tag
      className={`tf-audio-track${isActive ? ' is-active' : ''}${isPlaying ? ' is-playing' : ''}${onOpen ? ' is-clickable' : ''}${largeWave ? ' tf-audio-track-lg' : ''}${gridCell ? ' tf-audio-track-grid' : ''}`}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      <div className={`tf-audio-art${track.coverImage ? ' has-cover' : ''}`}>
        {track.coverImage ? (
          <img src={track.coverImage} alt="" className="tf-audio-art-bg" draggable={false} />
        ) : null}
        <div className="tf-audio-art-shade" aria-hidden />

        <div className="tf-audio-art-body">
          <div className="tf-audio-art-top">
            <div className="tf-audio-controls" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="tf-audio-play"
                onClick={onPlayPause}
                aria-label={isActive && isPlaying ? '일시정지' : '재생'}
              >
                {isActive && isPlaying ? '❚❚' : '▶'}
              </button>
              <button
                type="button"
                className="tf-audio-restart"
                onClick={onRestart}
                aria-label="처음부터"
                title="처음부터"
              >
                ⏮
              </button>
            </div>
            <div className="tf-audio-art-badges">
              {(track.likes ?? 0) > 0 ? (
                <span className="tf-audio-like-count" aria-hidden>
                  ♥ {track.likes}
                </span>
              ) : null}
              {(track.comments?.length ?? 0) > 0 ? (
                <span className="tf-audio-comment-count" aria-hidden>
                  💬 {track.comments?.length ?? 0}
                </span>
              ) : null}
            </div>
          </div>

          <div className="tf-audio-art-text">
            <strong>{track.title}</strong>
            {track.caption ? <p className="tf-audio-caption">{track.caption}</p> : null}
            <span className="tf-audio-duration">
              {progressLabel ? `${progressLabel}${durationLabel ? ` / ${durationLabel}` : ''}` : durationLabel}
            </span>
          </div>
        </div>

        <div
          className={`tf-audio-wave-wrap${largeWave ? ' tf-audio-wave-wrap-lg' : ''}${waveMarkers.length > 0 ? ' has-markers' : ''}`}
          onClick={(event) => event.stopPropagation()}
        >
          {waveMarkers.length > 0 ? (
            <div
              className="tf-audio-wave-marker-layer"
              style={{ height: markerLaneHeight }}
              aria-hidden
            >
              {waveMarkers.map((marker) => {
                const left = markerLeftPx[marker.id];
                if (left == null) return null;
                const isOpen = activeMarkerId === marker.id;
                return (
                  <button
                    key={`marker-${marker.id}`}
                    type="button"
                    className={`tf-wave-comment-marker${isOpen ? ' is-open' : ''}${largeWave ? ' tf-wave-comment-marker-lg' : ''}`}
                    style={{
                      left,
                      bottom: marker.stack * markerStackStep,
                      zIndex: isOpen ? 100 : 30 - marker.stack,
                    }}
                    title={`${marker.personName}: ${marker.label}`}
                    aria-label={`${marker.teamName} ${marker.personName} 댓글 ${formatDuration(marker.seconds)} 구간`}
                    aria-expanded={isOpen}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveMarkerId(isOpen ? null : marker.id);
                      onSeekTimestamp?.(marker.seconds);
                    }}
                  >
                    {marker.avatarUrl ? (
                      <img
                        src={marker.avatarUrl}
                        alt=""
                        className="tf-wave-marker-avatar"
                        draggable={false}
                      />
                    ) : (
                      <span className="tf-wave-marker-avatar tf-wave-marker-avatar-fallback" aria-hidden>
                        {marker.personName.slice(0, 1)}
                      </span>
                    )}
                    {isOpen ? (
                      <span className="tf-wave-marker-popover" role="tooltip">
                        {marker.teamId ? (
                          <button
                            type="button"
                            className="tf-wave-marker-popover-team-link"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigateToTeamFeed(getTeam(marker.teamId), () => {
                                setActiveMarkerId(null);
                                onTeamFeedNavigate?.();
                              });
                            }}
                          >
                            {marker.teamName}
                          </button>
                        ) : (
                          <span className="tf-wave-marker-popover-team">{marker.teamName}</span>
                        )}
                        <span className="tf-wave-marker-popover-author">{marker.personName}</span>
                        <span className="tf-wave-marker-popover-text">{marker.label}</span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="tf-audio-wave-body">
            {waveMarkers.length > 0 ? (
              <div className="tf-audio-wave-tick-layer" aria-hidden>
                {waveMarkers.map((marker) => {
                  const left = markerLeftPx[marker.id];
                  if (left == null) return null;
                  return <span key={`tick-${marker.id}`} className="tf-wave-time-tick" style={{ left }} />;
                })}
              </div>
            ) : null}
            <div
              ref={waveRef}
              className={`tf-audio-wave${largeWave ? ' tf-audio-wave-lg' : ''}`}
              role="slider"
              aria-label="재생 위치"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              tabIndex={0}
              onPointerDown={onWavePointerDown}
              onPointerMove={onWavePointerMove}
              onPointerUp={onWavePointerUp}
              onPointerCancel={onWavePointerUp}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  onSeek(Math.max(0, progress - 0.02));
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  onSeek(Math.min(1, progress + 0.02));
                }
              }}
            >
              {bars.map((h, i) => {
                const barRatio = (i + 0.5) / bars.length;
                const barEnd = (i + 1) / bars.length;
                const active = barEnd <= progress || (i === bars.length - 1 && progress >= 1);
                const commentMark = barNearCommentRatio(barRatio, commentRatios, bars.length);
                const className = [active ? 'played' : '', commentMark ? 'comment-mark' : '']
                  .filter(Boolean)
                  .join(' ');
                return (
                  <span key={i} className={className || undefined} style={{ height: `${h}%` }} />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Tag>
  );
}

export type MixedFeedItem =
  | { kind: 'post'; id: string; createdAt: string; post: Post }
  | { kind: 'audio'; id: string; createdAt: string; track: TeamAudioTrack };

interface TeamAudioPanelProps {
  tracks: TeamAudioTrack[];
  canUpload: boolean;
  embedded?: boolean;
  mixedFeed?: {
    items: MixedFeedItem[];
    onPostOpen: (postId: string) => void;
  };
  onTrackOpen?: (trackId: string) => void;
  onUpload?: (input: {
    title: string;
    audioUrl: string;
    durationSec?: number;
    caption?: string;
    body?: string;
    coverImage?: string;
  }) => void;
  seekRequest?: { token: number; seconds: number } | null;
  onTeamFeedNavigate?: () => void;
}

export function TeamAudioPanel({
  tracks,
  canUpload,
  embedded = false,
  mixedFeed,
  onTrackOpen,
  onUpload,
  seekRequest,
  onTeamFeedNavigate,
}: TeamAudioPanelProps) {
  const { activeTeamId } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeTrackIdRef = useRef<string | null>(null);
  const activeDurationSecRef = useRef<number | undefined>(undefined);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [playbackDurationSec, setPlaybackDurationSec] = useState<number | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [coverImage, setCoverImage] = useState<string | undefined>();
  const [cropCoverFile, setCropCoverFile] = useState<File | null>(null);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  useEffect(() => {
    activeTrackIdRef.current = activeTrackId;
  }, [activeTrackId]);

  const syncActiveTrack = (trackId: string) => {
    activeTrackIdRef.current = trackId;
    setActiveTrackId(trackId);
  };

  const releasePlayback = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    activeTrackIdRef.current = null;
    activeDurationSecRef.current = undefined;
    setActiveTrackId(null);
    setPlaybackDurationSec(undefined);
    setIsPlaying(false);
    setProgress(0);
  };

  const syncDuration = (audio: HTMLAudioElement, fallbackSec?: number) => {
    const resolved = resolveDuration(audio, fallbackSec);
    if (resolved == null) return undefined;
    activeDurationSecRef.current = resolved;
    setPlaybackDurationSec(resolved);
    return resolved;
  };

  const attachAudioHandlers = (audio: HTMLAudioElement, durationSec?: number) => {
    activeDurationSecRef.current = durationSec;
    setPlaybackDurationSec(durationSec);

    const onMeta = () => syncDuration(audio, durationSec);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);

    audio.ontimeupdate = () => {
      const duration = resolveDuration(audio, activeDurationSecRef.current);
      if (!duration) return;
      setProgress(Math.min(1, audio.currentTime / duration));
    };
    audio.onended = () => {
      setIsPlaying(false);
      setProgress(1);
    };
    audio.onerror = () => {
      setError('재생할 수 없는 파일이에요.');
      releasePlayback();
    };
  };

  const ensureAudioElement = (track: TeamAudioTrack): HTMLAudioElement => {
    if (audioRef.current && activeTrackIdRef.current === track.id) {
      activeDurationSecRef.current = track.durationSec ?? activeDurationSecRef.current;
      return audioRef.current;
    }

    audioRef.current?.pause();
    const audio = new Audio(track.audioUrl);
    audio.preload = 'auto';
    audioRef.current = audio;
    syncActiveTrack(track.id);
    attachAudioHandlers(audio, track.durationSec);
    return audio;
  };

  const waitForAudioReady = (audio: HTMLAudioElement, fallbackSec?: number) =>
    new Promise<boolean>((resolve) => {
      const hasDuration = () => resolveDuration(audio, fallbackSec) != null;

      if (hasDuration()) {
        resolve(true);
        return;
      }

      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        audio.removeEventListener('loadedmetadata', onReady);
        audio.removeEventListener('durationchange', onReady);
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('error', onError);
        window.clearTimeout(timer);
        resolve(ok);
      };
      const onReady = () => finish(hasDuration());
      const onError = () => finish(false);
      const timer = window.setTimeout(() => finish(hasDuration()), 8000);

      audio.addEventListener('loadedmetadata', onReady);
      audio.addEventListener('durationchange', onReady);
      audio.addEventListener('canplay', onReady);
      audio.addEventListener('error', onError);
      audio.load();
    });

  const applySeek = (audio: HTMLAudioElement, ratio: number, fallbackSec?: number): Promise<boolean> =>
    new Promise((resolve) => {
      const duration = resolveDuration(audio, activeDurationSecRef.current ?? fallbackSec);
      if (!duration) {
        resolve(false);
        return;
      }

      const nextTime = Math.min(duration - 0.01, Math.max(0, ratio * duration));
      const commit = () => {
        syncDuration(audio, fallbackSec);
        try {
          audio.currentTime = nextTime;
        } catch {
          resolve(false);
          return;
        }
        setProgress(nextTime / duration);
        resolve(true);
      };

      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        commit();
        return;
      }

      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('loadeddata', onCanPlay);
        window.clearTimeout(timer);
        if (ok) commit();
        else resolve(false);
      };
      const onCanPlay = () => finish(true);
      const timer = window.setTimeout(() => finish(audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA), 3000);

      audio.addEventListener('canplay', onCanPlay);
      audio.addEventListener('loadeddata', onCanPlay);
      if (audio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
        audio.load();
      }
    });

  const playAudio = (audio: HTMLAudioElement) => {
    void audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        setError('재생에 실패했어요.');
      });
  };

  const togglePlayPause = (track: TeamAudioTrack) => {
    setError('');

    if (activeTrackIdRef.current === track.id && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        playAudio(audioRef.current);
      }
      return;
    }

    const audio = ensureAudioElement(track);
    setProgress(0);
    void waitForAudioReady(audio, track.durationSec).then((ok) => {
      if (!ok || !audioRef.current) return;
      void applySeek(audioRef.current, 0, track.durationSec).then((seeked) => {
        if (seeked && audioRef.current) playAudio(audioRef.current);
      });
    });
  };

  const restartTrack = (track: TeamAudioTrack) => {
    setError('');
    const audio = ensureAudioElement(track);
    const start = () => {
      void applySeek(audio, 0, track.durationSec).then((seeked) => {
        if (seeked) playAudio(audio);
      });
    };

    if (resolveDuration(audio, track.durationSec) != null) {
      start();
      return;
    }

    void waitForAudioReady(audio, track.durationSec).then((ok) => {
      if (!ok) return;
      start();
    });
  };

  const seekTrack = (track: TeamAudioTrack, ratio: number, shouldPlay = true) => {
    setError('');
    const clamped = Math.max(0, Math.min(1, ratio));
    const audio = ensureAudioElement(track);
    setProgress(clamped);

    const finishSeek = () => {
      void applySeek(audio, clamped, track.durationSec).then((seeked) => {
        if (!seeked) {
          setError('재생 위치를 찾지 못했어요.');
          return;
        }
        if (shouldPlay) playAudio(audio);
      });
    };

    if (resolveDuration(audio, track.durationSec) != null) {
      if (shouldPlay) void audio.play().catch(() => {});
      finishSeek();
      return;
    }

    if (shouldPlay) void audio.play().catch(() => {});
    void waitForAudioReady(audio, track.durationSec).then((ok) => {
      if (!ok) {
        setError('재생 위치를 찾지 못했어요.');
        return;
      }
      finishSeek();
    });
  };

  const seekToTimestamp = (track: TeamAudioTrack, seconds: number, shouldPlay = true) => {
    const audio = ensureAudioElement(track);
    const resolved = resolveDuration(audio, track.durationSec ?? activeDurationSecRef.current);
    if (resolved != null && resolved > 0) {
      seekTrack(track, Math.max(0, Math.min(1, seconds / resolved)), shouldPlay);
      return;
    }
    void waitForAudioReady(audio, track.durationSec).then((ok) => {
      if (!ok) return;
      const duration = resolveDuration(audio, track.durationSec ?? activeDurationSecRef.current);
      if (!duration || duration <= 0) return;
      seekTrack(track, Math.max(0, Math.min(1, seconds / duration)), shouldPlay);
    });
  };

  useEffect(() => {
    if (!seekRequest) return;
    const track = tracks.find((t) => t.id === activeTrackIdRef.current) ?? tracks[0];
    if (!track) return;
    seekToTimestamp(track, seekRequest.seconds, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seek on external token only
  }, [seekRequest?.token]);

  const onFilePicked = (file: File | undefined) => {
    setError('');
    if (!file) return;
    const isAudio =
      file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i.test(file.name);
    if (!isAudio) {
      setError('오디오 파일만 올릴 수 있어요.');
      setPendingFile(null);
      return;
    }
    setPendingFile(file);
  };

  const clearPendingFile = () => {
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const clearCoverImage = () => {
    setCoverImage(undefined);
    if (coverRef.current) coverRef.current.value = '';
  };

  const onCoverPicked = (file: File | undefined) => {
    setError('');
    if (!file) return;
    const isImage =
      file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name);
    if (!isImage) {
      setError('이미지 파일만 배경으로 올릴 수 있어요.');
      return;
    }
    // File picker close can trigger a ghost click that instantly dismisses the crop sheet.
    window.setTimeout(() => setCropCoverFile(file), 100);
  };

  const submitUpload = async () => {
    if (!pendingFile || uploading || !activeTeamId) return;
    setError('');
    setUploading(true);
    const previewUrl = URL.createObjectURL(pendingFile);
    try {
      const durationSec = await getAudioDuration(previewUrl);
      const prepared = await prepareMediaBlob(pendingFile, 'audio');
      const audioUrl = await ensurePublishedMedia(prepared, 'audio', activeTeamId, pendingFile.name);
      const publishedCover = coverImage
        ? await ensurePublishedMedia(coverImage, 'audio', activeTeamId)
        : undefined;

      const trimmedTitle =
        title.trim() || pendingFile.name.replace(/\.[^.]+$/, '') || '새 녹음';
      onUpload?.({
        title: trimmedTitle,
        audioUrl,
        durationSec,
        caption: caption.trim() || undefined,
        body: body.trim() || undefined,
        coverImage: publishedCover,
      });
      setTitle('');
      setCaption('');
      setBody('');
      clearPendingFile();
      clearCoverImage();
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일을 불러오지 못했어요.');
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploading(false);
    }
  };

  const openTrack = (trackId: string) => {
    releasePlayback();
    onTrackOpen?.(trackId);
  };

  const renderTrackCard = (track: TeamAudioTrack, gridCell = false) => (
    <AudioTrackCard
      key={track.id}
      track={track}
      gridCell={gridCell}
      isActive={activeTrackId === track.id}
      isPlaying={activeTrackId === track.id && isPlaying}
      progress={activeTrackId === track.id ? progress : 0}
      playbackDurationSec={activeTrackId === track.id ? playbackDurationSec : undefined}
      largeWave={embedded}
      onPlayPause={() => togglePlayPause(track)}
      onRestart={() => restartTrack(track)}
      onSeek={(ratio, shouldPlay) => seekTrack(track, ratio, shouldPlay ?? true)}
      onSeekTimestamp={(seconds) => seekToTimestamp(track, seconds, true)}
      onOpen={onTrackOpen ? () => openTrack(track.id) : undefined}
      onTeamFeedNavigate={onTeamFeedNavigate}
    />
  );

  const renderMixedFeed = () => {
    if (!mixedFeed || mixedFeed.items.length === 0) return null;
    return (
      <div className="tf-mixed-feed-grid">
        {mixedFeed.items.map((item) => {
          if (item.kind === 'post') {
            const p = item.post;
            return (
              <button
                key={item.id}
                type="button"
                className="tf-grid-cell"
                onClick={() => mixedFeed.onPostOpen(p.id)}
                aria-label="게시물 보기"
              >
                {p.mediaType === 'video' && p.mediaUrl ? (
                  <div className="tf-grid-video">
                    <video src={p.mediaUrl} muted playsInline preload="metadata" />
                    <span className="tf-grid-badge">▶</span>
                  </div>
                ) : p.mediaType === 'image' && p.mediaUrl ? (
                  <img src={p.mediaUrl} alt="" />
                ) : (
                  <div className="tf-grid-text">
                    <p>{p.caption}</p>
                  </div>
                )}
              </button>
            );
          }
          return (
            <div key={item.id} className="tf-mixed-audio-cell">
              {renderTrackCard(item.track, true)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`tf-audio-panel${embedded ? ' tf-audio-panel-embedded' : ''}${mixedFeed ? ' tf-audio-panel-mixed' : ''}`}>
      {canUpload && !mixedFeed && (
        <div className="tf-audio-upload card">
          <div className="tf-audio-upload-head">
            <span className="tf-audio-upload-icon">🎙</span>
            <div>
              <strong>녹음 파일 올리기</strong>
              <p>데모·리허설·합주 녹음을 팀 프로필에 올려요. 큰 파일은 자동으로 {formatMaxSize(CHAT_MAX_AUDIO_BYTES)} 이하로 줄여요.</p>
            </div>
          </div>
          <div className="field">
            <label>제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 신곡 INTRO 데모"
              maxLength={40}
            />
          </div>
          <div className="field">
            <label>설명 (선택)</label>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="템포, 파트, 메모…"
              maxLength={120}
            />
          </div>
          <div className="field">
            <label>글 (선택)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="팀원에게 전할 메시지, 연습 메모, 공유할 내용…"
              maxLength={500}
              rows={3}
            />
          </div>
          <div className="field tf-audio-cover-field">
            <label>글 배경 사진 (선택)</label>
            <div className="tf-audio-cover-actions">
              <button
                type="button"
                className="btn tf-audio-cover-btn"
                disabled={uploading}
                onClick={() => coverRef.current?.click()}
              >
                {coverImage ? '사진 변경' : '사진 선택'}
              </button>
              {coverImage ? (
                <button type="button" className="btn tf-audio-cover-clear" disabled={uploading} onClick={clearCoverImage}>
                  제거
                </button>
              ) : null}
            </div>
            {coverImage ? (
              <div className="tf-audio-cover-preview">
                <img src={coverImage} alt="" />
              </div>
            ) : (
              <p className="tf-audio-cover-hint">정사각형으로 자르기 후 제목·설명 뒤 배경으로 표시돼요.</p>
            )}
          </div>
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            className="tf-audio-file"
            onChange={(e) => {
              onCoverPicked(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="tf-audio-file"
            onChange={(e) => {
              onFilePicked(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {pendingFile ? (
            <div className="tf-audio-pending">
              <span className="tf-audio-pending-name">{pendingFile.name}</span>
              <button type="button" className="tf-audio-pending-clear" onClick={clearPendingFile} disabled={uploading}>
                제거
              </button>
            </div>
          ) : null}
          <div className="tf-audio-upload-actions">
            <button
              type="button"
              className="btn tf-audio-pick-btn"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              파일 선택
            </button>
            <button
              type="button"
              className="btn btn-primary tf-audio-upload-btn"
              disabled={uploading || !pendingFile}
              onClick={() => void submitUpload()}
            >
              {uploading ? '압축 · 올리는 중…' : '올리기'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="tf-audio-error">{error}</p>}

      {mixedFeed ? (
        renderMixedFeed()
      ) : tracks.length > 0 ? (
        <ul className="tf-audio-list">
          {tracks.map((track) => renderTrackCard(track))}
        </ul>
      ) : (
        !canUpload && (
          <div className="tf-empty card">
            <p>아직 올린 녹음이 없어요.</p>
          </div>
        )
      )}

      {!mixedFeed && tracks.length === 0 && canUpload && !embedded && (
        <div className="tf-audio-empty-hint card">
          <p>올린 녹음이 여기에 사운드클라우드처럼 표시돼요.</p>
        </div>
      )}

      {cropCoverFile ? (
        <SquareImageCropSheet
          file={cropCoverFile}
          heading="배경 사진 자르기"
          onConfirm={(dataUrl) => {
            setCoverImage(dataUrl);
            setCropCoverFile(null);
          }}
          onClose={() => setCropCoverFile(null)}
        />
      ) : null}
    </div>
  );
}
