import type { JamTrack } from './jamUtils';
import {
  trackPlayableEndSec,
  trackSessionDurationSec,
  trackSyncOffsetSec,
  trackTrimStartSec,
} from './jamUtils';
import { applyMediaElementUrl, isRemoteMediaUrl } from '../../utils/videoMediaUtils';

let practiceAudioCtx: AudioContext | null = null;
const elementGainNodes = new WeakMap<HTMLMediaElement, GainNode>();

/**
 * Cross-origin (Supabase-hosted) media isn't loaded with `crossorigin`
 * (see `applyMediaElementUrl`), so routing it through
 * `createMediaElementSource` would permanently redirect its audio into a
 * Web Audio graph that outputs silence for tainted sources — with no way
 * back to native playback. Only same-origin (`blob:`) elements get the
 * Web Audio gain path (needed for the iOS `element.volume` workaround);
 * remote elements use native `.volume`/`.muted` instead.
 */
function usesWebAudioGain(el: HTMLMediaElement): boolean {
  const src = el.currentSrc || el.src;
  return !!src && !isRemoteMediaUrl(src);
}

function getPracticeAudioCtx(): AudioContext {
  if (!practiceAudioCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    practiceAudioCtx = new AC();
  }
  return practiceAudioCtx;
}

/**
 * Every track element is routed through this shared AudioContext once
 * `createMediaElementSource` is called on it (see `ensureGainNode`), so if
 * the context is suspended the element can look like it's playing (not
 * paused, currentTime advancing) while producing no audible sound at all.
 * Browsers only resume a suspended context reliably when `resume()` is
 * called synchronously inside a user-gesture handler, so call this at the
 * very top of click handlers — before any `await`/promise chain — rather
 * than relying on the resume() inside `setGainValue`, which usually runs
 * too late (after an async track/element load).
 */
export function resumePracticeAudio(): void {
  const ctx = getPracticeAudioCtx();
  if (ctx.state === 'suspended') void ctx.resume();
}

function ensureGainNode(el: HTMLMediaElement): GainNode | null {
  if (!usesWebAudioGain(el)) return null;
  let gain = elementGainNodes.get(el);
  if (gain) return gain;

  const ctx = getPracticeAudioCtx();
  const source = ctx.createMediaElementSource(el);
  gain = ctx.createGain();
  source.connect(gain);
  gain.connect(ctx.destination);
  elementGainNodes.set(el, gain);
  return gain;
}

function setGainValue(el: HTMLMediaElement, volume: number): void {
  const vol = Math.max(0, Math.min(1, volume));
  const gain = ensureGainNode(el);
  if (!gain) {
    // Remote source: no Web Audio routing, use native volume/mute directly.
    el.muted = vol === 0;
    el.volume = vol;
    return;
  }
  const ctx = getPracticeAudioCtx();
  if (ctx.state === 'suspended') void ctx.resume();
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(vol, now);
  el.muted = vol === 0;
  el.volume = 1;
}

/** Route element audio through a GainNode (iOS ignores element.volume). */
export function setElementVolume(el: HTMLMediaElement, volume: number): void {
  setGainValue(el, volume);
}

function waitCanPlay(el: HTMLMediaElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      resolve();
      return;
    }
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('media load failed'));
    };
    const cleanup = () => {
      el.removeEventListener('canplay', onReady);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener('canplay', onReady);
    el.addEventListener('error', onErr);
  });
}

/** Wait until the browser thinks it can play through without rebuffering. */
function waitCanPlayThrough(el: HTMLMediaElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (el.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      resolve();
      return;
    }
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('media load failed'));
    };
    const cleanup = () => {
      el.removeEventListener('canplaythrough', onReady);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener('canplaythrough', onReady);
    el.addEventListener('error', onErr);
  });
}

const mixBlobCache = new Map<string, string>();

