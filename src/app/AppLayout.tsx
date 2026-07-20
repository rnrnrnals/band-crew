import { Outlet, useLocation } from 'react-router-dom';
import { TabBar } from './TabBar';
import { AuthLoadingScreen } from '../components/AuthLoadingScreen';
import { AuthGate } from '../features/auth/AuthGate';
import { TeamGate } from '../features/team/TeamGate';
import { useApp } from '../state/AppContext';
import { useAuth } from '../state/AuthContext';

export function AppLayout() {
  const { activeTeamId, dataLoading, dataReady } = useApp();
  const { authLoading, authRequired, session } = useAuth();
  const location = useLocation();
  const hideTabBar = location.pathname.startsWith('/story/upload');

  if (authRequired) {
    if (authLoading) {
      return <AuthLoadingScreen />;
    }
    if (!session) {
      return (
        <div className="app-shell">
          <AuthGate />
        </div>
      );
    }
    if (dataLoading || !dataReady) {
      return <AuthLoadingScreen />;
    }
  }

  if (!activeTeamId) {
    return (
      <div className="app-shell">
        <TeamGate />
      </div>
    );
  }

  return (
    <div className={`app-shell ${hideTabBar ? 'app-shell-immersive' : ''}`}>
      <Outlet />
      {!hideTabBar && <TabBar />}
    </div>
  );
}
