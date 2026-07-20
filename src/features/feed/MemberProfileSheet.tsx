import { useState } from 'react';
import type { BandTeam, TeamMember } from '../../types';
import { POSITION_LABELS } from '../../mock/positions';
import {
  getMemberAvatar,
  getMemberBio,
  getMemberInstagram,
} from '../../mock/memberUtils';
import { useApp } from '../../state/AppContext';
import { ProfilePhotoLightbox } from '../../components/ProfilePhotoLightbox';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { InstagramProfileLink } from './InstagramProfileLink';
import './FollowListSheet.css';
import './MemberProfileSheet.css';

interface MemberProfileSheetProps {
  member: TeamMember;
  team: BandTeam;
  onClose: () => void;
  onBack?: () => void;
  isSelf?: boolean;
  onChangePosition?: () => void;
}

export function MemberProfileSheet({
  member,
  team,
  onClose,
  onBack,
  isSelf = false,
  onChangePosition,
}: MemberProfileSheetProps) {
  const { user, isActiveTeamLeader, transferTeamLeadership, setTeamCoLeader } = useApp();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);

  const avatarUrl = getMemberAvatar(member);

  const bio = getMemberBio(member, user);
  const instagram = getMemberInstagram(member, user);
  const canManageRoles = isActiveTeamLeader && !isSelf && !member.isLeader;
  const currentCoLeader = team.members.find((m) => m.isCoLeader);

  const runAction = async (action: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.message || '처리하지 못했어요.');
        return;
      }
      if (result.message) setMessage(result.message);
    } finally {
      setBusy(false);
    }
  };

  const handleTransferLeadership = () => {
    if (!confirm(`"${member.nick}"에게 리더를 넘길까요?\n리더 권한은 바로 넘어가요.`)) return;
    void runAction(() => transferTeamLeadership(member.id));
  };

  const handleSetCoLeader = () => {
    const replacing = currentCoLeader && currentCoLeader.id !== member.id;
    const prompt = replacing
      ? `"${currentCoLeader.nick}" 대신 "${member.nick}"을(를) 코리더로 지정할까요?\n팀당 코리더는 한 명만 가능해요.`
      : `"${member.nick}"을(를) 코리더로 지정할까요?\n코리더는 리더와 같은 팀 관리 권한을 가져요.`;
    if (!confirm(prompt)) return;
    void runAction(() => setTeamCoLeader(member.id));
  };

  const handleRemoveCoLeader = () => {
    if (!confirm(`"${member.nick}"의 코리더 권한을 해제할까요?`)) return;
    void runAction(() => setTeamCoLeader(null));
  };

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
          {onBack ? (
            <button type="button" className="member-profile-back" onClick={onBack}>
              ← 멤버
            </button>
          ) : (
            <span className="member-profile-back-spacer" aria-hidden />
          )}
          <h2>프로필</h2>
          <button type="button" className="follow-sheet-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="member-profile-body">
          <button
            type="button"
            className="member-profile-avatar-btn"
            onClick={() => {
              if (avatarUrl) setPhotoOpen(true);
            }}
            aria-label={`${member.nick} 프로필 사진 크게 보기`}
            disabled={!avatarUrl}
          >
            <ProfileAvatar src={avatarUrl} className="member-profile-avatar" />
          </button>
          <strong
            className={
              member.isLeader
                ? 'member-profile-name--leader'
                : member.isCoLeader
                  ? 'member-profile-name--coleader'
                  : undefined
            }
          >
            {member.nick}
          </strong>
          <span className="member-profile-position">{POSITION_LABELS[member.position]}</span>
          <span className="member-profile-team">{team.name}</span>
          {instagram ? <InstagramProfileLink username={instagram} /> : null}
          {bio ? (
            <p className="member-profile-bio">{bio}</p>
          ) : (
            <p className="member-profile-bio member-profile-bio--empty">아직 자기소개가 없어요.</p>
          )}

          {isSelf && onChangePosition ? (
            <button
              type="button"
              className="btn member-profile-action"
              disabled={busy}
              onClick={onChangePosition}
            >
              포지션 변경
            </button>
          ) : null}

          {canManageRoles ? (
            <div className="member-profile-actions">
              <button
                type="button"
                className="btn btn-primary member-profile-action"
                disabled={busy}
                onClick={handleTransferLeadership}
              >
                리더 넘기기
              </button>
              {member.isCoLeader ? (
                <button
                  type="button"
                  className="btn member-profile-action"
                  disabled={busy}
                  onClick={handleRemoveCoLeader}
                >
                  코리더 해제
                </button>
              ) : (
                <button
                  type="button"
                  className="btn member-profile-action"
                  disabled={busy}
                  onClick={handleSetCoLeader}
                >
                  {currentCoLeader ? '코리더로 변경' : '코리더로 지정'}
                </button>
              )}
            </div>
          ) : null}

          {error ? <p className="member-profile-error">{error}</p> : null}
          {message ? <p className="member-profile-info">{message}</p> : null}
        </div>
      </div>
      {photoOpen ? (
        <ProfilePhotoLightbox
          src={avatarUrl}
          alt={`${member.nick} 프로필 사진`}
          onClose={() => setPhotoOpen(false)}
        />
      ) : null}
    </div>
  );
}
