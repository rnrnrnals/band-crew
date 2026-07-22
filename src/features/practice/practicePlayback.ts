import type { JamTrack } from './jamUtils';
import {
  trackFileTimeAtSessionElapsed,
  trackSessionDurationSec,
  trackTrimStartSec,
} from './jamUtils';

let practiceAudioCtx: AudioContext | null = null;
const elementGainNodes = new WeakMap<HTMLMediaElement, GainNode>();

function getPracticeAudioCtx(): AudioContext {
  if (!practiceAudioCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    practiceAudioCtx = new AC();
  }
  return practiceAudioCtx;
}

function ensureGainNode(el: HTMLMediaElement): GainNode {
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
  const ctx = getPracticeAudioCtx();
  if (ctx.state === 'suspended') void ctx.resume();
  const gain = ensureGainNode(el);
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
  el.src = track.blobUrl;
  el.preload = 'auto';
  ensureGainNode(el);
  el.dataset.trackId = String(track.id);
  if (track.kind === 'video') {
    (el as HTMLVideoElement).playsInline = true;
    el.setAttribute('playsinline', '');
  }
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

  if (Math.abs(el.currentTime - fileTime) > 0.03) {
    el.currentTime = fileTime;
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
