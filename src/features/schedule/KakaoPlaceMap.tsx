import { useEffect, useRef } from 'react';
import { getKakaoMapsAppKey, loadKakaoMaps } from '../../utils/kakaoMaps';
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
  const appKey = getKakaoMapsAppKey();

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

export function KakaoPlacePickerMap({
  centerLat,
  centerLng,
  onCenterChange,
  height = 200,
  level = 3,
  className,
}: {
  centerLat?: number;
  centerLng?: number;
  onCenterChange: (lat: number, lng: number) => void;
  height?: number;
  level?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const skipPanRef = useRef(false);
  const onCenterChangeRef = useRef(onCenterChange);
  const appKey = getKakaoMapsAppKey();

  const lat = centerLat ?? DEFAULT_CENTER.lat;
  const lng = centerLng ?? DEFAULT_CENTER.lng;

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);

  useEffect(() => {
    if (!appKey || !containerRef.current) return;

    let cancelled = false;
    let dragEndHandler: (() => void) | null = null;
    let mapInstance: unknown = null;

    void loadKakaoMaps(appKey).then(() => {
      if (cancelled || !containerRef.current || !window.kakao?.maps) return;

      const position = new window.kakao.maps.LatLng(lat, lng);
      const map = new window.kakao.maps.Map(containerRef.current, {
        center: position,
        level,
      });
      mapInstance = map;
      mapRef.current = map;

      dragEndHandler = () => {
        if (skipPanRef.current) return;
        const center = map.getCenter();
        onCenterChangeRef.current(center.getLat(), center.getLng());
      };
      window.kakao.maps.event.addListener(map, 'dragend', dragEndHandler);
    });

    return () => {
      cancelled = true;
      if (mapInstance && dragEndHandler && window.kakao?.maps) {
        window.kakao.maps.event.removeListener(mapInstance as never, 'dragend', dragEndHandler);
      }
      mapRef.current = null;
    };
  }, [appKey, level]);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const position = new window.kakao.maps.LatLng(lat, lng);
    const map = mapRef.current as { panTo: (p: typeof position) => void };
    skipPanRef.current = true;
    map.panTo(position);
    window.setTimeout(() => {
      skipPanRef.current = false;
    }, 0);
  }, [lat, lng]);

  if (!appKey) {
    return (
      <div className={`kakao-place-map kakao-place-map-empty ${className ?? ''}`} style={{ height }}>
        카카오맵 키가 필요해요.
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`kakao-place-picker ${className ?? ''}`} style={{ height }}>
      <div ref={containerRef} className="kakao-place-map" />
      <div className="kakao-place-picker-pin" aria-hidden>
        📍
      </div>
      <p className="kakao-place-picker-hint">지도를 움직여 가운데 핀 위치를 맞춘 뒤 선택하세요.</p>
    </div>
  );
}
