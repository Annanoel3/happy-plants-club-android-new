// Care schedules (Plus): fertilize, mist, rotate, repot check.
// Stored on the plant as care_schedule = { fertilize: {on, every_days, next, last, winter_pause}, ... }
// The server (functions/plus) only reads `on` and `next` to send at most one care push a day.
import { base44 } from '@/api/base44Client';
import { localToday } from '@/lib/dates';
import { refreshPlantData } from '@/lib/query-client';
import { queueOp, registerOutboxHandler, isOfflineError } from '@/lib/outbox';

export const CARE_TYPES = [
  { key: 'fertilize', icon: '🌱', label: 'Fertilize', doing: 'Fertilize' },
  { key: 'mist', icon: '💦', label: 'Mist', doing: 'Mist' },
  { key: 'rotate', icon: '🔄', label: 'Rotate', doing: 'Give it a quarter turn' },
  { key: 'repot', icon: '🪴', label: 'Repot check', doing: 'Check if it needs a bigger pot' },
];
export const CARE_META = Object.fromEntries(CARE_TYPES.map((t) => [t.key, t]));

export function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
}

/** 'north' | 'south' | 'tropics' from the user's saved location (north if unknown). */
export function hemisphere(user) {
  const lat = user?.location_lat;
  if (typeof lat !== 'number') return 'north';
  if (Math.abs(lat) < 23.5) return 'tropics';
  return lat < 0 ? 'south' : 'north';
}

/** Most plants rest in winter: Nov–Feb up north, May–Aug down south, never in the tropics. */
export function isDormant(day, hemi) {
  const m = Number(String(day).slice(5, 7));
  if (hemi === 'tropics') return false;
  if (hemi === 'south') return m >= 5 && m <= 8;
  return m === 11 || m === 12 || m === 1 || m === 2;
}

/**
 * Feeding happens in spring and summer only: no fertilizer Oct–Feb up north, Apr–Aug down
 * south, any time in the tropics. (Iowa State Extension: fertilize only while houseplants
 * are actively growing, spring and summer; aloe's growing season is about March–September.)
 */
export function isNoFeedSeason(day, hemi) {
  const m = Number(String(day).slice(5, 7));
  if (hemi === 'tropics') return false;
  if (hemi === 'south') return m >= 4 && m <= 8;
  return m >= 10 || m <= 2;
}

/** First day of the next growing season after `day`. */
export function seasonStart(day, hemi) {
  const y = Number(String(day).slice(0, 4));
  const m = Number(String(day).slice(5, 7));
  if (hemi === 'south') return m >= 9 ? `${y + 1}-09-01` : `${y}-09-01`;
  return m >= 3 ? `${y + 1}-03-01` : `${y}-03-01`;
}

export function nextAfter(day, key, task, hemi) {
  let next = addDays(day, Math.max(1, Number(task?.every_days) || 30));
  if (key === 'fertilize' && task?.winter_pause !== false && isNoFeedSeason(next, hemi)) next = seasonStart(next, hemi);
  return next;
}

export function isPausedForWinter(key, task, hemi, today = localToday()) {
  return key === 'fertilize' && task?.on && task.winter_pause !== false && isNoFeedSeason(today, hemi);
}

/**
 * The day a task is really due. A fertilize task that rests in winter is never due
 * before spring, even when its saved date is earlier (it came due right before winter
 * and wasn't done, or the date was typed into winter). Same rule on the server
 * (functions/plus careDueToday).
 */
export function effectiveNext(key, task, hemi, today = localToday()) {
  const next = String(task?.next || '').slice(0, 10);
  if (!next) return next;
  if (key === 'fertilize' && task?.winter_pause !== false && hemi !== 'tropics') {
    if (isNoFeedSeason(today, hemi)) {
      const spring = seasonStart(today, hemi);
      if (next < spring) return spring;
    }
    if (isNoFeedSeason(next, hemi)) return seasonStart(next, hemi);
  }
  return next;
}

// Spread first dates so a whole garden doesn't land on one day.
function stagger(id, spread) {
  let h = 0;
  for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 1 + (h % spread);
}

