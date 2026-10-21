import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Flag, Loader2, Trash2, Check, Ban, ShieldCheck, Bot, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { community, parseServerDate, REPORT_REASONS } from '@/lib/community';
import { useGameTheme } from '@/lib/games/common';

// Admin-only review screen for Community reports. Google Play expects reported posts and
// people to be acted on promptly; admins get a push for every new report.
const reasonLabel = (r) => REPORT_REASONS.find((x) => x.key === r)?.label || (r === 'auto_blocked' ? 'Blocked by the filter' : r);
const typeLabel = { post: 'Post', comment: 'Comment', message: 'Message', user: 'Profile', ai_answer: 'Plant Expert answer' };
// Profiles and Plant Expert answers have nothing to hide, so they only get "Mark reviewed"
const reviewOnly = (r) => r.target_type === 'user' || r.target_type === 'ai_answer';
// Server times are UTC without a "Z"
const ago = (d) => {
  const date = parseServerDate(d);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : '';
};

export default function CommunityReports() {
  const navigate = useNavigate();
  const { dark, ui } = useGameTheme();
  const [tab, setTab] = useState('open');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await community('admin_reports', { status: tab === 'auto' ? 'open' : tab }));
    } catch (e) {
      if (e.code === 'forbidden') setDenied(true); else toast.error(e.message);
    }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, id) => {
    setBusy(id);
    try { await fn(); await load(); } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };
  const resolve = (r, decision) => act(async () => {
    await community('admin_resolve', { report_id: r.id, decision });
    toast.success(decision === 'remove' ? 'Removed' : 'Dismissed');
  }, r.id);
  const ban = (email, banned) => act(async () => {
    await community('admin_ban', { email, banned });
    toast.success(banned ? 'Community access turned off' : 'Community access restored');
  }, email);
  const clearProfile = (r) => act(async () => {
    if (!window.confirm(`Clear ${r.target_name || 'this person'}'s bio and profile photo?`)) return;
    await community('admin_clear_profile', { email: r.target_email });
    toast.success('Bio and photo cleared');
  }, `clear-${r.id}`);

  if (denied) {
    return <div className="min-h-screen theme-bg flex items-center justify-center"><p className={ui.text}>Admins only.</p></div>;
  }

  const rows = tab === 'auto' ? data?.auto || [] : data?.reports || [];
  const banned = new Set(data?.banned || []);
  const card = `rounded-2xl border p-4 ${ui.card}`;

  return (
    <div className="min-h-screen theme-bg p-4 pb-28">
      <div className="max-w-xl mx-auto">
        <button onClick={() => navigate(-1)} className={`flex items-center gap-2 mb-3 ${ui.text}`}><ArrowLeft className="w-5 h-5" /> Back</button>
        <h1 className={`text-3xl font-bold flex items-center gap-2 ${ui.text}`}><Flag className="w-7 h-7 text-red-500" /> Reports</h1>
        <p className={`text-sm mb-4 ${ui.sub}`}>Remove hides the post or comment from everyone (or deletes a message). Dismiss closes the report and brings back anything that was hidden only because of reports. For a reported profile, Clear bio and photo wipes both.</p>

        <div className="flex gap-2 mb-4 flex-wrap">
          {[['open', 'Open'], ['removed', 'Removed'], ['dismissed', 'Dismissed'], ['auto', 'Blocked by filter']].map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setData(null); }}
              className={`px-4 py-2 rounded-full text-sm font-semibold border ${tab === k ? 'bg-green-600 text-white border-green-600' : ui.chip}`}>{label}</button>
          ))}
        </div>

        {!data ? (
          <div className="flex justify-center py-12"><Loader2 className={`w-6 h-6 animate-spin ${ui.text}`} /></div>
        ) : rows.length === 0 ? (
          <div className={card}><p className={ui.sub}>{tab === 'open' ? 'Nothing to review. 🌱' : 'Nothing here.'}</p></div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className={card}>
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${ui.sub}`}>
                    {r.source === 'auto' && <Bot className="w-3 h-3 inline mr-1" />}
                    {typeLabel[r.target_type] || r.target_type} · {reasonLabel(r.reason)}
                  </p>
                  <p className={`text-xs ${ui.sub}`}>{ago(r.created_date)}</p>
                </div>
                <p className={`mt-1 text-sm ${ui.text}`}>
                  <b>{r.target_name || r.target_email}</b>{r.target_name && r.target_email ? <span className={ui.sub}> ({r.target_email})</span> : null}
                  {banned.has(r.target_email) && <span className="ml-2 text-xs font-bold text-red-500">Community access off</span>}
                </p>
                {r.target_preview && <p className={`mt-2 text-sm whitespace-pre-wrap rounded-xl p-3 ${dark ? 'bg-white/10' : 'bg-gray-50'} ${ui.text}`}>{r.target_preview}</p>}
                {r.target_image && <img src={r.target_image} alt="Reported" className="mt-2 rounded-xl max-h-48" />}
                {r.details && <p className={`mt-2 text-sm italic ${ui.sub}`}>{r.source === 'auto' ? 'Filter: ' : 'Reporter: '}“{r.details}”</p>}
                {r.status !== 'open' && r.resolved_at && <p className={`mt-2 text-xs ${ui.sub}`}>{r.status === 'removed' ? 'Removed' : 'Dismissed'} {ago(r.resolved_at)}</p>}

                <div className="flex gap-2 mt-3 flex-wrap">
                  {r.status === 'open' && !reviewOnly(r) && (
                    <button disabled={busy === r.id} onClick={() => resolve(r, 'remove')}
                      className="px-3 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white flex items-center gap-1">
                      <Trash2 className="w-4 h-4" /> Remove
                    </button>
                  )}
                  {r.status === 'open' && (
                    <button disabled={busy === r.id} onClick={() => resolve(r, 'dismiss')}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold border flex items-center gap-1 ${ui.chip}`}>
                      <Check className="w-4 h-4" /> {reviewOnly(r) ? 'Mark reviewed' : 'Dismiss'}
                    </button>
                  )}
                  {r.target_type === 'user' && r.source !== 'auto' && r.target_email && (
                    <button disabled={busy === `clear-${r.id}`} onClick={() => clearProfile(r)}
                      className="px-3 py-2 rounded-xl text-sm font-semibold border border-red-400 text-red-500 flex items-center gap-1">
                      <Eraser className="w-4 h-4" /> Clear bio and photo
                    </button>
                  )}
                  {r.target_email && (banned.has(r.target_email) ? (
                    <button disabled={busy === r.target_email} onClick={() => ban(r.target_email, false)}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold border flex items-center gap-1 ${ui.chip}`}>
                      <ShieldCheck className="w-4 h-4" /> Restore access
                    </button>
                  ) : (
                    <button disabled={busy === r.target_email} onClick={() => ban(r.target_email, true)}
                      className="px-3 py-2 rounded-xl text-sm font-semibold border border-red-400 text-red-500 flex items-center gap-1">
                      <Ban className="w-4 h-4" /> Turn off their Community access
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
