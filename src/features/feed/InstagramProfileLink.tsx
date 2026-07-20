import type { MouseEvent } from 'react';
import { formatInstagramHandle, openInstagramProfile } from '../../utils/teamInstagram';
import './InstagramProfileLink.css';

interface InstagramProfileLinkProps {
  username: string;
  className?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function InstagramProfileLink({ username, className, onClick }: InstagramProfileLinkProps) {
  const handle = formatInstagramHandle(username);
  if (!handle) return null;

  return (
    <button
      type="button"
      className={`instagram-profile-link${className ? ` ${className}` : ''}`}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          openInstagramProfile(username);
        }
      }}
    >
      {handle}
    </button>
  );
}
