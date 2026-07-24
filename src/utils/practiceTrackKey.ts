export function buildPracticeTrackKey(sessionId: string, trackKey: number): string {
  return `${sessionId}:${trackKey}`;
}

export function parsePracticeTrackKey(key: string): { sessionId: string; trackKey: number } | null {
  const separator = key.indexOf(':');
  if (separator <= 0) return null;
  const sessionId = key.slice(0, separator);
  const trackKey = Number(key.slice(separator + 1));
  if (!sessionId || !Number.isFinite(trackKey)) return null;
  return { sessionId, trackKey };
}
