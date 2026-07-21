import { parseShareMessage, shareMessagePreview } from './contentShare';
import type { ChatMessage } from '../types';

export function isChatMessageDeleted(message: ChatMessage): boolean {
  return !!message.deletedAt;
}

export function isOwnChatMessage(
  message: ChatMessage,
  userId: string | undefined,
  myNick: string,
  activeTeamId: string,
  peerTeamId?: string,
): boolean {
  if (userId && message.authorUserId) return message.authorUserId === userId;
  if (peerTeamId) return message.teamId === activeTeamId && message.authorNick === myNick;
  return message.authorNick === myNick;
}

export function canEditChatMessage(message: ChatMessage): boolean {
  if (message.deletedAt) return false;
  if ((message.kind ?? 'text') !== 'text') return false;
  if (parseShareMessage(message.text)) return false;
  return true;
}

export function getCrossTeamThreadId(teamA: string, teamB: string): string {
  return [teamA, teamB].sort().join('__');
}

export function getCrossTeamThreadPreview(
  messages: {
    chatThreadId?: string;
    text?: string;
    kind?: string;
    createdAt: string;
    deletedAt?: string;
  }[],
  threadId: string,
): string | null {
  const latest = messages
    .filter((m) => m.chatThreadId === threadId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  if (!latest) return null;
  if (latest.deletedAt) return '삭제된 메세지입니다.';
  const sharedPreview = shareMessagePreview(latest.text);
  if (sharedPreview) return `공유: ${sharedPreview}`;
  if (latest.text?.trim()) return latest.text.trim();
  const kind = latest.kind ?? 'text';
  if (kind === 'image') return '사진';
  if (kind === 'video') return '영상';
  if (kind === 'audio') return '음성 메시지';
  return null;
}
