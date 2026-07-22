import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import type { PracticeSessionMeta } from '../../types';
import type { PositionId } from '../../types';
import { POS_ART } from '../../mock/positions';
import {
  POSITIONS,
  analyzeMedia,
  drawWaveform,
  slicePeaks,
  trackPlayableDuration,
  trackPlayableEndSec,
  trackSessionDurationSec,
  trackSyncOffsetSec,
  trackTrimStartSec,
  type JamTrack,
} from './jamUtils';
import {
  applyMixTransport,
  cancelPendingSyncPlays,
  loadTrackElement,
  mixSessionDurationSec,
  primeMixTransport,
  resumePracticeAudio,
  setElementVolume,
} from './practicePlayback';
import { WaveformTrimSheet } from './WaveformTrimSheet';
import { VideoTrackViewerSheet } from './VideoTrackViewerSheet';
import { RecordPreviewSheet, type RecordPreviewData } from './RecordPreviewSheet';
import { VideoCropSheet } from '../media/VideoCropSheet';
import { MediaProgressPanel } from '../../components/MediaProgressPanel';
import { clampProgress } from '../../utils/mediaProgress';
import { loadSessionTracks, saveSessionTracks, type StoredPracticeTrack } from '../../utils/practiceStorage';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../state/AuthContext';
import { useApp } from '../../state/AppContext';
import { findCurrentMember } from '../../mock/memberUtils';
import {
  fetchPracticeTracksForSession,
  syncPracticeTracksToDb,
  deletePracticeTrackInDb,
} from '../../services/practiceTracksService';
import { isStoragePublicUrl } from '../../services/storageService';
import { ensureVideoFileType } from '../../utils/videoMediaUtils';
import './PracticeRoom.css';

interface PendingPos {
  id: PositionId;
  label: string;
  color: string;
  nick: string;
}

interface Props {
  session: PracticeSessionMeta;
  teamName: string;
  onBack: () => void;
}

function isVideoFile(file: File): boolean {
  return (
    file.type.startsWith('video/') ||
    /\.(mp4|mov|webm|m4v|mkv|3gp)$/i.test(file.name)
  );
}

const SYNC_NUDGE_FINE = 0.001;
const SYNC_NUDGE_COARSE = 0.01;
const SYNC_NUDGE_WIDE = 0.1;
const MAX_SYNC_OFFSET = 10;

function formatSyncOffset(sec: number): string {
  const ms = Math.round(sec * 1000);
  if (ms === 0) return '0ms';
  return ms > 0 ? `+${ms}ms` : `${ms}ms`;
}

function syncWaveformLayout(t: JamTrack, timeline: number) {
  const syncSec = trackSyncOffsetSec(t);
  const playable = trackPlayableDuration(t);
  const clipPct = Math.max(2, (playable / timeline) * 100);
  const clipLeftPct = (syncSec / timeline) * 100;
  return { clipPct, clipLeftPct };
}

/**
 * 0–1 progress within a track's full playable clip (trimStart → windowEnd),
 * driven by the actual file position at the given session elapsed time.
 * Used for waveform highlight, which is drawn over the full-clip peaks.
 */
function trackMixLocalProgress(t: JamTrack, elapsedSec: number): number {
  const offset = trackSyncOffsetSec(t);
  const playable = trackPlayableDuration(t);
  if (playable <= 0) return 0;
  if (offset > 0 && elapsedSec <= offset) return 0;
  if (elapsedSec >= offset + playable) return 1;
  return (elapsedSec - offset) / playable;
}

/**
 * Solo playback is driven by the same elapsed-time transport as mix (see
 * `applyMixTransport`), just for a single track, so both modes share the
 * exact same visual math: `playProgress` is always "seconds elapsed since
 * the left wall / shared timeline", 0–1.
 */
function trackVisualLocalProgress(
  t: JamTrack,
  timeline: number,
  playProgress: number,
  mode: 'mix' | 'solo' | 'idle',
): number {
  if (mode === 'idle' || playProgress <= 0) return 0;
  return trackMixLocalProgress(t, playProgress * timeline);
}

function trackPlayheadLeftPct(playProgress: number, mode: 'mix' | 'solo' | 'idle'): number {
  if (mode === 'idle' || playProgress <= 0) return 0;
  return playProgress * 100;
}

function trackVolume(t: JamTrack): number {
  return t.volume ?? 1;
}

function isTrackAudible(t: JamTrack): boolean {
  return trackVolume(t) > 0;
}

