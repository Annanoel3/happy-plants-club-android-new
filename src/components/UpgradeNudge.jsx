import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Sparkles, PlayCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { whenPopupFree, releasePopup } from '@/lib/popupGate';
import { NUDGE_EVENT, nudgeCopy } from '@/lib/upgradeNudge';

// The small "get Plus" popup (see lib/upgradeNudge). One at a time, and it waits for
// any other popup to close first. While one is up (or waiting), new nudges are ignored.
export default function UpgradeNudge() {
  const navigate = useNavigate();
  const [nudge, setNudge] = useState(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const cancelWait = useRef(null);

  useEffect(() => {
    const onNudge = (e) => {
      if (pending.current) return;
      pending.current = true;
      const detail = e.detail || {};
      cancelWait.current = whenPopupFree('upgrade', () => setNudge(detail), { firstDelay: 400, interval: 1200, maxWaitMs: 90000 });
      // If it never got a turn, let the next one try
      setTimeout(() => { if (!document.getElementById('hp-upgrade-nudge')) pending.current = false; }, 92000);
    };
    window.addEventListener(NUDGE_EVENT, onNudge);
    return () => { window.removeEventListener(NUDGE_EVENT, onNudge); cancelWait.current?.(); };
  }, []);

  const close = () => {
    setNudge(null);
    setBusy(false);
    pending.current = false;
    releasePopup('upgrade');
  };

  if (!nudge) return null;
  const { title, body } = nudgeCopy(nudge.reason, nudge);

  const seePlus = () => { close(); navigate('/Premium'); };

  // Out of photo IDs: the reward video stays on offer next to Plus
  let canWatch = false;
  if (nudge.reason === 'ids' && nudge.ids) {
    canWatch = !!nudge.ids.can_reward && !!nudge.canWatch;
  }
  const watch = async () => {
    setBusy(true);
    try {
      const ids = await import('@/lib/plantIds');
      const r = await ids.watchForIds();
      close();
      toast[r.ok ? 'success' : 'message'](r.ok ? `${nudge.ids.per_ad} more photo IDs! Naming your waiting plants…` : ids.rewardFailText(r.reason));
    } catch {
      close();
    }
  };

  return createPortal(
    <div id="hp-upgrade-nudge" className="fixed inset-0 z-[300] flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div
        className="relative w-full max-w-md bg-white text-gray-900 rounded-t-3xl px-6 pt-5 shadow-2xl text-center"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        <div className="w-11 h-11 mx-auto mb-2 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-800 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <p className="text-lg font-bold leading-snug">{title}</p>
        <p className="text-sm text-gray-600 mt-1 mb-4">{body}</p>
        <button onClick={seePlus} className="w-full py-3 rounded-2xl bg-green-600 active:bg-green-700 text-white font-bold">
          See Plus
        </button>
        {canWatch && (
          <button onClick={watch} disabled={busy} className="w-full py-3 mt-2 rounded-2xl border border-green-600 text-green-700 font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Watch a video for {nudge.ids.per_ad} more
          </button>
        )}
        <button onClick={close} className="w-full py-2.5 mt-1 text-sm font-semibold text-gray-500">
          Not now
        </button>
      </div>
    </div>,
    document.body
  );
}
