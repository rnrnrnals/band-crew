import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KakaoPlaceResult, SchedulePlaceSelection } from '../../utils/kakaoMaps';
import {
  buildSchedulePlaceSelection,
  buildSchedulePlaceSelectionFromCoords,
  getKakaoMapsAppKey,
  getKakaoMapsSetupHelp,
  loadKakaoMaps,
  reverseGeocodeCoords,
  searchKakaoPlaces,
} from '../../utils/kakaoMaps';
import { KakaoPlacePickerMap } from './KakaoPlaceMap';
import './PlaceSearchSheet.css';

interface PlaceSearchSheetProps {
  initialQuery?: string;
  onSelect: (selection: SchedulePlaceSelection) => void;
  onClose: () => void;
}

export function PlaceSearchSheet({ initialQuery = '', onSelect, onClose }: PlaceSearchSheetProps) {
  const appKey = getKakaoMapsAppKey();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<KakaoPlaceResult[]>([]);
  const [preview, setPreview] = useState<SchedulePlaceSelection | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState('');
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    if (!appKey) {
      setError('카카오맵 키가 설정되지 않았어요. .env에 JavaScript 키를 넣고 dev 서버를 재시작하세요.');
      return;
    }
    loadKakaoMaps(appKey)
      .then(() => setMapsReady(true))
      .catch((err) =>
        setError(err instanceof Error ? err.message : getKakaoMapsSetupHelp()),
      );
  }, [appKey]);

  useEffect(() => {
    if (!appKey || !mapsReady) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(trimmed.length === 0 ? '' : '두 글자 이상 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError('');
    const timer = window.setTimeout(() => {
      searchKakaoPlaces(appKey, trimmed)
        .then((items) => {
          setResults(items.slice(0, 8));
          if (items.length === 0) {
            setError('검색 결과가 없어요.');
            return;
          }
          const first = buildSchedulePlaceSelection(items[0]);
          setPreview(first);
          setMapCenter({ lat: first.lat, lng: first.lng });
        })
        .catch(() => {
          setResults([]);
          setError('장소 검색에 실패했어요. 카카오 Developers Web 도메인 설정을 확인해 주세요.');
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [appKey, mapsReady, query]);

  const selectPlace = (place: KakaoPlaceResult) => {
    onSelect(buildSchedulePlaceSelection(place));
  };

  const focusPlace = (place: KakaoPlaceResult) => {
    const selection = buildSchedulePlaceSelection(place);
    setPreview(selection);
    setMapCenter({ lat: selection.lat, lng: selection.lng });
  };

  const handleMapCenterChange = useCallback(
    (lat: number, lng: number) => {
      if (!appKey) return;
      setGeocoding(true);
      setError('');
      void reverseGeocodeCoords(appKey, lat, lng)
        .then(({ label }) => {
          setPreview(buildSchedulePlaceSelectionFromCoords(label, lat, lng));
          setMapCenter({ lat, lng });
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : '주소를 불러오지 못했어요.');
        })
        .finally(() => setGeocoding(false));
    },
    [appKey],
  );

  const confirmSelection = () => {
    if (!preview) return;
    onSelect(preview);
  };

  const sheet = (
    <div className="place-search-backdrop" onClick={onClose} role="presentation">
      <div
        className="place-search-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="장소 검색"
      >
        <header className="place-search-head">
          <h2>장소 검색</h2>
          <button type="button" className="place-search-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <p className="place-search-sub">
          검색 결과를 탭하면 바로 선택됩니다. 지도를 드래그해 핀 위치를 맞춘 뒤 「이 위치 선택」도 가능해요.
        </p>

        <KakaoPlacePickerMap
          centerLat={mapCenter?.lat}
          centerLng={mapCenter?.lng}
          onCenterChange={handleMapCenterChange}
          height={200}
          level={3}
        />

        {preview ? (
          <p className="place-search-preview-label">
            <strong>{preview.label}</strong>
            {geocoding ? <span> · 주소 확인 중…</span> : null}
          </p>
        ) : null}

        <input
          className="place-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예: 합정 연습실, 올림픽공원"
          autoFocus
        />

        {loading ? <p className="place-search-status">검색 중…</p> : null}
        {error ? <p className="place-search-error">{error}</p> : null}

        <ul className="place-search-list" role="listbox">
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className={`place-search-item${preview?.placeId === place.id ? ' is-active' : ''}`}
                onClick={() => selectPlace(place)}
                onMouseEnter={() => focusPlace(place)}
                onFocus={() => focusPlace(place)}
              >
                <strong>{place.place_name}</strong>
                <span>{place.road_address_name || place.address_name}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="place-search-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!preview || geocoding}
            onClick={confirmSelection}
          >
            이 위치 선택
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
