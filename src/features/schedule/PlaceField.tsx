import { useEffect, useRef, useState } from 'react';
import type { KakaoPlaceResult } from '../../utils/kakaoMaps';
import {
  buildKakaoMapSearchUrl,
  buildKakaoPlaceUrl,
  getKakaoPlaceLabel,
  loadKakaoMaps,
  searchKakaoPlaces,
} from '../../utils/kakaoMaps';
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
  const [mapsReady, setMapsReady] = useState(false);
  const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY;

  useEffect(() => {
    if (!appKey) return;
    loadKakaoMaps(appKey)
      .then(() => setMapsReady(true))
      .catch(() => setMapsReady(false));
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

  const openKakaoMap = () => {
    window.open(buildKakaoMapSearchUrl(value), '_blank', 'noopener,noreferrer');
  };

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
        <button type="button" className="btn place-field-map-btn" onClick={openKakaoMap}>
          카카오맵에서 찾기
        </button>
        {mapUrl && (
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="place-field-preview">
            선택한 장소 보기
          </a>
        )}
      </div>
      <p className="place-field-hint">
        {appKey && mapsReady
          ? '입력창에 치면 카카오맵 장소 목록에서 고를 수 있어요. 직접 적어도 됩니다.'
          : '직접 입력하거나 카카오맵에서 찾아보세요.'}
      </p>
    </div>
  );
}
