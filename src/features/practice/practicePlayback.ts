import type { JamTrack } from './jamUtils';
import {
  trackFileTimeAtSessionElapsed,
  trackSessionDurationSec,
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

export function cancelPendingSyncPlays(_elements: HTMLMediaElement[]): void {
  /* mix transport is driven by elapsed time */
}

/** Drift beyond this forces a hard seek (start-of-playback, resume, or a
 * real desync too large for a speed nudge to close in reasonable time). */
const DRIFT_HARD_SEEK_SEC = 0.35;
/** Drift below this is inaudible — leave `playbackRate` alone. */
const DRIFT_IGNORE_SEC = 0.03;
const NUDGE_RATE_AHEAD = 1.06;
const NUDGE_RATE_BEHIND = 0.94;

/** Position a track for the current mix session elapsed time. */
export function applyMixTransport(
  el: HTMLMediaElement,
  track: JamTrack,
  elapsedSec: number,
): void {
  const vol = track.volume ?? 1;
  const fileTime = trackFileTimeAtSessionElapsed(track, elapsedSec);

  if (vol === 0 || fileTime == null) {
    setGainValue(el, 0);
    if (!el.paused) el.pause();
    return;
  }

  const drift = fileTime - el.currentTime;
  const absDrift = Math.abs(drift);
  if (absDrift > DRIFT_HARD_SEEK_SEC || el.paused) {
    el.currentTime = fileTime;
    el.playbackRate = 1;
  } else if (absDrift > DRIFT_IGNORE_SEC) {
    // Small ongoing drift: nudge speed instead of seeking. A streamed
    // (non-`blob:`) element can't seek for free — every `currentTime`
    // assignment forces it to re-buffer at the new position, which is what
    // made mix/solo playback sound glitchy/stuttery once remote audio
    // actually started playing (it used to be silently Web-Audio-tainted,
    // so nobody heard the constant re-seeking before).
    el.playbackRate = drift > 0 ? NUDGE_RATE_AHEAD : NUDGE_RATE_BEHIND;
  } else if (el.playbackRate !== 1) {
    el.playbackRate = 1;
  }

  setGainValue(el, vol);
  if (el.paused) void el.play().catch(() => {});
}

/** Prime mix elements before the transport loop takes over. */
export function primeMixTransport(tracks: JamTrack[], elements: HTMLMediaElement[]): void {
  tracks.forEach((track, i) => {
    const el = elements[i];
    el.pause();
    applyMixTransport(el, track, 0);
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
