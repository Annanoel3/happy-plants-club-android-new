// Keeps the phone's own watering pop-up (native WateringAlarms) up to date:
// who's signed in, whether Watering Reminders is on, and which plants are due.
// Runs on every app open and shortly after any watering / plant change.
// Older app builds don't have the pop-up; there this quietly does nothing and
// the regular 8 AM push keeps working.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { localToday } from '@/lib/dates';

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
      const plants = (await base44.entities.Plant.filter({ created_by: user.email }, '-created_date', 500)) || [];
      const snapshot = plants
        .filter((p) => !onVacation(p, today))
        .map((p) => ({
          id: p.id,
          name: p.nickname || p.name || 'Plant',
          // already watered today → not due again today
          next_due: String(p.last_watered || '').slice(0, 10) === today
            ? '9999-12-31'
            : String(p.next_watering_due || '').slice(0, 10),
        }));
      const state = await b.syncWatering({
        token,
        appId: appParams.appId,
        serverUrl: appParams.serverUrl || 'https://base44.app',
        enabled: user.notifications_watering !== false,
        hour: 8,
        minute: 0,
        plants: snapshot,
      });
      // Tell the server this phone does its own pop-up, so the 8 AM push doesn't double up.
      const last = String(user.watering_popups_native_at || '').slice(0, 10);
      if (state && last !== today) {
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
}
