export const POSITION_LABELS: Record<string, string> = {
  vocal: '보컬',
  elec: '일렉',
  acoustic: '어쿠스틱',
  bass: '베이스',
  drums: '드럼',
  keys: '키보드',
  sax: '색소폰',
  other: '그 외',
};

export const POSITION_COLORS: Record<string, string> = {
  vocal: '#c25a3d',
  elec: '#e0a04a',
  acoustic: '#a9bf7e',
  bass: '#5b8dc0',
  drums: '#c77dab',
  keys: '#8d78a8',
  sax: '#4f8f8a',
  other: '#a8998a',
};

export const POS_ART: Record<string, string> = {
  vocal: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="10" width="16" height="24" rx="8" fill="#c25a3d"/><path d="M18 30c0 9 6.3 16 14 16s14-7 14-16" stroke="#c25a3d" stroke-width="3" stroke-linecap="round"/><path d="M32 46v10" stroke="#8a672f" stroke-width="3.5" stroke-linecap="round"/><path d="M22 56h20" stroke="#8a672f" stroke-width="3.5" stroke-linecap="round"/><path d="M28 18h8M28 23h8M28 28h8" stroke="#f2e8d8" stroke-width="2" stroke-linecap="round"/></svg>`,
  elec: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 18V6l16-2 2 12-16 2z" fill="#d4922a"/><circle cx="8" cy="9" r="1.2" fill="#8a672f"/><circle cx="8" cy="13" r="1.2" fill="#8a672f"/><circle cx="8" cy="17" r="1.2" fill="#8a672f"/><circle cx="13" cy="8" r="1.2" fill="#8a672f"/><circle cx="13" cy="12" r="1.2" fill="#8a672f"/><circle cx="13" cy="16" r="1.2" fill="#8a672f"/><path d="M8 18l28 14" stroke="#8a672f" stroke-width="5" stroke-linecap="round"/><path d="M10 19l24 12" stroke="#201c19" stroke-width="2.5" stroke-linecap="round" opacity=".22"/><path d="M35 32l14-6c8 2 12 10 10 20-2 10-14 16-24 14-8-2-12-10-8-18 2-4 6-7 10-8z" fill="#e0a04a"/><path d="M38 36c6 0 10 5 10 12s-4 12-10 12-9-5-9-12 3-12 9-12z" fill="#c25a3d" opacity=".42"/><rect x="38" y="38" width="7" height="2.5" rx="1" fill="#201c19" opacity=".32"/><rect x="40" y="44" width="7" height="2.5" rx="1" fill="#201c19" opacity=".32"/><rect x="36" y="50" width="9" height="2" rx="1" fill="#8a672f"/><circle cx="48" cy="48" r="2" fill="#8a672f" opacity=".55"/></svg>`,
  acoustic: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 50c-14 0-22-8-22-20 0-10 8-18 18-18 2 0 4 0 6 2 2-2 4-2 6-2 10 0 18 8 18 18 0 12-8 20-22 20z" fill="#a9bf7e"/><path d="M29 12v10c0 2 1.3 3 3 3s3-1 3-3V12" fill="#7a9a5c"/><rect x="26" y="4" width="12" height="8" rx="2" fill="#e0a04a"/><circle cx="32" cy="30" r="8" fill="#201c19"/><circle cx="32" cy="30" r="3.5" fill="#f2e8d8"/></svg>`,
  bass: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 8l32 34" stroke="#8a672f" stroke-width="4" stroke-linecap="round"/><path d="M10 6l12 5-2 7-10-5V6z" fill="#5b8dc0"/><path d="M46 30c10-1 16 6 16 16 0 12-10 20-22 20-8 0-14-6-16-14 4-10 12-18 22-22z" fill="#5b8dc0"/><path d="M48 38c5 1 8 5 7 10-1 6-7 10-13 8-4-1-7-5-7-9 1-5 6-9 13-9z" fill="#3d6a9a" opacity=".55"/><line x1="12" y1="4" x2="12" y2="10" stroke="#5b8dc0" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="4" x2="16" y2="10" stroke="#5b8dc0" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="4" x2="20" y2="10" stroke="#5b8dc0" stroke-width="2" stroke-linecap="round"/><line x1="24" y1="4" x2="24" y2="10" stroke="#5b8dc0" stroke-width="2" stroke-linecap="round"/></svg>`,
  drums: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 34V18" stroke="#8a672f" stroke-width="2" stroke-linecap="round"/><ellipse cx="8" cy="16" rx="6.5" ry="2" fill="#e0a04a"/><ellipse cx="8" cy="18.5" rx="6.5" ry="2" fill="#d4cfc4"/><path d="M56 10v28" stroke="#8a672f" stroke-width="2" stroke-linecap="round"/><ellipse cx="56" cy="8" rx="7" ry="2.5" fill="#e0a04a"/><g><ellipse cx="19" cy="23" rx="6.5" ry="3.5" fill="#a85f7a"/><ellipse cx="19" cy="21" rx="6.5" ry="3.5" fill="#f2e8d8"/></g><g><ellipse cx="45" cy="23" rx="6.5" ry="3.5" fill="#a85f7a"/><ellipse cx="45" cy="21" rx="6.5" ry="3.5" fill="#f2e8d8"/></g><g><ellipse cx="32" cy="31" rx="9" ry="5" fill="#c25a3d"/><ellipse cx="32" cy="29" rx="9" ry="5" fill="#f2e8d8"/></g><g><ellipse cx="32" cy="47" rx="17" ry="10" fill="#a85f7a"/><ellipse cx="32" cy="43" rx="17" ry="10" fill="#f2e8d8"/><circle cx="32" cy="43" r="4" fill="#c77dab" opacity=".35"/></g><g><ellipse cx="52" cy="49" rx="7" ry="4.5" fill="#a85f7a"/><ellipse cx="52" cy="47" rx="7" ry="4.5" fill="#f2e8d8"/></g></svg>`,
  keys: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="24" width="48" height="26" rx="4" fill="#f2e8d8" stroke="#8d78a8" stroke-width="2"/><rect x="12" y="28" width="7" height="18" rx="1" fill="#fff"/><rect x="21" y="28" width="7" height="18" rx="1" fill="#fff"/><rect x="30" y="28" width="7" height="18" rx="1" fill="#fff"/><rect x="39" y="28" width="7" height="18" rx="1" fill="#fff"/><rect x="48" y="28" width="4" height="18" rx="1" fill="#fff"/><rect x="17" y="28" width="4" height="11" fill="#201c19"/><rect x="26" y="28" width="4" height="11" fill="#201c19"/><rect x="35" y="28" width="4" height="11" fill="#201c19"/><rect x="44" y="28" width="4" height="11" fill="#201c19"/></svg>`,
  sax: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M41 5l11 3-3 8c-5 2-9 7-10 13l-2 10c-1 7 2 13 8 16 6 3 13 0 16-6 3-7 0-14-6-18l-2-8c-1-6-1-12 1-18l-3-9z" fill="#4f8f8a"/><ellipse cx="50" cy="50" rx="11" ry="9" fill="#4f8f8a"/><path d="M39 5l12-2 3 7-12 4-3-9z" fill="#f2e8d8"/><circle cx="38" cy="18" r="2" fill="#f2e8d8"/><circle cx="36" cy="26" r="2" fill="#f2e8d8"/><circle cx="35" cy="34" r="2" fill="#f2e8d8"/><circle cx="38" cy="42" r="2" fill="#f2e8d8"/></svg>`,
  other: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="14" y="14" width="36" height="36" rx="10" fill="#a8998a" opacity=".22"/><path d="M32 24v16M24 32h16" stroke="#a8998a" stroke-width="4.5" stroke-linecap="round"/></svg>`,};
