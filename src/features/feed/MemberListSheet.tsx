import { useState } from 'react';
import type { BandTeam, TeamMember } from '../../types';
import { POSITION_LABELS } from '../../mock/positions';
import { getMemberAvatar, sortMembersWithLeaderFirst } from '../../mock/memberUtils';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { MemberProfileSheet } from './MemberProfileSheet';
import './FollowListSheet.css';
import './MemberListSheet.css';

interface MemberListSheetProps {
  team: BandTeam;
  onClose: () => void;
}

export function MemberListSheet({ team, onClose }: MemberListSheetProps) {
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  if (selectedMember) {
    return (
      <MemberProfileSheet
        member={selectedMember}
        team={team}
        onBack={() => setSelectedMember(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="follow-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="follow-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="멤버"
      >
        <header className="follow-sheet-head">
          <h2>멤버</h2>
          <button type="button" className="follow-sheet-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <ul className="follow-sheet-list member-sheet-list">
          {sortMembersWithLeaderFirst(team.members).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`member-sheet-row${
                  m.isLeader
                    ? ' member-sheet-row--leader'
                    : m.isCoLeader
                      ? ' member-sheet-row--coleader'
                      : ''
                }`}
                onClick={() => setSelectedMember(m)}
              >
                <ProfileAvatar src={getMemberAvatar(m)} className="member-sheet-avatar" />
                <div>
                  <strong>{m.nick}</strong>
                  <span>{POSITION_LABELS[m.position]}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
