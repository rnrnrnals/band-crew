import type { JamTrack } from './jamUtils';

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

/** Decode/buffer track media and reset playhead to 0. */
export async function loadTrackElement(track: JamTrack): Promise<HTMLMediaElement> {
  const el = createTrackElement(track);
  await waitCanPlay(el);
  el.currentTime = 0;
  return el;
}

/** Apply per-track sync offset then play (positive = delayed start, negative = skip head). */
export function applySyncOffsetAndPlay(el: HTMLMediaElement, offsetSec: number): void {
  const offset = offsetSec || 0;
  if (offset < 0) {
    const dur = el.duration;
    const start = Number.isFinite(dur)
      ? Math.min(Math.max(0, -offset), dur)
      : Math.max(0, -offset);
    el.currentTime = start;
    void el.play().catch(() => {});
    return;
  }
  el.currentTime = 0;
  if (offset > 0) {
    window.setTimeout(() => void el.play().catch(() => {}), offset * 1000);
    return;
  }
  void el.play().catch(() => {});
}

/** Start tracks together, honoring each track's syncOffsetSec. */
export function startTracksWithSync(tracks: JamTrack[], elements: HTMLMediaElement[]): void {
  tracks.forEach((track, i) => {
    applySyncOffsetAndPlay(elements[i], track.syncOffsetSec ?? 0);
  });
}

export async function preloadGuideTracks(tracks: JamTrack[]): Promise<HTMLMediaElement[]> {
  if (tracks.length === 0) return [];
  return Promise.all(tracks.map(loadTrackElement));
}
