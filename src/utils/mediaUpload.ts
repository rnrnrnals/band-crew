import { isSupabaseConfigured } from '../lib/supabase';
import type { MediaFolder } from '../lib/storageBuckets';
import { dataUrlToBlob, uploadMediaBlob } from '../services/storageService';
import { readFileAsDataUrl } from './fileMedia';

export function isRemoteMediaUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function isDataUrl(url: string): boolean {
  return url.startsWith('data:');
}

/** Upload to Supabase Storage when configured; otherwise keep data URL (local demo). */
export async function ensurePublishedMedia(
  source: Blob | string,
  folder: MediaFolder,
  scopeId: string,
  fileLabel?: string,
): Promise<string> {
  if (typeof source === 'string') {
    if (isRemoteMediaUrl(source)) return source;
    if (!isSupabaseConfigured) return source;
    const blob = await dataUrlToBlob(source);
    return uploadMediaBlob(folder, scopeId, blob, fileLabel);
  }

  if (!isSupabaseConfigured) return readFileAsDataUrl(source);
  return uploadMediaBlob(folder, scopeId, source, fileLabel);
}

/** Upload profile/team image on save if still a data URL. */
export async function ensurePublishedImageUrl(
  url: string,
  folder: 'profiles' | 'teams',
  scopeId: string,
): Promise<string> {
  if (!url || isRemoteMediaUrl(url)) return url;
  if (!isSupabaseConfigured) return url;
  return ensurePublishedMedia(url, folder, scopeId);
}
