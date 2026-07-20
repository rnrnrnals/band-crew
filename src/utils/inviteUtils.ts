import type { BandTeam } from '../types';

export const INVITE_CODE_TTL_MS = 24 * 60 * 60 * 1000;

export function isInviteCodeActive(team: BandTeam, now = Date.now()): boolean {
  if (!team.inviteCode || !team.inviteCodeCreatedAt) return false;
  return now - new Date(team.inviteCodeCreatedAt).getTime() < INVITE_CODE_TTL_MS;
}

export function createRandomInviteCode(): string {
  return `BAND-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function buildInviteShareText(teamName: string, code: string): string {
  return `${teamName} 팀 초대\n코드 ${code}\n24시간 동안 가입 가능해요.`;
}

export async function shareInviteViaMessenger(
  teamName: string,
  code: string,
): Promise<'shared' | 'sms' | 'cancelled' | 'unsupported'> {
  const text = buildInviteShareText(teamName, code);
  const title = `${teamName} 팀 초대`;

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
    }
  }

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = `sms:?body=${encodeURIComponent(text)}`;
    return 'sms';
  }

  return 'unsupported';
}

export function formatInviteExpiry(team: BandTeam, now = Date.now()): string {
  if (!team.inviteCodeCreatedAt) return '';
  const expiresAt = new Date(team.inviteCodeCreatedAt).getTime() + INVITE_CODE_TTL_MS;
  const msLeft = expiresAt - now;
  if (msLeft <= 0) return '만료됨';
  const hoursLeft = Math.ceil(msLeft / (60 * 60 * 1000));
  if (hoursLeft >= 24) return '24시간 동안 유효';
  if (hoursLeft <= 1) {
    const minsLeft = Math.max(1, Math.ceil(msLeft / (60 * 1000)));
    return `${minsLeft}분 후 만료`;
  }
  return `${hoursLeft}시간 후 만료`;
}
