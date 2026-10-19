import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2, ChevronDown, ChevronUp, MapPin, CalendarRange, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { localToday } from '@/lib/dates';
import { refreshPlantData } from '@/lib/query-client';
import { waterPlantQuiet, undoWateringQuiet, wateredToday } from '@/lib/watering';
import { showAdForEvent } from '@/lib/admob';
import { waterAmount, methodInfo } from '@/lib/waterAmount';
import { careTasks } from '@/components/plus/CareTaskList';
import CareTaskList from '@/components/plus/CareTaskList';
import WaterCheer from '@/components/WaterCheer';

// "Watering round": only what's due, grouped by area (biggest group first), one button
// per area, a running count, and finished areas fold away. One ad at the end of the
// round (same rule as every watering: one per watering, not one per plant).
// It can also open straight into "Even out my schedule".

function onVacation(p, today) {
  if (!p.vacation_mode_enabled) return false;
  const start = p.vacation_start_date ? String(p.vacation_start_date).slice(0, 10) : null;
  const end = p.vacation_end_date ? String(p.vacation_end_date).slice(0, 10) : null;
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

export function dueNow(plants, today = localToday()) {
  return (plants || []).filter((p) => {
    const d = String(p?.next_watering_due || '').slice(0, 10);
    return d && d <= today && !onVacation(p, today) && !wateredToday(p);
  });
}

function areaOf(p) {
  const raw = String(p.location || '').trim();
  return { key: raw.toLowerCase() || '~none', label: raw || 'No area set' };
}

const name = (p) => p.nickname || p.name || 'Plant';

function dayLabel(d, today) {
  const n = differenceInCalendarDays(parseISO(d), parseISO(today));
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return format(parseISO(d), 'EEE MMM d');
}

export default function WateringRound({ open, onClose, plants, user, plus, ui, initialView = 'round', onAllDone }) {
  const today = localToday();
  const [view, setView] = useState(initialView);
  const [snapshot, setSnapshot] = useState([]); // the due list as it was when the round opened
  const [done, setDone] = useState({}); // plantId -> undo info
  const [busy, setBusy] = useState({}); // plantId or area key -> true
  const [collapsed, setCollapsed] = useState({});
  const wateredAny = useRef(false);
  const cheered = useRef(false); // the little pop-up shows once per round, on the first plant checked
  const [cheer, setCheer] = useState(null);

  useEffect(() => {
    if (!open) return;
    setView(initialView);
    setSnapshot(dueNow(plants, today));
    setDone({});
    setBusy({});
    setCollapsed({});
    wateredAny.current = false;
    cheered.current = false;
    setCheer(null);
    // Only when it opens: rows stay put (checked) instead of vanishing as you go
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialView]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const p of snapshot) {
      const a = areaOf(p);
      if (!m.has(a.key)) m.set(a.key, { ...a, plants: [] });
      m.get(a.key).plants.push(p);
    }
    const list = [...m.values()];
    for (const g of list) {
      g.plants.sort((a, b) => String(a.next_watering_due).localeCompare(String(b.next_watering_due)) || name(a).localeCompare(name(b)));
    }
    return list.sort((a, b) => b.plants.length - a.plants.length || a.label.localeCompare(b.label));
  }, [snapshot]);

  const care = useMemo(() => (plus ? careTasks(plants, user).filter((t) => t.next <= today) : []), [plus, plants, user, today]);

  const total = snapshot.length;
  const doneCount = Object.keys(done).length;
  const allDone = total > 0 && doneCount === total;

  useEffect(() => {
    if (open && allDone) onAllDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, open]);

  if (!open) return null;

  const close = () => {
    if (wateredAny.current) {
      refreshPlantData();
      // Let the round close before any ad
      setTimeout(() => showAdForEvent('water'), 600);
    }
    onClose();
  };

  const celebrate = () => {
    if (cheered.current) return;
    cheered.current = true;
    setCheer(Date.now());
  };

  const toggle = async (p) => {
    if (busy[p.id]) return;
    setBusy((b) => ({ ...b, [p.id]: true }));
    try {
      if (done[p.id]) {
        await undoWateringQuiet(done[p.id]);
        setDone((d) => { const n = { ...d }; delete n[p.id]; return n; });
      } else {
        celebrate(); // right on the tap, not after the save (~1s later)
        const info = await waterPlantQuiet(p);
        wateredAny.current = true;
        setDone((d) => ({ ...d, [p.id]: info }));
      }
    } catch {
      toast.error(`Couldn't save ${name(p)}. Try again.`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[p.id]; return n; });
    }
  };

  const waterArea = async (g) => {
    const todo = g.plants.filter((p) => !done[p.id]);
    if (!todo.length || busy[g.key]) return;
    setBusy((b) => ({ ...b, [g.key]: true }));
    celebrate();
    let failed = 0;
    // A few at a time so a big area doesn't hammer the server
    for (let i = 0; i < todo.length; i += 4) {
      const chunk = todo.slice(i, i + 4);
      const res = await Promise.allSettled(chunk.map((p) => waterPlantQuiet(p)));
      const ok = {};
      res.forEach((r, j) => { if (r.status === 'fulfilled') ok[chunk[j].id] = r.value; else failed++; });
      if (Object.keys(ok).length) { wateredAny.current = true; setDone((d) => ({ ...d, ...ok })); }
    }
    setBusy((b) => { const n = { ...b }; delete n[g.key]; return n; });
    refreshPlantData();
    if (failed) toast.error(`${failed} didn't save. Tap them to try again.`);
    else setCollapsed((c) => ({ ...c, [g.key]: true }));
  };

  // { text: "6 oz", late: "1 day late" } — the late part shows in red so overdue plants stand out
  const rowDetail = (p) => {
    const amt = waterAmount(p);
    const bits = [];
    if (amt.kind === 'oz' || amt.kind === 'ground') { if (plus && amt.short) bits.push(amt.short); }
    else if (amt.kind !== 'unknown' && amt.short) bits.push(amt.short);
    const d = String(p.next_watering_due).slice(0, 10);
    const days = differenceInCalendarDays(parseISO(today), parseISO(d));
    return { text: bits.join(' · '), late: days > 0 ? `${days} day${days === 1 ? '' : 's'} late` : null };
  };

  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const border = ui.light ? 'border-gray-200' : 'border-white/15';
  const pageBg = ui.light ? 'bg-gray-50' : 'bg-neutral-950';

  return createPortal(
    <div className={`fixed inset-0 z-[300] flex flex-col ${pageBg}`} role="dialog" aria-modal="true" aria-label={view === 'even' ? 'Even out my schedule' : 'Watering round'}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Header */}
      <div className={`px-4 pt-3 pb-3 border-b ${border}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-lg font-bold ${ui.text}`}>{view === 'even' ? 'Even out my schedule' : '💧 Watering round'}</p>
            {view === 'round' && total > 0 && (
              <p className={`text-sm ${ui.sub}`}>{allDone ? 'All done 🌱' : `${doneCount} of ${total} done`}</p>
            )}
          </div>
          <button onClick={view === 'even' && initialView === 'round' ? () => setView('round') : close}
            aria-label={view === 'even' && initialView === 'round' ? 'Back to the watering round' : 'Close'}
            className={`p-2 -mr-2 rounded-full ${ui.light ? 'active:bg-gray-200' : 'active:bg-white/10'} ${ui.text}`}>
            <X className="w-6 h-6" />
          </button>
        </div>
        {view === 'round' && total > 0 && (
          <div className={`mt-2 h-2 rounded-full overflow-hidden ${ui.light ? 'bg-gray-200' : 'bg-white/10'}`}>
            <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {view === 'even' ? (
          <EvenOut ui={ui} today={today} onDone={() => (initialView === 'round' ? setView('round') : close())} />
        ) : (
          <>
            {total === 0 && (
              <div className={`rounded-2xl border p-5 text-center ${ui.card}`}>
                <p className={`font-semibold ${ui.text}`}>Nothing needs water right now 🌱</p>
                <p className={`text-sm mt-1 ${ui.sub}`}>Plants on vacation and plants you already watered today aren't listed.</p>
              </div>
            )}

            {groups.map((g) => {
              const left = g.plants.filter((p) => !done[p.id]).length;
              const finished = left === 0;
              const isCollapsed = collapsed[g.key] ?? false;
              return (
                <div key={g.key} className={`rounded-2xl border overflow-hidden ${ui.card}`}>
                  <div className="flex items-center gap-2 p-3">
                    <button onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !isCollapsed }))}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left" aria-expanded={!isCollapsed}>
                      {finished ? <Check className="w-5 h-5 text-green-500 shrink-0" /> : <MapPin className={`w-5 h-5 shrink-0 ${ui.sub}`} />}
                      <span className="min-w-0">
                        <span className={`block font-bold truncate ${ui.text}`}>{g.label}</span>
                        <span className={`block text-xs ${ui.sub}`}>{finished ? `${g.plants.length} watered` : `${left} of ${g.plants.length} left`}</span>
                      </span>
                      {isCollapsed ? <ChevronDown className={`w-4 h-4 shrink-0 ${ui.sub}`} /> : <ChevronUp className={`w-4 h-4 shrink-0 ${ui.sub}`} />}
                    </button>
                    {!finished && (
                      <button onClick={() => waterArea(g)} disabled={!!busy[g.key]}
                        className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold bg-green-600 text-white active:scale-95 disabled:opacity-60">
                        {busy[g.key] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {left === 1 ? 'Done' : `All ${left} done`}
                      </button>
                    )}
                  </div>
                  {!isCollapsed && (
                    <ul className={`border-t ${border}`}>
                      {g.plants.map((p) => {
                        const isDone = !!done[p.id];
                        const detail = rowDetail(p);
                        const icon = methodInfo(p).icon;
                        return (
                          <li key={p.id} className={`flex items-center gap-3 px-3 py-2 border-b last:border-b-0 ${border}`}>
                            {p.thumbnail_url || p.image_url ? (
                              <img src={p.thumbnail_url || p.image_url} alt="" className={`w-11 h-11 rounded-xl object-cover shrink-0 ${isDone ? 'opacity-50' : ''}`} loading="lazy" />
                            ) : (
                              <span className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-xl ${ui.light ? 'bg-green-100' : 'bg-white/10'}`} aria-hidden>🪴</span>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={`font-semibold text-sm truncate ${ui.text} ${isDone ? 'line-through opacity-60' : ''}`}>
                                {name(p)}
                                {p.scientific_name && <span className={`ml-1.5 font-normal italic text-[11px] ${ui.sub}`}>{p.scientific_name}</span>}
                              </p>
                              {(detail.text || detail.late) && (
                                <p className={`text-xs truncate ${ui.sub}`}>
                                  {icon} {detail.text}{detail.text && detail.late ? ' · ' : ''}
                                  {detail.late && <span className={`font-bold ${isDone ? '' : ui.light ? 'text-red-600' : 'text-red-400'}`}>{detail.late}</span>}
                                </p>
                              )}
                            </div>
                            <button onClick={() => toggle(p)} disabled={!!busy[p.id] || !!busy[g.key]}
                              aria-label={isDone ? `Undo ${name(p)}` : `Mark ${name(p)} done`}
                              className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center border-2 active:scale-95 transition ${
                                isDone ? 'bg-green-600 border-green-600 text-white' : ui.light ? 'border-gray-300 text-gray-400' : 'border-white/30 text-white/50'}`}>
                              {busy[p.id] ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}

            {care.length > 0 && (
              <div className="pt-2">
                <p className={`text-sm font-bold mb-2 ${ui.text}`}>Other care today</p>
                <CareTaskList tasks={care} user={user} ui={ui} />
              </div>
            )}

            {allDone && (
              <button onClick={close} className="w-full rounded-2xl py-3.5 bg-green-600 text-white font-bold active:scale-95">
                All done. Close
              </button>
            )}

            <button onClick={() => setView('even')} className={`w-full flex items-center justify-center gap-2 text-sm py-3 underline ${ui.sub}`}>
              <CalendarRange className="w-4 h-4" /> Too many on one day? Even out my schedule
            </button>
          </>
        )}
      </div>
      {cheer && <WaterCheer key={cheer} onDone={() => setCheer(null)} />}
    </div>,
    document.body,
  );
}

// Preview first, then apply. Never moves plants marked "keep exact watering days".
function EvenOut({ ui, today, onDone }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await base44.functions.invoke('plus', { action: 'even_out' });
        if (alive) setPlan(data?.success ? data : null);
        if (alive && !data?.success) setError("Couldn't check your schedule. Try again.");
      } catch {
        if (alive) setError("Couldn't check your schedule. Try again.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const apply = async () => {
    setApplying(true);
    try {
      const { data } = await base44.functions.invoke('plus', { action: 'even_out', apply: true });
      if (!data?.success) throw new Error('failed');
      refreshPlantData();
      toast.success(data.applied ? `Moved ${data.applied} plant${data.applied === 1 ? '' : 's'}. Busiest day: ${data.after_max} instead of ${data.before_max}.` : 'Nothing needed moving.');
      onDone();
    } catch {
      toast.error("Couldn't save that. Try again.");
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className={`w-7 h-7 animate-spin ${ui.sub}`} /></div>;
  if (error || !plan) return <p className={`text-sm ${ui.text}`}>{error || "Couldn't check your schedule. Try again."}</p>;

  const moves = plan.moves || [];
  return (
    <div className="space-y-3">
      <div className={`rounded-2xl border p-4 ${ui.card}`}>
        {moves.length ? (
          <>
            <p className={`font-semibold ${ui.text}`}>
              Move {moves.length} plant{moves.length === 1 ? '' : 's'} by a day or two. Your busiest day goes from {plan.before_max} to {plan.after_max}.
            </p>
            <p className={`text-sm mt-1 ${ui.sub}`}>
              Only forgiving plants move, and never to a day in the past. Late plants are never pushed later.
              {plan.strict_skipped ? ` ${plan.strict_skipped} finicky plant${plan.strict_skipped === 1 ? ' stays' : 's stay'} exactly where ${plan.strict_skipped === 1 ? 'it is' : 'they are'}.` : ''}
            </p>
          </>
        ) : (
          <>
            <p className={`font-semibold ${ui.text}`}>Your schedule is already as even as it can safely get.</p>
            <p className={`text-sm mt-1 ${ui.sub}`}>
              {plan.strict_skipped ? `${plan.strict_skipped} finicky plant${plan.strict_skipped === 1 ? ' is' : 's are'} kept on ${plan.strict_skipped === 1 ? 'its' : 'their'} exact days. ` : ''}
              You can mark a plant finicky (or not) with Edit on its page.
            </p>
          </>
        )}
      </div>

      {moves.length > 0 && (
        <ul className={`rounded-2xl border overflow-hidden ${ui.card}`}>
          {moves.map((m) => (
            <li key={m.id} className={`flex items-center gap-2 px-3 py-2.5 border-b last:border-b-0 ${ui.light ? 'border-gray-200' : 'border-white/15'}`}>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${ui.text}`}>{m.name}</p>
                {m.area && <p className={`text-xs truncate ${ui.sub}`}>{m.area}</p>}
              </div>
              <span className={`text-xs whitespace-nowrap ${ui.sub}`}>{dayLabel(m.from < today ? today : m.from, today)}</span>
              <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${ui.sub}`} />
              <span className={`text-xs font-semibold whitespace-nowrap ${ui.text}`}>{dayLabel(m.to, today)}</span>
            </li>
          ))}
        </ul>
      )}

      {moves.length > 0 ? (
        <button onClick={apply} disabled={applying} className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 bg-green-600 text-white font-bold active:scale-95 disabled:opacity-60">
          {applying ? <Loader2 className="w-5 h-5 animate-spin" /> : <CalendarRange className="w-5 h-5" />} Even it out
        </button>
      ) : (
        <button onClick={onDone} className={`w-full rounded-2xl py-3.5 font-bold border ${ui.card} ${ui.text}`}>OK</button>
      )}
    </div>
  );
}
