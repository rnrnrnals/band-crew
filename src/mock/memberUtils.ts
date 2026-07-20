import type { TeamMember, AppUser, BandTeam } from '../types';

export function findCurrentMember(team: BandTeam, user: AppUser): TeamMember | undefined {
  return (
    team.members.find((m) => m.userId === user.id || m.id === user.id) ??
    team.members.find((m) => m.avatar === user.avatar) ??
    team.members.find((m) => m.nick === user.name)
  );
}

export function sortMembersWithLeaderFirst(members: TeamMember[]): TeamMember[] {
  return [...members].sort((a, b) => {
    if (a.isLeader && !b.isLeader) return -1;
    if (!a.isLeader && b.isLeader) return 1;
    return 0;
  });
}

const FALLBACK_AVATARS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop',
];

export function getMemberAvatar(member: TeamMember): string {
  if (member.avatar) return member.avatar;
  const idx =
    member.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % FALLBACK_AVATARS.length;
  return FALLBACK_AVATARS[idx];
}

export function getMemberBio(member: TeamMember, user?: AppUser): string | undefined {
  if (user && member.avatar && member.avatar === user.avatar) {
    return user.bio ?? member.bio;
  }
  return member.bio;
}
