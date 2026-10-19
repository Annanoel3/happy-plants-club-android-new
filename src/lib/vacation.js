// Garden-wide vacation (Schedule > Vacations).
// While a trip covers today, watering reminders pause for the whole garden: the server
// checks the same rule before every push, phone pop-up and widget refresh
// (functions/wateringReminder, sendWateringReminders, plus). After the trip, if a sitter
// plan (the PDF) was made, the app asks "Did your sitter water as planned?" and logs
// those waterings, so the schedule picks up from the sitter's last visit.
import { base44 } from '@/api/base44Client';
import { registerOutboxHandler, queueOp, dropQueued, isOfflineError } from '@/lib/outbox';
import { refreshPlantData } from '@/lib/query-client';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day10 = (v) => String(v || '').slice(0, 10);

export function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Thu, Nov 5" for a YYYY-MM-DD day (no time zone shifts). */
export function niceDay(day, withWeekday = true) {
  if (!DATE.test(day10(day))) return '';
  const d = new Date(day10(day) + 'T12:00:00Z');
  return `${withWeekday ? `${WEEKDAYS[d.getUTCDay()]}, ` : ''}${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export async function fetchTrips(email) {
  if (!email) return [];
  const r = await base44.entities.VacationDay.filter({ created_by: email }, '-start_date', 200);
  return Array.isArray(r) ? r : [];
}

function sitterPending(v) {
  return !!(v?.sitter_plan?.visits?.length) && (!v.status || v.status === 'planned') && !answeredHere(v.id);
}

/**
 * The trip that covers `today`. With grace, a trip whose sitter plan hasn't been answered
 * yet also covers the 2 days after it (same rule as the server).
 */
export function tripCovering(trips, today, grace = false) {
  for (const v of trips || []) {
    const s = day10(v.start_date), e = day10(v.end_date);
    if (!DATE.test(s) || !DATE.test(e)) continue;
    const until = grace && sitterPending(v) ? addDays(e, 2) : e;
    if (today >= s && today <= until) return v;
  }
  return null;
}

/** A trip that ended in the last 2 weeks whose sitter plan hasn't been answered. */
export function welcomeBackTrip(trips, today) {
  return (trips || [])
    .filter((v) => {
      const e = day10(v.end_date);
      return DATE.test(e) && e < today && today <= addDays(e, 14) && sitterPending(v);
    })
    .sort((a, b) => day10(b.end_date).localeCompare(day10(a.end_date)))[0] || null;
}

// Answers are remembered on this phone right away, so the question doesn't come back
// while the answer is still waiting to be sent
const ANSWERED = 'hp_trip_answered';
function answeredHere(id) {
  try { return JSON.parse(localStorage.getItem(ANSWERED) || '[]').includes(id); } catch { return false; }
}
function markAnswered(id) {
  try {
    const list = JSON.parse(localStorage.getItem(ANSWERED) || '[]');
    if (!list.includes(id)) localStorage.setItem(ANSWERED, JSON.stringify([...list, id].slice(-50)));
  } catch { /* ignore */ }
}

async function sendAnswer({ vacation_id, answer, tz }) {
  const { data } = await base44.functions.invoke('generateVacationPDF', { action: answer, vacation_id, tz });
  if (!data?.success) throw Object.assign(new Error(data?.error || 'not saved'), { response: { status: 500 } });
  return data;
}
registerOutboxHandler('sitter', async (payload) => { await sendAnswer(payload); refreshPlantData(); });

/**
 * "Did your sitter water as planned?" answer: 'confirm' (log the plan's waterings) or
 * 'dismiss'. Saved on the phone first, then sent; with no signal it's sent later.
 * Resolves { synced, logged }.
 */
export async function answerSitterPlan(vacationId, answer) {
  let tz;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { tz = undefined; }
  const payload = { vacation_id: vacationId, answer, tz };
  markAnswered(vacationId);
  const opId = queueOp('sitter', payload);
  try {
    const data = await sendAnswer(payload);
    dropQueued(opId);
    refreshPlantData();
    return { synced: true, logged: Number(data.logged) || 0 };
  } catch (e) {
    if (isOfflineError(e) || e?.response?.status === 401) return { synced: false, logged: 0 };
    dropQueued(opId);
    throw e;
  }
}

/** Shift a plant's next due day past any trip it falls in (for the phone's offline copy). */
export function dueAfterTrips(nextDue, trips) {
  let d = day10(nextDue);
  if (!DATE.test(d)) return d;
  for (let i = 0; i < 5; i++) {
    const t = tripCovering(trips, d, true);
    if (!t) break;
    d = addDays(sitterPending(t) ? addDays(day10(t.end_date), 2) : day10(t.end_date), 1);
  }
  return d;
}
