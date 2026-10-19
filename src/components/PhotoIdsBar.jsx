import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Loader2, PlayCircle, Sparkles, Hourglass } from 'lucide-react';
import { toast } from 'sonner';
import { canWatchForIds, watchForIds, idsLine, introEndsText, rewardFailText } from '@/lib/plantIds';

// Photo IDs left today, and what to do when they run out.
//   mode="add":     on the Add Plants screen (a short line, or a card when there are none left)
//   mode="waiting": in the garden, when photos are saved but waiting for an ID
export default function PhotoIdsBar({ ids, mode = 'add', waitingCount = 0, text = '', sub = '', cardClass = '', onChange }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!ids) return null;
  const canWatch = canWatchForIds(ids);

  const watch = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await watchForIds();
      if (r.ok) {
        toast.success(r.named ? `${ids.per_ad} more photo IDs! Naming ${r.named} waiting plant${r.named === 1 ? '' : 's'}…` : `${ids.per_ad} more photo IDs for today!`);
        onChange?.(r.ids);
      } else {
        toast(rewardFailText(r.reason));
      }
    } catch {
      toast.error("Couldn't add the extra IDs. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const actions = (
    <div className="flex flex-wrap gap-2 mt-3">
      {canWatch && (
        <button onClick={watch} disabled={busy}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold bg-green-600 text-white active:scale-95 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          Watch a video for {ids.per_ad} more
        </button>
      )}
      {!ids.plus && (
        <button onClick={() => navigate('/Premium')}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold border border-amber-400/60 active:scale-95 ${text}`}>
          <Sparkles className="w-4 h-4 text-amber-500" /> Plus: {200} a day
        </button>
      )}
    </div>
  );

  if (mode === 'waiting') {
    if (!waitingCount) return null;
    return (
      <div className={`rounded-2xl p-3 mb-2 ${cardClass}`} role="status">
        <p className={`text-sm font-semibold flex items-center gap-1.5 ${text}`}>
          <Hourglass className="w-4 h-4 text-amber-500" />
          {waitingCount} plant{waitingCount === 1 ? ' is' : 's are'} waiting for a photo ID
        </p>
        <p className={`text-xs mt-0.5 ${sub}`}>
          {ids.left > 0 ? 'Naming them now…' : "They'll be named tomorrow on their own. Or open one and type its name (always free)."}
        </p>
        {ids.left === 0 && (canWatch || !ids.plus) && actions}
      </div>
    );
  }

  // Add screen
  if (ids.left > 0) {
    if (ids.plus && ids.left > 20) return null; // Plus: only mention it when it's getting low
    return (
      <p className={`text-xs flex items-center gap-1.5 ${sub}`}>
        <Camera className="w-3.5 h-3.5 shrink-0" />
        <span>
          {idsLine(ids)}
          {ids.intro ? ` (${introEndsText(ids)})` : ''}
          {!ids.intro && !ids.plus && canWatch ? ` · a short video gets you ${ids.per_ad} more` : ''}
        </span>
      </p>
    );
  }
  return (
    <div className={`rounded-2xl p-4 ${cardClass}`} role="status">
      <p className={`font-bold ${text}`}>You're out of photo IDs for today</p>
      <p className={`text-sm mt-1 ${sub}`}>
        Photos you add now are saved and get named tomorrow. Typing a plant's name is always free.
        {ids.plus ? '' : ` You get ${ids.daily} free photo IDs a day.`}
      </p>
      {(canWatch || !ids.plus) && actions}
    </div>
  );
}
