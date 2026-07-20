import { useState } from 'react';
import type { PositionId } from '../../types';
import { POSITION_LABELS, POS_ART } from '../../mock/positions';
import { useApp } from '../../state/AppContext';
import { DEMO_JOIN_CODE } from '../../mock/data';
import './TeamGate.css';

const POSITIONS = Object.keys(POSITION_LABELS) as PositionId[];

export function TeamGate() {
  const { createTeam, joinTeam, user } = useApp();
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [name, setName] = useState('');
  const [genre, setGenre] = useState('인디 / 록');
  const [code, setCode] = useState(DEMO_JOIN_CODE);
  const [nick, setNick] = useState(user.name.slice(0, 2) || '멤버');
  const [position, setPosition] = useState<PositionId>('elec');
  const [msg, setMsg] = useState('');

  const submit = async () => {
    if (!nick.trim()) {
      setMsg('닉네임을 입력해주세요.');
      return;
    }
    if (mode === 'create') {
      if (!name.trim()) {
        setMsg('팀 이름을 입력해주세요.');
        return;
      }
      createTeam(name.trim(), genre.trim() || '장르 미정', nick.trim(), position);
      return;
    }
    const res = await joinTeam(code, nick.trim(), position);
    setMsg(res.message);
  };

  return (
    <div className="gate page">
      <div className="gate-brand">BandCrew</div>
      <h1 className="page-title">팀에 들어가세요</h1>
      <p className="page-sub">
        인스타처럼 개인 피드가 아니라, 당근모임처럼 <strong>밴드 팀</strong>이 단위예요. 리더가 만들면
        멤버가 코드로 가입합니다.
      </p>

      <div className="gate-tabs">
        <button type="button" className={mode === 'join' ? 'on' : ''} onClick={() => setMode('join')}>
          코드로 가입
        </button>
        <button type="button" className={mode === 'create' ? 'on' : ''} onClick={() => setMode('create')}>
          팀 만들기
        </button>
      </div>

      {mode === 'create' ? (
        <>
          <div className="field">
            <label>팀 이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 퇴근 후 기타" />
          </div>
          <div className="field">
            <label>장르</label>
            <input value={genre} onChange={(e) => setGenre(e.target.value)} />
          </div>
        </>
      ) : (
        <div className="field">
          <label>초대 코드</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="BAND-DEMO" />
          <span className="hint">데모: {DEMO_JOIN_CODE}</span>
        </div>
      )}

      <div className="field">
        <label>내 닉네임</label>
        <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={12} />
      </div>

      <div className="field">
        <label>내 포지션</label>
        <div className="pos-pick">
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              className={`pos-item ${position === p ? 'selected' : ''}`}
              onClick={() => setPosition(p)}
            >
              <span className="pos-art" dangerouslySetInnerHTML={{ __html: POS_ART[p] }} />
              <span>{POSITION_LABELS[p]}</span>
            </button>
          ))}
        </div>
      </div>

      {msg && <p className="gate-msg">{msg}</p>}

      <button type="button" className="btn btn-primary gate-submit" onClick={submit}>
        {mode === 'create' ? '팀 만들고 시작' : '가입하고 시작'}
      </button>
    </div>
  );
}
