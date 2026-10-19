// Logging waterings from the app (garden cards, watering round, plant page, bulk).
// Every watering is saved on the phone first (lib/outbox) and then sent to the server,
// which skips repeats. If the app closes or there's no signal, it's sent later and the
// garden shows it as watered in the meantime.
import { base44 } from '@/api/base44Client';
import { localToday } from '@/lib/dates';
import { refreshPlantData, queryClientInstance } from '@/lib/query-client';
import { showAdForEvent } from '@/lib/admob';
import { queueWaterings, sendOp, dropQueued } from '@/lib/outbox';
import { toast } from 'sonner';

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };

export function wateredToday(plant) {
  return String(plant?.last_watered || '').slice(0, 10) === localToday();
}

function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Show it as watered right away (also while it's waiting to be sent)
function showWatered(plants, date) {
  const ids = new Set(plants.map((p) => p.id));
  const patchOf = (p) => {
    const isNewest = !p.last_watered || date >= String(p.last_watered).slice(0, 10);
    return isNewest ? { ...p, last_watered: date, next_watering_due: addDays(date, p.water_frequency_days || 7) } : p;
  };
  try {
    queryClientInstance.setQueriesData({ queryKey: ['plants'] }, (old) =>
      Array.isArray(old) ? old.map((p) => (p && ids.has(p.id) ? patchOf(p) : p)) : old);
  } catch { /* cache shape differs on some screens; the refresh fixes it */ }
}
function showBefore(plantId, before) {
  try {
    queryClientInstance.setQueriesData({ queryKey: ['plants'] }, (old) =>
      Array.isArray(old) ? old.map((p) => (p && p.id === plantId ? { ...p, ...before } : p)) : old);
  } catch { /* ignore */ }
}

/**
 * Log waterings for one or more plants on `date` (default today).
 * Returns { synced, results, opId, infos } — infos[i] can be passed to undoWatering().
 */
export async function logWaterings(plants, { date = localToday(), notes = null, method = 'quick' } = {}) {
  const list = (plants || []).filter(Boolean);
  if (!list.length) return { synced: true, results: [], infos: [] };
  const opId = queueWaterings(list.map((p) => ({ plant_id: p.id, date, notes, method })));
  const befores = new Map(list.map((p) => [p.id, {
    last_watered: p.last_watered ?? null,
    next_watering_due: p.next_watering_due ?? null,
    growth_stage: p.growth_stage ?? 'seedling',
  }]));
  showWatered(list, date);
  try {
    const data = await sendOp(opId);
    const results = data?.results || [];
    refreshPlantData();
    const infos = list.map((p) => {
      const r = results.find((x) => x.plant_id === p.id) || {};
      return { plantId: p.id, date, before: befores.get(p.id), logId: r.log_id || null, status: r.status, grew: !!r.grew, stage: r.stage, synced: true };
    });
    return { synced: true, results, infos };
  } catch (e) {
    const status = e?.response?.status;
    if (status && status < 500 && status !== 401 && status !== 408 && status !== 429) {
      // The server refused it (e.g. the plant was deleted): undo the look of it
      for (const p of list) showBefore(p.id, befores.get(p.id));
      throw e;
    }
    // Saved on the phone; it'll go when the app is online again
    const infos = list.map((p) => ({ plantId: p.id, date, before: befores.get(p.id), opId, pending: true }));
    return { synced: false, opId, infos };
  }
}

/** Undo one plant's watering (from logWaterings' infos). */
export async function undoWatering(info) {
  if (!info) return;
  if (info.pending && info.opId) {
    // Not sent yet: just forget it (only this plant, if it was part of a group)
    if (dropQueued(info.opId)) {
      showBefore(info.plantId, info.before);
      refreshPlantData();
      return;
    }
  }
  await base44.functions.invoke('wateringReminder', {
    action: 'unwater', plant_id: info.plantId, date: info.date, log_id: info.logId || undefined, before: info.before, tz: tz(),
  });
  refreshPlantData();
}

/** Watering round: log one plant (no toast, no ad; the round shows one ad at the end). */
export async function waterPlantQuiet(plant) {
  const r = await logWaterings([plant]);
  return r.infos[0];
}

/** Watering round: take back one plant's watering from this round. */
export async function undoWateringQuiet(info) {
  return undoWatering(info);
}

/** Card button: water now, toast with Undo, one ad (same rule as every watering). */
export async function quickWaterPlant(plant) {
  const name = plant.nickname || plant.name || 'Plant';
  const r = await logWaterings([plant]);
  const info = r.infos[0];
  const msg = !r.synced
    ? `💧 ${name} watered. No signal right now, so it'll sync when you're back online.`
    : info.grew ? `💧 ${name} watered — it grew to ${info.stage}! 🌱` : `💧 ${name} watered`;
  toast.success(msg, {
    duration: 5000,
    action: {
      label: 'Undo',
      onClick: () => undoWatering(info).then(() => toast(`Undid ${name}'s watering`)).catch(() => toast.error("Couldn't undo. Try again.")),
    },
  });
  // Let Undo be seen before any ad
  setTimeout(() => showAdForEvent('water'), 3500);
  return info;
}
