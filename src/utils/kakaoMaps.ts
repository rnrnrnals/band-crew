export interface KakaoPlaceResult {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  place_url?: string;
  x: string;
  y: string;
}

export interface SchedulePlaceSelection {
  label: string;
  mapUrl: string;
  lat: number;
  lng: number;
  placeId?: string;
}

const COORD_HASH = '#@';

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (callback: () => void) => void;
        Map: new (
          container: HTMLElement,
          options: { center: KakaoLatLng; level: number },
        ) => KakaoMap;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        Marker: new (options: { map: KakaoMap; position: KakaoLatLng }) => KakaoMarker;
        services: {
          Places: new () => {
            keywordSearch: (
              keyword: string,
              callback: (data: KakaoPlaceResult[], status: string) => void,
            ) => void;
          };
          Status: {
            OK: string;
            ZERO_RESULT: string;
          };
        };
      };
    };
  }
}

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

interface KakaoMap {
  setCenter(latlng: KakaoLatLng): void;
  setLevel(level: number): void;
}

interface KakaoMarker {
  setMap(map: KakaoMap | null): void;
  setPosition(latlng: KakaoLatLng): void;
}

let loadPromise: Promise<void> | null = null;

export function loadKakaoMaps(appKey: string): Promise<void> {
  if (window.kakao?.maps?.services) {
    return new Promise((resolve) => {
      window.kakao!.maps.load(() => resolve());
    });
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-maps]');
    if (existing) {
      existing.addEventListener(
        'load',
        () => {
          window.kakao?.maps.load(() => resolve());
        },
        { once: true },
      );
      existing.addEventListener('error', () => reject(new Error('Kakao Maps failed to load')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.dataset.kakaoMaps = 'true';
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&libraries=services&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps) {
        reject(new Error('Kakao Maps failed to load'));
        return;
      }
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () => reject(new Error('Kakao Maps failed to load'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function placeResultToLatLng(place: KakaoPlaceResult): { lat: number; lng: number } {
  return { lat: Number(place.y), lng: Number(place.x) };
}

export function searchKakaoPlaces(appKey: string, keyword: string): Promise<KakaoPlaceResult[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return Promise.resolve([]);

  return loadKakaoMaps(appKey).then(
    () =>
      new Promise((resolve, reject) => {
        const places = new window.kakao!.maps.services.Places();
        places.keywordSearch(trimmed, (data, status) => {
          if (status === window.kakao!.maps.services.Status.OK) {
            resolve(data);
            return;
          }
          if (status === window.kakao!.maps.services.Status.ZERO_RESULT) {
            resolve([]);
            return;
          }
          reject(new Error('Kakao place search failed'));
        });
      }),
  );
}

export function buildKakaoMapSearchUrl(query: string): string {
  return `https://map.kakao.com/link/search/${encodeURIComponent(query.trim() || ' ')}`;
}

export function getKakaoPlaceLabel(place: KakaoPlaceResult): string {
  const address = place.road_address_name || place.address_name;
  return address ? `${place.place_name} · ${address}` : place.place_name;
}

export function buildKakaoPlaceLink(place: KakaoPlaceResult): string {
  if (place.place_url) return place.place_url;
  if (place.id) return `https://map.kakao.com/link/map/${place.id}`;
  return buildKakaoMapSearchUrl(place.place_name);
}

export function buildSchedulePlaceSelection(place: KakaoPlaceResult): SchedulePlaceSelection {
  const { lat, lng } = placeResultToLatLng(place);
  const linkUrl = buildKakaoPlaceLink(place);
  return {
    label: getKakaoPlaceLabel(place),
    mapUrl: encodePlaceMapUrl(linkUrl, lat, lng),
    lat,
    lng,
    placeId: place.id,
  };
}

export function encodePlaceMapUrl(linkUrl: string, lat: number, lng: number): string {
  return `${linkUrl}${COORD_HASH}${lat},${lng}`;
}

export function parsePlaceMapUrl(mapUrl?: string): { linkUrl: string; lat?: number; lng?: number } {
  if (!mapUrl) return { linkUrl: '' };
  const hashIndex = mapUrl.indexOf(COORD_HASH);
  if (hashIndex === -1) return { linkUrl: mapUrl };

  const linkUrl = mapUrl.slice(0, hashIndex);
  const [latStr, lngStr] = mapUrl.slice(hashIndex + COORD_HASH.length).split(',');
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { linkUrl: mapUrl };
  }
  return { linkUrl, lat, lng };
}

/** @deprecated use buildKakaoPlaceLink */
export function buildKakaoPlaceUrl(place: KakaoPlaceResult): string {
  return buildSchedulePlaceSelection(place).mapUrl;
}
