import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { answerSitterPlan, niceDay } from '@/lib/vacation';

// After a trip with a sitter plan: "Did your sitter water as planned?"
// Yes → the plan's waterings are logged on the days the sitter came, and each plant's
// schedule picks up from there. No → nothing is logged; the garden shows what's due.
export default function WelcomeBack({ trip, ui, onClose }) {
  const [busy, setBusy] = useState(null);
  const visits = trip?.sitter_plan?.visits || [];
  const end = String(trip?.end_date || '').slice(0, 10);
  const done = visits.filter((v) => v.date <= end); // a trip cut short: later visits never happened
  const waterings = done.reduce((n, v) => n + (v.areas || []).reduce((m, a) => m + (a.plants || []).length, 0), 0);
  const plantIds = new Set(done.flatMap((v) => (v.areas || []).flatMap((a) => (a.plants || []).map((p) => p.id))));

  const answer = async (kind) => {
    setBusy(kind);
    try {
      const r = await answerSitterPlan(trip.id, kind);
      if (kind === 'confirm') {
        toast.success(r.synced
          ? `Logged ${waterings} watering${waterings === 1 ? '' : 's'} from your trip`
          : 'Saved on your phone. It will be logged as soon as you\'re back online.');
      }
      onClose(kind);
    } catch (e) {
      toast.error('That didn\'t save. Please try again.');
      setBusy(null);
    }
  };

  const light = ui?.light;
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog" aria-modal="true" aria-label="Welcome back">
      <div className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl ${light ? 'bg-white' : 'bg-neutral-900'}`}>
        <p className="text-3xl mb-2" aria-hidden>🏡</p>
        <h2 className={`text-xl font-bold ${ui?.text || ''}`}>Welcome back!</h2>
        <p className={`mt-1 text-sm ${ui?.sub || ''}`}>
          Did your sitter water as planned ({niceDay(trip.start_date, false)} to {niceDay(end, false)})?
        </p>
        <div className={`mt-3 rounded-2xl p-3 text-sm ${light ? 'bg-green-50 text-green-900' : 'bg-white/10 text-white/90'}`}>
          The plan had {waterings} watering{waterings === 1 ? '' : 's'} for {plantIds.size} plant{plantIds.size === 1 ? '' : 's'} over {done.length} visit{done.length === 1 ? '' : 's'}.
          If you say yes, they're logged on those days and each plant's schedule picks up from there.
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => answer('confirm')}
            disabled={!!busy}
            className="w-full rounded-2xl py-3.5 font-bold bg-green-600 text-white disabled:opacity-60"
          >
            {busy === 'confirm' ? 'Logging…' : 'Yes, log them'}
          </button>
          <button
            onClick={() => answer('dismiss')}
            disabled={!!busy}
            className={`w-full rounded-2xl py-3 font-semibold border ${light ? 'border-gray-300 text-gray-800' : 'border-white/20 text-white'} disabled:opacity-60`}
          >
            {busy === 'dismiss' ? 'Saving…' : 'No, or not sure'}
          </button>
          <button
            onClick={() => onClose('later')}
            disabled={!!busy}
            className={`w-full py-2 text-sm ${ui?.sub || ''}`}
          >
            Ask me later
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
