import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Flag, Loader2, ShieldX, X } from 'lucide-react';
import { toast } from 'sonner';
import { community, REPORT_REASONS } from '@/lib/community';
import { useGameTheme } from '@/lib/games/common';

// Report a post, comment, message or person. After sending, offers to block them too.
// target: { type: 'post'|'comment'|'message'|'user', id? (post/comment/message id), userId (who wrote it), name }
export default function ReportSheet({ target, onClose, onBlocked }) {
  const { dark, ui } = useGameTheme();
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (!target) return null;
  const what = { post: 'post', comment: 'comment', message: 'message', user: 'profile' }[target.type] || 'post';
  const name = target.name || 'this person';

  const send = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      await community('report', { target_type: target.type, target_id: target.id, user_id: target.userId, reason, details: details.trim() });
      setSent(true);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    setBusy(true);
    try {
      await community('block', { user_id: target.userId });
      toast.success(`${name} is blocked. Unblock anytime from Blocked people in your profile.`);
      onBlocked?.(target.userId);
      onClose();
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  const sheet = dark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900';
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50" onClick={busy ? undefined : onClose}>
      <div className={`w-full max-w-lg rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto ${sheet}`} onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2"><Flag className="w-5 h-5 text-red-500" /> {sent ? 'Thanks for telling us' : `Report this ${what}`}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="p-1"><X className="w-5 h-5" /></button>
        </div>

        {sent ? (
          <>
            <p className={`text-sm ${ui.sub}`}>We’ll review it within 24 hours. The person won’t know who reported them.</p>
            {target.userId && (
              <button onClick={block} disabled={busy}
                className="mt-4 w-full rounded-2xl py-3 font-semibold border border-red-400 text-red-500 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldX className="w-4 h-4" />} Also block {name}
              </button>
            )}
            <p className={`text-xs mt-2 ${ui.sub}`}>Blocking hides their posts, comments and messages from you, and yours from them.</p>
            <button onClick={onClose} className="mt-4 w-full rounded-2xl py-3 font-bold bg-green-600 text-white">Done</button>
          </>
        ) : (
          <>
            <p className={`text-sm mb-3 ${ui.sub}`}>What’s wrong with it?</p>
            <div className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <button key={r.key} onClick={() => setReason(r.key)}
                  className={`w-full text-left rounded-xl border px-4 py-3 text-sm font-medium ${
                    reason === r.key ? 'border-red-500 bg-red-500/10' : dark ? 'border-white/15' : 'border-gray-200'}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <textarea value={details} onChange={(e) => setDetails(e.target.value.slice(0, 500))} rows={2}
              placeholder="Anything else we should know? (optional)"
              className={`mt-3 w-full rounded-xl border px-3 py-2 text-sm ${dark ? 'bg-white/10 border-white/15 text-white placeholder:text-white/50' : 'bg-white border-gray-300'}`} />
            <button onClick={send} disabled={!reason || busy}
              className="mt-3 w-full rounded-2xl py-3 font-bold bg-red-600 text-white disabled:opacity-40 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send report
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
