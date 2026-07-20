import './ProfileAvatar.css';

interface ProfileAvatarProps {
  src?: string;
  className?: string;
  square?: boolean;
}

export function ProfileAvatar({ src, className = '', square = false }: ProfileAvatarProps) {
  const trimmed = src?.trim();
  const classes = ['profile-avatar', square ? 'profile-avatar-square' : '', className]
    .filter(Boolean)
    .join(' ');

  if (!trimmed) {
    return <span className={`${classes} profile-avatar-empty`} aria-hidden />;
  }

  return <img src={trimmed} alt="" className={classes} />;
}
