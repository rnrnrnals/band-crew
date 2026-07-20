import './AuthLoadingScreen.css';

export function AuthLoadingScreen() {
  return (
    <div className="auth-loading app-shell" role="status" aria-live="polite">
      <div className="auth-loading-inner">
        <div className="gate-brand">BandCrew</div>
        <p>연결 중…</p>
      </div>
    </div>
  );
}
