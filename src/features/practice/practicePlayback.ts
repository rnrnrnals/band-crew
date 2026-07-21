import type { JamTrack } from './jamUtils';
import { trackPlayableEndSec, trackTrimStartSec } from './jamUtils';

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

function attachTrimEndGuard(el: HTMLMediaElement, windowEnd: number) {
  const onTimeUpdate = () => {
    if (el.currentTime < windowEnd - 0.03) return;
    el.pause();
    el.removeEventListener('timeupdate', onTimeUpdate);
    el.dispatchEvent(new Event('ended'));
  };
  el.addEventListener('timeupdate', onTimeUpdate);
}

export function createTrackElement(track: JamTrack): HTMLMediaElement {
  const el = document.createElement(track.kind === 'video' ? 'video' : 'audio');
  el.src = track.blobUrl;
  el.preload = 'auto';
  const vol = track.volume ?? 1;
  el.volume = vol;
  el.muted = vol === 0;
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

/** Play from trim start with no sync offset (solo preview). */
export function playTrackFromStart(el: HTMLMediaElement, track: JamTrack): void {
  const windowStart = trackTrimStartSec(track);
  const windowEnd = trackPlayableEndSec(track);
  el.currentTime = windowStart;
  attachTrimEndGuard(el, windowEnd);
  void el.play().catch(() => {});
}

/** Apply trim window and per-track sync offset, then play. */
export function applySyncOffsetAndPlay(el: HTMLMediaElement, track: JamTrack): void {
  const offset = track.syncOffsetSec ?? 0;
  const windowStart = trackTrimStartSec(track);
  const windowEnd = trackPlayableEndSec(track);

  const begin = () => {
    let start = windowStart;
    if (offset < 0) {
      start = Math.min(windowEnd, windowStart + Math.max(0, -offset));
    }
    el.currentTime = start;
    attachTrimEndGuard(el, windowEnd);
    void el.play().catch(() => {});
  };

  if (offset > 0) {
    el.currentTime = windowStart;
    window.setTimeout(begin, offset * 1000);
    return;
  }
  begin();
}

/** Start all tracks from trim start (mix preview; sync offset is visual only). */
export function startTracksFromStart(tracks: JamTrack[], elements: HTMLMediaElement[]): void {
  tracks.forEach((track, i) => {
    playTrackFromStart(elements[i], track);
  });
}

/** Start tracks together, honoring trim + syncOffsetSec. */
export function startTracksWithSync(tracks: JamTrack[], elements: HTMLMediaElement[]): void {
  tracks.forEach((track, i) => {
    applySyncOffsetAndPlay(elements[i], track);
  });
}

export async function preloadGuideTracks(tracks: JamTrack[]): Promise<HTMLMediaElement[]> {
  if (tracks.length === 0) return [];
  return Promise.all(tracks.map(loadTrackElement));
}
