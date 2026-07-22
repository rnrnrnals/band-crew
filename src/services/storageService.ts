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

const TEAM_STORAGE_FOLDERS: MediaFolder[] = [
  'posts',
  'stories',
  'audio',
  'chat',
  'practice',
  'teams',
];

export class StorageDeleteError extends Error {
  readonly paths: string[];

  constructor(message: string, paths: string[] = []) {
    super(message);
    this.name = 'StorageDeleteError';
    this.paths = paths;
  }
}

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
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  const supabase = requireSupabase();
  const ext = fileLabel?.includes('.') ? fileLabel.split('.').pop()!.toLowerCase() : extensionFromBlob(blob);
  const path = `${folder}/${scopeId}/${crypto.randomUUID()}.${ext}`;

  if (onProgress) {
    try {
      await uploadBlobWithProgress(supabase, path, blob, onProgress);
    } catch {
      const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
        contentType: blob.type || undefined,
        upsert: false,
        cacheControl: '3600',
      });
      if (error) throw error;
    }
  } else {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
      contentType: blob.type || undefined,
      upsert: false,
      cacheControl: '3600',
    });
    if (error) throw error;
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadBlobWithProgress(
  supabase: ReturnType<typeof requireSupabase>,
  path: string,
  blob: Blob,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!baseUrl || !anonKey) {
    throw new Error('Supabase가 설정되지 않았습니다.');
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? anonKey;
  const url = `${baseUrl}/storage/v1/object/${STORAGE_BUCKET}/${path}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    xhr.setRequestHeader('cache-control', '3600');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(xhr.responseText || '파일 업로드에 실패했어요.'));
    };
    xhr.onerror = () => reject(new Error('파일 업로드에 실패했어요.'));
    xhr.send(blob);
  });
}

export async function uploadPosterForVideo(videoUrl: string, poster: Blob): Promise<string> {
  const supabase = requireSupabase();
  const videoPath = storagePathFromPublicUrl(videoUrl);
  if (!videoPath) throw new Error('포스터 경로를 만들 수 없어요.');
  const posterPath = videoPath.replace(/\.[^.]+$/, '-poster.jpg');

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(posterPath, poster, {
    contentType: poster.type || 'image/jpeg',
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw error;

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(posterPath);
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

/** Delete storage objects; throws if removal fails. */
export async function deleteStorageUrls(...urls: (string | null | undefined)[]): Promise<void> {
  const paths = [...new Set(urls.map(storagePathFromPublicUrl).filter(Boolean) as string[])];
  if (paths.length === 0) return;

  const supabase = requireSupabase();
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) {
    throw new StorageDeleteError(error.message, paths);
  }
}

/** Remove all files under a bucket folder prefix (e.g. practice/{teamId}/{sessionId}). */
export async function deleteStorageFolder(folderPath: string): Promise<void> {
  const supabase = requireSupabase();
  const root = folderPath.replace(/^\/+|\/+$/g, '');
  if (!root) return;

  const filePaths: string[] = [];
  const folders = [root];
  const listErrors: string[] = [];

  while (folders.length > 0) {
    const folder = folders.pop()!;
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(folder);
    if (error) {
      listErrors.push(`${folder}: ${error.message}`);
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

  if (listErrors.length > 0) {
    throw new StorageDeleteError(`Storage list failed: ${listErrors.join('; ')}`, [root]);
  }

  if (filePaths.length === 0) return;

  const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove(filePaths);
  if (removeError) {
    throw new StorageDeleteError(removeError.message, filePaths);
  }
}

/** Delete all media uploaded under a team scope. */
export async function deleteTeamStorage(teamId: string): Promise<void> {
  const errors: string[] = [];
  for (const folder of TEAM_STORAGE_FOLDERS) {
    try {
      await deleteStorageFolder(`${folder}/${teamId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'storage delete failed';
      errors.push(`${folder}/${teamId}: ${message}`);
    }
  }
  if (errors.length > 0) {
    throw new StorageDeleteError(`Team storage cleanup failed: ${errors.join('; ')}`);
  }
}

/** Delete a replaced media URL after a successful profile/cover/avatar update. */
export async function deleteReplacedStorageUrl(
  previousUrl: string | null | undefined,
  nextUrl: string | null | undefined,
): Promise<void> {
  if (!previousUrl || previousUrl === nextUrl) return;
  if (!isStoragePublicUrl(previousUrl)) return;
  if (nextUrl && storagePathFromPublicUrl(previousUrl) === storagePathFromPublicUrl(nextUrl)) return;
  await deleteStorageUrls(previousUrl);
}
