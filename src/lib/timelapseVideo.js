// Turns a plant's progress photos into a short shareable video (MP4 when the phone can,
// WebM otherwise): photos cross-fade with their dates, a small "Happy Plants" tag sits in the
// corner, and it ends on a "Made with Happy Plants" card. Everything happens on the phone.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';

const W = 720;
const H = 900; // 4:5, fits Instagram and most feeds
const FPS = 30;

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

export function canMakeVideo() {
  try {
    const c = document.createElement('canvas');
    return !!pickMime() && typeof c.captureStream === 'function';
  } catch {
    return false;
  }
}

async function loadImage(url) {
  // Fetch as a blob so the canvas never gets "tainted" and stays exportable
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('photo_load_failed');
  const blob = await res.blob();
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

function drawCover(ctx, img, alpha = 1) {
  const iw = img.width, ih = img.height;
  const s = Math.max(W / iw, H / ih);
  const w = iw * s, h = ih * s;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  ctx.globalAlpha = 1;
}

function pill(ctx, text, x, y, { align = 'left', size = 26, bg = 'rgba(0,0,0,0.55)' } = {}) {
  ctx.font = `700 ${size}px system-ui, -apple-system, Roboto, sans-serif`;
  const pad = size * 0.55;
  const tw = ctx.measureText(text).width;
  const w = tw + pad * 2, h = size * 1.7;
  const left = align === 'right' ? x - w : x;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(left, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + pad, y + h / 2 + 1);
}

function endCard(ctx, t, plantName, span) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#14532d');
  g.addColorStop(1, '#16a34a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = Math.min(1, t * 3);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '120px system-ui, sans-serif';
  ctx.fillText('🌱', W / 2, H * 0.36);
  ctx.font = '800 48px system-ui, -apple-system, Roboto, sans-serif';
  ctx.fillText(plantName, W / 2, H * 0.52, W - 80);
  if (span) {
    ctx.font = '600 30px system-ui, -apple-system, Roboto, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(span, W / 2, H * 0.59, W - 80);
  }
  ctx.fillStyle = '#fff';
  ctx.font = '700 32px system-ui, -apple-system, Roboto, sans-serif';
  ctx.fillText('Made with Happy Plants', W / 2, H * 0.76);
  ctx.font = '500 24px system-ui, -apple-system, Roboto, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('Free on Google Play', W / 2, H * 0.81);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

function spanLabel(first, last) {
  try {
    const days = Math.abs(differenceInCalendarDays(parseISO(last), parseISO(first)));
    if (days < 1) return null;
    if (days < 14) return `${days} day${days === 1 ? '' : 's'} of growth`;
    if (days < 60) return `${Math.round(days / 7)} weeks of growth`;
    if (days < 730) return `${Math.round(days / 30.4)} months of growth`;
    return `${(days / 365).toFixed(1).replace(/\.0$/, '')} years of growth`;
  } catch { return null; }
}

/**
 * photos: [{ image_url, photo_date }] oldest first. Returns { blob, mime, ext, durationMs }.
 * onProgress(0..1) is called while it records (the video takes as long to make as to watch).
 */
export async function makeTimelapseVideo(photos, { plantName = 'My plant', onProgress } = {}) {
  const mime = pickMime();
  if (!mime) throw new Error('unsupported');
  const list = photos.slice(-60); // keep it short and shareable
  const imgs = [];
  for (let n = 0; n < list.length; n++) {
    imgs.push(await loadImage(list[n].image_url));
    onProgress?.(0.15 * ((n + 1) / list.length));
  }

  const per = Math.max(450, Math.min(1200, 9000 / list.length)); // whole thing ~9-12 s
  const fade = Math.min(320, per * 0.35);
  const firstHold = 700, lastHold = 1400, endMs = 2200;
  const starts = [];
  let t = 0;
  for (let n = 0; n < list.length; n++) {
    starts.push(t);
    t += per + (n === 0 ? firstHold : 0) + (n === list.length - 1 ? lastHold : 0);
  }
  const photosEnd = t;
  const total = photosEnd + endMs;
  const span = spanLabel(list[0].photo_date, list[list.length - 1].photo_date);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const draw = (ms) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (ms >= photosEnd) { endCard(ctx, (ms - photosEnd) / endMs, plantName, span); return; }
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= ms) i++;
    drawCover(ctx, imgs[i]);
    const next = i + 1 < imgs.length ? starts[i + 1] : Infinity;
    if (ms > next - fade && i + 1 < imgs.length) drawCover(ctx, imgs[i + 1], (ms - (next - fade)) / fade);
    // Soft shade so the labels read on any photo
    const sh = ctx.createLinearGradient(0, 0, 0, 140);
    sh.addColorStop(0, 'rgba(0,0,0,0.45)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, W, 140);
    let label = '';
    try { label = format(parseISO(list[i].photo_date), 'MMM d, yyyy'); } catch { /* no date */ }
    if (label) pill(ctx, label, 28, 28);
    if (ms < firstHold + per * 0.6) pill(ctx, plantName, W - 28, 28, { align: 'right', size: 24, bg: 'rgba(22,163,74,0.85)' });
    pill(ctx, '🌱 Happy Plants', W - 24, H - 72, { align: 'right', size: 22, bg: 'rgba(0,0,0,0.45)' });
  };

  draw(0);
  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve) => { rec.onstop = resolve; });
  rec.start(250);

  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const ms = performance.now() - t0;
      draw(Math.min(ms, total));
      onProgress?.(0.15 + 0.85 * Math.min(1, ms / total));
      if (ms >= total) resolve();
      else setTimeout(tick, 1000 / FPS); // timers keep going even if a frame is skipped
    };
    tick();
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  imgs.forEach((im) => im.close?.());
  const type = mime.split(';')[0];
  return { blob: new Blob(chunks, { type }), mime: type, ext: type === 'video/mp4' ? 'mp4' : 'webm', durationMs: total };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

const fileNameFor = (plantName, ext) => `${String(plantName || 'plant').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'plant'}-timelapse.${ext}`;

/** Opens the phone's share sheet (Instagram, TikTok, Messages…). Returns 'shared' | 'downloaded' | 'update_needed'. */
export async function shareVideo(video, plantName) {
  const fileName = fileNameFor(plantName, video.ext);
  if (Capacitor.isNativePlatform()) {
    try {
      await registerPlugin('NotifyBridge').shareFile({ base64: await blobToBase64(video.blob), fileName, mimeType: video.mime, title: 'Share your time-lapse' });
      return 'shared';
    } catch (e) {
      if (/not implemented|not available|unimplemented/i.test(String(e?.message || e))) return 'update_needed';
      throw e;
    }
  }
  const file = new File([video.blob], fileName, { type: video.mime });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${plantName} time-lapse` }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'shared'; }
  }
  downloadBlob(video.blob, fileName);
  return 'downloaded';
}

/** Saves to the phone's Movies/Happy Plants folder. Returns 'saved' | 'downloaded' | 'update_needed' | 'unsupported'. */
export async function saveVideo(video, plantName) {
  const fileName = fileNameFor(plantName, video.ext);
  if (Capacitor.isNativePlatform()) {
    try {
      await registerPlugin('NotifyBridge').saveVideo({ base64: await blobToBase64(video.blob), fileName, mimeType: video.mime });
      return 'saved';
    } catch (e) {
      const m = String(e?.message || e);
      if (/not implemented|not available|unimplemented/i.test(m)) return 'update_needed';
      if (/unsupported/.test(m)) return 'unsupported';
      throw e;
    }
  }
  downloadBlob(video.blob, fileName);
  return 'downloaded';
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
