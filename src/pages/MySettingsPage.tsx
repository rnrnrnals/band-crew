import { useEffect, useMemo, useState } from 'react';

import { Link } from 'react-router-dom';

import { useApp } from '../state/AppContext';
import { useAuth } from '../state/AuthContext';
import type { TeamMember } from '../types';

import { POSITION_LABELS } from '../mock/positions';

import { findCurrentMember, getMemberAvatar, getMemberRoleLabel, sortMembersWithLeaderFirst } from '../mock/memberUtils';

import { MemberProfileSheet } from '../features/feed/MemberProfileSheet';

import { InstagramProfileLink } from '../features/feed/InstagramProfileLink';

import { PositionPickerSheet } from '../features/team/PositionPickerSheet';

import { formatInviteExpiry, isInviteCodeActive, shareInviteViaMessenger } from '../utils/inviteUtils';

import './MyPage.css';



export function MySettingsPage() {

  const {

    user,

    activeTeam,

    myTeamIds,

    teams,

    setActiveTeam,

    updateMyPosition,

    generateTeamInviteCode,

    leaveTeam,

    canManageActiveTeam,

  } = useApp();

  const { authRequired, signOut } = useAuth();

  const [positionOpen, setPositionOpen] = useState(false);

  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const [inviteMsg, setInviteMsg] = useState('');

  const [leaveMsg, setLeaveMsg] = useState('');

  const [leaving, setLeaving] = useState(false);

  const [inviteClock, setInviteClock] = useState(() => Date.now());



  const myTeams = teams.filter((t) => myTeamIds.includes(t.id));

  const currentMember = useMemo(

    () => (activeTeam ? findCurrentMember(activeTeam, user) : undefined),

    [activeTeam, user],

  );

  const hasActiveInvite = activeTeam ? isInviteCodeActive(activeTeam, inviteClock) : false;

  const inviteExpiry = activeTeam && hasActiveInvite ? formatInviteExpiry(activeTeam, inviteClock) : '';



  useEffect(() => {

    const id = window.setInterval(() => setInviteClock(Date.now()), 60_000);

    return () => window.clearInterval(id);

  }, []);



  const showInviteMsg = (message: string) => {

    setInviteMsg(message);

    window.setTimeout(() => setInviteMsg(''), 2200);

  };



  const copyInviteCode = async () => {

    if (!activeTeam?.inviteCode || !hasActiveInvite) return;

    try {

      await navigator.clipboard.writeText(activeTeam.inviteCode);

      showInviteMsg('초대 코드를 복사했어요.');

    } catch {

      showInviteMsg('복사에 실패했어요.');

    }

  };



  const shareInvite = async () => {
    if (!activeTeam?.inviteCode || !hasActiveInvite) return;

    const result = await shareInviteViaMessenger(activeTeam.name, activeTeam.inviteCode);
    if (result === 'shared') {
      return;
    } else if (result === 'sms') {
      showInviteMsg('문자 앱을 열었어요.');
    } else if (result === 'unsupported') {
      showInviteMsg('메신저 공유를 지원하지 않는 환경이에요. 코드 복사를 이용해 주세요.');
    }
  };



  const leaveToGate = () => {

    localStorage.removeItem('band-crew-state-v1');

    window.location.reload();

  };



  const handleLeaveTeam = async () => {

    if (!activeTeam || leaving) return;

    if (!confirm(`"${activeTeam.name}" 팀에서 나갈까요?`)) return;

    setLeaving(true);

    setLeaveMsg('');

    const res = await leaveTeam(activeTeam.id);

    setLeaving(false);

    setLeaveMsg(res.message);

    if (res.ok) {

      window.setTimeout(() => setLeaveMsg(''), 2200);

    }

  };



  return (

    <div className="page my-page">

      <Link to="/my" className="settings-back">

        ← 우리 팀 피드

      </Link>

      <h1 className="page-title">팀 설정</h1>

      <p className="page-sub">프로필, 멤버, 팀 초대를 관리해요.</p>



      <h2 className="sec">내 프로필</h2>

      <Link to="/my/user-profile" className="me-card card me-card-link">

        <img src={user.avatar} alt="" />

        <div>

          <strong>{user.name}</strong>

          <span>현재 팀 · {activeTeam?.name ?? '없음'}</span>

          {user.instagram ? (
            <InstagramProfileLink
              username={user.instagram}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
          ) : null}

          {user.bio ? (
            <p className="me-card-bio">{user.bio}</p>
          ) : (
            <span className="me-card-bio-empty">자기소개를 적어보세요</span>
          )}

        </div>

      </Link>



      {activeTeam && (

        <>

          <h2 className="sec">내 팀 멤버</h2>

          <div className="members">

            {sortMembersWithLeaderFirst(activeTeam.members).map((m) => {

              const isMe = currentMember?.id === m.id;
              const roleClass = m.isLeader ? ' chip-leader' : m.isCoLeader ? ' chip-coleader' : '';
              const roleSuffix = getMemberRoleLabel(m);

              return (

                <button

                  key={m.id}

                  type="button"

                  className={`chip${isMe ? ' chip-me' : ''}${roleClass}`}

                  onClick={() => setSelectedMember(m)}

                >

                  <img src={getMemberAvatar(m)} alt="" className="member-chip-avatar" />

                  {m.nick} · {POSITION_LABELS[m.position]}

                  {roleSuffix ? ` · ${roleSuffix}` : ''}

                </button>

              );

            })}

          </div>



          <h2 className="sec">팀 초대</h2>

          {canManageActiveTeam ? (
          <div className="invite-card card">

            {hasActiveInvite ? (

              <>

                <p className="invite-label">초대 코드</p>

                <p className="invite-code">{activeTeam.inviteCode}</p>

                <p className="invite-hint">{inviteExpiry}. 새 코드를 만들면 이전 코드는 바로 무효화돼요.</p>

                <div className="invite-actions">

                  <button type="button" className="btn" onClick={() => void copyInviteCode()}>

                    코드 복사

                  </button>

                  <button type="button" className="btn btn-primary" onClick={() => void shareInvite()}>
                    초대
                  </button>

                </div>

                <button

                  type="button"

                  className="btn invite-regenerate"

                  onClick={() => {

                    generateTeamInviteCode(activeTeam.id);

                    showInviteMsg('새 초대 코드를 만들었어요. 24시간 동안 유효해요.');

                  }}

                >

                  새 코드 만들기

                </button>

              </>

            ) : (

              <>

                <p className="invite-empty">아직 초대 코드가 없어요.</p>

                <p className="invite-hint">코드를 만들면 24시간 동안만 팀 가입에 사용할 수 있어요.</p>

                <button

                  type="button"

                  className="btn btn-primary invite-generate"

                  onClick={() => {

                    generateTeamInviteCode(activeTeam.id);

                    showInviteMsg('초대 코드를 만들었어요. 24시간 동안 유효해요.');

                  }}

                >

                  코드 생성

                </button>

              </>

            )}

            {inviteMsg && <p className="invite-msg">{inviteMsg}</p>}

          </div>
          ) : (
            <p className="invite-hint card">팀 초대 코드는 리더 또는 코리더만 만들 수 있어요.</p>
          )}

        </>

      )}



      {myTeams.length > 1 && (

        <>

          <h2 className="sec">팀 전환</h2>

          <div className="switch-list">

            {myTeams.map((t) => (

              <button

                key={t.id}

                type="button"

                className={`btn ${t.id === activeTeam?.id ? 'btn-amber' : ''}`}

                onClick={() => setActiveTeam(t.id)}

              >

                {t.name}

              </button>

            ))}

          </div>

        </>

      )}



      {authRequired ? (
        <button
          type="button"
          className="btn reset"
          onClick={() => {
            void signOut();
          }}
        >
          로그아웃
        </button>
      ) : null}

      {activeTeam && (
        <>
          <button
            type="button"
            className="btn reset"
            disabled={leaving}
            onClick={() => void handleLeaveTeam()}
          >
            {leaving ? '나가는 중…' : '팀 나가기'}
          </button>
          {leaveMsg && <p className="gate-msg">{leaveMsg}</p>}
        </>
      )}

      {!authRequired ? (
        <button type="button" className="btn reset" onClick={leaveToGate}>
          데모 데이터 초기화
        </button>
      ) : null}



      {positionOpen && currentMember && (

        <PositionPickerSheet

          current={currentMember.position}

          onSelect={updateMyPosition}

          onClose={() => setPositionOpen(false)}

        />

      )}

      {selectedMember && activeTeam && (

        <MemberProfileSheet

          member={selectedMember}

          team={activeTeam}

          isSelf={currentMember?.id === selectedMember.id}

          onChangePosition={() => {

            setSelectedMember(null);

            setPositionOpen(true);

          }}

          onClose={() => setSelectedMember(null)}

        />

      )}

    </div>

  );

}


