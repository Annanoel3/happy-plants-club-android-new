import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Sparkles } from 'lucide-react';
import { claimPopup, releasePopup } from '@/lib/popupGate';

// "There's an update!" popup, same idea as ADHDone's: it only says there's an
// update, shows on every app open until the phone is updated, and the Update
// button opens Google Play's own update screen inside the app.
//
// The app asks Google Play directly whether a newer version exists for this
// phone (NotifyBridge.checkAppUpdate, added in build 13), so nothing has to be
// bumped by hand after a release. Builds older than 13 don't have that method;
// the call just fails and nothing shows.

const NotifyBridge = registerPlugin('NotifyBridge');
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.mediocreatbest.happyplants';

export default function UpdatePrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        if (!Capacitor.isNativePlatform()) return;
        const { result } = await NotifyBridge.checkAppUpdate();
        if (cancelled || result !== 'available') return;
        // Never stack on another popup (permissions, weather, etc.): wait until it's closed.
        const showWhenClear = () => {
          if (cancelled) return;
          if (!claimPopup('update')) {
            t2 = setTimeout(showWhenClear, 2000);
          } else {
            setShow(true);
          }
        };
        showWhenClear();
      } catch { /* older build or no Play services: stay quiet */ }
    };
    let t2;
    const t = setTimeout(check, 2500);
    return () => { cancelled = true; clearTimeout(t); clearTimeout(t2); };
  }, []);

  const update = async () => {
    setBusy(true);
    try {
      const { result } = await NotifyBridge.startAppUpdate();
      if (result === 'started') return; // Play takes over and restarts the app
      if (result === 'cancelled') { setBusy(false); return; }
      window.open(PLAY_URL, '_blank'); // Play couldn't do it in-app: open the store page
    } catch {
      window.open(PLAY_URL, '_blank');
    }
    setBusy(false);
  };

  if (!show) return null;
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md bg-white text-gray-900 rounded-t-3xl p-6 shadow-2xl text-center"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-green-600 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <p className="text-xl font-bold mb-1">There's an update!</p>
        <p className="text-sm text-gray-600 mb-5">Update Happy Plants to keep everything working smoothly.</p>
        <button
          onClick={update}
          disabled={busy}
          className="w-full py-3.5 rounded-2xl bg-green-600 active:bg-green-700 text-white font-bold disabled:opacity-60"
        >
          {busy ? 'Opening…' : 'Update'}
        </button>
        <button onClick={() => { setShow(false); releasePopup('update'); }} aria-label="Close" className="w-full py-3 mt-2 text-sm font-semibold text-gray-500">
          Not now
        </button>
      </div>
    </div>,
    document.body
  );
}
