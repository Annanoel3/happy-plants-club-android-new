import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw, Check, Loader2, Eye, EyeOff } from 'lucide-react';

// In-app camera for progress photos with an "onion skin": a faint copy of the last
// photo sits on top of the live camera so the pot can be lined up the same way every
// time, which keeps a time-lapse steady. Photos are saved in a fixed 3:4 portrait frame
// (exactly what's inside the frame on screen), so every photo lines up with the next.
//
// If the camera can't be opened in the app (permission off, old WebView), onFallback()
// is called and the regular camera is used instead, without the guide.
const FRAME_W = 3;
const FRAME_H = 4;
const OUT_W = 1200;

export default function OnionSkinCamera({ open, ghostUrl, onClose, onCapture, onFallback }) {
  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [ghostOn, setGhostOn] = useState(true);
  const [opacity, setOpacity] = useState(0.4);
  const [shot, setShot] = useState(null); // { blob, url }
  const [saving, setSaving] = useState(false);

  const stop = () => {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    streamRef.current = null;
  };

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setReady(false);
    setShot(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
      } catch (e) {
        if (!cancelled) {
          stop();
          onFallback?.(e);
        }
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [open]);

  useEffect(() => () => { if (shot?.url) URL.revokeObjectURL(shot.url); }, [shot]);

  if (!open) return null;

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    // Same crop as object-cover inside the 3:4 frame
    const vw = v.videoWidth, vh = v.videoHeight;
    const target = FRAME_W / FRAME_H;
    let sw = vw, sh = vh;
    if (vw / vh > target) sw = vh * target; else sh = vw / target;
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    const outW = Math.min(OUT_W, Math.round(sw));
    const outH = Math.round(outW * FRAME_H / FRAME_W);
    const c = document.createElement('canvas');
    c.width = outW; c.height = outH;
    c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, outW, outH);
    c.toBlob((blob) => {
      if (!blob) return;
      setShot({ blob, url: URL.createObjectURL(blob) });
    }, 'image/jpeg', 0.88);
  };

  const use = async () => {
    if (!shot) return;
    setSaving(true);
    try {
      const file = new File([shot.blob], `progress_${Date.now()}.jpg`, { type: 'image/jpeg' });
      await onCapture(file);
      stop();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const close = () => { stop(); onClose(); };

  return createPortal(
    <div className="fixed inset-0 z-[400] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Progress photo camera"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={close} aria-label="Close" className="p-2 -ml-2 rounded-full active:bg-white/10"><X className="w-6 h-6" /></button>
        <p className="text-sm font-semibold">{shot ? 'Keep this photo?' : ghostUrl ? 'Line it up with the last photo' : 'Progress photo'}</p>
        {ghostUrl && !shot ? (
          <button onClick={() => setGhostOn((g) => !g)} aria-label={ghostOn ? 'Hide guide' : 'Show guide'} className="p-2 -mr-2 rounded-full active:bg-white/10">
            {ghostOn ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
          </button>
        ) : <span className="w-10" />}
      </div>

      <div className="flex-1 flex items-center justify-center px-3 min-h-0">
        <div ref={frameRef} className="relative w-full max-h-full overflow-hidden rounded-2xl bg-neutral-900" style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}`, maxWidth: `calc((100vh - 220px) * ${FRAME_W / FRAME_H})` }}>
          <video ref={videoRef} playsInline muted autoPlay onLoadedData={() => setReady(true)}
            className={`absolute inset-0 w-full h-full object-cover ${shot ? 'hidden' : ''}`} />
          {shot && <img src={shot.url} alt="New progress photo" className="absolute inset-0 w-full h-full object-cover" />}
          {ghostUrl && ghostOn && !shot && (
            <img src={ghostUrl} alt="" crossOrigin="anonymous" draggable={false}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ opacity }} />
          )}
          {!ready && !shot && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {!shot ? (
        <div className="px-6 pt-4 pb-6 space-y-4">
          {ghostUrl && ghostOn && (
            <label className="flex items-center gap-3 text-white/80 text-xs">
              <span>Guide</span>
              <input type="range" min="0.1" max="0.8" step="0.05" value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))} className="flex-1 accent-green-500" aria-label="Guide strength" />
            </label>
          )}
          <div className="flex items-center justify-center">
            <button onClick={capture} disabled={!ready} aria-label="Take photo"
              className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 disabled:opacity-40">
              <span className="w-[56px] h-[56px] rounded-full bg-white" />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-6 pt-4 pb-6 flex gap-3">
          <button onClick={() => setShot(null)} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 bg-white/15 text-white font-bold active:scale-95">
            <RotateCcw className="w-5 h-5" /> Retake
          </button>
          <button onClick={use} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 bg-green-600 text-white font-bold active:scale-95">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> Use photo</>}
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
