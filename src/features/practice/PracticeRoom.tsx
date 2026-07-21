import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { PracticeSessionMeta } from '../../types';
import type { PositionId } from '../../types';
import { POS_ART } from '../../mock/positions';
import {
  POSITIONS,
  analyzeMedia,
  drawWaveform,
  pickRecorderMime,
  slicePeaks,
  trackPlayableDuration,
  trackPlayableEndSec,
  trackTrimStartSec,
  type JamTrack,
  type MediaKind,
} from './jamUtils';
import {
  loadTrackElement,
  playTrackFromStart,
  preloadGuideTracks,
  startTracksFromStart,
  startTracksWithSync,
} from './practicePlayback';
import { WaveformTrimSheet } from './WaveformTrimSheet';
import { RecordPreviewSheet, type RecordPreviewData } from './RecordPreviewSheet';
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
import './PracticeRoom.css';

interface PendingPos {
  id: PositionId;
  label: string;
  color: string;
  nick: string;
  kind: MediaKind;
}

interface Props {
  session: PracticeSessionMeta;
  teamName: string;
  onBack: () => void;
}

function describeGuide(audible: number, total: number, metro: boolean) {
  const parts: string[] = [];
  if (audible > 0) parts.push(audible === total ? `이전 ${audible}개 트랙` : `트랙 ${audible}/${total}개`);
  if (metro) parts.push('메트로놈');
  if (!parts.length) return '가이드 없이 녹음';
  return parts.join(' + ') + ' 들으며';
}

const SYNC_NUDGE_FINE = 0.001;
const SYNC_NUDGE_COARSE = 0.01;
const SYNC_NUDGE_WIDE = 0.1;
const MAX_SYNC_OFFSET = 3;

function formatSyncOffset(sec: number): string {
  const ms = Math.round(sec * 1000);
  if (ms === 0) return '0ms';
  return ms > 0 ? `+${ms}ms` : `${ms}ms`;
}

function syncWaveformLayout(t: JamTrack, timeline: number) {
  const syncSec = t.syncOffsetSec ?? 0;
  const playable = trackPlayableDuration(t);
  const clipPct = Math.min(100, Math.max(2, (playable / timeline) * 100));
  const clipLeftPct = (syncSec / timeline) * 100;
  return { clipPct, clipLeftPct };
}

/** Solo playhead: cell left = trim start, independent of sync offset. */
function trackTimelineProgress(
  currentTime: number,
  track: JamTrack,
  timeline: number,
): number {
  const trimStart = trackTrimStartSec(track);
  return Math.min(1, Math.max(0, (currentTime - trimStart) / timeline));
}

