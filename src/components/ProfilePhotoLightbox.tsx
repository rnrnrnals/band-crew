import { createPortal } from 'react-dom';
import './ProfilePhotoLightbox.css';

interface ProfilePhotoLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ProfilePhotoLightbox({ src, alt = '', onClose }: ProfilePhotoLightboxProps) {
  return createPortal(
    <div
      className="profile-photo-lightbox"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="프로필 사진 크게 보기"
    >
      <button
        type="button"
        className="profile-photo-lightbox-close"
        onClick={onClose}
        aria-label="닫기"
      >
        ✕
      </button>
      <img
        src={src}
        alt={alt}
        className="profile-photo-lightbox-image"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