/** Drop cached remote→blob URLs (e.g. when leaving the practice room). */
export function clearMixBlobCache(): void {
  mixBlobCache.forEach((blobUrl, remoteUrl) => {
    if (blobUrl.startsWith('blob:') && blobUrl !== remoteUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  });
  mixBlobCache.clear();
}

async function fetchRemoteMediaBlob(
  url: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('media fetch failed');

  const lengthHeader = res.headers.get('content-length');
  const total = lengthHeader ? Number.parseInt(lengthHeader, 10) : null;
  if (!res.body || total == null || !Number.isFinite(total) || total <= 0) {
    onProgress?.(0, null);
    const blob = await res.blob();
    onProgress?.(1, 1);
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }
  const type = res.headers.get('content-type') ?? 'video/mp4';
  return new Blob(chunks, { type });
}

async function resolveMixPlaybackUrl(
  track: JamTrack,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<string> {
  const url = track.blobUrl;
  if (!isRemoteMediaUrl(url)) return url;

  const cached = mixBlobCache.get(url);
  if (cached) {
    onProgress?.(1, 1);
    return cached;
  }

  const blob = await fetchRemoteMediaBlob(url, onProgress);
  const blobUrl = URL.createObjectURL(blob);
  mixBlobCache.set(url, blobUrl);
  return blobUrl;
}

export type MixPrepareProgress = {
  label: string;
  progress: number;
};

export type PreparedMixSession = {
  audioElements: HTMLMediaElement[];
  videoByTrackId: Map<number, HTMLMediaElement>;
};

/**
 * Download each track fully (remote URLs → `blob:`), decode both audio +
 * stage-video elements, then return — playback starts only after this resolves.
 * One download per track; audio + muted tile video share the same blob URL.
 */
export async function prepareMixSession(
  tracks: JamTrack[],
  options?: { onProgress?: (update: MixPrepareProgress) => void },
): Promise<PreparedMixSession> {
  if (tracks.length === 0) {
    return { audioElements: [], videoByTrackId: new Map() };
  }

  const trackProgress = tracks.map(() => 0);
  const reportDownloads = () => {
    const sum = trackProgress.reduce((acc, value) => acc + value, 0);
    options?.onProgress?.({
      label: '트랙 다운로드 중…',
      progress: sum / (tracks.length * 2),
    });
  };

  const playbackUrls = await Promise.all(
    tracks.map(async (track, index) => {
      const url = await resolveMixPlaybackUrl(track, (loaded, total) => {
        trackProgress[index] = total && total > 0 ? loaded / total : 0.35;
        reportDownloads();
      });
      trackProgress[index] = 1;
      reportDownloads();
      return url;
    }),
  );

  options?.onProgress?.({ label: '디코딩 준비 중…', progress: 0.5 });

  const decodeProgress = tracks.map(() => 0);
  const reportDecodes = () => {
    const sum = decodeProgress.reduce((acc, value) => acc + value, 0);
    options?.onProgress?.({
      label: '재생 준비 중…',
      progress: 0.5 + sum / (tracks.length * 2),
    });
  };

  const prepared = await Promise.all(
    tracks.map(async (track, index) => {
      const playbackUrl = playbackUrls[index];
      const trackWithUrl = { ...track, blobUrl: playbackUrl };

      const audioEl = createMixPlaybackElement(trackWithUrl);
      await waitCanPlayThrough(audioEl);
      audioEl.currentTime = trackTrimStartSec(track);
      decodeProgress[index] += 0.5;
      reportDecodes();

      let videoEl: HTMLVideoElement | undefined;
      if (track.kind === 'video') {
        videoEl = createMixVideoElement(trackWithUrl);
        await waitCanPlayThrough(videoEl);
        videoEl.currentTime = trackTrimStartSec(track);
      }

      decodeProgress[index] = 1;
      reportDecodes();

      return { track, audioEl, videoEl };
    }),
  );

  options?.onProgress?.({ label: '준비 완료', progress: 1 });

  const audioElements = prepared.map((row) => row.audioEl);
  const videoByTrackId = new Map<number, HTMLMediaElement>();
  prepared.forEach(({ track, videoEl }) => {
    if (videoEl) videoByTrackId.set(track.id, videoEl);
  });

  return { audioElements, videoByTrackId };
}

export function createTrackElement(track: JamTrack): HTMLMediaElement {
  const el = document.createElement(track.kind === 'video' ? 'video' : 'audio');
  el.preload = 'auto';
  el.dataset.trackId = String(track.id);
  if (track.kind === 'video') {
    (el as HTMLVideoElement).playsInline = true;
    el.setAttribute('playsinline', '');
  }
  applyMediaElementUrl(el, track.blobUrl);
  ensureGainNode(el);
  return el;
}

/** Decode/buffer track media and reset playhead to trim start. */
export async function loadTrackElement(track: JamTrack): Promise<HTMLMediaElement> {
  const el = createTrackElement(track);
  await waitCanPlay(el);
  el.currentTime = trackTrimStartSec(track);
  return el;
}

/** Mix jam playback uses `<audio>` even for video files — same URL, audio-only
 * decode. Running N `<video>` decoders plus per-frame `currentTime` seeks was
 * what made multi-track mix stutter; native parallel `play()` matches the old
 * in-app recording flow. */
export function createMixPlaybackElement(track: JamTrack): HTMLMediaElement {
  const el = document.createElement('audio');
  el.preload = 'auto';
  el.dataset.trackId = String(track.id);
  applyMediaElementUrl(el, track.blobUrl);
  ensureGainNode(el);
  return el;
}

/** Muted video for the stage tiles — audio comes from `createMixPlaybackElement`. */
export function createMixVideoElement(track: JamTrack): HTMLVideoElement {
  const el = document.createElement('video');
  el.preload = 'auto';
  el.dataset.trackId = String(track.id);
  el.dataset.mixVisual = '1';
  el.playsInline = true;
  el.setAttribute('playsinline', '');
  el.muted = true;
  applyMediaElementUrl(el, track.blobUrl);
  return el;
}

let mixAudioMount: HTMLElement | null = null;
const mixPlayTimers = new Set<number>();

function getMixAudioMount(): HTMLElement {
  if (!mixAudioMount) {
    mixAudioMount = document.createElement('div');
    mixAudioMount.id = 'practice-mix-audio-mount';
    mixAudioMount.hidden = true;
    mixAudioMount.setAttribute('aria-hidden', 'true');
    document.body.appendChild(mixAudioMount);
  }
  return mixAudioMount;
}

/** Keep mix `<audio>` elements in the DOM (iOS is picky about detached media). */
export function mountMixPlaybackElements(elements: HTMLMediaElement[]): void {
  getMixAudioMount().replaceChildren(...elements);
}

export function clearMixPlaybackMount(): void {
  if (mixAudioMount) mixAudioMount.replaceChildren();
}

function attachTrimEndGuard(el: HTMLMediaElement, windowEnd: number): void {
  const guard = () => {
    if (!el.paused && el.currentTime >= windowEnd - 0.03) {
      el.pause();
      el.removeEventListener('timeupdate', guard);
    }
  };
  el.addEventListener('timeupdate', guard);
}

export function cancelPendingSyncPlays(_elements: HTMLMediaElement[]): void {
  mixPlayTimers.forEach((id) => clearTimeout(id));
  mixPlayTimers.clear();
}

function primeMixElement(el: HTMLMediaElement, vol: number, visualOnly: boolean): void {
  el.pause();
  el.playbackRate = 1;
  if (visualOnly) {
    el.muted = true;
    el.volume = 0;
    return;
  }
  setElementVolume(el, vol);
}

function playMixElement(
  el: HTMLMediaElement,
  start: number,
  windowEnd: number,
  vol: number,
  visualOnly: boolean,
): void {
  el.currentTime = start;
  attachTrimEndGuard(el, windowEnd);
  if (visualOnly || vol > 0) void el.play().catch(() => {});
}

/** Start mix audio + optional muted stage videos together — no per-frame seeking. */
export function startMixSession(
  tracks: JamTrack[],
  audioElements: HTMLMediaElement[],
  videoElements: Map<number, HTMLMediaElement> = new Map(),
): void {
  cancelPendingSyncPlays(audioElements);
  tracks.forEach((track, i) => {
    const audioEl = audioElements[i];
    const videoEl = track.kind === 'video' ? videoElements.get(track.id) : undefined;
    const offset = trackSyncOffsetSec(track);
    const trimStart = trackTrimStartSec(track);
    const windowEnd = trackPlayableEndSec(track);
    const vol = track.volume ?? 1;

    primeMixElement(audioEl, vol, false);
    if (videoEl) primeMixElement(videoEl, 0, true);

    const begin = () => {
      let start = trimStart;
      if (offset < 0) {
        start = Math.min(windowEnd, trimStart + Math.max(0, -offset));
      }
      playMixElement(audioEl, start, windowEnd, vol, false);
      if (videoEl) playMixElement(videoEl, start, windowEnd, 0, true);
    };

    if (offset > 0) {
      audioEl.currentTime = trimStart;
      if (videoEl) videoEl.currentTime = trimStart;
      mixPlayTimers.add(window.setTimeout(begin, offset * 1000));
    } else {
      begin();
    }
  });
}

export function mixSessionDurationSec(tracks: JamTrack[]): number {
  if (tracks.length === 0) return 1;
  return Math.max(
    0.001,
    ...tracks.map((t) => trackSessionDurationSec(t)),
  );
}

export async function preloadGuideTracks(tracks: JamTrack[]): Promise<HTMLMediaElement[]> {
  if (tracks.length === 0) return [];
  return Promise.all(tracks.map(loadTrackElement));
}
