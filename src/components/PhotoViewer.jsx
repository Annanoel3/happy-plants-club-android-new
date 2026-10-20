import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Full-screen photo: the whole picture (no cropping). Pinch or double-tap to zoom, drag to
// look around while zoomed, tap X or the back button to close.
export default function PhotoViewer({ src, alt = '', onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const g = useRef({ pinch: null, drag: null, lastTap: 0 });

  // Android back button / browser back closes the viewer instead of leaving the page
  useEffect(() => {
    const state = { hpPhotoViewer: true };
    window.history.pushState(state, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('popstate', onPop);
      document.body.style.overflow = prevOverflow;
      if (window.history.state?.hpPhotoViewer) window.history.back();
    };
  }, []);

  const clamp = (s) => Math.min(5, Math.max(1, s));
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      g.current.pinch = { d: dist(e.touches), s: scale };
      g.current.drag = null;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - g.current.lastTap < 300) { // double tap
        if (scale > 1) { setScale(1); setPos({ x: 0, y: 0 }); } else setScale(2.5);
        g.current.lastTap = 0;
        return;
      }
      g.current.lastTap = now;
      g.current.drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, px: pos.x, py: pos.y };
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && g.current.pinch) {
      const s = clamp(g.current.pinch.s * (dist(e.touches) / g.current.pinch.d));
      setScale(s);
      if (s === 1) setPos({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && g.current.drag && scale > 1) {
      const d = g.current.drag;
      setPos({ x: d.px + (e.touches[0].clientX - d.x), y: d.py + (e.touches[0].clientY - d.y) });
    }
  };
  const onTouchEnd = (e) => {
    if (e.touches.length < 2) g.current.pinch = null;
    if (e.touches.length === 0) g.current.drag = null;
  };

  return createPortal(
    <div className="fixed inset-0 z-[400] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Photo"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex justify-end p-2">
        <button onClick={onClose} aria-label="Close photo" className="p-2 text-white"><X className="w-7 h-7" /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden touch-none select-none"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onDoubleClick={() => { if (scale > 1) { setScale(1); setPos({ x: 0, y: 0 }); } else setScale(2.5); }}>
        <img src={src} alt={alt} draggable={false}
          className="max-w-full max-h-full object-contain"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: g.current.pinch || g.current.drag ? 'none' : 'transform 0.15s ease-out' }} />
      </div>
      <p className="text-center text-white/60 text-xs py-3">Pinch or double-tap to zoom</p>
    </div>,
    document.body,
  );
}
