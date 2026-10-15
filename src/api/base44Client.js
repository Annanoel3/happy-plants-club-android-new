import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

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

base44.auth.logout = (...args) => {
  clearUserCache();
  return rawLogout(...args);
};

base44.auth.setToken = (...args) => {
  clearUserCache(); // a new token means a possibly different user
  return rawSetToken(...args);
};
