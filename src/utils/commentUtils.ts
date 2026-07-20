import type { BandTeam, PostComment } from '../types';

export function resolveCommentTeam(
  comment: PostComment,
  teams: BandTeam[],
  contextTeam?: BandTeam,
): BandTeam | undefined {
  if (comment.authorTeam) {
    return teams.find((t) => t.name === comment.authorTeam);
  }

  const matched = teams.find((t) =>
    t.members.some(
      (m) =>
        m.nick === comment.author ||
        m.nick === comment.authorNick ||
        m.id === comment.authorUserId,
    ),
  );
  if (matched) return matched;

  if (
    contextTeam &&
    contextTeam.members.some(
      (m) =>
        m.nick === comment.author ||
        m.nick === comment.authorNick ||
        m.id === comment.authorUserId,
    )
  ) {
    return contextTeam;
  }

  return contextTeam;
}

export function isOwnComment(
  comment: PostComment,
  userId: string,
  nick: string,
  teamName?: string,
): boolean {
  if (comment.authorUserId) return comment.authorUserId === userId;
  if (comment.authorTeam) {
    return comment.authorTeam === teamName && comment.authorNick === nick;
  }
  return comment.author === nick;
}

export function getCommentReplyLabel(comment: PostComment): string {
  return comment.authorNick ?? comment.authorTeam ?? comment.author;
}
