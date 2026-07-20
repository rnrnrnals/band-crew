import { useEffect, useRef, useState } from 'react';
import type { KakaoPlaceResult, SchedulePlaceSelection } from '../../utils/kakaoMaps';
import {
  buildSchedulePlaceSelection,
  loadKakaoMaps,
  parsePlaceMapUrl,
  searchKakaoPlaces,
} from '../../utils/kakaoMaps';
import { KakaoPlaceMap } from './KakaoPlaceMap';
import { PlaceSearchSheet } from './PlaceSearchSheet';
import './PlaceField.css';

interface PlaceFieldProps {
  value: string;
  mapUrl?: string;
  onValueChange: (value: string) => void;
  onMapUrlChange: (mapUrl?: string) => void;
}

export function PlaceField({ value, mapUrl, onValueChange, onMapUrlChange }: PlaceFieldProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<KakaoPlaceResult[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState(false);
  const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY;
  const parsedMap = parsePlaceMapUrl(mapUrl);

  useEffect(() => {
    if (!appKey) return;
    loadKakaoMaps(appKey)
      .then(() => {
        setMapsReady(true);
        setMapsError(false);
      })
      .catch(() => {
        setMapsReady(false);
        setMapsError(true);
      });
  }, [appKey]);

  useEffect(() => {
    if (!appKey || !mapsReady || value.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = window.setTimeout(() => {
      searchKakaoPlaces(appKey, value.trim())
        .then((results) => {
          setSuggestions(results.slice(0, 5));
          setListOpen(results.length > 0);
        })
        .catch(() => setSuggestions([]));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [appKey, mapsReady, value]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setListOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const applySelection = (selection: SchedulePlaceSelection) => {
    onValueChange(selection.label);
    onMapUrlChange(selection.mapUrl);
    setSuggestions([]);
    setListOpen(false);
  };

  const selectPlace = (place: KakaoPlaceResult) => {
    applySelection(buildSchedulePlaceSelection(place));
  };

  const hint = !appKey
    ? '카카오맵 키가 없어 장소를 직접 입력해야 해요.'
    : mapsError
      ? '카카오맵 연결에 실패했어요. Developers Web 도메인 등록을 확인해 주세요.'
      : mapsReady
        ? '입력창 자동완성 또는 「카카오맵에서 장소 선택」을 사용하세요.'
        : '카카오맵 불러오는 중…';

  return (
    <div className="place-field">
      <div className="place-field-input-wrap" ref={wrapRef}>
        <input
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            onMapUrlChange(undefined);
            setListOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setListOpen(true);
          }}
          placeholder="직접 입력하거나 카카오맵에서 선택"
        />
        {listOpen && suggestions.length > 0 && (
          <ul className="place-suggest-list" role="listbox">
            {suggestions.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="place-suggest-item"
                  onClick={() => selectPlace(place)}
                >
                  <strong>{place.place_name}</strong>
                  <span>{place.road_address_name || place.address_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        className="btn btn-primary place-field-map-btn"
        disabled={!appKey}
        onClick={() => setSearchOpen(true)}
      >
        카카오맵에서 장소 선택
      </button>

      {parsedMap.lat != null && parsedMap.lng != null ? (
        <div className="place-field-map-preview">
          <KakaoPlaceMap lat={parsedMap.lat} lng={parsedMap.lng} height={160} level={3} />
          {parsedMap.linkUrl ? (
            <a href={parsedMap.linkUrl} target="_blank" rel="noopener noreferrer" className="place-field-preview">
              카카오맵에서 크게 보기
            </a>
          ) : null}
        </div>
      ) : null}

      <p className="place-field-hint">{hint}</p>

      {searchOpen ? (
        <PlaceSearchSheet
          initialQuery={value}
          onSelect={(selection) => {
            applySelection(selection);
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}
    </div>
  );
}
