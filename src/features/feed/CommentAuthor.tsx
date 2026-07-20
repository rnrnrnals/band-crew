import type { BandTeam, PostComment } from '../../types';
import { useApp } from '../../state/AppContext';
import { useNavigateToTeamFeed } from '../../hooks/useNavigateToTeamFeed';
import { resolveCommentTeam } from '../../utils/commentUtils';
import './CommentAuthor.css';

interface CommentAuthorProps {
  comment: PostComment;
  layout?: 'block' | 'inline';
  contextTeam?: BandTeam;
  onNavigate?: () => void;
}

export function CommentAuthor({
  comment,
  layout = 'block',
  contextTeam,
  onNavigate,
}: CommentAuthorProps) {
  const { teams } = useApp();
  const navigateToTeamFeed = useNavigateToTeamFeed();
  const team = resolveCommentTeam(comment, teams, contextTeam);
  const name = comment.authorTeam ?? comment.author;

  const handleAuthorClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    navigateToTeamFeed(team, onNavigate);
  };

  const authorLabel =
    team != null ? (
      <button type="button" className="comment-author-link" onClick={handleAuthorClick}>
        {name}
      </button>
    ) : (
      <strong>{name}</strong>
    );

  if (layout === 'inline') {
    return (
      <>
        {authorLabel}
        {comment.authorNick ? <span className="comment-nick comment-nick--inline">{comment.authorNick}</span> : null}
      </>
    );
  }

  return (
    <div className="comment-author">
      {authorLabel}
      {comment.authorNick ? <span className="comment-nick">{comment.authorNick}</span> : null}
    </div>
  );
}
