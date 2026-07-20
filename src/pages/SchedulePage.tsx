import { useMemo, useState } from 'react';

import { useApp } from '../state/AppContext';

import { PlaceField } from '../features/schedule/PlaceField';
import { KakaoPlaceMap } from '../features/schedule/KakaoPlaceMap';
import { buildKakaoMapSearchUrl, parsePlaceMapUrl } from '../utils/kakaoMaps';

import './SchedulePage.css';



export function SchedulePage() {

  const { events, activeTeam, addEvent, canManageActiveTeam } = useApp();

  const [title, setTitle] = useState('');

  const [place, setPlace] = useState('');

  const [placeMapUrl, setPlaceMapUrl] = useState<string | undefined>();

  const [date, setDate] = useState('2026-07-30T20:00');

  const [kind, setKind] = useState<'practice' | 'gig' | 'other'>('practice');

  const [open, setOpen] = useState(false);



  const mine = useMemo(

    () =>

      events

        .filter((e) => e.teamId === activeTeam?.id)

        .sort((a, b) => +new Date(a.date) - +new Date(b.date)),

    [events, activeTeam],

  );



  const submit = () => {

    if (!activeTeam || !title.trim()) return;

    addEvent({

      teamId: activeTeam.id,

      title: title.trim(),

      place: place.trim() || '미정',

      placeMapUrl,

      date: new Date(date).toISOString(),

      kind,

    });

    setTitle('');

    setPlace('');

    setPlaceMapUrl(undefined);

    setOpen(false);

  };



  const kindLabel = { practice: '연습', gig: '공연', other: '기타' };



  return (

    <div className="page">

      <div className="sched-head">

        <div>

          <h1 className="page-title">일정</h1>

          <p className="page-sub">{activeTeam?.name} 팀 캘린더</p>

        </div>

        {canManageActiveTeam ? (
          <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)}>
            {open ? '닫기' : '+ 추가'}
          </button>
        ) : null}

      </div>



      {open && canManageActiveTeam && (

        <div className="card add-form">

          <div className="field">

            <label>제목</label>

            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="정기 합주" />

          </div>

          <div className="field">

            <label>장소</label>

            <PlaceField

              value={place}

              mapUrl={placeMapUrl}

              onValueChange={setPlace}

              onMapUrlChange={setPlaceMapUrl}

            />

          </div>

          <div className="field">

            <label>일시</label>

            <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />

          </div>

          <div className="field">

            <label>종류</label>

            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>

              <option value="practice">연습</option>

              <option value="gig">공연</option>

              <option value="other">기타</option>

            </select>

          </div>

          <button type="button" className="btn btn-amber" onClick={submit}>

            저장

          </button>

        </div>

      )}



      <div className="event-list">

        {mine.map((e) => {
          const placeMeta = parsePlaceMapUrl(e.placeMapUrl);
          const placeLink = placeMeta.linkUrl || buildKakaoMapSearchUrl(e.place);

          return (
          <div key={e.id} className="event-card">
            <div className={`kind ${e.kind}`}>{kindLabel[e.kind]}</div>

            <div className="event-card-body">
              <strong>{e.title}</strong>
              <span>
                {new Date(e.date).toLocaleString('ko-KR', {
                  month: 'short',
                  day: 'numeric',
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <a
                href={placeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="event-place-link"
              >
                {e.place}
              </a>
              {placeMeta.lat != null && placeMeta.lng != null ? (
                <KakaoPlaceMap
                  lat={placeMeta.lat}
                  lng={placeMeta.lng}
                  height={120}
                  level={4}
                  className="event-card-map"
                />
              ) : null}
            </div>
          </div>
          );
        })}

        {mine.length === 0 && <p className="empty">아직 일정이 없어요.</p>}

      </div>

    </div>

  );

}


