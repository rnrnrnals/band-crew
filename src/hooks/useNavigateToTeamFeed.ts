import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BandTeam } from '../types';
import { useApp } from '../state/AppContext';

export function useNavigateToTeamFeed() {
  const navigate = useNavigate();
  const { myTeamIds, setActiveTeam } = useApp();

  return useCallback(
    (team: BandTeam | undefined, onNavigate?: () => void) => {
      if (!team) return;
      onNavigate?.();
      if (myTeamIds.includes(team.id)) {
        setActiveTeam(team.id);
        navigate('/my');
        return;
      }
      navigate(`/team/${team.id}`);
    },
    [myTeamIds, navigate, setActiveTeam],
  );
}
