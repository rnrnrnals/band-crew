/**
 * `blob:` object URLs only live as long as the page that created them —
 * they're dead the instant the page reloads. The local (non-Supabase)
 * practice room persists tracks to `localStorage`, which can only hold the
 * URL *string*, not the underlying bytes, so a plain refresh always left
 * every locally-stored video pointing at a URL that no longer resolves to
 * anything (black tile, "MEDIA_ELEMENT_ERROR: Format error").
 *
 * This module stores the actual `Blob` in IndexedDB so a fresh
 * `URL.createObjectURL()` can be minted for it after every reload.
 */

const DB_NAME = 'band-crew-practice-media';
const DB_VERSION = 1;
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
  }
  return dbPromise;
}

export function mediaBlobKey(sessionId: string, trackId: number): string {
  return `${sessionId}:${trackId}`;
}

export async function putMediaBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed'));
  });
}

export async function getMediaBlob(key: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
  });
}

export async function deleteMediaBlob(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
}

/** Delete every stored blob whose key starts with `${sessionId}:`. */
export async function deleteMediaBlobsForSession(sessionId: string): Promise<void> {
  const prefix = `${sessionId}:`;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (String(cursor.key).startsWith(prefix)) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB cleanup failed'));
  });
}
