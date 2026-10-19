import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { Loader2, Lock, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { localToday } from '@/lib/dates';
import {
  CARE_TYPES, hemisphere, scheduleFromSuggestion, completeCare, saveCareSchedule,
  isPausedForWinter, hasCareSchedule, effectiveNext,
} from '@/lib/care';

export const EVERY_OPTIONS = [1, 2, 3, 4, 5, 7, 10, 14, 21, 30, 45, 60, 90, 180, 365, 540, 730];
export function everyText(days) {
  const d = Number(days) || 0;
  if (d === 1) return 'every day';
  if (d === 7) return 'every week';
  if (d % 365 === 0) return d === 365 ? 'every year' : `every ${d / 365} years`;
  if (d === 540) return 'every 18 months';
  if (d % 30 === 0) return d === 30 ? 'every month' : `every ${d / 30} months`;
  if (d % 7 === 0) return `every ${d / 7} weeks`;
  return `every ${d} days`;
}
export function whenText(next, today = localToday()) {
  if (!next) return '';
  const n = differenceInCalendarDays(parseISO(next), parseISO(today));
  if (n < 0) return n === -1 ? '1 day late' : `${-n} days late`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return format(parseISO(next), n < 300 ? 'EEE, MMM d' : 'MMM d, yyyy');
}

export default function CareScheduleCard({ plant, user, plus, plusReady, ui }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // draft schedule while the edit sheet is open
  const [saving, setSaving] = useState(false);
  const hemi = hemisphere(user);
  const today = localToday();
  const cs = plant.care_schedule || {};
  const active = hasCareSchedule(plant);

  const rows = useMemo(() => CARE_TYPES.filter((t) => cs[t.key]?.on), [plant.care_schedule]);

  if (!plus) {
    if (!plusReady) return null;
    return (
      <button onClick={() => navigate('/Premium')} className={`w-full text-left rounded-2xl p-4 border ${ui.card}`}>
        <p className={`font-semibold flex items-center gap-2 ${ui.text}`}><Lock className="w-4 h-4" /> Care schedule</p>
        <p className={`text-sm mt-1 ${ui.sub}`}>Plus reminds you when to fertilize, mist, rotate and repot, and pauses feeding in winter.</p>
      </button>
    );
  }

  const setUp = async () => {
    setBusy('setup');
    try {
      const { data } = await base44.functions.invoke('plus', { action: 'care_suggest', plant_ids: [plant.id] });
      const s = data?.suggestions?.[plant.id];
      if (!s) throw new Error('no suggestion');
      setEditing(scheduleFromSuggestion(plant, s, hemi, today));
    } catch {
      toast.error("Couldn't make a schedule right now. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const done = async (key, skip = false) => {
    setBusy(key + (skip ? ':skip' : ''));
    try {
      const next = await completeCare(plant, key, hemi, { skip });
      toast.success(`${skip ? 'Skipped' : 'Done'}! Next: ${whenText(next)}`);
    } catch {
      toast.error("Couldn't save that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      // A task switched on without a date (or a fertilize date that lands in winter) gets a fresh one.
      const draft = { ...editing };
      for (const t of CARE_TYPES) {
        const task = draft[t.key];
        if (!task) continue;
        if (task.on && !task.next) task.next = today;
        if (task.on) task.next = effectiveNext(t.key, task, hemi, today); // no winter dates for resting plants
      }
      await saveCareSchedule(plant, draft);
      setEditing(null);
      toast.success('Care schedule saved');
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const patchDraft = (key, patch) => setEditing((d) => ({ ...d, [key]: { ...(d[key] || {}), ...patch } }));

  return (
    <Card className={ui.card}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className={`text-xl font-semibold ${ui.text}`}>🗓️ Care schedule</h2>
          {active && (
            <button onClick={() => setEditing(JSON.parse(JSON.stringify(cs)))} aria-label="Edit care schedule"
              className={`p-2 rounded-full ${ui.light ? 'bg-gray-100 text-gray-800' : 'bg-white/10 text-white'}`}>
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>

        {!active ? (
          <div>
            <p className={`text-sm mb-3 ${ui.sub}`}>Get reminders to fertilize, mist, rotate and check the pot, set for this plant. At most one care notification a day.</p>
            <Button onClick={setUp} disabled={busy === 'setup'} className="w-full bg-green-600 hover:bg-green-700 text-white">
              {busy === 'setup' ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Making a schedule…</> : 'Set up care schedule'}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((t) => {
              const task = cs[t.key];
              const paused = isPausedForWinter(t.key, task, hemi, today);
              const next = effectiveNext(t.key, task, hemi, today);
              const due = next && next <= today && !paused;
              const late = next && next < today && !paused;
              return (
                <div key={t.key} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${ui.light ? 'bg-gray-50' : 'bg-white/5'}`}>
                  <span className="text-xl" aria-hidden>{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${ui.text}`}>{t.label}</p>
                    <p className={`text-xs ${late ? 'text-red-500 font-semibold' : due ? 'text-orange-500 font-semibold' : ui.sub}`}>
                      {paused ? `Resting for winter · back ${format(parseISO(next), 'MMM d')}` : `${whenText(next)} · ${everyText(task.every_days)}`}
                    </p>
                    {task.last && <p className={`text-[11px] ${ui.sub} opacity-80`}>Last done {format(parseISO(task.last), 'MMM d')}</p>}
                  </div>
                  {!paused && (
                    <div className="flex flex-col items-end gap-1">
                      <button onClick={() => done(t.key)} disabled={!!busy}
                        className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold shadow active:scale-95 ${due ? 'bg-green-600 text-white' : ui.light ? 'bg-white border border-gray-300 text-gray-800' : 'bg-white/15 text-white'}`}>
                        {busy === t.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Done
                      </button>
                      {due && (
                        <button onClick={() => done(t.key, true)} disabled={!!busy} className={`text-[11px] underline ${ui.sub}`}>
                          {busy === t.key + ':skip' ? '…' : 'Skip'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {cs.note && <p className={`text-xs pt-1 ${ui.sub}`}>💡 {cs.note}</p>}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="theme-card max-w-sm w-[calc(100vw-2rem)] rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="theme-text">Care schedule</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              {CARE_TYPES.map((t) => {
                const task = editing[t.key] || { on: false, every_days: t.key === 'mist' ? 3 : t.key === 'rotate' ? 14 : t.key === 'repot' ? 540 : 30 };
                return (
                  <div key={t.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="theme-text font-medium">{t.icon} {t.label}</p>
                      <Switch checked={!!task.on} onCheckedChange={(v) => patchDraft(t.key, { ...task, on: v })} />
                    </div>
                    {task.on && (
                      <div className="pl-7 space-y-2">
                        <select
                          value={task.every_days}
                          onChange={(e) => patchDraft(t.key, { every_days: Number(e.target.value) })}
                          className="theme-input w-full rounded-lg border px-3 py-2 text-sm"
                        >
                          {[...new Set([...EVERY_OPTIONS, Number(task.every_days)])].sort((a, b) => a - b).map((d) => (
                            <option key={d} value={d}>{everyText(d)}</option>
                          ))}
                        </select>
                        {t.key === 'fertilize' && hemi !== 'tropics' && (
                          <label className="flex items-center justify-between gap-3">
                            <span className="text-xs theme-text-secondary">Pause in winter (most plants rest then)</span>
                            <Switch checked={task.winter_pause !== false} onCheckedChange={(v) => patchDraft(t.key, { winter_pause: v })} />
                          </label>
                        )}
                        <label className="flex items-center justify-between gap-3">
                          <span className="text-xs theme-text-secondary">Next one</span>
                          <input
                            type="date"
                            value={task.next || today}
                            min={today}
                            onChange={(e) => patchDraft(t.key, { next: e.target.value })}
                            className="theme-input rounded-lg border px-2 py-1 text-sm"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-xs theme-text-secondary">You'll get at most one care notification a day. If several things are due, it lists the first and how many more.</p>
              <Button onClick={saveDraft} disabled={saving} className="w-full bg-green-600 hover:bg-green-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save schedule'}
              </Button>
              {active && (
                <button
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const off = {};
                      for (const t of CARE_TYPES) off[t.key] = { ...(editing[t.key] || {}), on: false };
                      await saveCareSchedule(plant, off);
                      setEditing(null);
                    } finally { setSaving(false); }
                  }}
                  className="w-full text-sm text-red-500 py-1"
                >
                  Turn off all care reminders for this plant
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
