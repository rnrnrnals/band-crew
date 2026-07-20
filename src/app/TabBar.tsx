import { type MouseEvent } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { requestHomeRefresh } from '../utils/homeRefresh';
import './TabBar.css';

const tabs = [
  { to: '/', label: '홈', icon: '⌂', end: true },
  { to: '/practice', label: '연습실', icon: '🎛' },
  { to: '/chat', label: '채팅', icon: '💬', fab: true },
  { to: '/schedule', label: '일정', icon: '▦' },
  { to: '/my', label: '마이', icon: '☺' },
] as const;

export function TabBar() {
  const location = useLocation();
  const { activeTeam } = useApp();

  const refreshHomeAndScrollTop = (event: MouseEvent<HTMLAnchorElement>) => {
    if (location.pathname !== '/') return;
    event.preventDefault();
    void requestHomeRefresh().finally(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  return (
    <nav className="tabbar" aria-label="하단 탭">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={'end' in t && t.end}
          className={({ isActive }) =>
            [isActive ? 'active' : undefined, t.to === '/my' ? 'tab-my' : undefined].filter(Boolean).join(' ') ||
            undefined
          }
          aria-label={'fab' in t && t.fab ? t.label : t.to === '/my' ? '우리 팀' : undefined}
          onClick={t.to === '/' ? refreshHomeAndScrollTop : undefined}
        >
          {'fab' in t && t.fab ? (
            <span className="tab-fab">{t.icon}</span>
          ) : t.to === '/my' && activeTeam ? (
            <span className="tab-team-avatar">
              <img src={activeTeam.cover} alt="" />
            </span>
          ) : (
            <span className="icon">{t.icon}</span>
          )}
          {!('fab' in t && t.fab) && t.to !== '/my' && <span>{t.label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