/** Highlight progress within the clip; follows playhead vs waveform position. */
function trackWaveformLocalProgress(
  t: JamTrack,
  timeline: number,
  timelineProgress: number,
): number | null {
  const { clipPct, clipLeftPct } = syncWaveformLayout(t, timeline);
  if (clipPct <= 0) return 0;
  const playheadPct = timelineProgress * 100;
  if (playheadPct <= clipLeftPct) return 0;
  if (playheadPct >= clipLeftPct + clipPct) return 1;
  return (playheadPct - clipLeftPct) / clipPct;
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
  const [tracksLoading, setTracksLoading] = useState(useDb);
  const syncedRef = useRef<Map<number, StoredPracticeTrack>>(new Map());
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);
  const syncPendingRef = useRef(false);

  const [tracks, setTracks] = useState<JamTrack[]>(() =>
    useDb ? [] : loadSessionTracks(session.id).map(fromStoredTrack),
  );
  const [bpm, setBpm] = useState(session.bpm);
  const [metro, setMetro] = useState(true);
  const [recording, setRecording] = useState(false);
  const [mixPlaying, setMixPlaying] = useState(false);
  const [soloId, setSoloId] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [transportLabel, setTransportLabel] = useState('새 트랙 올리기');
  const [transportSub, setTransportSub] = useState('● 눌러 포지션 선택');

  const [posOpen, setPosOpen] = useState(false);
  const [mediaKind, setMediaKind] = useState<MediaKind>('audio');
  const [selPos, setSelPos] = useState<PositionId | null>(null);

  const [playProgress, setPlayProgress] = useState<Record<number, number>>({});
  const [trimTrackId, setTrimTrackId] = useState<number | null>(null);
  const [recordPreview, setRecordPreview] = useState<RecordPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef('');
  const pendingRef = useRef<PendingPos | null>(null);
  const metroTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef<HTMLMediaElement[]>([]);
  const rafRef = useRef<number | null>(null);
  const camPreviewRef = useRef<HTMLVideoElement>(null);

  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const sessionLockRef = useRef(false);
  const countInDoneRef = useRef(false);
  const finishLockRef = useRef(false);
  const recordingPhaseRef = useRef<'idle' | 'counting' | 'recording'>('idle');
  const guideElementsRef = useRef<HTMLMediaElement[]>([]);
  const guideLoadGenRef = useRef(0);
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

  const persistTracks = useCallback(
    (next: JamTrack[]) => {
      tracksRef.current = next;
      const stored = next.map(toStoredTrack);
      if (!useDb) {
        const ok = saveSessionTracks(session.id, stored);
        if (!ok) setStatus('녹음 저장 공간이 부족해요. 오래된 트랙을 삭제해주세요.');
        return;
      }

      const runSync = () => {
        if (syncInFlightRef.current) {
          syncPendingRef.current = true;
          return;
        }
        syncInFlightRef.current = true;
        const payload = tracksRef.current.map(toStoredTrack);
        void syncPracticeTracksToDb(session, payload, syncedRef.current)
          .then((map) => {
            syncedRef.current = map;
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
            if (syncPendingRef.current) {
              syncPendingRef.current = false;
              runSync();
            }
          });
      };

      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(runSync, 400);
    },
    [session, useDb, markOwnTrack],
  );

  useEffect(() => {
    if (!useDb) return;
    let cancelled = false;
    setTracksLoading(true);
    void fetchPracticeTracksForSession(session.id)
      .then((stored) => {
        if (cancelled) return;
        const uid = authSession?.user.id;
        stored.forEach((t) => {
          if (uid && t.authorUserId === uid) markOwnTrack(t.id);
        });
        syncedRef.current = new Map(stored.map((t) => [t.id, t]));
        setTracks(stored.map(fromStoredTrack));
      })
      .catch((err) => {
        console.error('[BandCrew] practice tracks load failed', err);
        setStatus('연습 트랙을 불러오지 못했어요.');
      })
      .finally(() => {
        if (!cancelled) setTracksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [useDb, session.id, authSession?.user.id, markOwnTrack]);

  useEffect(
    () => () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (tracksLoading) return;
    persistTracks(tracks);
  }, [tracks, persistTracks, tracksLoading]);

  const maxDur = useCallback(
    () => tracks.reduce((m, t) => Math.max(m, trackPlayableDuration(t)), 0) || 1,
    [tracks],
  );

  const getCtx = () => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  };

  const click = (strong: boolean) => {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = strong ? 1400 : 900;
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  };

  const stopAll = useCallback(() => {
    activeRef.current.forEach((a) => {
      try {
        a.pause();
        a.removeAttribute('src');
        a.load();
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
      tracks.forEach((t) => {
        const canvas = canvasRefs.current.get(t.id);
        const global = progress?.[t.id];
        const local =
          global != null ? trackWaveformLocalProgress(t, timeline, global) : null;
        const trimmedPeaks = slicePeaks(
          t.peaks,
          trackTrimStartSec(t),
          trackPlayableEndSec(t),
          t.duration || timeline,
        );
        drawWaveform(canvas ?? null, trimmedPeaks, t.color, local);
      });
    },
    [tracks, maxDur],
  );

  useEffect(() => {
    requestAnimationFrame(() => paintWaveforms(null));
  }, [tracks, paintWaveforms]);

  const syncLoop = useCallback(() => {
    const timeline = maxDur();
    const next: Record<number, number> = {};
    if (mixPlaying || recording) {
      const start = transportStartRef.current;
      if (start != null && timeline > 0) {
        const elapsed = (performance.now() - start) / 1000;
        const p = Math.min(1, elapsed / timeline);
        tracks.forEach((t) => {
          next[t.id] = p;
        });
      }
    } else if (soloId != null) {
      const solo = tracks.find((t) => t.id === soloId);
      const a = activeRef.current.find((x) => x.dataset.trackId === String(soloId));
      if (a && solo) {
        next[soloId] = trackTimelineProgress(a.currentTime, solo, timeline);
      }
    }
    setPlayProgress(next);
    paintWaveforms(next);
  }, [maxDur, mixPlaying, recording, soloId, tracks, paintWaveforms]);

  useEffect(() => {
    if (!mixPlaying && !recording && soloId == null) return;
    const tick = () => {
      syncLoop();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mixPlaying, recording, soloId, syncLoop]);

  const playTrack = (t: JamTrack, onEnd?: () => void) => {
    void loadTrackElement(t)
      .then((el) => {
        activeRef.current.push(el);
        el.addEventListener('ended', () => {
          activeRef.current = activeRef.current.filter((x) => x !== el);
          onEnd?.();
        });
        playTrackFromStart(el, t);
      })
      .catch(() => onEnd?.());
    return null;
  };

  const releaseGuideElements = () => {
    guideElementsRef.current.forEach((el) => {
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch {
        /* ignore */
      }
    });
    guideElementsRef.current = [];
  };

  const releaseRecordingHardware = () => {
    if (metroTimerRef.current) {
      clearInterval(metroTimerRef.current);
      metroTimerRef.current = null;
    }
    releaseGuideElements();
    guideLoadGenRef.current += 1;
    stopAll();
    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      if (recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      recorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    if (camPreviewRef.current) camPreviewRef.current.srcObject = null;
    sessionLockRef.current = false;
    countInDoneRef.current = false;
    recordingPhaseRef.current = 'idle';
    setRecording(false);
  };

  const resetTransport = () => {
    setTransportLabel('새 트랙 올리기');
    setTransportSub('● 눌러 포지션 선택');
  };

  const cleanupRec = () => {
    releaseRecordingHardware();
    resetTransport();
  };

  const finishRecording = async () => {
    if (finishLockRef.current) return;
    finishLockRef.current = true;

    const pos = pendingRef.current;
    pendingRef.current = null;
    const chunks = chunksRef.current.slice();
    chunksRef.current = [];

    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      recorderRef.current = null;
    }

    releaseRecordingHardware();

    if (!chunks.length || !pos) {
      finishLockRef.current = false;
      resetTransport();
      setStatus('녹음된 내용이 없어요.');
      return;
    }

    setPreviewLoading(true);
    setTransportLabel('녹음 확인 준비 중…');
    setTransportSub('잠시만 기다려 주세요');

    const kind = pos.kind || 'audio';
    const blob = new Blob(chunks, {
      type: mimeRef.current || (kind === 'video' ? 'video/webm' : 'audio/webm'),
    });
    const blobUrl = URL.createObjectURL(blob);

    try {
      const analyzed = await analyzeMedia(blobUrl);
      setRecordPreview({
        blobUrl,
        kind,
        positionId: pos.id,
        positionLabel: pos.label,
        name: pos.nick || `트랙 ${tracks.length + 1}`,
        color: pos.color,
        peaks: analyzed.peaks,
        duration: analyzed.duration,
      });
      setTransportLabel('녹음 확인');
      setTransportSub('들어보고 올릴지 선택하세요');
      setStatus('');
    } catch {
      URL.revokeObjectURL(blobUrl);
      resetTransport();
      setStatus('녹음을 불러오지 못했어요. 다시 시도해 주세요.');
    } finally {
      setPreviewLoading(false);
      finishLockRef.current = false;
    }
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
    setStatus('녹음을 버렸어요.');
  };

  const beginRecord = async (guide: JamTrack[], useMetro: boolean, beatMs: number) => {
    if (countInDoneRef.current || recordingPhaseRef.current === 'recording') return;
    countInDoneRef.current = true;
    recordingPhaseRef.current = 'recording';

    setTransportLabel(`${pendingRef.current?.label || '녹음'} ${pendingRef.current?.kind === 'video' ? '녹화' : '녹음'} 중`);
    const audible = guide.filter(isTrackAudible);
    setTransportSub(
      describeGuide(audible.length, guide.length, useMetro) +
        (guide.length ? ' · 트랙 볼륨으로 가이드 조절' : ''),
    );

    const kind = pendingRef.current?.kind || 'audio';
    mimeRef.current = pickRecorderMime(kind);
    const stream = streamRef.current;
    if (!stream) {
      countInDoneRef.current = false;
      recordingPhaseRef.current = 'idle';
      sessionLockRef.current = false;
      setRecording(false);
      return;
    }

    let guideElements = guideElementsRef.current;
    if (guideElements.length !== guide.length) {
      try {
        guideElements = await preloadGuideTracks(guide);
        guideElementsRef.current = guideElements;
      } catch {
        countInDoneRef.current = false;
        recordingPhaseRef.current = 'idle';
        sessionLockRef.current = false;
        setRecording(false);
        setStatus('가이드 트랙을 불러오지 못했어요. 네트워크를 확인해주세요.');
        return;
      }
    } else {
      guideElements.forEach((el, i) => {
        const vol = trackVolume(guide[i]);
        el.volume = vol;
        el.muted = vol === 0;
        el.currentTime = 0;
      });
    }

    guideElements.forEach((el) => {
      activeRef.current.push(el);
    });

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }

    recorderRef.current = mimeRef.current
      ? new MediaRecorder(stream, { mimeType: mimeRef.current })
      : new MediaRecorder(stream);
    chunksRef.current = [];
    recorderRef.current.ondataavailable = (e) => {
      if (e.data?.size) chunksRef.current.push(e.data);
    };
    recorderRef.current.onstop = () => {
      if (recorderRef.current) recorderRef.current.onstop = null;
      void finishRecording();
    };

    if (useMetro) {
      let beat = 0;
      metroTimerRef.current = setInterval(() => {
        click(beat % 4 === 0);
        beat++;
      }, beatMs);
    }

    recorderRef.current.start();
    transportStartRef.current = performance.now();
    startTracksWithSync(guide, guideElements);
  };

  const startSession = async (pos: PendingPos) => {
    if (sessionLockRef.current || recordingPhaseRef.current !== 'idle' || recordPreview) return;
    sessionLockRef.current = true;
    countInDoneRef.current = false;
    recordingPhaseRef.current = 'counting';
    pendingRef.current = pos;

    const ctx = getCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia(
        pos.kind === 'video'
          ? { audio: true, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } }
          : { audio: true },
      );
    } catch {
      sessionLockRef.current = false;
      recordingPhaseRef.current = 'idle';
      pendingRef.current = null;
      setStatus(pos.kind === 'video' ? '카메라·마이크 권한 필요' : '마이크 권한 필요');
      return;
    }

    if (pos.kind === 'video' && camPreviewRef.current) {
      camPreviewRef.current.srcObject = streamRef.current;
    }

    setRecording(true);
    setPosOpen(false);
    const beatMs = 60000 / Math.max(20, Math.min(300, bpm));
    const guide = tracks;
    const who = `${pos.label}${pos.nick !== pos.label ? ' · ' + pos.nick : ''}`;
    setTransportLabel(`${who} 카운트인...`);
    setTransportSub(describeGuide(guide.filter(isTrackAudible).length, guide.length, metro) + ' 준비');

    releaseGuideElements();
    const loadGen = ++guideLoadGenRef.current;
    void preloadGuideTracks(guide)
      .then((elements) => {
        if (loadGen !== guideLoadGenRef.current) {
          elements.forEach((el) => {
            el.pause();
            el.removeAttribute('src');
            el.load();
          });
          return;
        }
        guideElementsRef.current = elements;
      })
      .catch(() => {
        if (loadGen === guideLoadGenRef.current) guideElementsRef.current = [];
      });

    let beat = 0;
    metroTimerRef.current = setInterval(() => {
      click(beat % 4 === 0);
      beat++;
      if (beat >= 4) {
        if (metroTimerRef.current) clearInterval(metroTimerRef.current);
        metroTimerRef.current = null;
        beginRecord(guide, metro, beatMs);
      }
    }, beatMs);
  };

  const stopRec = () => {
    if (metroTimerRef.current) {
      clearInterval(metroTimerRef.current);
      metroTimerRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      pendingRef.current = null;
      cleanupRec();
    }
  };

  const openPos = () => {
    if (recordPreview || previewLoading) return;
    if (recording) {
      stopRec();
      return;
    }
    if (mixPlaying) {
      stopAll();
      return;
    }
    if (soloId != null) stopAll();
    setPosOpen(true);
    setSelPos(null);
  };

  const confirmPos = () => {
    if (!selPos || sessionLockRef.current) return;
    const p = POSITIONS.find((x) => x.id === selPos)!;
    startSession({
      id: p.id,
      label: p.label,
      color: p.color,
      nick: getUploaderNick(),
      kind: mediaKind,
    });
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
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        activeRef.current.forEach((a) => {
          if (a.dataset.trackId === String(id)) {
            a.volume = vol;
            a.muted = vol === 0;
          }
        });
        return { ...t, volume: vol };
      }),
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
    setTracks((prev) => prev.filter((x) => x.id !== id));
  };

  const toggleSolo = (id: number) => {
    if (recording) return;
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

  const toggleMix = () => {
    if (recording) return;
    if (soloId != null) stopAll();
    if (mixPlaying) {
      stopAll();
      return;
    }
    const list = tracks.filter(isTrackAudible);
    if (list.length === 0) {
      setStatus('재생할 트랙이 없어요');
      return;
    }
    setStatus('믹스 준비 중…');
    void Promise.all(list.map((t) => loadTrackElement(t)))
      .then((elements) => {
        setStatus('');
        setMixPlaying(true);
        let done = 0;
        const total = elements.length;
        elements.forEach((el) => {
          activeRef.current.push(el);
          el.addEventListener('ended', () => {
            activeRef.current = activeRef.current.filter((x) => x !== el);
            done++;
            if (done >= total) stopAll();
          });
        });
        transportStartRef.current = performance.now();
        startTracksFromStart(list, elements);
      })
      .catch(() => {
        setStatus('트랙을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      });
  };

  const videoTracks = tracks.filter((t) => t.kind === 'video');
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

      <div className="transport">
        <button
          type="button"
          className={`rec-btn ${recording ? 'on' : ''}`}
          disabled={!!recordPreview || previewLoading}
          onClick={openPos}
        >
          {recording ? '■' : '●'}
        </button>
        <div className="transport-info">
          <div className="transport-label">{transportLabel}</div>
          <div className="transport-sub">{transportSub}</div>
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

      <div className="settings-row">
        <label>
          <input type="checkbox" checked={metro} onChange={(e) => setMetro(e.target.checked)} />{' '}
          메트로놈
        </label>
        <span>♩ =</span>
        <input
          type="number"
          className="bpm-input"
          value={bpm}
          min={20}
          max={300}
          onChange={(e) => setBpm(parseInt(e.target.value, 10) || 92)}
        />
      </div>

      {videoTracks.length > 0 && (
        <div className="video-stage show">
          {videoTracks.map((t) => (
            <div key={t.id} className={`video-tile ${trackVolume(t) === 0 ? 'is-silent' : ''}`}>
              <video src={t.blobUrl} muted playsInline preload="metadata" />
              <span>
                {t.positionLabel} · {t.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {tracks.length === 0 && (
        <div className="empty-hint">● 눌러 첫 트랙을 녹음·녹화하세요.</div>
      )}

      {tracks.map((t) => {
        const { clipPct, clipLeftPct } = syncWaveformLayout(t, timeline);
        const prog = playProgress[t.id] ?? 0;
        return (
          <div
            key={t.id}
            className={`track ${trackVolume(t) === 0 ? 'is-silent' : ''}`}
            style={{ ['--c' as string]: t.color }}
          >
            {t.kind === 'video' ? (
              <div className="track-thumb">
                <video src={t.blobUrl} muted playsInline preload="metadata" />
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
                className={`waveform ${prog > 0 ? 'is-playing' : ''}${isOwnTrack(t) ? ' waveform--tap' : ''}`}
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
                <div className="playhead" style={{ left: `${prog * 100}%` }} />
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
                  onChange={(e) => setTrackVolume(t.id, Number(e.target.value) / 100)}
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

      <div className={`cam-preview ${recording && pendingRef.current?.kind === 'video' ? 'show' : ''}`}>
        <span>REC</span>
        <video ref={camPreviewRef} autoPlay muted playsInline />
      </div>

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
            <h2>포지션 · 미디어</h2>
            <p className="pos-nick-hint">올린 트랙에는 {getUploaderNick()} 으로 표시돼요.</p>
            <div className="media-mode">
              <button
                type="button"
                className={mediaKind === 'audio' ? 'on' : ''}
                onClick={() => setMediaKind('audio')}
              >
                오디오
              </button>
              <button
                type="button"
                className={mediaKind === 'video' ? 'on' : ''}
                onClick={() => setMediaKind('video')}
              >
                동영상
              </button>
            </div>
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
                {mediaKind === 'video' ? '녹화 시작' : '녹음 시작'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