function toStoredTrack(track: JamTrack): StoredPracticeTrack {
  return {
    id: track.id,
    name: track.name,
    mediaUrl: track.blobUrl,
    color: track.color,
    volume: track.volume ?? 1,
    peaks: track.peaks,
    duration: track.duration,
    positionId: track.positionId,
    positionLabel: track.positionLabel,
    kind: track.kind,
    authorUserId: track.authorUserId,
    syncOffsetSec: track.syncOffsetSec ?? 0,
    trimStartSec: track.trimStartSec ?? 0,
    trimEndSec: track.trimEndSec ?? 0,
  };
}

function fromStoredTrack(track: StoredPracticeTrack): JamTrack {
  return {
    id: track.id,
    name: track.name,
    blobUrl: track.mediaUrl,
    color: track.color,
    volume: track.volume ?? (track.muted ? 0 : 1),
    peaks: track.peaks,
    duration: track.duration,
    positionId: track.positionId,
    positionLabel: track.positionLabel,
    kind: track.kind,
    authorUserId: track.authorUserId,
    syncOffsetSec: track.syncOffsetSec ?? 0,
    trimStartSec: track.trimStartSec ?? 0,
    trimEndSec: track.trimEndSec ?? 0,
  };
}

function revokeBlobUrl(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

export function PracticeRoom({ session, teamName, onBack }: Props) {
  const { session: authSession } = useAuth();
  const { isOwnPracticeSession, deleteSession, user, activeTeam } = useApp();
  const useDb = isSupabaseConfigured && !!authSession;
  const canDeleteSession = isOwnPracticeSession(session);
  const [tracksLoading, setTracksLoading] = useState(() => isSupabaseConfigured);
  const syncedRef = useRef<Map<number, StoredPracticeTrack>>(new Map());
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);
  const syncPendingRef = useRef(false);
  const runSyncRef = useRef<(() => void) | null>(null);
  const tracksHydratedRef = useRef(!useDb);
  /** Only true after the user explicitly removed every track — never on initial load. */
  const userEmptiedTracksRef = useRef(false);

  const [tracks, setTracks] = useState<JamTrack[]>(() =>
    useDb ? [] : loadSessionTracks(session.id).map(fromStoredTrack),
  );
  const [mixPlaying, setMixPlaying] = useState(false);
  const [soloId, setSoloId] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [transportLabel, setTransportLabel] = useState('새 동영상 올리기');
  const [transportSub, setTransportSub] = useState('+ 눌러 포지션 선택');

  const [posOpen, setPosOpen] = useState(false);
  const [selPos, setSelPos] = useState<PositionId | null>(null);

  const [playProgress, setPlayProgress] = useState<Record<number, number>>({});
  const [trimTrackId, setTrimTrackId] = useState<number | null>(null);
  const [recordPreview, setRecordPreview] = useState<RecordPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [cropTarget, setCropTarget] = useState<{ file: File; pos: PendingPos } | null>(null);
  const [videoViewerTrackId, setVideoViewerTrackId] = useState<number | null>(null);
  const [mediaJob, setMediaJob] = useState<{
    label: string;
    progress: number;
    startedAt: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<PendingPos | null>(null);
  const mediaJobStartedRef = useRef(0);
  const activeRef = useRef<HTMLMediaElement[]>([]);
  const rafRef = useRef<number | null>(null);

  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const videoMountRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const videoThumbRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const transportStartRef = useRef<number | null>(null);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const ownTrackIdsRef = useRef<Set<number>>(new Set());

  const markOwnTrack = useCallback((trackId: number) => {
    ownTrackIdsRef.current.add(trackId);
  }, []);

  const getUploaderNick = useCallback(() => {
    if (!activeTeam) return user.name;
    return findCurrentMember(activeTeam, user)?.nick ?? user.name;
  }, [activeTeam, user]);

  const reportMediaJob = useCallback((label: string, progress: number) => {
    if (mediaJobStartedRef.current === 0) mediaJobStartedRef.current = performance.now();
    setMediaJob({
      label,
      progress: clampProgress(progress),
      startedAt: mediaJobStartedRef.current,
    });
  }, []);

  const clearMediaJob = useCallback(() => {
    mediaJobStartedRef.current = 0;
    setMediaJob(null);
  }, []);

  const mountPlaybackVideo = useCallback((trackId: number, el: HTMLMediaElement) => {
    if (!(el instanceof HTMLVideoElement)) return;
    const mount = videoMountRefs.current.get(trackId);
    if (!mount) return;
    el.className = 'video-tile-playback';
    el.playsInline = true;
    mount.replaceChildren(el);
  }, []);

  const syncVideoThumbs = useCallback(() => {
    tracksRef.current.forEach((t) => {
      if (t.kind !== 'video') return;
      const playback = activeRef.current.find((x) => x.dataset.trackId === String(t.id));
      const thumb = videoThumbRefs.current.get(t.id);
      if (!playback || !thumb) return;
      if (Math.abs(thumb.currentTime - playback.currentTime) > 0.05) {
        thumb.currentTime = playback.currentTime;
      }
      if (!playback.paused && thumb.paused) void thumb.play().catch(() => {});
      else if (playback.paused && !thumb.paused) thumb.pause();
    });
  }, []);

  const persistTracks = useCallback(
    (next: JamTrack[]) => {
      tracksRef.current = next;
      const stored = next.map(toStoredTrack);
      if (!useDb) {
        const ok = saveSessionTracks(session.id, stored);
        if (!ok) setStatus('트랙 저장 공간이 부족해요. 오래된 트랙을 삭제해주세요.');
        return;
      }

      const runSync = () => {
        if (syncInFlightRef.current) {
          syncPendingRef.current = true;
          return;
        }
        syncInFlightRef.current = true;
        const payload = tracksRef.current.map(toStoredTrack);
        if (
          payload.length === 0 &&
          syncedRef.current.size > 0 &&
          !userEmptiedTracksRef.current
        ) {
          syncInFlightRef.current = false;
          return;
        }
        void syncPracticeTracksToDb(session, payload, syncedRef.current, {
          onUploadProgress: (update) => {
            reportMediaJob(update.label ?? '클라우드에 저장 중…', update.progress);
          },
          allowEmpty: userEmptiedTracksRef.current,
        })
          .then((map) => {
            syncedRef.current = map;
            if (map.size === 0) userEmptiedTracksRef.current = false;
            setTracks((prev) =>
              prev.map((t) => {
                const saved = map.get(t.id);
                if (!saved) return t;
                if (saved.authorUserId) markOwnTrack(t.id);
                const blobUrl =
                  saved.mediaUrl !== t.blobUrl ? saved.mediaUrl : t.blobUrl;
                if (saved.mediaUrl !== t.blobUrl && t.blobUrl.startsWith('blob:')) {
                  revokeBlobUrl(t.blobUrl);
                }
                if (
                  blobUrl === t.blobUrl &&
                  saved.authorUserId === t.authorUserId &&
                  (saved.syncOffsetSec ?? 0) === (t.syncOffsetSec ?? 0) &&
                  (saved.trimStartSec ?? 0) === (t.trimStartSec ?? 0) &&
                  (saved.trimEndSec ?? 0) === (t.trimEndSec ?? 0)
                ) {
                  return t;
                }
                return {
                  ...t,
                  blobUrl,
                  authorUserId: saved.authorUserId ?? t.authorUserId,
                  syncOffsetSec: saved.syncOffsetSec ?? t.syncOffsetSec ?? 0,
                  trimStartSec: saved.trimStartSec ?? t.trimStartSec ?? 0,
                  trimEndSec: saved.trimEndSec ?? t.trimEndSec ?? 0,
                };
              }),
            );
            setStatus((prev) =>
              prev.startsWith('클라우드 저장') ? '' : prev,
            );
          })
          .catch((err) => {
            console.error('[BandCrew] practice tracks sync failed', err);
            setStatus(
              '클라우드 저장에 실패했어요. 로컬 재생은 가능해요 — 잠시 후 다시 시도해주세요.',
            );
          })
          .finally(() => {
            syncInFlightRef.current = false;
            if (!syncPendingRef.current) clearMediaJob();
            if (syncPendingRef.current) {
              syncPendingRef.current = false;
              runSync();
            }
          });
      };

      runSyncRef.current = runSync;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(runSync, 400);
    },
    [session, useDb, markOwnTrack, reportMediaJob, clearMediaJob],
  );

  useEffect(() => {
    if (!useDb) {
      tracksHydratedRef.current = true;
      return;
    }
    let cancelled = false;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    tracksHydratedRef.current = false;
    setTracksLoading(true);
    void fetchPracticeTracksForSession(session.id)
      .then((stored) => {
        if (cancelled) return;
        const uid = authSession?.user.id;
        stored.forEach((t) => {
          if (uid && t.authorUserId === uid) markOwnTrack(t.id);
        });
        syncedRef.current = new Map(stored.map((t) => [t.id, t]));
        userEmptiedTracksRef.current = false;
        setTracks(stored.map(fromStoredTrack));
        if (stored.some((t) => t.mediaUrl.startsWith('blob:'))) {
          setStatus('일부 트랙 파일이 저장되지 않았어요. 다시 올려주세요.');
        }
      })
      .catch((err) => {
        console.error('[BandCrew] practice tracks load failed', err);
        setStatus('연습 트랙을 불러오지 못했어요.');
      })
      .finally(() => {
        if (!cancelled) {
          tracksHydratedRef.current = true;
          setTracksLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [useDb, session.id, authSession?.user.id, markOwnTrack]);

  useEffect(
    () => () => {
      // Leaving the page shouldn't drop a pending debounced save — flush it
      // immediately instead of just cancelling the timer (which previously
      // dropped the last upload if you navigated away within ~400ms).
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
        runSyncRef.current?.();
      }
    },
    [],
  );

  useEffect(() => {
    const flushPendingSync = () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
        runSyncRef.current?.();
      }
    };
    window.addEventListener('pagehide', flushPendingSync);
    return () => window.removeEventListener('pagehide', flushPendingSync);
  }, []);

  useEffect(() => {
    if (tracksLoading || !tracksHydratedRef.current) return;
    persistTracks(tracks);
  }, [tracks, persistTracks, tracksLoading]);

  const maxDur = useCallback(() => mixSessionDurationSec(tracks), [tracks]);

  const stopAll = useCallback(() => {
    cancelPendingSyncPlays(activeRef.current);
    activeRef.current.forEach((a) => {
      try {
        a.pause();
        if (a.parentElement?.classList.contains('video-tile-mount')) {
          a.parentElement.replaceChildren();
        }
        a.removeAttribute('src');
        a.load();
      } catch {
        /* ignore */
      }
    });
    videoThumbRefs.current.forEach((thumb) => {
      try {
        thumb.pause();
        thumb.currentTime = 0;
      } catch {
        /* ignore */
      }
    });
    activeRef.current = [];
    transportStartRef.current = null;
    setSoloId(null);
    setMixPlaying(false);
    setPlayProgress({});
  }, []);

  const paintWaveforms = useCallback(
    (progress: Record<number, number> | null) => {
      const timeline = maxDur();
      const mode: 'mix' | 'solo' | 'idle' = mixPlaying ? 'mix' : soloId != null ? 'solo' : 'idle';
      tracks.forEach((t) => {
        const canvas = canvasRefs.current.get(t.id);
        const global = progress?.[t.id];
        const trackMode = soloId === t.id && !mixPlaying ? 'solo' : mode;
        const local =
          global != null && trackMode !== 'idle'
            ? trackVisualLocalProgress(t, timeline, global, trackMode)
            : null;
        const trimmedPeaks = slicePeaks(
          t.peaks,
          trackTrimStartSec(t),
          trackPlayableEndSec(t),
          t.duration || timeline,
        );
        drawWaveform(canvas ?? null, trimmedPeaks, t.color, local);
      });
    },
    [tracks, maxDur, soloId, mixPlaying],
  );

  useEffect(() => {
    requestAnimationFrame(() => paintWaveforms(null));
  }, [tracks, paintWaveforms]);

  const syncLoop = useCallback(() => {
    const timeline = maxDur();
    const next: Record<number, number> = {};
    if (mixPlaying) {
      const start = transportStartRef.current;
      if (start != null && timeline > 0) {
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed >= timeline) {
          stopAll();
          return;
        }
        const p = Math.min(1, elapsed / timeline);
        tracks.forEach((t) => {
          next[t.id] = p;
        });
        tracksRef.current.filter(isTrackAudible).forEach((t) => {
          const el = activeRef.current.find((x) => x.dataset.trackId === String(t.id));
          if (el) applyMixTransport(el, t, elapsed);
        });
      }
    } else if (soloId != null) {
      const solo = tracks.find((t) => t.id === soloId);
      const start = transportStartRef.current;
      const a = activeRef.current.find((x) => x.dataset.trackId === String(soloId));
      if (a && solo && start != null) {
        const elapsed = (performance.now() - start) / 1000;
        const soloEnd = trackSessionDurationSec(solo);
        if (elapsed >= soloEnd) {
          stopAll();
          return;
        }
        next[soloId] = timeline > 0 ? Math.min(1, elapsed / timeline) : 0;
        applyMixTransport(a, solo, elapsed);
      }
    }
    setPlayProgress(next);
    paintWaveforms(next);
    syncVideoThumbs();
  }, [maxDur, mixPlaying, soloId, tracks, paintWaveforms, stopAll, syncVideoThumbs]);

  useEffect(() => {
    if (!mixPlaying && soloId == null) return;
    const tick = () => {
      syncLoop();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mixPlaying, soloId, syncLoop]);

  /** Solo preview: drive playback with the same elapsed-time transport as
   * mix (single-track), so it also waits out a positive sync offset before
   * making sound instead of skipping straight to the clip. */
  const playTrack = (t: JamTrack, onFail?: () => void) => {
    const latest = tracksRef.current.find((x) => x.id === t.id) ?? t;
    void loadTrackElement(latest)
      .then((el) => {
        activeRef.current.push(el);
        mountPlaybackVideo(latest.id, el);
        transportStartRef.current = performance.now();
        primeMixTransport([latest], [el]);
      })
      .catch(() => onFail?.());
  };

  const resetTransport = () => {
    setTransportLabel('새 동영상 올리기');
    setTransportSub('+ 눌러 포지션 선택');
  };

  const processMediaFile = async (blob: Blob, pos: PendingPos) => {
    setPreviewLoading(true);
    mediaJobStartedRef.current = performance.now();
    reportMediaJob('파일 분석 중…', 0);
    setTransportLabel('파일 확인 준비 중…');
    setTransportSub('잠시만 기다려 주세요');

    const blobUrl = URL.createObjectURL(blob);
    try {
      const analyzed = await analyzeMedia(blobUrl, (update) => {
        reportMediaJob(update.label ?? '파일 분석 중…', update.progress);
      });
      clearMediaJob();
      setRecordPreview({
        blobUrl,
        kind: 'video',
        positionId: pos.id,
        positionLabel: pos.label,
        name: pos.nick || `트랙 ${tracks.length + 1}`,
        color: pos.color,
        peaks: analyzed.peaks,
        duration: analyzed.duration,
      });
      setTransportLabel('파일 확인');
      setTransportSub('미리 듣고 올릴지 선택하세요');
      setStatus('');
    } catch {
      clearMediaJob();
      URL.revokeObjectURL(blobUrl);
      resetTransport();
      setStatus('파일을 불러오지 못했어요. 다른 파일로 다시 시도해 주세요.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const pos = pendingRef.current;
    pendingRef.current = null;
    if (!file || !pos) return;

    if (!isVideoFile(file)) {
      setStatus('동영상 파일을 선택해 주세요.');
      return;
    }

    setCropTarget({ file: ensureVideoFileType(file), pos });
    setTransportLabel('영상 프레임 맞추기');
    setTransportSub('정사각형으로 잘라서 올려요');
  };

  const handleCropConfirm = (cropped: Blob) => {
    const target = cropTarget;
    setCropTarget(null);
    if (!target) return;
    void processMediaFile(cropped, target.pos);
  };

  const handleCropSkip = (blob: Blob) => {
    const target = cropTarget;
    setCropTarget(null);
    if (!target) return;
    void processMediaFile(blob, target.pos);
  };

  const handleCropClose = () => {
    setCropTarget(null);
    resetTransport();
  };

  const confirmRecordPreview = () => {
    if (!recordPreview) return;
    const track: JamTrack = {
      id: Date.now(),
      name: recordPreview.name,
      blobUrl: recordPreview.blobUrl,
      color: recordPreview.color,
      volume: 1,
      peaks: recordPreview.peaks,
      duration: recordPreview.duration,
      positionId: recordPreview.positionId,
      positionLabel: recordPreview.positionLabel,
      kind: recordPreview.kind,
      authorUserId: authSession?.user.id,
      syncOffsetSec: 0,
    };
    if (authSession?.user.id) markOwnTrack(track.id);
    setTracks((prev) => [...prev, track]);
    setRecordPreview(null);
    resetTransport();
    setStatus(`${track.positionLabel} · ${track.name} 추가됨`);
  };

  const discardRecordPreview = () => {
    if (recordPreview) URL.revokeObjectURL(recordPreview.blobUrl);
    setRecordPreview(null);
    resetTransport();
    setStatus('파일을 버렸어요.');
  };

  const openPos = () => {
    if (recordPreview || previewLoading || cropTarget) return;
    if (mixPlaying) stopAll();
    if (soloId != null) stopAll();
    setPosOpen(true);
    setSelPos(null);
  };

  const confirmPos = () => {
    if (!selPos || previewLoading) return;
    const p = POSITIONS.find((x) => x.id === selPos)!;
    pendingRef.current = {
      id: p.id,
      label: p.label,
      color: p.color,
      nick: getUploaderNick(),
    };
    setPosOpen(false);
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = 'video/*';
    input.click();
  };

  const isOwnTrack = useCallback(
    (t: JamTrack) => {
      if (!useDb) return true;
      const uid = authSession?.user.id;
      if (!uid) return false;
      if (t.authorUserId === uid) return true;
      return ownTrackIdsRef.current.has(t.id);
    },
    [useDb, authSession?.user.id],
  );

  const setTrackVolume = (id: number, volume: number) => {
    const vol = Math.max(0, Math.min(1, volume));
    activeRef.current.forEach((a) => {
      if (a.dataset.trackId === String(id)) setElementVolume(a, vol);
    });
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, volume: vol } : t)),
    );
  };

  const deleteTrack = (id: number) => {
    const t = tracks.find((x) => x.id === id);
    if (!t || !isOwnTrack(t) || !confirm(`"${t.name}" 삭제할까요?`)) return;
    if (soloId === id) stopAll();

    const synced = syncedRef.current.get(id);
    syncedRef.current.delete(id);

    if (useDb) {
      const mediaUrl =
        synced?.mediaUrl ??
        (isStoragePublicUrl(t.blobUrl) ? t.blobUrl : undefined);
      void deletePracticeTrackInDb(session.id, id, mediaUrl).catch((err) => {
        console.error('[BandCrew] delete practice track failed', err);
        if (synced) syncedRef.current.set(id, synced);
        setStatus('트랙 삭제에 실패했어요. 잠시 후 다시 시도해주세요.');
      });
    }

    revokeBlobUrl(t.blobUrl);
    ownTrackIdsRef.current.delete(id);
    setTracks((prev) => {
      const next = prev.filter((x) => x.id !== id);
      if (next.length === 0) userEmptiedTracksRef.current = true;
      return next;
    });
  };

  const toggleSolo = (id: number) => {
    resumePracticeAudio();
    if (mixPlaying) stopAll();
    if (soloId === id) {
      stopAll();
      return;
    }
    stopAll();
    setSoloId(id);
    const t = tracks.find((x) => x.id === id);
    if (!t) return;
    playTrack(t, () => {
      setSoloId(null);
      stopAll();
    });
  };

  const applyTrackTrim = (trackId: number, trimStartSec: number, trimEndSec: number) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId ? { ...t, trimStartSec, trimEndSec } : t,
      ),
    );
    setTrimTrackId(null);
  };

  const nudgeSyncOffset = (id: number, delta: number) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = Math.round(((t.syncOffsetSec ?? 0) + delta) * 1000) / 1000;
        const clamped = Math.max(-MAX_SYNC_OFFSET, Math.min(MAX_SYNC_OFFSET, next));
        return { ...t, syncOffsetSec: clamped };
      }),
    );
  };

  const handleDeleteSession = () => {
    void deleteSession(session.id).then((ok) => {
      if (ok) onBack();
    });
  };

  const openVideoViewer = (trackId: number) => {
    resumePracticeAudio();
    stopAll();
    setVideoViewerTrackId(trackId);
  };

  const toggleMix = () => {
    resumePracticeAudio();
    if (soloId != null) stopAll();
    if (mixPlaying) {
      stopAll();
      return;
    }
    const list = tracksRef.current.filter(isTrackAudible);
    if (list.length === 0) {
      setStatus('재생할 트랙이 없어요');
      return;
    }
    setStatus('믹스 준비 중…');
    void Promise.all(list.map((t) => loadTrackElement(t)))
      .then((elements) => {
        const latest = tracksRef.current;
        const syncedList = list.map((t) => latest.find((x) => x.id === t.id) ?? t);
        setStatus('');
        setMixPlaying(true);
        elements.forEach((el, index) => {
          activeRef.current.push(el);
          mountPlaybackVideo(syncedList[index].id, el);
        });
        transportStartRef.current = performance.now();
        primeMixTransport(syncedList, elements);
      })
      .catch(() => {
        setStatus('트랙을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      });
  };

  const videoTracks = tracks.filter((t) => t.kind === 'video');
  const videoViewerTrack =
    videoViewerTrackId != null ? tracks.find((t) => t.id === videoViewerTrackId) : undefined;
  const timeline = maxDur();
  const trimTrack = trimTrackId != null ? tracks.find((t) => t.id === trimTrackId) : undefined;

  if (tracksLoading) {
    return (
      <div className="practice-room page">
      <header className="pr-head">
        <button type="button" className="back" onClick={onBack}>
          ← 세션
        </button>
        <div className="pr-head-info">
          <strong>{session.title}</strong>
          <span>{teamName}</span>
        </div>
        {canDeleteSession && (
          <button type="button" className="pr-delete" onClick={handleDeleteSession}>
            삭제
          </button>
        )}
      </header>
        <p className="pr-status">연습 트랙 불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="practice-room page">
      <header className="pr-head">
        <button type="button" className="back" onClick={onBack}>
          ← 세션
        </button>
        <div className="pr-head-info">
          <strong>{session.title}</strong>
          <span>{teamName}</span>
        </div>
        {canDeleteSession && (
          <button type="button" className="pr-delete" onClick={handleDeleteSession}>
            삭제
          </button>
        )}
      </header>

      <input
        ref={fileInputRef}
        type="file"
        className="file-input-hidden"
        onChange={(e) => void handleFilePick(e)}
      />

      <div className="transport">
        <button
          type="button"
          className="upload-btn"
          disabled={!!recordPreview || previewLoading}
          onClick={openPos}
        >
          +
        </button>
        <div className="transport-info">
          {mediaJob ? (
            <MediaProgressPanel
              label={mediaJob.label}
              progress={mediaJob.progress}
              startedAt={mediaJob.startedAt}
            />
          ) : (
            <>
              <div className="transport-label">{transportLabel}</div>
              <div className="transport-sub">{transportSub}</div>
            </>
          )}
        </div>
        <button
          type="button"
          className={`play-all ${mixPlaying ? 'on' : ''}`}
          disabled={!tracks.length}
          onClick={toggleMix}
        >
          {mixPlaying ? '■' : '▶'}
        </button>
      </div>

      {videoTracks.length > 0 && (
        <div className="video-stage show">
          {videoTracks.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`video-tile ${trackVolume(t) === 0 ? 'is-silent' : ''}`}
              onClick={() => openVideoViewer(t.id)}
              aria-label={`${t.positionLabel} ${t.name} 동영상 보기`}
            >
              <video
                key={t.blobUrl}
                className="video-tile-poster"
                src={t.blobUrl}
                muted
                playsInline
                preload="auto"
                aria-hidden
              />
              <div
                className="video-tile-mount"
                ref={(el) => {
                  if (el) videoMountRefs.current.set(t.id, el);
                  else videoMountRefs.current.delete(t.id);
                }}
              />
              <span className="video-tile-label">
                {t.positionLabel} · {t.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {tracks.length === 0 && (
        <div className="empty-hint">+ 눌러 첫 동영상 트랙을 올리세요.</div>
      )}

      {tracks.map((t) => {
        const { clipPct, clipLeftPct } = syncWaveformLayout(t, timeline);
        const prog = playProgress[t.id] ?? 0;
        const trackMode: 'mix' | 'solo' | 'idle' =
          mixPlaying ? 'mix' : soloId === t.id ? 'solo' : 'idle';
        const playheadLeft = trackPlayheadLeftPct(prog, trackMode);
        return (
          <div
            key={t.id}
            className={`track ${trackVolume(t) === 0 ? 'is-silent' : ''}`}
            style={{ ['--c' as string]: t.color }}
          >
            {t.kind === 'video' ? (
              <div className="track-thumb">
                <video
                  key={t.blobUrl}
                  ref={(el) => {
                    if (el) videoThumbRefs.current.set(t.id, el);
                    else videoThumbRefs.current.delete(t.id);
                  }}
                  src={t.blobUrl}
                  muted
                  playsInline
                  preload="auto"
                />
                <span className="vid-badge">VID</span>
              </div>
            ) : (
              <div
                className="track-icon"
                dangerouslySetInnerHTML={{ __html: POS_ART[t.positionId] || POS_ART.other }}
              />
            )}
            <div className="track-body">
              <div className="track-meta">
                <span className="track-pos">
                  {t.positionLabel}
                  {t.kind === 'video' ? ' · VIDEO' : ''}
                </span>
                <span className="track-name">{t.name}</span>
                {isOwnTrack(t) && (
                  <button
                    type="button"
                    className="track-delete"
                    onClick={() => deleteTrack(t.id)}
                    title="내 트랙 삭제"
                  >
                    삭제
                  </button>
                )}
              </div>
              {isOwnTrack(t) && (
                <div className="sync-nudge" title="재생 타이밍 미세 조절">
                  <button
                    type="button"
                    className="sync-btn sync-btn-wide"
                    onClick={() => nudgeSyncOffset(t.id, -SYNC_NUDGE_WIDE)}
                    title="앞당기기 (−100ms)"
                  >
                    ◀◀◀
                  </button>
                  <button
                    type="button"
                    className="sync-btn sync-btn-coarse"
                    onClick={() => nudgeSyncOffset(t.id, -SYNC_NUDGE_COARSE)}
                    title="앞당기기 (−10ms)"
                  >
                    ◀◀
                  </button>
                  <button
                    type="button"
                    className="sync-btn"
                    onClick={() => nudgeSyncOffset(t.id, -SYNC_NUDGE_FINE)}
                    title="앞당기기 (−1ms)"
                  >
                    ◀
                  </button>
                  <span className="sync-offset">{formatSyncOffset(t.syncOffsetSec ?? 0)}</span>
                  <button
                    type="button"
                    className="sync-btn"
                    onClick={() => nudgeSyncOffset(t.id, SYNC_NUDGE_FINE)}
                    title="뒤로 (+1ms)"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    className="sync-btn sync-btn-coarse"
                    onClick={() => nudgeSyncOffset(t.id, SYNC_NUDGE_COARSE)}
                    title="뒤로 (+10ms)"
                  >
                    ▶▶
                  </button>
                  <button
                    type="button"
                    className="sync-btn sync-btn-wide"
                    onClick={() => nudgeSyncOffset(t.id, SYNC_NUDGE_WIDE)}
                    title="뒤로 (+100ms)"
                  >
                    ▶▶▶
                  </button>
                </div>
              )}
              <button
                type="button"
                className={`waveform ${mixPlaying || soloId === t.id ? 'is-playing' : ''}${isOwnTrack(t) ? ' waveform--tap' : ''}`}
                onClick={() => {
                  if (isOwnTrack(t)) setTrimTrackId(t.id);
                }}
                title={isOwnTrack(t) ? '탭하여 앞뒤 구간 자르기' : undefined}
              >
                <div
                  className="waveform-clip"
                  style={{
                    width: `${clipPct}%`,
                    left: `${clipLeftPct}%`,
                  }}
                >
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current.set(t.id, el);
                    }}
                  />
                </div>
                <div className="playhead" style={{ left: `${playheadLeft}%` }} />
              </button>
            </div>
            <div className="track-actions">
              <label className="volume-control" title="볼륨 (0 = 음소거)">
                <input
                  type="range"
                  className="track-volume"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(trackVolume(t) * 100)}
                  onInput={(e) => setTrackVolume(t.id, Number(e.currentTarget.value) / 100)}
                  onChange={(e) => setTrackVolume(t.id, Number(e.currentTarget.value) / 100)}
                  aria-label="볼륨"
                />
              </label>
              <button
                type="button"
                className={`icon-btn ${soloId === t.id ? 'active' : ''}`}
                onClick={() => toggleSolo(t.id)}
              >
                {soloId === t.id ? '■' : '▶'}
              </button>
            </div>
          </div>
        );
      })}

      {status && <p className="status-line">{status}</p>}

      {cropTarget ? (
        <VideoCropSheet
          file={cropTarget.file}
          fileName={cropTarget.file.name}
          description="트랙에 올라갈 정사각형 프레임에 꽉 차도록 맞춰 주세요. 드래그하고 확대할 수 있어요."
          onConfirm={handleCropConfirm}
          onClose={handleCropClose}
          onSkip={handleCropSkip}
          compressProfile="practice"
        />
      ) : null}

      {videoViewerTrack ? (
        <VideoTrackViewerSheet
          track={videoViewerTrack}
          onClose={() => setVideoViewerTrackId(null)}
        />
      ) : null}

      {recordPreview ? (
        <RecordPreviewSheet
          preview={recordPreview}
          onConfirm={confirmRecordPreview}
          onDiscard={discardRecordPreview}
        />
      ) : null}

      {trimTrack ? (
        <WaveformTrimSheet
          track={trimTrack}
          onClose={() => setTrimTrackId(null)}
          onConfirm={(trimStartSec, trimEndSec) =>
            applyTrackTrim(trimTrack.id, trimStartSec, trimEndSec)
          }
        />
      ) : null}

      {posOpen && (
        <div className="pos-overlay open" onClick={() => setPosOpen(false)}>
          <div className="pos-sheet" onClick={(e) => e.stopPropagation()}>
            <h2>포지션 · 동영상</h2>
            <p className="pos-nick-hint">
              기기에 찍은 동영상을 올릴 수 있어요. 트랙에는 {getUploaderNick()} 으로 표시돼요.
            </p>
            <div className="pos-grid">
              {POSITIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pos-card ${selPos === p.id ? 'selected' : ''}`}
                  onClick={() => setSelPos(p.id)}
                >
                  <span className="pos-art" dangerouslySetInnerHTML={{ __html: p.art }} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
            <div className="pos-actions">
              <button type="button" className="btn" onClick={() => setPosOpen(false)}>
                취소
              </button>
              <button type="button" className="btn btn-primary" disabled={!selPos} onClick={confirmPos}>
                동영상 선택
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
