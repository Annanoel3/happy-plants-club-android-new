import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { localToday } from '@/lib/dates';
import { CARE_TYPES, CARE_META, completeCare, hemisphere, isPausedForWinter } from '@/lib/care';
import { whenText } from '@/components/plus/CareScheduleCard';

/** All care tasks across plants: [{plant, key, next}] sorted by date. Paused-for-winter tasks are left out. */
export function careTasks(plants, user) {
  const hemi = hemisphere(user);
  const today = localToday();
  const out = [];
  for (const p of plants || []) {
    const cs = p.care_schedule || {};
    for (const t of CARE_TYPES) {
      const task = cs[t.key];
      if (!task?.on || !task.next) continue;
      if (isPausedForWinter(t.key, task, hemi, today)) continue;
      out.push({ plant: p, key: t.key, next: String(task.next).slice(0, 10) });
    }
  }
  return out.sort((a, b) => a.next.localeCompare(b.next));
}

export default function CareTaskList({ tasks, user, ui, emptyText }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const today = localToday();
  const hemi = hemisphere(user);

  if (!tasks.length) return emptyText ? <p className={`text-sm ${ui.sub}`}>{emptyText}</p> : null;

  const done = async (t) => {
    const id = `${t.plant.id}:${t.key}`;
    setBusy(id);
    try {
      const next = await completeCare(t.plant, t.key, hemi);
      toast.success(`Done! Next: ${whenText(next)}`);
    } catch {
      toast.error("Couldn't save that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      {tasks.map((t) => {
        const id = `${t.plant.id}:${t.key}`;
        const late = t.next < today;
        const due = t.next <= today;
        const meta = CARE_META[t.key];
        return (
          <div key={id} className={`flex items-center gap-3 p-3 rounded-xl border ${ui.card}`}>
            <span className="text-xl" aria-hidden>{meta.icon}</span>
            <button onClick={() => navigate(`/PlantDetail?id=${t.plant.id}`)} className="flex-1 min-w-0 text-left">
              <p className={`font-semibold text-sm truncate ${ui.text}`}>{meta.label} · {t.plant.nickname || t.plant.name}</p>
              <p className={`text-xs ${late ? 'text-red-500 font-semibold' : due ? 'text-orange-500 font-semibold' : ui.sub}`}>{whenText(t.next, today)}</p>
            </button>
            <button onClick={() => done(t)} disabled={!!busy}
              className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold active:scale-95 ${due ? 'bg-green-600 text-white' : ui.light ? 'bg-white border border-gray-300 text-gray-800' : 'bg-white/15 text-white'}`}>
              {busy === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Done
            </button>
          </div>
        );
      })}
    </div>
  );
}
