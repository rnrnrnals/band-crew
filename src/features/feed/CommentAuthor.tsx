import type { BandTeam, PostComment } from '../../types';
import { useApp } from '../../state/AppContext';
import { useNavigateToTeamFeed } from '../../hooks/useNavigateToTeamFeed';
import {
  getCommentAuthorName,
  getCommentMemberNick,
  isCommentFromPostTeam,
  resolveCommentTeam,
} from '../../utils/commentUtils';
import './CommentAuthor.css';

interface CommentAuthorProps {
  comment: PostComment;
  layout?: 'block' | 'inline';
  contextTeam?: BandTeam;
  onNavigate?: () => void;
  /** 게시글 댓글에서 글을 올린 팀 이름을 주황색으로 강조 */
  highlightPostTeam?: boolean;
}

export function CommentAuthor({
  comment,
  layout = 'block',
  contextTeam,
  onNavigate,
  highlightPostTeam = false,
}: CommentAuthorProps) {
  const { teams } = useApp();
  const navigateToTeamFeed = useNavigateToTeamFeed();
  const team = resolveCommentTeam(comment, teams, contextTeam);
  const fromPostTeam = highlightPostTeam && isCommentFromPostTeam(comment, contextTeam);
  const primaryName = getCommentAuthorName(comment, contextTeam, highlightPostTeam);
  const memberNick = getCommentMemberNick(comment, contextTeam, highlightPostTeam);

  const handleAuthorClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    navigateToTeamFeed(team, onNavigate);
  };

  const authorLabel =
    team != null ? (
      <button
        type="button"
        className={`comment-author-link${fromPostTeam ? ' comment-author-link--post-team' : ''}`}
        onClick={handleAuthorClick}
      >
        {primaryName}
      </button>
    ) : (
      <strong className={fromPostTeam ? 'comment-author--post-team' : undefined}>{primaryName}</strong>
    );

  const showMemberNick = memberNick && memberNick !== primaryName;

  if (layout === 'inline') {
    return (
      <>
        {authorLabel}
        {showMemberNick ? <span className="comment-nick comment-nick--inline">{memberNick}</span> : null}
      </>
    );
  }

  return (
    <div className="comment-author">
      {authorLabel}
      {showMemberNick ? <span className="comment-nick">{memberNick}</span> : null}
    </div>
  );
}
