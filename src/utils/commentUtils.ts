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

export function isCommentFromPostTeam(
  comment: PostComment,
  contextTeam?: BandTeam,
): boolean {
  if (!contextTeam) return false;
  if (comment.authorTeam) return comment.authorTeam === contextTeam.name;
  return contextTeam.members.some(
    (member) =>
      member.nick === comment.author ||
      member.nick === comment.authorNick ||
      member.id === comment.authorUserId,
  );
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

export function getCommentAuthorName(
  comment: PostComment,
  contextTeam?: BandTeam,
  highlightPostTeam?: boolean,
): string {
  if (highlightPostTeam && isCommentFromPostTeam(comment, contextTeam)) {
    return comment.authorNick ?? comment.author;
  }
  if (comment.authorTeam) return comment.authorTeam;
  return comment.author;
}

export function getCommentMemberNick(
  comment: PostComment,
  contextTeam?: BandTeam,
  highlightPostTeam?: boolean,
): string | undefined {
  if (highlightPostTeam && isCommentFromPostTeam(comment, contextTeam)) return undefined;
  if (comment.authorTeam) return comment.authorNick;
  return undefined;
}

export function getCommentReplyLabel(
  comment: PostComment,
  contextTeam?: BandTeam,
  highlightPostTeam?: boolean,
): string {
  if (highlightPostTeam && isCommentFromPostTeam(comment, contextTeam)) {
    return comment.authorNick ?? comment.author;
  }
  return comment.authorNick ?? comment.authorTeam ?? comment.author;
}

/** Keep in-flight optimistic likes when reloading comment lists from the server. */
export function mergeCommentLikeLists(
  fetched: PostComment[],
  previous: PostComment[] = [],
): PostComment[] {
  return fetched.map((comment) => {
    const prev = previous.find((item) => item.id === comment.id);
    if (!prev) return comment;
    const remoteLikes = comment.likes ?? 0;
    const localLikes = prev.likes ?? 0;
    const remoteLiked = comment.likedByMe ?? false;
    const localLiked = prev.likedByMe ?? false;
    return {
      ...comment,
      likes: Math.max(remoteLikes, localLikes),
      likedByMe: remoteLiked || (localLiked && localLikes > remoteLikes),
    };
  });
}
