export function formatRelativeTime(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '방금';

  const sec = Math.floor(ms / 1000);
  if (sec < 60) return '방금';

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;

  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;

  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
