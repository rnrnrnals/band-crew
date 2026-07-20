export interface KakaoPlaceResult {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  place_url?: string;
  x: string;
  y: string;
}

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (callback: () => void) => void;
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

export function buildKakaoPlaceUrl(place: KakaoPlaceResult): string {
  if (place.place_url) return place.place_url;
  if (place.id) return `https://map.kakao.com/link/map/${place.id}`;
  return buildKakaoMapSearchUrl(place.place_name);
}
