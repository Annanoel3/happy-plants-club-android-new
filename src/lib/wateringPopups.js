// Keeps the phone's own watering pop-up (native WateringAlarms) up to date:
// who's signed in, whether Watering Reminders is on, and which plants are due.
// Runs on every app open and shortly after any watering / plant change.
// Older app builds don't have the pop-up; there this quietly does nothing and
// the regular 8 AM push keeps working.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { localToday } from '@/lib/dates';
import { isPlusCached } from '@/lib/premium';
import { waterAmount } from '@/lib/waterAmount';
import { fetchTrips, dueAfterTrips } from '@/lib/vacation';

let Notify = null;
function bridge() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!Notify) Notify = registerPlugin('NotifyBridge');
  return Notify;
}

function onVacation(p, today) {
  if (!p.vacation_mode_enabled) return false;
  const start = p.vacation_start_date ? String(p.vacation_start_date).slice(0, 10) : null;
  const end = p.vacation_end_date ? String(p.vacation_end_date).slice(0, 10) : null;
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

let timer = null;
let running = null;

export async function syncWateringPopups() {
  const b = bridge();
  if (!b) return null;
  if (running) return running;
  running = (async () => {
    try {
      const user = await base44.auth.me();
      if (!user?.email) return null;
      let token = null;
      try { token = localStorage.getItem('base44_access_token'); } catch { /* ignore */ }
      token = token || appParams.token;
      if (!token) return null;
      const today = localToday();
      const plus = isPlusCached();
      const [plants, trips] = await Promise.all([
        base44.entities.Plant.filter({ created_by: user.email }, '-created_date', 500).then((r) => r || []),
        fetchTrips(user.email).catch(() => []),
      ]);
      const snapshot = plants
        .filter((p) => !onVacation(p, today))
        .map((p) => {
          const amt = plus ? waterAmount(p) : null;
          return {
            id: p.id,
            name: p.nickname || p.name || 'Plant',
            // already watered today → not due again today; on a trip → not due until after it
            // (the phone uses these dates only when it can't reach the server)
            next_due: String(p.last_watered || '').slice(0, 10) === today
              ? '9999-12-31'
              : dueAfterTrips(String(p.next_watering_due || '').slice(0, 10), trips),
            // Plus: "6 oz" on the pop-up and widget (used when the phone is offline)
            detail: amt && amt.short ? amt.short : null,
            // so a watering from the widget/pop-up can set the right next date offline
            every: Number(p.water_frequency_days) || 7,
          };
        });
      const state = await b.syncWatering({
        token,
        appId: appParams.appId,
        serverUrl: appParams.serverUrl || 'https://base44.app',
        enabled: user.notifications_watering !== false,
        hour: 8,
        minute: 0,
        plus,
        plants: snapshot,
      });
      // Tell the server this phone does its own pop-up, so the 8 AM push doesn't double up.
      // Only when the pop-up can actually show: reminders on and notifications allowed.
      // (The pop-up itself also refreshes this each morning it checks in.)
      const last = String(user.watering_popups_native_at || '').slice(0, 10);
      const canShow = state && state.enabled !== false && state.notificationsAllowed !== false;
      if (canShow && last !== today) {
        base44.auth.updateMe({ watering_popups_native_at: new Date().toISOString() }).catch(() => {});
      }
      return state;
    } catch (e) {
      // Older builds: "syncWatering is not implemented" — nothing to do.
      return null;
    } finally {
      running = null;
    }
  })();
  return running;
}

export function scheduleWateringPopupSync(delay = 3000) {
  clearTimeout(timer);
  timer = setTimeout(() => { syncWateringPopups(); }, delay);
}

export async function signOutWateringPopups() {
  const b = bridge();
  if (!b) return;
  try { await b.wateringSignOut(); } catch { /* older build */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('hp-data-write', () => scheduleWateringPopupSync());
  // Plus just started or ended: the widget and pop-up show amounts only for Plus
  window.addEventListener('hp-plus', () => scheduleWateringPopupSync(500));
  // Coming back to the app: refresh the session the pop-up uses and the due list
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleWateringPopupSync(1500);
  });
}
