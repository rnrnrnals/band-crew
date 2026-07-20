import { STORAGE_BUCKET, type MediaFolder } from '../lib/storageBuckets';
import { requireSupabase } from '../lib/supabase';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
};

function extensionFromBlob(blob: Blob): string {
  const fromMime = blob.type ? MIME_EXT[blob.type.toLowerCase()] : undefined;
  if (fromMime) return fromMime;
  return 'bin';
}

export async function uploadMediaBlob(
  folder: MediaFolder,
  scopeId: string,
  blob: Blob,
  fileLabel?: string,
): Promise<string> {
  const supabase = requireSupabase();
  const ext = fileLabel?.includes('.') ? fileLabel.split('.').pop()!.toLowerCase() : extensionFromBlob(blob);
  const path = `${folder}/${scopeId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
    contentType: blob.type || undefined,
    upsert: false,
    cacheControl: '3600',
  });

  if (error) throw error;

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/** Parse object path inside our bucket from a Supabase public URL. */
export function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const raw = url.slice(idx + marker.length).split('?')[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function isStoragePublicUrl(url: string | null | undefined): boolean {
  return storagePathFromPublicUrl(url) != null;
}

/** Best-effort delete; logs and continues if storage removal fails. */
export async function deleteStorageUrls(...urls: (string | null | undefined)[]): Promise<void> {
  const paths = [...new Set(urls.map(storagePathFromPublicUrl).filter(Boolean) as string[])];
  if (paths.length === 0) return;

  const supabase = requireSupabase();
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) {
    console.warn('[BandCrew] storage delete failed', error.message, paths);
  }
}

/** Remove all files under a bucket folder prefix (e.g. practice/{teamId}/{sessionId}). */
export async function deleteStorageFolder(folderPath: string): Promise<void> {
  const supabase = requireSupabase();
  const root = folderPath.replace(/^\/+|\/+$/g, '');
  if (!root) return;

  const filePaths: string[] = [];
  const folders = [root];

  while (folders.length > 0) {
    const folder = folders.pop()!;
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(folder);
    if (error) {
      console.warn('[BandCrew] storage list failed', error.message, folder);
      continue;
    }
    for (const item of data ?? []) {
      if (!item.name) continue;
      const path = `${folder}/${item.name}`;
      if (item.metadata) {
        filePaths.push(path);
      } else {
        folders.push(path);
      }
    }
  }

  if (filePaths.length === 0) return;

  const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove(filePaths);
  if (removeError) {
    console.warn('[BandCrew] storage folder delete failed', removeError.message, filePaths);
  }
}
