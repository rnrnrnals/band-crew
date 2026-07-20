import type { TeamMember, AppUser, BandTeam } from '../types';

export function isCurrentMember(member: TeamMember, user: AppUser): boolean {
  if (member.userId) return member.userId === user.id;
  return member.id === user.id;
}

export function findCurrentMember(team: BandTeam, user: AppUser): TeamMember | undefined {
  return team.members.find((member) => isCurrentMember(member, user));
}

export function isTeamLeader(team: BandTeam, user: AppUser): boolean {
  const member = findCurrentMember(team, user);
  return member?.isLeader === true;
}

export function canManageTeam(team: BandTeam, user: AppUser): boolean {
  const member = findCurrentMember(team, user);
  if (!member) return false;
  return member.isLeader === true || member.isCoLeader === true;
}

export function getMemberRoleLabel(member: TeamMember): string | null {
  if (member.isLeader) return '리더';
  if (member.isCoLeader) return '코리더';
  return null;
}

export function sortMembersWithLeaderFirst(members: TeamMember[]): TeamMember[] {
  return [...members].sort((a, b) => {
    const rank = (member: TeamMember) => {
      if (member.isLeader) return 0;
      if (member.isCoLeader) return 1;
      return 2;
    };
    return rank(a) - rank(b);
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
  if (user && isCurrentMember(member, user)) {
    return user.bio ?? member.bio;
  }
  return member.bio;
}

export function getMemberInstagram(member: TeamMember, user?: AppUser): string | undefined {
  if (user && isCurrentMember(member, user)) {
    return user.instagram ?? member.instagram;
  }
  return member.instagram;
}
