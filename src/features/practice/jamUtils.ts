import { POSITION_LABELS, POSITION_COLORS, POS_ART } from '../../mock/positions';
import type { PositionId } from '../../types';

export type MediaKind = 'audio' | 'video';

export interface JamTrack {
  id: number;
  name: string;
  blobUrl: string;
  color: string;
  /** 0 = silent, 1 = full volume */
  volume: number;
  peaks: number[];
  duration: number;
  positionId: PositionId;
  positionLabel: string;
  kind: MediaKind;
  /** Set when uploaded via Supabase auth; used for sync nudge permissions */
  authorUserId?: string;
  /** Timeline position of the clip's left edge (seconds). Negative = extends before wall. */
  syncOffsetSec?: number;
  /** Seconds cut from the start of the source media */
  trimStartSec?: number;
  /** Seconds cut from the end of the source media */
  trimEndSec?: number;
}

export const WAVE_BARS = 96;

export function trackTrimStartSec(track: JamTrack): number {
  return Math.max(0, track.trimStartSec ?? 0);
}

export function trackTrimEndSec(track: JamTrack): number {
  return Math.max(0, track.trimEndSec ?? 0);
}

export function trackPlayableDuration(track: JamTrack): number {
  const total = Math.max(track.duration || 0, 0);
  return Math.max(0.001, total - trackTrimStartSec(track) - trackTrimEndSec(track));
}

export function trackPlayableEndSec(track: JamTrack): number {
  const total = Math.max(track.duration || 0, 0);
  return Math.max(trackTrimStartSec(track), total - trackTrimEndSec(track));
}

export function trackSyncOffsetSec(track: JamTrack): number {
  return track.syncOffsetSec ?? 0;
}

/** Total session timeline length contributed by this track. */
export function trackSessionDurationSec(track: JamTrack): number {
  return trackSyncOffsetSec(track) + trackPlayableDuration(track);
}

/**
 * File playhead for a position on the shared session timeline.
 * Timeline 0 = left wall; clip left edge sits at syncOffsetSec.
 */
export function trackFileTimeAtSessionElapsed(
  track: JamTrack,
  elapsedSec: number,
): number | null {
  const offset = trackSyncOffsetSec(track);
  const playable = trackPlayableDuration(track);
  const trimStart = trackTrimStartSec(track);
  const windowEnd = trackPlayableEndSec(track);

  if (offset > 0 && elapsedSec < offset) return null;
  if (elapsedSec >= offset + playable) return null;

  return Math.min(windowEnd, Math.max(trimStart, trimStart + (elapsedSec - offset)));
}

export function slicePeaks(
  peaks: number[] | undefined,
  startSec: number,
  endSec: number,
  duration: number,
): number[] {
  const bars = peaks?.length ? peaks : Array(WAVE_BARS).fill(0.12);
  if (!duration || endSec <= startSec) return bars;
  const startRatio = startSec / duration;
  const endRatio = endSec / duration;
  const startIdx = Math.max(0, Math.min(bars.length - 1, Math.floor(startRatio * bars.length)));
  const endIdx = Math.max(startIdx + 1, Math.min(bars.length, Math.ceil(endRatio * bars.length)));
  return bars.slice(startIdx, endIdx);
}

export const POSITIONS = (Object.keys(POSITION_LABELS) as PositionId[]).map((id) => ({
  id,
  label: POSITION_LABELS[id],
  color: POSITION_COLORS[id],
  art: POS_ART[id],
}));

export async function analyzeMedia(blobUrl: string): Promise<{ peaks: number[]; duration: number }> {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const res = await fetch(blobUrl);
    const raw = await res.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(raw.slice(0));
    const data = audioBuffer.getChannelData(0);
    const peaks: number[] = [];
    const block = Math.max(1, Math.floor(data.length / WAVE_BARS));
    for (let i = 0; i < WAVE_BARS; i++) {
      let peak = 0;
      const start = i * block;
      const end = Math.min(start + block, data.length);
      for (let j = start; j < end; j++) {
        const v = Math.abs(data[j]);
        if (v > peak) peak = v;
      }
      peaks.push(peak);
    }
    const max = Math.max(...peaks, 0.001);
    await ctx.close();
    return { peaks: peaks.map((p) => p / max), duration: audioBuffer.duration };
  } catch {
    const duration = await getMediaDuration(blobUrl);
    return { peaks: Array(WAVE_BARS).fill(0.22), duration: duration || 1 };
  }
}

function getMediaDuration(blobUrl: string) {
  return new Promise<number>((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const d = el.duration;
      el.src = '';
      resolve(Number.isFinite(d) ? d : 0);
    };
    el.onerror = () => resolve(0);
    el.src = blobUrl;
  });
}

export function drawWaveform(
  canvas: HTMLCanvasElement | null,
  peaks: number[] | undefined,
  color: string,
  progress: number | null,
) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
  const cssH = Math.max(1, canvas.clientHeight || 44);
  const w = Math.floor(cssW * dpr);
  const h = Math.floor(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  const bars = peaks?.length ? peaks : Array(WAVE_BARS).fill(0.12);
  const n = bars.length;
  const gap = Math.max(1, Math.floor(dpr));
  const barW = Math.max(1, (w - gap * (n - 1)) / n);
  const mid = h / 2;
  const playedUntil = progress == null ? -1 : progress * n;
  for (let i = 0; i < n; i++) {
    const amp = Math.max(0.04, bars[i]);
    const barH = Math.max(2 * dpr, amp * (h * 0.86));
    const x = i * (barW + gap);
    const y = mid - barH / 2;
    ctx.globalAlpha = i < playedUntil ? 0.95 : 0.4;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW, barH);
  }
  ctx.globalAlpha = 1;
}
