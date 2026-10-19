// Waterings are saved on the phone FIRST, then sent. If the app is closed, the phone
// turns off or there's no signal, they're sent the next time the app is open and online.
// The server skips repeats (one watering per plant per day), so sending twice is safe.
import { base44 } from '@/api/base44Client';
import { refreshPlantData } from '@/lib/query-client';

const KEY = 'hp_outbox_v1';
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };

function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or blocked: still sends now */ }
  try { window.dispatchEvent(new CustomEvent('hp-outbox', { detail: list.length })); } catch { /* ignore */ }
}

export function pendingWaterings() {
  return load().reduce((n, op) => n + (op.items?.length || 0), 0);
}

export function isOfflineError(e) {
  const status = e?.response?.status;
  return !status || status >= 500 || status === 408 || status === 429;
}

/** Save waterings on the phone. Returns the op id. */
export function queueWaterings(items) {
  const op = {
    id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'water',
    items: items.map((x) => ({ plant_id: x.plant_id, date: x.date, notes: x.notes || null, method: x.method || 'quick' })),
    at: new Date().toISOString(),
    tries: 0,
  };
  save([...load(), op]);
  return op.id;
}

/** Forget a queued watering (Undo before it was sent): one plant, or the whole op. True if it was still waiting. */
export function dropQueued(opId, plantId = null) {
  const list = load();
  const op = list.find((o) => o.id === opId);
  if (!op) return false;
  const items = plantId ? op.items.filter((x) => x.plant_id !== plantId) : [];
  if (plantId && items.length === op.items.length) return false;
  save(items.length ? list.map((o) => (o.id === opId ? { ...o, items } : o)) : list.filter((o) => o.id !== opId));
  return true;
}

// Other kinds of saves (care "Done") register how to replay themselves
const handlers = {};
export function registerOutboxHandler(kind, fn) { handlers[kind] = fn; }

/** Save any other action on the phone to send later (used when the first try had no signal). */
export function queueOp(kind, payload) {
  const op = { id: `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, kind, payload, at: new Date().toISOString(), tries: 0 };
  save([...load(), op]);
  return op.id;
}

/** Plants as the server sent them, plus waterings still waiting on this phone. */
export function withPendingWaterings(plants) {
  const ops = load();
  if (!ops.length || !Array.isArray(plants)) return plants;
  const latest = new Map();
  for (const op of ops) for (const it of op.items || []) {
    if (!latest.has(it.plant_id) || it.date > latest.get(it.plant_id)) latest.set(it.plant_id, it.date);
  }
  return plants.map((p) => {
    const d = p && latest.get(p.id);
    if (!d || (p.last_watered && String(p.last_watered).slice(0, 10) >= d)) return p;
    const next = new Date(d + 'T12:00:00Z');
    next.setUTCDate(next.getUTCDate() + (p.water_frequency_days || 7));
    return { ...p, last_watered: d, next_watering_due: next.toISOString().slice(0, 10) };
  });
}

function isNetworkError(e) {
  // No response at all (offline, timeout) or the server had a bad moment
  const status = e?.response?.status;
  return !status || status >= 500 || status === 408 || status === 429;
}

/** Send one queued op now. Resolves with the server's results; throws if it can't reach the server. */
export async function sendOp(opId) {
  const op = load().find((o) => o.id === opId);
  if (!op) return null;
  try {
    const { data } = await base44.functions.invoke('wateringReminder', { action: 'water', items: op.items, tz: tz() });
    if (!data?.success) throw Object.assign(new Error('not saved'), { response: { status: 500 } });
    save(load().filter((o) => o.id !== opId));
    return data;
  } catch (e) {
    if (!isNetworkError(e)) {
      // The server said no (signed out, plant deleted): don't retry forever
      if (e?.response?.status === 401) throw e; // keep it; they'll sign back in
      save(load().filter((o) => o.id !== opId));
      throw e;
    }
    save(load().map((o) => (o.id === opId ? { ...o, tries: (o.tries || 0) + 1, last_error: String(e?.message || e).slice(0, 120) } : o)));
    throw e;
  }
}

let flushing = null;
/** Send everything that's waiting, oldest first. */
export function flushOutbox() {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    try {
      for (const op of load()) {
        if (op.kind === 'water') {
          try { await sendOp(op.id); sent++; } catch (e) { if (isNetworkError(e) || e?.response?.status === 401) break; }
          continue;
        }
        const fn = handlers[op.kind];
        if (!fn) continue; // that screen's code isn't loaded yet; next time
        try {
          await fn(op.payload);
          save(load().filter((o) => o.id !== op.id));
          sent++;
        } catch (e) {
          if (isNetworkError(e) || e?.response?.status === 401) {
            save(load().map((o) => (o.id === op.id ? { ...o, tries: (o.tries || 0) + 1 } : o)));
            break;
          }
          save(load().filter((o) => o.id !== op.id)); // refused by the server: drop it
        }
      }
    } finally {
      flushing = null;
      if (sent) refreshPlantData();
    }
    return sent;
  })();
  return flushing;
}

if (typeof window !== 'undefined') {
  const kick = () => { if (load().length) flushOutbox(); };
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  setInterval(kick, 60 * 1000);
  setTimeout(kick, 3000); // app just opened
}
