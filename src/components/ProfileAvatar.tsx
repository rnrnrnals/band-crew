import './ProfileAvatar.css';

interface ProfileAvatarProps {
  src?: string;
  className?: string;
  square?: boolean;
}

function PlaceholderIcon() {
  return (
    <svg className="profile-avatar-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
      />
    </svg>
  );
}

export function ProfileAvatar({ src, className = '', square = false }: ProfileAvatarProps) {
  const trimmed = src?.trim();
  const classes = ['profile-avatar', square ? 'profile-avatar-square' : '', className]
    .filter(Boolean)
    .join(' ');

  if (!trimmed) {
    return (
      <span className={`${classes} profile-avatar-empty`} aria-hidden="true">
        <PlaceholderIcon />
      </span>
    );
  }

  return <img src={trimmed} alt="" className={classes} loading="lazy" decoding="async" />;
}
