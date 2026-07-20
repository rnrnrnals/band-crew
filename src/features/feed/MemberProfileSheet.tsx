import type { BandTeam, TeamMember } from '../../types';
import { POSITION_LABELS } from '../../mock/positions';
import { getMemberAvatar, getMemberBio } from '../../mock/memberUtils';
import { useApp } from '../../state/AppContext';
import './FollowListSheet.css';
import './MemberProfileSheet.css';

interface MemberProfileSheetProps {
  member: TeamMember;
  team: BandTeam;
  onBack: () => void;
  onClose: () => void;
}

export function MemberProfileSheet({ member, team, onBack, onClose }: MemberProfileSheetProps) {
  const { user } = useApp();
  const bio = getMemberBio(member, user);

  return (
    <div className="follow-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="follow-sheet member-profile-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${member.nick} 프로필`}
      >
        <header className="follow-sheet-head">
          <button type="button" className="member-profile-back" onClick={onBack}>
            ← 멤버
          </button>
          <h2>프로필</h2>
          <button type="button" className="follow-sheet-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="member-profile-body">
          <img src={getMemberAvatar(member)} alt="" className="member-profile-avatar" />
          <strong className={member.isLeader ? 'member-profile-name--leader' : undefined}>
            {member.nick}
          </strong>
          <span className="member-profile-position">{POSITION_LABELS[member.position]}</span>
          <span className="member-profile-team">{team.name}</span>
          {bio ? (
            <p className="member-profile-bio">{bio}</p>
          ) : (
            <p className="member-profile-bio member-profile-bio--empty">아직 자기소개가 없어요.</p>
          )}
        </div>
      </div>
    </div>
  );
}