/** Build a fresh schedule from a suggestion (functions/plus care_suggest). */
export function scheduleFromSuggestion(plant, s, hemi, today = localToday()) {
  const cs = {};
  const fert = { on: true, every_days: s.fertilize.every_days, winter_pause: s.fertilize.winter_pause !== false };
  let fNext = addDays(today, stagger(plant.id, 7));
  if (fert.winter_pause && isNoFeedSeason(fNext, hemi)) fNext = seasonStart(fNext, hemi);
  cs.fertilize = { ...fert, next: fNext, last: null };
  cs.mist = { on: !!s.mist.useful, every_days: s.mist.every_days, next: addDays(today, 1), last: null };
  cs.rotate = { on: !!s.rotate.useful, every_days: s.rotate.every_days, next: addDays(today, 2 + stagger(plant.id, 7)), last: null };
  // Spring is the time to repot, so the first check lands at the start of the next growing season.
  const repotFirst = hemi === 'tropics' ? addDays(today, 30) : seasonStart(today, hemi);
  cs.repot = { on: true, every_days: s.repot.every_days, next: repotFirst, last: null };
  if (s.note) cs.note = s.note;
  return cs;
}

/** Tasks that are due today or overdue: [{key, next, late}] */
export function dueCare(plant, hemi = 'north', today = localToday()) {
  const cs = plant?.care_schedule || {};
  const out = [];
  for (const t of CARE_TYPES) {
    const task = cs[t.key];
    if (!task?.on || !task.next) continue;
    const next = effectiveNext(t.key, task, hemi, today);
    if (next <= today) out.push({ key: t.key, next, late: next < today });
  }
  return out;
}

export function hasCareSchedule(plant) {
  const cs = plant?.care_schedule;
  return !!cs && CARE_TYPES.some((t) => cs[t.key]?.on);
}

function pushHistory(list, entry) {
  const arr = Array.isArray(list) ? list.slice(-59) : [];
  arr.push(entry);
  return arr;
}

// One save at a time per plant, so quick taps on the same plant line up instead of racing.
const saving = new Map();

/** Mark a care task done today (or skip it: moves it on without logging). */
export function completeCare(plant, key, hemi, opts = {}) {
  const prev = saving.get(plant.id) || Promise.resolve();
  const run = prev.catch(() => {}).then(() => saveCompletion(plant, key, hemi, opts));
  saving.set(plant.id, run);
  run.finally(() => { if (saving.get(plant.id) === run) saving.delete(plant.id); }).catch(() => {});
  return run;
}

async function saveCompletion(plant, key, hemi, { skip = false, date = null, replay = false } = {}) {
  const today = date || localToday();
  // Start from the saved plant, not the copy on screen: two quick taps (Fertilize, then
  // Mist) would otherwise each write their own stale copy and undo each other.
  let current = plant;
  try {
    const rows = await base44.entities.Plant.filter({ id: plant.id });
    if (rows?.[0]) current = rows[0];
    else if (replay) return null; // plant was deleted meanwhile
  } catch (e) {
    if (replay) throw e; // still no signal: keep it queued
    /* offline: fall back to what's on screen */
  }
  const cs = { ...(current.care_schedule || {}) };
  const task = { ...(cs[key] || {}) };
  // Already saved (a replay after a lost connection): nothing to do
  if (!skip && task.last === today && task.next && task.next > today) return task.next;
  task.next = nextAfter(today, key, task, hemi);
  if (!skip) task.last = today;
  cs[key] = task;
  const patch = { care_schedule: cs };
  if (!skip) patch.care_history = pushHistory(current.care_history, { type: key, date: today });
  try {
    await base44.entities.Plant.update(plant.id, patch);
  } catch (e) {
    // No signal: keep it on the phone and send it when the app is back online
    if (replay || !isOfflineError(e)) throw e;
    queueOp('care', { plant_id: plant.id, key, hemi, skip, date: today });
    return task.next;
  }
  refreshPlantData();
  return task.next;
}

registerOutboxHandler('care', (p) => saveCompletion({ id: p.plant_id }, p.key, p.hemi, { skip: p.skip, date: p.date, replay: true }));

export async function saveCareSchedule(plant, cs) {
  await base44.entities.Plant.update(plant.id, { care_schedule: cs });
  refreshPlantData();
}
