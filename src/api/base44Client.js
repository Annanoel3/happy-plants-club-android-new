import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { queryClientInstance } from '@/lib/query-client';

const { appId, serverUrl, token, functionsVersion } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

// ---------------------------------------------------------------------------
// Cache auth.me() app-wide.
// Layout, NotificationPopup and almost every page each call base44.auth.me()
// on mount, so one screen change fired 3-4 identical network requests before
// anything useful loaded. This dedupes them: one request per 60s, shared by
// everyone, and any updateMe() clears it so edited settings show up at once.
// ---------------------------------------------------------------------------
const USER_TTL_MS = 60_000;
let userPromise = null;
let userFetchedAt = 0;

const rawMe = base44.auth.me.bind(base44.auth);
const rawUpdateMe = base44.auth.updateMe.bind(base44.auth);
const rawLogout = base44.auth.logout.bind(base44.auth);
const rawSetToken = base44.auth.setToken.bind(base44.auth);

export function clearUserCache() {
  userPromise = null;
  userFetchedAt = 0;
}

base44.auth.me = () => {
  const fresh = userPromise && (Date.now() - userFetchedAt) < USER_TTL_MS;
  if (!fresh) {
    userFetchedAt = Date.now();
    userPromise = rawMe().catch((err) => {
      clearUserCache(); // don't cache failures (expired token, offline)
      throw err;
    });
  }
  return userPromise;
};

base44.auth.updateMe = async (data) => {
  const result = await rawUpdateMe(data);
  clearUserCache();
  return result;
};

// Unlinks this phone from the signed-out account's pushes. Every logout goes
// through base44.auth.logout below, so Settings, My Profile, Delete Account and
// an expired session all do this (before, only Settings did, so a phone kept
// getting the old account's reminders).
export async function unlinkPushFromThisPhone() {
  const tasks = [
    (async () => { await window.Capacitor?.Plugins?.NotifyBridge?.logout?.(); })(),
    (async () => { window.onNativePushLogout?.(); })(),
    (async () => { await window.OneSignal?.logout?.(); })(),
    // Stop this phone's watering pop-ups for the account being signed out
    import('@/lib/wateringPopups').then((m) => m.signOutWateringPopups()),
  ];
  // Never let a stuck bridge call block signing out
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
}

base44.auth.logout = async (...args) => {
  clearUserCache();
  try { await unlinkPushFromThisPhone(); } catch { /* best effort */ }
  return rawLogout(...args);
};

base44.auth.setToken = (...args) => {
  clearUserCache(); // a new token means a possibly different user
  return rawSetToken(...args);
};

// ---------------------------------------------------------------------------
// Auto-refresh cached lists after writes.
// Screens now keep their data for 30s (see lib/query-client.js) instead of
// re-downloading everything on every visit. So that an edit never shows stale,
// any write to an entity below marks the related screen queries for refresh.
// ---------------------------------------------------------------------------
const QUERY_KEYS_BY_ENTITY = {
  Plant: ['plants', 'plant', 'userPlants'],
  WateringLog: ['wateringLogs'],
  Reminder: ['reminders', 'remindersWithNotifications'],
  DailyWateringReminder: ['todayWateringReminder'],
  GameEvent: ['activeEvents'],
  PlantProgressPhoto: ['progressPhotos'],
  HealthCheck: ['healthChecks'],
  VacationDay: ['vacations', 'vacation'],
  UserPlantCategory: ['customCategories'],
  Follow: ['following', 'followers', 'followingCount', 'followerCount'],
  FollowRequest: ['followRequests', 'pendingRequests', 'notifications'],
  Notification: ['notifications', 'feedNotifications'],
  Block: ['following', 'followers'],
};
const STATS_ENTITIES = new Set(['WateringLog', 'Plant', 'PlantProgressPhoto']);
const WRITE_METHODS = new Set(['create', 'update', 'delete', 'bulkCreate', 'bulkUpdate', 'updateMany', 'deleteMany', 'upsert']);

const rawEntities = base44.entities;
base44.entities = new Proxy({}, {
  get(_, entityName) {
    const mod = rawEntities[entityName];
    const keys = QUERY_KEYS_BY_ENTITY[entityName];
    if (!keys || !mod) return mod;
    return new Proxy(mod, {
      get(target, prop) {
        const fn = target[prop];
        if (typeof fn !== 'function' || !WRITE_METHODS.has(prop)) return fn;
        return async (...args) => {
          const result = await fn.apply(target, args);
          for (const key of keys) queryClientInstance.invalidateQueries({ queryKey: [key] });
          // Stats & achievements are recomputed from these (see lib/stats.js)
          if (STATS_ENTITIES.has(entityName)) {
            try { window.dispatchEvent(new CustomEvent('hp-data-write', { detail: { entity: entityName } })); } catch { /* noop */ }
          }
          return result;
        };
      },
    });
  },
});
