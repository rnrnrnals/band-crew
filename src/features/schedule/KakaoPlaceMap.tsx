import { useEffect, useRef } from 'react';
import { loadKakaoMaps } from '../../utils/kakaoMaps';
import './KakaoPlaceMap.css';

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

export function KakaoPlaceMap({
  lat,
  lng,
  height = 200,
  level = 3,
  className,
}: {
  lat?: number;
  lng?: number;
  height?: number;
  level?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY;

  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const centerLat = hasCoords ? lat : DEFAULT_CENTER.lat;
  const centerLng = hasCoords ? lng : DEFAULT_CENTER.lng;

  useEffect(() => {
    if (!appKey || !containerRef.current) return;

    let cancelled = false;

    void loadKakaoMaps(appKey).then(() => {
      if (cancelled || !containerRef.current || !window.kakao?.maps) return;

      const position = new window.kakao.maps.LatLng(centerLat, centerLng);

      if (!mapRef.current) {
        mapRef.current = new window.kakao.maps.Map(containerRef.current, {
          center: position,
          level,
        });
        markerRef.current = new window.kakao.maps.Marker({
          map: mapRef.current as never,
          position,
        });
        return;
      }

      const map = mapRef.current as { setCenter: (p: typeof position) => void; setLevel: (l: number) => void };
      const marker = markerRef.current as { setPosition: (p: typeof position) => void };
      map.setCenter(position);
      map.setLevel(level);
      marker.setPosition(position);
    });

    return () => {
      cancelled = true;
    };
  }, [appKey, centerLat, centerLng, level]);

  if (!appKey) {
    return (
      <div className={`kakao-place-map kakao-place-map-empty ${className ?? ''}`} style={{ height }}>
        카카오맵 키가 필요해요.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`kakao-place-map ${hasCoords ? '' : 'is-placeholder'} ${className ?? ''}`}
      style={{ height }}
      aria-label={hasCoords ? '선택한 장소 지도' : '장소 검색 지도'}
    />
  );
}
