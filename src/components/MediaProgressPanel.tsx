import {
  clampProgress,
  etaSecondsFromProgress,
  formatEtaSeconds,
  formatProgressPercent,
} from '../utils/mediaProgress';
import './MediaProgressPanel.css';

interface MediaProgressPanelProps {
  label: string;
  progress: number;
  /** When omitted, ETA is derived from `startedAt` + `progress`. */
  etaSec?: number | null;
  startedAt?: number;
  className?: string;
}

export function MediaProgressPanel({
  label,
  progress,
  etaSec,
  startedAt,
  className = '',
}: MediaProgressPanelProps) {
  const pct = clampProgress(progress);
  const eta =
    etaSec !== undefined
      ? etaSec
      : startedAt != null
        ? etaSecondsFromProgress(startedAt, pct)
        : null;
  const etaLabel = formatEtaSeconds(eta);

  return (
    <div className={`media-progress ${className}`.trim()} role="status" aria-live="polite">
      <div className="media-progress-head">
        <span className="media-progress-label">{label}</span>
        <span className="media-progress-meta">
          {formatProgressPercent(pct)}
          {etaLabel ? ` · ${etaLabel}` : ''}
        </span>
      </div>
      <div
        className="media-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label={label}
      >
        <div className="media-progress-fill" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
