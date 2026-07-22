/** Derive paired poster JPEG URL from an uploaded post video URL. */
export function posterUrlForVideo(videoUrl: string | undefined): string | undefined {
  if (!videoUrl) return undefined;
  if (!/\.(webm|mp4|mov|m4v)(\?|#|$)/i.test(videoUrl)) return undefined;
  return videoUrl.replace(/(\.[^./?#]+)(\?[^#]*)?(#.*)?$/, '-poster.jpg$2$3');
}

export function videoFileExtension(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('webm')) return 'webm';
  return 'mp4';
}

const VIDEO_EXTENSION_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
};

/**
 * Some mobile share sheets / file pickers (notably some Android gallery
 * apps and cloud-synced iOS files) hand over a File with an empty or
 * generic `type`. `<video src="blob:...">` can then refuse to load the
 * blob in some browsers even though the underlying media plays fine
 * elsewhere — the element has no MIME hint to pick a decoder. Re-wrap the
 * file with a type inferred from its extension so playback/crop/compress
 * all get a usable hint.
 */
export function ensureVideoFileType(file: File): File {
  if (file.type.startsWith('video/')) return file;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = VIDEO_EXTENSION_MIME[ext];
  if (!mime) return file;
  return new File([file], file.name, { type: mime, lastModified: file.lastModified });
}

export function isRemoteMediaUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Do NOT set `crossOrigin` here. Supabase Storage buckets aren't guaranteed
 * to have CORS configured for this app's origin, and requesting a remote
 * video with `crossorigin="anonymous"` when the server doesn't answer with
 * matching CORS headers makes the browser refuse to load the resource at
 * all — the element never fires `canplay`, so playback looks completely
 * dead (black frame, frozen controls) instead of just losing volume
 * control. Plain (no-crossorigin) loads always render + play normally;
 * see `practicePlayback.ts` for how Web Audio gain routing is skipped for
 * remote sources to avoid the (separate) silent-audio tainting issue.
 */
export function applyMediaElementUrl(el: HTMLMediaElement, url: string): void {
  el.removeAttribute('crossorigin');
  el.src = url;
}
