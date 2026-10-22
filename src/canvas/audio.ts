import type { Item } from '../model/types';

/**
 * Audio notes: recorded in the browser, kept in their item as a data URL (like pictures) with their
 * length and a coarse waveform, and played back one at a time.
 */
export interface AudioNote { src: string; dur: number; peaks: number[] }

/** Bars in a note's waveform. */
export const PEAKS = 48;
/** Longest recording; it stops by itself after this. */
export const MAX_SECONDS = 180;

/* ---------- playback ---------- */

let current: { id: string; el: HTMLAudioElement; raf: number } | null = null;

/** Plays a note, or stops it if it's the one playing; `tick` runs every frame while it plays. */
export function toggleAudio(it: Item, tick: () => void): void {
  const same = current?.id === it.id;
  stopAudio();
  tick();
  if (same || !it.src) return;
  const el = new Audio(it.src);
  const c = { id: it.id, el, raf: 0 };
  const loop = () => { tick(); c.raf = requestAnimationFrame(loop); };
  el.onended = () => { if (current === c) stopAudio(); tick(); };
  current = c;
  void el.play().then(() => { if (current === c) loop(); }, () => { if (current === c) stopAudio(); tick(); });
}

export function stopAudio(): void {
  if (!current) return;
  cancelAnimationFrame(current.raf);
  current.el.pause();
  current = null;
}

/** How far the note is played, 0…1, or null when it isn't playing. */
export function audioProgress(id: string, dur: number): number | null {
  if (current?.id !== id) return null;
  return Math.min(1, current.el.currentTime / (Number.isFinite(current.el.duration) ? current.el.duration : dur || 1));
}

/** "1:05" */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/* ---------- recording ---------- */

/** A recording in progress: `level()` is the microphone's loudness right now, 0…1. */
export interface Recording { level: () => number; stop: () => Promise<AudioNote>; cancel: () => void }

/** Opus in WebM where the browser can, MP4 (Safari) otherwise. */
const MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));

/** Starts recording from the microphone (the browser asks for permission the first time). */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream, { ...(MIME && { mimeType: MIME }), audioBitsPerSecond: 32000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  // Loudness, sampled for the live meter and, every frame, for the note's waveform.
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const level = () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.min(1, Math.sqrt(sum / buf.length) * 4);
  };
  const levels: number[] = [];
  let raf = requestAnimationFrame(function sample() { levels.push(level()); raf = requestAnimationFrame(sample); });
  const started = performance.now();
  const release = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); void ctx.close(); };
  rec.start(250);
  return {
    level,
    cancel: () => { rec.onstop = null; if (rec.state !== 'inactive') rec.stop(); release(); },
    stop: () => new Promise((resolve, reject) => {
      rec.onstop = () => {
        release();
        const blob = new Blob(chunks, { type: rec.mimeType || MIME || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => resolve({ src: reader.result as string, dur: (performance.now() - started) / 1000, peaks: toPeaks(levels) });
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      };
      rec.stop();
    }),
  };
}

/** Squeezes the sampled loudness into PEAKS bars, scaled so the loudest is full height. */
export function toPeaks(levels: number[]): number[] {
  if (!levels.length) return Array(PEAKS).fill(0);
  const bars = Array.from({ length: PEAKS }, (_, i) => {
    const from = Math.floor((i * levels.length) / PEAKS), to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / PEAKS));
    return Math.max(...levels.slice(from, to));
  });
  const top = Math.max(...bars) || 1;
  return bars.map((b) => Math.round((b / top) * 100) / 100);
}
