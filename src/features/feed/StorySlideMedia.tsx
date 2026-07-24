import { useEffect, useRef } from 'react';
import type { StoryMediaType } from '../../types';

interface StorySlideMediaProps {
  src: string;
  mediaType: StoryMediaType;
  onVideoEnded?: () => void;
  onVideoDuration?: (seconds: number) => void;
}

export function StorySlideMedia({
  src,
  mediaType,
  onVideoEnded,
  onVideoDuration,
}: StorySlideMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (mediaType !== 'video') return;
    const video = videoRef.current;
    if (!video) return;

    const onMeta = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        onVideoDuration?.(video.duration);
      }
    };
    const onEnd = () => onVideoEnded?.();

    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('ended', onEnd);
    if (video.readyState >= 1) onMeta();
    void video.play().catch(() => {});

    return () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('ended', onEnd);
      video.pause();
    };
  }, [src, mediaType, onVideoEnded, onVideoDuration]);

  if (mediaType === 'video') {
    return (
      <video
        ref={videoRef}
        className="story-media story-media--video"
        src={src}
        playsInline
        autoPlay
        preload="auto"
      />
    );
  }

  return <img className="story-media" src={src} alt="" />;
}
