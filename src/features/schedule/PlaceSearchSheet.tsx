import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KakaoPlaceResult, SchedulePlaceSelection } from '../../utils/kakaoMaps';
import {
  buildSchedulePlaceSelection,
  loadKakaoMaps,
  searchKakaoPlaces,
} from '../../utils/kakaoMaps';
import { KakaoPlaceMap } from './KakaoPlaceMap';
import './PlaceSearchSheet.css';

interface PlaceSearchSheetProps {
  initialQuery?: string;
  onSelect: (selection: SchedulePlaceSelection) => void;
  onClose: () => void;
}

export function PlaceSearchSheet({ initialQuery = '', onSelect, onClose }: PlaceSearchSheetProps) {
  const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY;
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<KakaoPlaceResult[]>([]);
  const [preview, setPreview] = useState<SchedulePlaceSelection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    if (!appKey) {
      setError('카카오맵 키가 설정되지 않았어요.');
      return;
    }
    loadKakaoMaps(appKey)
      .then(() => setMapsReady(true))
      .catch(() => setError('카카오맵을 불러오지 못했어요. Developers Web 도메인 등록을 확인해 주세요.'));
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
          setPreview(buildSchedulePlaceSelection(items[0]));
        })
        .catch(() => {
          setResults([]);
          setError('장소 검색에 실패했어요. 카카오 Developers Web 도메인 설정을 확인해 주세요.');
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [appKey, mapsReady, query]);

  const previewPlace = (place: KakaoPlaceResult) => {
    setPreview(buildSchedulePlaceSelection(place));
  };

  const confirmSelection = () => {
    if (!preview) return;
    onSelect(preview);
  };

  const previewCoords = preview ? { lat: preview.lat, lng: preview.lng } : undefined;

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

        <p className="place-search-sub">카카오맵에서 장소를 고르면 일정에 입력되고 아래 지도에 표시돼요.</p>

        <KakaoPlaceMap lat={previewCoords?.lat} lng={previewCoords?.lng} height={180} level={3} />

        {preview ? (
          <p className="place-search-preview-label">
            <strong>{preview.label}</strong>
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
                onClick={() => previewPlace(place)}
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
          <button type="button" className="btn btn-primary" disabled={!preview} onClick={confirmSelection}>
            이 장소 선택
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
