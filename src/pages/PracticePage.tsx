import { useMemo, useState } from 'react';

import { useApp } from '../state/AppContext';

import { PracticeRoom } from '../features/practice/PracticeRoom';

import './PracticePage.css';



export function PracticePage() {

  const { activeTeam, sessions, addSession, isOwnPracticeSession, deleteSession } = useApp();

  const teamSessions = useMemo(

    () => sessions.filter((s) => s.teamId === activeTeam?.id),

    [sessions, activeTeam],

  );

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');



  const activeSession = teamSessions.find((s) => s.id === activeSessionId);



  if (activeSession && activeTeam) {

    return (

      <PracticeRoom

        session={activeSession}

        teamName={activeTeam.name}

        onBack={() => setActiveSessionId(null)}

      />

    );

  }



  const create = () => {

    const title = newTitle.trim() || `연습 ${teamSessions.length + 1}`;

    const s = addSession(title, 92);

    setNewTitle('');

    setActiveSessionId(s.id);

  };



  return (

    <div className="page practice-list">

      <h1 className="page-title">연습실</h1>

      <p className="page-sub">

        {activeTeam?.name} 팀의 레이어드 합주. 포지션별로 녹음·녹화하고 겹쳐 들어보세요.

      </p>



      <div className="card session-new">

        <div className="field" style={{ marginBottom: 8 }}>

          <label>새 연습곡</label>

          <input

            value={newTitle}

            onChange={(e) => setNewTitle(e.target.value)}

            placeholder="곡 이름 / 파트"

          />

        </div>

        <button type="button" className="btn btn-primary" onClick={create}>

          + 새 세션 시작

        </button>

      </div>



      <h2 className="sec">우리 팀 세션</h2>

      <div className="session-list">

        {teamSessions.map((s) => (

          <div key={s.id} className="session-card">

            <button

              type="button"

              className="session-card-main"

              onClick={() => setActiveSessionId(s.id)}

            >

              <div>

                <strong>{s.title}</strong>

                <span>

                  ♩ {s.bpm} · {new Date(s.updatedAt).toLocaleDateString('ko-KR')}

                </span>

              </div>

              <span className="go">입장 →</span>

            </button>

            {isOwnPracticeSession(s) && (

              <button

                type="button"

                className="session-delete"

                onClick={() => deleteSession(s.id)}

                title="세션 삭제"

              >

                삭제

              </button>

            )}

          </div>

        ))}

        {teamSessions.length === 0 && (

          <p className="empty">세션이 없어요. 위에서 새로 만들어보세요.</p>

        )}

      </div>

    </div>

  );

}


