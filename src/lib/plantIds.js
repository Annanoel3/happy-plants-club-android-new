// Photo IDs: how many plants a person can name from a photo today.
// Rules live on the server (functions/premium + identifyPlantWithExpert):
//   free: 30 in the first 24 hours, then 5 a day, +5 per reward video (3 videos a day max)
//   Plus: 200 a day. Typing a plant's name never uses a photo ID.
// Photos over the limit are still saved; they wait under "Newly added" and get named
// when IDs are back (next day, a reward video, or Plus).
import { base44 } from '@/api/base44Client';
import { refreshPlantData } from '@/lib/query-client';
import { rewardedAvailable, showRewardedAd } from '@/lib/admob';

let last = null;
function remember(ids) {
  if (!ids) return;
  last = ids;
  try { window.dispatchEvent(new CustomEvent('hp-ids', { detail: ids })); } catch { /* ignore */ }
}
export const lastIdStatus = () => last;

export async function getIdStatus() {
  const { data } = await base44.functions.invoke('premium', { action: 'status' });
  remember(data?.ids || null);
  return data?.ids || null;
}

export const isWaitingForId = (p) => p?.add_status === 'failed' && p?.add_info?.error === 'limit_reached';
export const canWatchForIds = (ids) => !!ids?.can_reward && rewardedAvailable();

/** Reserve photo IDs for these new plants, then name the ones that got one. */
export async function nameNewPlants(plantIds) {
  let approved = plantIds;
  let waiting = [];
  try {
    const { data } = await base44.functions.invoke('premium', { action: 'reserve_ids', plant_ids: plantIds });
    if (data?.success) {
      approved = data.approved || [];
      waiting = data.waiting || [];
      remember(data.ids);
    }
  } catch {
    // No signal or the check failed: each plant is still checked when it's named
  }
  for (const id of approved) {
    base44.functions.invoke('identifyPlantWithExpert', { plant_id: id })
      .then(() => refreshPlantData())
      .catch(() => refreshPlantData());
  }
  if (waiting.length) refreshPlantData();
  return { approved, waiting };
}

/** Plants added by typing their names: write each one's care sheet (no photo ID used).
 *  Runs in the background; the Dashboard and the hourly sweep retry any that get stuck. */
export function writeTypedCare(plants) {
  for (const p of plants || []) {
    if (!p?.id) continue;
    base44.functions.invoke('identifyPlantWithExpert', { plant_id: p.id })
      .then(() => refreshPlantData())
      .catch(() => refreshPlantData());
  }
}

/** Plants waiting for a photo ID: name as many as today's IDs allow, oldest first. */
export async function nameWaitingPlants() {
  const me = await base44.auth.me();
  const failed = await base44.entities.Plant.filter({ created_by: me.email, add_status: 'failed' });
  const ids = (failed || [])
    .filter(isWaitingForId)
    .sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)))
    .map((p) => p.id);
  if (!ids.length) return { approved: [], waiting: [] };
  return nameNewPlants(ids);
}

/** Watch a reward video, get 5 more photo IDs, and name plants that were waiting. */
export async function watchForIds() {
  const r = await showRewardedAd();
  if (!r.ok) return { ok: false, reason: r.reason };
  const { data } = await base44.functions.invoke('premium', { action: 'reward_ids' });
  remember(data?.ids);
  if (!data?.success) return { ok: false, reason: data?.reason || 'failed' };
  const named = await nameWaitingPlants().catch(() => ({ approved: [] }));
  return { ok: true, ids: last, named: named.approved.length };
}

/** "5 left today" / "First day: 27 of 30 left" */
export function idsLine(ids) {
  if (!ids) return '';
  if (ids.plus) return `${ids.left} of ${ids.limit} photo IDs left today`;
  if (ids.intro) return `Welcome bonus: ${ids.left} of ${ids.intro_total} photo IDs left`;
  return `${ids.left} of ${ids.limit} free photo IDs left today`;
}

export function introEndsText(ids) {
  if (!ids?.intro_ends_at) return '';
  const d = new Date(ids.intro_ends_at);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `until ${time} today` : `until ${time} tomorrow`;
}

export function rewardFailText(reason) {
  if (reason === 'closed') return 'The video was closed early, so no extra IDs this time.';
  if (reason === 'no_fill') return 'No video is available right now. Try again in a little while.';
  if (reason === 'max_ads') return "That's all the extra IDs for today. More tomorrow!";
  return "Couldn't play the video. Try again in a little while.";
}
