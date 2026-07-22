export interface MediaProgressUpdate {
  /** 0–1 */
  progress: number;
  label?: string;
}

export type MediaProgressReporter = (update: MediaProgressUpdate) => void;

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Rough ETA from elapsed wall time and normalized progress. */
export function etaSecondsFromProgress(startedAtMs: number, progress: number): number | null {
  const p = clampProgress(progress);
  if (p < 0.03 || p > 0.98) return null;
  const elapsedSec = (performance.now() - startedAtMs) / 1000;
  if (elapsedSec <= 0) return null;
  return Math.max(0, (elapsedSec * (1 - p)) / p);
}

export function formatEtaSeconds(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return '';
  if (sec < 60) return `약 ${Math.max(1, Math.ceil(sec))}초 남음`;
  const min = Math.max(1, Math.ceil(sec / 60));
  return min === 1 ? '약 1분 남음' : `약 ${min}분 남음`;
}

export function formatProgressPercent(progress: number): string {
  return `${Math.round(clampProgress(progress) * 100)}%`;
}
