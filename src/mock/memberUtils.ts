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

export function getMemberAvatar(member: TeamMember, user?: AppUser): string {
  if (user && isCurrentMember(member, user)) {
    return user.avatar?.trim() || member.avatar?.trim() || '';
  }
  return member.avatar?.trim() ?? '';
}

export function getMemberBio(member: TeamMember, user?: AppUser): string | undefined {
  if (user && isCurrentMember(member, user)) {
    return user.bio ?? member.bio;
  }
  return member.bio;
}

export function mergeDisplayProfile(
  userId: string,
  global: AppUser | null | undefined,
  member: TeamMember | undefined,
  prev?: AppUser,
): AppUser {
  const pickText = (...values: (string | undefined)[]) => {
    for (const value of values) {
      const trimmed = value?.trim();
      if (trimmed) return trimmed;
    }
    return '';
  };
  const pickOptional = (...values: (string | undefined)[]) => {
    const text = pickText(...values);
    return text || undefined;
  };

  return {
    id: userId,
    name: pickText(member?.nick, global?.name, prev?.name) || 'User',
    avatar: pickText(member?.avatar, global?.avatar, prev?.avatar),
    bio: pickOptional(member?.bio, global?.bio, prev?.bio),
    instagram: pickOptional(member?.instagram, global?.instagram, prev?.instagram),
  };
}

export function getMemberInstagram(member: TeamMember, user?: AppUser): string | undefined {
  if (user && isCurrentMember(member, user)) {
    return user.instagram ?? member.instagram;
  }
  return member.instagram;
}
