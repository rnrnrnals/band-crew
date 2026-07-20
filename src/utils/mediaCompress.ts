import {
  CHAT_MAX_AUDIO_BYTES,
  CHAT_MAX_IMAGE_BYTES,
  CHAT_MAX_VIDEO_BYTES,
  readFileAsDataUrl,
} from './fileMedia';

export type MediaKind = 'image' | 'video' | 'audio';

export function formatMaxSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

function waitEvent(target: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('미디어를 불러올 수 없어요.'));
    };
    const cleanup = () => {
      target.removeEventListener(event, onOk);
      target.removeEventListener('error', onErr);
    };
    target.addEventListener(event, onOk, { once: true });
    target.addEventListener('error', onErr, { once: true });
  });
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('이미지를 불러올 수 없어요.'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('압축에 실패했어요.'))),
      type,
      quality,
    );
  });
}

export async function compressImageBlob(
  blob: Blob,
  maxBytes = CHAT_MAX_IMAGE_BYTES,
): Promise<Blob> {
  if (blob.size <= maxBytes) return blob;

  const img = await loadImage(blob);
  const baseW = img.naturalWidth || img.width;
  const baseH = img.naturalHeight || img.height;

  for (let pass = 0; pass < 8; pass += 1) {
    const scale = pass === 0 ? 1 : Math.max(0.35, 1 - pass * 0.11);
    const w = Math.max(320, Math.round(baseW * scale));
    const h = Math.max(320, Math.round(baseH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('압축에 실패했어요.');
    ctx.drawImage(img, 0, 0, w, h);

    for (const quality of [0.92, 0.84, 0.76, 0.68, 0.58, 0.48, 0.38]) {
      const result = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (result.size <= maxBytes) return result;
    }
  }

  throw new Error(`사진을 ${formatMaxSize(maxBytes)} 이하로 줄이지 못했어요.`);
}

function pickVideoMime(): string {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i += 1) {
      mono[i] += channel[i] / buffer.numberOfChannels;
    }
  }
  return mono;
}

function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const sampleRate = buffer.sampleRate;
  const samples = mixToMono(buffer);
  const pcm = floatTo16BitPCM(samples);
  const dataLength = pcm.byteLength;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  const bytes = new Uint8Array(pcm.byteLength);
  bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  return new Blob([header, bytes], { type: 'audio/wav' });
}

async function resampleAudioBuffer(buffer: AudioBuffer, sampleRate: number): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.ceil(buffer.duration * sampleRate));
  const offline = new OfflineAudioContext(1, frames, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

export function getAudioDuration(url: string, timeoutMs = 8000): Promise<number | undefined> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;
    const finish = (value: number | undefined) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.src = '';
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(undefined), timeoutMs);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () =>
      finish(Number.isFinite(audio.duration) ? audio.duration : undefined);
    audio.onerror = () => finish(undefined);
    audio.src = url;
  });
}

export const MAX_VIDEO_DURATION_SEC = 5 * 60;

export function formatMediaTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getVideoDuration(url: string, timeoutMs = 10000): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    let settled = false;
    const finish = (value: number | undefined) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.src = '';
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(undefined), timeoutMs);
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) ? video.duration : undefined);
    video.onerror = () => finish(undefined);
    video.src = url;
  });
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('영상을 불러올 수 없어요.'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

async function recordVideoSegment(
  video: HTMLVideoElement,
  endSec: number,
  mimeType: string,
  clipLen: number,
  maxBytes: number,
): Promise<Blob> {
  const videoBitsPerSecond = Math.max(150_000, Math.floor((maxBytes * 8 * 0.72) / clipLen));
  const canCaptureVideo =
    typeof (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream ===
      'function';

  let stream: MediaStream;
  let stopDraw: (() => void) | undefined;

  if (canCaptureVideo) {
    stream = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(320, video.videoWidth);
    canvas.height = Math.max(240, video.videoHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('영상 자르기에 실패했어요.');
    stream = canvas.captureStream(24);
    let rafId = 0;
    const draw = () => {
      if (video.currentTime >= endSec || video.paused) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      rafId = requestAnimationFrame(draw);
    };
    stopDraw = () => cancelAnimationFrame(rafId);
    draw();
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond,
    bitsPerSecond: videoBitsPerSecond,
  });
  const chunks: Blob[] = [];

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error('영상 자르기에 실패했어요.'));
    recorder.onstop = () => {
      stopDraw?.();
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(chunks, { type: mimeType }));
    };

    recorder.start(250);
    void video.play().catch(reject);

    const tick = () => {
      if (video.currentTime >= endSec || video.ended) {
        video.pause();
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();

    window.setTimeout(() => {
      video.pause();
      if (recorder.state !== 'inactive') recorder.stop();
    }, Math.ceil(clipLen * 1000) + 2500);
  });
}

export async function trimVideoBlob(
  blob: Blob,
  startSec: number,
  endSec: number,
  maxBytes = CHAT_MAX_VIDEO_BYTES,
): Promise<Blob> {
  const clipDuration = endSec - startSec;
  if (clipDuration <= 0.2) throw new Error('업로드할 구간을 선택해주세요.');
  if (clipDuration > MAX_VIDEO_DURATION_SEC + 0.5) {
    throw new Error('최대 5분까지 선택할 수 있어요.');
  }

  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.playsInline = true;
  video.volume = 0;
  video.src = url;

  try {
    await waitEvent(video, 'loadedmetadata');
    const safeStart = Math.max(0, Math.min(startSec, video.duration - 0.2));
    const safeEnd = Math.min(endSec, safeStart + MAX_VIDEO_DURATION_SEC, video.duration);
    const clipLen = safeEnd - safeStart;

    const mimeType = pickVideoMime();
    if (!mimeType) throw new Error('이 브라우저에서는 영상 자르기를 지원하지 않아요.');

    await seekVideo(video, safeStart);
    const trimmed = await recordVideoSegment(video, safeEnd, mimeType, clipLen, maxBytes);
    if (trimmed.size <= maxBytes) return trimmed;
    return compressVideoBlob(trimmed, maxBytes);
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
  }
}

