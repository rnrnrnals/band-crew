import { useEffect, useRef } from 'react';

export function FeedSeenMarker({
  itemKey,
  onSeen,
}: {
  itemKey: string;
  onSeen: (itemKey: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    reportedRef.current = false;
  }, [itemKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || entry.intersectionRatio < 0.55 || reportedRef.current) return;
        reportedRef.current = true;
        onSeen(itemKey);
      },
      { threshold: [0.55] },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [itemKey, onSeen]);

  return <div ref={ref} className="feed-seen-marker" aria-hidden />;
}
