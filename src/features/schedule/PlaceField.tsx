import { useEffect, useRef, useState } from 'react';
import type { KakaoPlaceResult } from '../../utils/kakaoMaps';
import {
  buildKakaoMapSearchUrl,
  buildKakaoPlaceUrl,
  getKakaoPlaceLabel,
  loadKakaoMaps,
  searchKakaoPlaces,
} from '../../utils/kakaoMaps';
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

  const selectPlace = (place: KakaoPlaceResult) => {
    onValueChange(getKakaoPlaceLabel(place));
    onMapUrlChange(buildKakaoPlaceUrl(place));
    setSuggestions([]);
    setListOpen(false);
  };

  const openPlaceSearch = () => {
    if (!appKey) {
      window.open(buildKakaoMapSearchUrl(value), '_blank', 'noopener,noreferrer');
      return;
    }
    setSearchOpen(true);
  };

  const openKakaoMapWeb = () => {
    window.open(buildKakaoMapSearchUrl(value), '_blank', 'noopener,noreferrer');
  };

  const hint = !appKey
    ? '카카오맵 키가 없어 직접 입력하거나 카카오맵 웹에서 찾아보세요.'
    : mapsError
      ? '카카오맵 연결에 실패했어요. Developers Web 도메인 등록을 확인해 주세요.'
      : mapsReady
        ? '입력창에 치거나 「장소 검색」에서 고르면 일정에 자동 입력돼요.'
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
          placeholder="직접 입력하거나 장소 검색"
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
      <div className="place-field-actions">
        <button type="button" className="btn btn-primary place-field-map-btn" onClick={openPlaceSearch}>
          장소 검색
        </button>
        <button type="button" className="btn place-field-web-btn" onClick={openKakaoMapWeb}>
          카카오맵 웹
        </button>
        {mapUrl && (
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="place-field-preview">
            선택한 장소 보기
          </a>
        )}
      </div>
      <p className="place-field-hint">{hint}</p>

      {searchOpen ? (
        <PlaceSearchSheet
          initialQuery={value}
          onSelect={(label, url) => {
            onValueChange(label);
            onMapUrlChange(url);
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}
    </div>
  );
}
