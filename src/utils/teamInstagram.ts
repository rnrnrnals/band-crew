const INSTAGRAM_USERNAME_MAX = 30;

export function normalizeInstagramUsername(input: string): string {
  let value = input.trim();
  if (!value) return '';

  value = value.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
  value = value.replace(/^@+/, '');
  value = value.replace(/[/?#].*$/, '');

  return value.replace(/[^a-zA-Z0-9._]/g, '').slice(0, INSTAGRAM_USERNAME_MAX);
}

export function formatInstagramHandle(username: string): string {
  const normalized = normalizeInstagramUsername(username);
  return normalized ? `@${normalized}` : '';
}

export function getInstagramProfileUrl(username: string): string | null {
  const normalized = normalizeInstagramUsername(username);
  return normalized ? `https://www.instagram.com/${normalized}/` : null;
}

function isMobileDevice(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
}

function isAndroidDevice(): boolean {
  return /Android/i.test(navigator.userAgent || '');
}

/** Opens Instagram app on mobile when installed, otherwise the profile page. */
export function openInstagramProfile(username: string): void {
  const normalized = normalizeInstagramUsername(username);
  if (!normalized) return;

  const webUrl = `https://www.instagram.com/${normalized}/`;

  if (!isMobileDevice()) {
    window.open(webUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  if (isAndroidDevice()) {
    window.location.assign(
      `intent://instagram.com/_u/${normalized}/#Intent;package=com.instagram.android;scheme=https;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`,
    );
    return;
  }

  const appUrl = `instagram://user?username=${encodeURIComponent(normalized)}`;
  window.location.assign(appUrl);
  window.setTimeout(() => {
    if (document.visibilityState === 'visible') {
      window.location.assign(webUrl);
    }
  }, 700);
}
