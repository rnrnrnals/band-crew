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
