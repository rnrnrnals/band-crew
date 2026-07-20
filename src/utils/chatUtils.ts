import { shareMessagePreview } from './contentShare';

export function getCrossTeamThreadId(teamA: string, teamB: string): string {
  return [teamA, teamB].sort().join('__');
}

export function getCrossTeamThreadPreview(
  messages: { chatThreadId?: string; text?: string; kind?: string; createdAt: string }[],
  threadId: string,
): string | null {
  const latest = messages
    .filter((m) => m.chatThreadId === threadId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  if (!latest) return null;
  const sharedPreview = shareMessagePreview(latest.text);
  if (sharedPreview) return `공유: ${sharedPreview}`;
  if (latest.text?.trim()) return latest.text.trim();
  const kind = latest.kind ?? 'text';
  if (kind === 'image') return '사진';
  if (kind === 'video') return '영상';
  if (kind === 'audio') return '음성 메시지';
  return null;
}
