/**
 * Fallback for videos the browser's native <video> tag flatly refuses to
 * load (e.g. iPhone .mov/QuickTime files opened on Android/Chrome, which
 * has no QuickTime demuxer at all). ffmpeg.wasm ships its own demuxer that
 * doesn't depend on the browser's codec support, so it can read these
 * files even when <video src> can't.
 *
 * We only ever *remux* (repackage the existing compressed audio/video into
 * an MP4 container via `-c copy`) rather than re-encode — remuxing is
 * effectively just I/O, so it stays fast even for large phone recordings,
 * whereas a full re-encode of a 200MB+ file would be far too slow/heavy
 * for a phone's CPU.
 *
 * The wasm core (~30MB) is fetched from a CDN lazily, only the first time
 * this is needed, and reused for the rest of the session.
 */

import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { MediaProgressReporter } from './mediaProgress';
import { clampProgress } from './mediaProgress';

let ffmpegPromise: Promise<FFmpeg> | null = null;

const CORE_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);
      const instance = new FFmpeg();
      await instance.load({
        coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return instance;
    })().catch((err) => {
      ffmpegPromise = null;
      throw err;
    });
  }
  return ffmpegPromise;
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : 'bin';
}

/**
 * Repackage a video file into an MP4 container without re-encoding.
 * Throws if the source can't even be demuxed (truly corrupt/unknown data).
 */
export async function remuxVideoToMp4(file: File, onProgress?: MediaProgressReporter): Promise<Blob> {
  const { fetchFile } = await import('@ffmpeg/util');

  onProgress?.({ progress: 0, label: '변환 도구 불러오는 중…' });
  const ffmpeg = await getFFmpeg();

  const inputName = `in-${Date.now()}.${extensionOf(file.name)}`;
  const outputName = `out-${Date.now()}.mp4`;

  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    onProgress?.({
      progress: clampProgress(0.12 + progress * 0.78),
      label: '호환 형식으로 변환 중…',
    });
  };

  try {
    onProgress?.({ progress: 0.05, label: '영상 읽는 중…' });
    ffmpeg.on('progress', onFfmpegProgress);
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    onProgress?.({ progress: 0.1, label: '호환 형식으로 변환 중…' });
    await ffmpeg.exec(['-i', inputName, '-c', 'copy', '-movflags', '+faststart', outputName]);
    onProgress?.({ progress: 0.92, label: '변환 마무리 중…' });
    const data = await ffmpeg.readFile(outputName);
    const bytes =
      data instanceof Uint8Array ? new Uint8Array(data) : new TextEncoder().encode(String(data));
    onProgress?.({ progress: 1, label: '완료' });
    return new Blob([bytes], { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', onFfmpegProgress);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      /* ignore cleanup errors */
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      /* ignore cleanup errors */
    }
  }
}