export function videoNeedsTrim(durationSec: number | undefined): boolean {
  return !!durationSec && durationSec > MAX_VIDEO_DURATION_SEC + 0.5;
}

async function reencodeVideo(
  video: HTMLVideoElement,
  maxBytes: number,
  scale: number,
): Promise<Blob> {
  const duration = video.duration;
  const width = Math.max(320, Math.round(video.videoWidth * scale));
  const height = Math.max(240, Math.round(video.videoHeight * scale));
  const videoBitsPerSecond = Math.max(100_000, Math.floor((maxBytes * 8 * 0.72) / duration));

  const mimeType = pickVideoMime();
  if (!mimeType) throw new Error('이 브라우저에서는 영상 압축을 지원하지 않아요.');

  const canCaptureVideo =
    scale >= 0.99 &&
    typeof (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream ===
      'function';

  let stream: MediaStream;
  let stopDraw: (() => void) | undefined;

  if (canCaptureVideo) {
    video.volume = 0;
    stream = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('영상 압축에 실패했어요.');
    stream = canvas.captureStream(24);
    let rafId = 0;
    const draw = () => {
      if (video.ended) return;
      ctx.drawImage(video, 0, 0, width, height);
      rafId = requestAnimationFrame(draw);
    };
    stopDraw = () => cancelAnimationFrame(rafId);
    draw();
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond,
    bitsPerSecond: videoBitsPerSecond,
  });
  const chunks: Blob[] = [];

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error('영상 압축에 실패했어요.'));
    recorder.onstop = () => {
      stopDraw?.();
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(chunks, { type: mimeType }));
    };

    video.currentTime = 0;
    recorder.start(250);
    void video
      .play()
      .then(() => {
        video.onended = () => {
          if (recorder.state !== 'inactive') recorder.stop();
        };
      })
      .catch(reject);

    window.setTimeout(() => {
      if (video.ended) return;
      video.pause();
      if (recorder.state !== 'inactive') recorder.stop();
    }, Math.ceil(duration * 1000) + 2500);
  });
}

export async function compressVideoBlob(
  blob: Blob,
  maxBytes = CHAT_MAX_VIDEO_BYTES,
): Promise<Blob> {
  if (blob.size <= maxBytes) return blob;

  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await waitEvent(video, 'loadedmetadata');
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('영상 정보를 확인할 수 없어요.');
    }

    for (const scale of [1, 0.85, 0.7, 0.55, 0.42]) {
      video.pause();
      video.currentTime = 0;
      const result = await reencodeVideo(video, maxBytes, scale);
      if (result.size <= maxBytes) return result;
    }

    throw new Error(`영상을 ${formatMaxSize(maxBytes)} 이하로 줄이지 못했어요.`);
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
  }
}

export async function compressAudioBlob(
  blob: Blob,
  maxBytes = CHAT_MAX_AUDIO_BYTES,
): Promise<Blob> {
  if (blob.size <= maxBytes) return blob;

  const arrayBuffer = await blob.arrayBuffer();
  let decoded: AudioBuffer;

  try {
    const decodeCtx = new AudioContext();
    try {
      decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      await decodeCtx.close();
    }
  } catch {
    throw new Error('이 녹음 형식은 압축할 수 없어요. 다른 파일을 선택해주세요.');
  }

  const duration = decoded.duration;
  const computedMin = Math.floor((maxBytes * 0.95) / Math.max(2, 2 * duration));
  const sampleRates = [24000, 16000, 12000, 8000, 6000, 4000, computedMin]
    .filter((rate, index, arr) => rate >= 3000 && arr.indexOf(rate) === index)
    .sort((a, b) => b - a);

  for (const sampleRate of sampleRates) {
    const resampled = await resampleAudioBuffer(decoded, sampleRate);
    const wav = audioBufferToWav(resampled);
    if (wav.size <= maxBytes) return wav;
  }

  throw new Error(
    `녹음이 너무 길어서 ${formatMaxSize(maxBytes)} 이하로 줄이지 못했어요. 더 짧은 구간을 올려주세요.`,
  );
}

export async function prepareMediaBlob(
  blob: Blob,
  kind: MediaKind,
  maxBytes?: number,
): Promise<Blob> {
  switch (kind) {
    case 'image':
      return compressImageBlob(blob, maxBytes ?? CHAT_MAX_IMAGE_BYTES);
    case 'video':
      return compressVideoBlob(blob, maxBytes ?? CHAT_MAX_VIDEO_BYTES);
    case 'audio':
      return compressAudioBlob(blob, maxBytes ?? CHAT_MAX_AUDIO_BYTES);
    default:
      return blob;
  }
}

export async function readPreparedMediaAsDataUrl(blob: Blob, kind: MediaKind): Promise<string> {
  const prepared = await prepareMediaBlob(blob, kind);
  return readFileAsDataUrl(prepared);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function compressDataUrlImage(
  dataUrl: string,
  maxBytes = CHAT_MAX_IMAGE_BYTES,
): Promise<string> {
  const blob = await dataUrlToBlob(dataUrl);
  const compressed = await compressImageBlob(blob, maxBytes);
  return readFileAsDataUrl(compressed);
}
