import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Lock, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { localToday } from '@/lib/dates';
import { nudgeUpgrade } from '@/lib/upgradeNudge';

const STATUS = {
  healthy: { label: 'Healthy', light: 'bg-green-100 text-green-800', dark: 'bg-green-700 text-white' },
  needs_attention: { label: 'Needs attention', light: 'bg-amber-100 text-amber-800', dark: 'bg-amber-600 text-white' },
  concerning: { label: 'Concerning', light: 'bg-red-100 text-red-800', dark: 'bg-red-700 text-white' },
};
const PROGRESS = { improving: '📈 Getting better', same: '➖ About the same', worse: '📉 Getting worse' };

// Plant page: Plant doctor follow-up (Plus). The open treatment plan with
// tick-off steps and the re-check date, plus every past check for this plant.
export default function HealthHistoryCard({ plant, plus, plusReady, ui, onRecheck }) {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(null);

  const { data: checks = [], refetch } = useQuery({
    queryKey: ['healthChecks', plant.id],
    queryFn: async () => (await base44.entities.HealthCheck.filter({ plant_id: plant.id }, '-created_date', 20)) || [],
    enabled: !!plant?.id && plus,
  });

  if (!plus) {
    if (!plusReady) return null;
    return (
      <button onClick={() => nudgeUpgrade('followup') || navigate('/Premium')} className={`w-full text-left rounded-2xl p-4 border ${ui.card}`}>
        <p className={`font-semibold flex items-center gap-2 ${ui.text}`}><Lock className="w-4 h-4" /> Plant doctor follow-up</p>
        <p className={`text-sm mt-1 ${ui.sub}`}>Plus keeps every health check, gives a step-by-step plan, and reminds you to re-check.</p>
      </button>
    );
  }
  if (!checks.length) return null;

  const open = checks.find((c) => !c.resolved && c.status && c.status !== 'healthy' && (c.plan?.length || c.recheck_date));
  const today = localToday();

  const toggleStep = async (check, i) => {
    const plan = (check.plan || []).map((s, j) => (j === i ? { ...s, done: !s.done } : s));
    setBusy(`${check.id}:${i}`);
    try {
      await base44.entities.HealthCheck.update(check.id, { plan });
      await refetch();
    } catch {
      toast.error("Couldn't save that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const markFixed = async (check) => {
    setBusy(`${check.id}:fixed`);
    try {
      await base44.entities.HealthCheck.update(check.id, { resolved: true });
      if (check.reminder_id) {
        await base44.functions.invoke('sendCustomReminders', { action: 'complete', reminder_id: check.reminder_id }).catch(() => {});
      }
      await refetch();
      toast.success('Nice work! 🌿');
    } catch {
      toast.error("Couldn't save that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const badge = (s) => STATUS[s] ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ui.light ? STATUS[s].light : STATUS[s].dark}`}>{STATUS[s].label}</span> : null;

  return (
    <Card className={ui.card}>
      <CardContent className="p-5 space-y-4">
        <h2 className={`text-lg font-semibold ${ui.text}`}>Plant doctor</h2>

        {open && (
          <div className={`rounded-2xl p-4 ${ui.light ? 'bg-amber-50 border border-amber-200' : 'bg-amber-900/30 border border-amber-700/40'}`}>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className={`font-semibold ${ui.text}`}>{open.headline || 'Treatment plan'}</p>
              {badge(open.status)}
            </div>
            <p className={`text-xs mb-3 ${ui.sub}`}>From the check on {format(parseISO(open.checked_date), 'MMM d')}</p>
            {open.plan?.length > 0 && (
              <ul className="space-y-2 mb-3">
                {open.plan.map((s, i) => (
                  <li key={i}>
                    <button onClick={() => toggleStep(open, i)} disabled={!!busy} className="flex items-start gap-2 text-left w-full">
                      <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center ${s.done ? 'bg-green-600 border-green-600' : ui.light ? 'border-gray-400' : 'border-white/50'}`}>
                        {busy === `${open.id}:${i}` ? <Loader2 className="w-3 h-3 animate-spin text-white" /> : s.done ? <Check className="w-3 h-3 text-white" /> : null}
                      </span>
                      <span className={`text-sm ${s.done ? 'line-through opacity-60' : ''} ${ui.text}`}>{s.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {open.recheck_date && (
              <p className={`text-sm mb-3 ${ui.text}`}>
                {open.recheck_date <= today ? '📸 Time to re-check with a new photo.' : `📸 Re-check on ${format(parseISO(open.recheck_date), 'EEE, MMM d')}${open.reminder_id ? " (we'll remind you)" : ''}.`}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={onRecheck} className="flex-1 rounded-xl py-2 text-sm font-bold bg-green-600 text-white active:scale-95">Re-check now</button>
              <button onClick={() => markFixed(open)} disabled={!!busy} className={`flex-1 rounded-xl py-2 text-sm font-bold active:scale-95 ${ui.light ? 'bg-white border border-gray-300 text-gray-800' : 'bg-white/10 text-white'}`}>
                {busy === `${open.id}:fixed` ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "It's better now"}
              </button>
            </div>
          </div>
        )}

        <div>
          <p className={`text-xs font-semibold mb-2 ${ui.sub}`}>History</p>
          <div className="space-y-2">
            {checks.map((c) => {
              const expanded = openId === c.id;
              return (
                <div key={c.id} className={`rounded-xl overflow-hidden ${ui.light ? 'bg-gray-50' : 'bg-white/5'}`}>
                  <button onClick={() => setOpenId(expanded ? null : c.id)} className="w-full flex items-center gap-3 p-2 text-left">
                    {c.image_url ? (
                      <img src={c.image_url} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : <div className="w-12 h-12 rounded-lg bg-green-100 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${ui.text}`}>{c.headline || 'Health check'}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className={`text-[11px] ${ui.sub}`}>{format(parseISO(c.checked_date), 'MMM d, yyyy')}</span>
                        {badge(c.status)}
                      </div>
                      {c.progress && PROGRESS[c.progress] && <p className={`text-[11px] mt-0.5 ${ui.sub}`}>{PROGRESS[c.progress]}</p>}
                    </div>
                    {expanded ? <ChevronUp className={`w-4 h-4 ${ui.sub}`} /> : <ChevronDown className={`w-4 h-4 ${ui.sub}`} />}
                  </button>
                  {expanded && (
                    <div className="px-3 pb-3">
                      {c.progress_note && <p className={`text-sm font-medium mb-2 ${ui.text}`}>{c.progress_note}</p>}
                      <p className={`text-sm whitespace-pre-wrap leading-relaxed ${ui.text}`}>{c.analysis}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
