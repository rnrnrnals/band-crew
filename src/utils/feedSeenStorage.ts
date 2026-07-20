const LS_KEY = 'band-crew-feed-seen-v1';
const MAX_ENTRIES = 600;

export interface FeedSeenRecord {
  firstSeenAt: number;
  lastSeenAt: number;
  viewCount: number;
}

export type FeedSeenStore = Record<string, FeedSeenRecord>;

export function feedSeenKey(kind: 'post' | 'audio', id: string): string {
  return `${kind}:${id}`;
}

export function loadFeedSeen(): FeedSeenStore {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as FeedSeenStore;
  } catch {
    return {};
  }
}

function trimFeedSeen(store: FeedSeenStore): FeedSeenStore {
  const entries = Object.entries(store);
  if (entries.length <= MAX_ENTRIES) return store;
  entries.sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt);
  return Object.fromEntries(entries.slice(entries.length - MAX_ENTRIES));
}

export function markFeedItemSeen(key: string): FeedSeenStore {
  const store = loadFeedSeen();
  const now = Date.now();
  const prev = store[key];
  store[key] = {
    firstSeenAt: prev?.firstSeenAt ?? now,
    lastSeenAt: now,
    viewCount: (prev?.viewCount ?? 0) + 1,
  };
  const trimmed = trimFeedSeen(store);
  localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  return trimmed;
}
