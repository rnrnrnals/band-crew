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
        Marker: new (options: { map: KakaoMap; position: KakaoLatLng; clickable?: boolean }) => KakaoMarker;
        event: {
          addListener: (target: KakaoMap | KakaoMarker, type: string, handler: () => void) => void;
          removeListener: (target: KakaoMap | KakaoMarker, type: string, handler: () => void) => void;
        };
        services: {
          Places: new () => {
            keywordSearch: (
              keyword: string,
              callback: (data: KakaoPlaceResult[], status: string) => void,
            ) => void;
          };
          Geocoder: new () => {
            coord2Address: (
              lng: number,
              lat: number,
              callback: (result: KakaoGeocodeResult[], status: string) => void,
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
  getCenter(): KakaoLatLng;
  panTo(latlng: KakaoLatLng): void;
}

interface KakaoMarker {
  setMap(map: KakaoMap | null): void;
  setPosition(latlng: KakaoLatLng): void;
}

interface KakaoGeocodeResult {
  road_address?: { address_name: string };
  address?: { address_name: string };
}

let loadPromise: Promise<void> | null = null;

export function getKakaoMapsAppKey(): string | undefined {
  const key = import.meta.env.VITE_KAKAO_MAP_APP_KEY?.trim();
  return key || undefined;
}

/** Domain to register under Kakao Developers → JavaScript key → JavaScript SDK domain */
export function getKakaoSdkDomainHint(): string {
  if (typeof window === 'undefined') return 'http://localhost:5173';
  return window.location.origin;
}

export function getKakaoMapsSetupHelp(): string {
  const origin = getKakaoSdkDomainHint();
  return [
    `JavaScript SDK 도메인에 ${origin} 등록`,
    '제품 설정 → 카카오맵 활성화',
    '.env의 VITE_KAKAO_MAP_APP_KEY는 JavaScript 키(REST 키 아님)',
    '설정 후 npm run dev 재시작',
  ].join(' · ');
}

function failLoad(reject: (error: Error) => void, message: string) {
  loadPromise = null;
  reject(new Error(message));
}

export function loadKakaoMaps(appKey: string): Promise<void> {
  if (window.kakao?.maps?.services) {
    return new Promise((resolve) => {
      window.kakao!.maps.load(() => resolve());
    });
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const origin = getKakaoSdkDomainHint();
    const help = getKakaoMapsSetupHelp();

    const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-maps]');
    if (existing) {
      existing.addEventListener(
        'load',
        () => {
          if (!window.kakao?.maps) {
            failLoad(reject, `카카오맵 SDK를 불러오지 못했어요. ${help}`);
            return;
          }
          window.kakao.maps.load(() => resolve());
        },
        { once: true },
      );
      existing.addEventListener(
        'error',
        () => failLoad(reject, `카카오맵 SDK 로드 실패. ${origin} 도메인·JavaScript 키를 확인해 주세요.`),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.dataset.kakaoMaps = 'true';
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&libraries=services&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps) {
        failLoad(reject, `카카오맵 SDK를 불러오지 못했어요. ${help}`);
        return;
      }
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () =>
      failLoad(
        reject,
        `카카오맵 SDK 로드 실패. JavaScript SDK 도메인에 ${origin} 등록했는지, JavaScript 키를 쓰는지 확인해 주세요.`,
      );
    document.head.appendChild(script);
  });

  return loadPromise.catch((error) => {
    loadPromise = null;
    throw error;
  });
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

export function buildSchedulePlaceSelectionFromCoords(
  label: string,
  lat: number,
  lng: number,
): SchedulePlaceSelection {
  const linkUrl = `https://map.kakao.com/link/map/${lat},${lng}`;
  return {
    label,
    mapUrl: encodePlaceMapUrl(linkUrl, lat, lng),
    lat,
    lng,
  };
}

export function reverseGeocodeCoords(
  appKey: string,
  lat: number,
  lng: number,
): Promise<{ label: string; lat: number; lng: number }> {
  return loadKakaoMaps(appKey).then(
    () =>
      new Promise((resolve, reject) => {
        const geocoder = new window.kakao!.maps.services.Geocoder();
        geocoder.coord2Address(lng, lat, (result, status) => {
          if (status !== window.kakao!.maps.services.Status.OK || result.length === 0) {
            reject(new Error('주소를 찾지 못했어요.'));
            return;
          }
          const row = result[0];
          const label =
            row.road_address?.address_name ||
            row.address?.address_name ||
            `선택한 위치 (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
          resolve({ label, lat, lng });
        });
      }),
  );
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
